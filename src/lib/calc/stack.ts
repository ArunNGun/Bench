/**
 * What is running at the same time, and whether any of it collides.
 *
 * The point of this module is to be quiet. A warning that fires on a normal,
 * deliberate combination trains you to ignore all of them, so the rules are
 * built on receptor classes rather than on categories or name matching. Two
 * compounds both labelled "metabolic" is not a finding; two compounds both
 * agonising GLP-1 is.
 *
 * The clearest example of the distinction: CJC-1295 with ipamorelin is a GHRH
 * analogue alongside a ghrelin agonist, different classes, complementary by
 * design, and one of the most common pairings there is. Nothing is reported.
 * GHRP-6 with ipamorelin is two ghrelin agonists, which is redundancy rather
 * than synergy, and that is reported.
 */

import type { MechanismClass, Peptide, Protocol } from "../types";
import { decomposeDose } from "./blend";
import { dosesPerWeek, scheduledDoseMcg } from "./schedule";

export type StackIssueKind = "duplicate-compound" | "shared-mechanism" | "component-overlap";

export type StackSeverity = "high" | "medium";

export interface StackIssue {
  kind: StackIssueKind;
  severity: StackSeverity;
  title: string;
  detail: string;
  /** Protocols involved, so the UI can point at them. */
  protocolIds: string[];
  /** Display names of the compounds involved. */
  compounds: string[];
}

const CLASS_LABEL: Record<MechanismClass, string> = {
  "glp1-agonist": "GLP-1 receptor agonists",
  "gip-agonist": "GIP receptor agonists",
  "glucagon-agonist": "glucagon receptor agonists",
  "amylin-analogue": "amylin analogues",
  "ghrh-analogue": "GHRH analogues",
  "ghrelin-agonist": "ghrelin receptor agonists",
};

/** Why doubling up on a class matters, and how loudly to say so. */
const CLASS_RISK: Record<MechanismClass, { severity: StackSeverity; why: string }> = {
  "glp1-agonist": {
    severity: "high",
    why: "Nausea, vomiting and the dehydration that follows are dose-dependent and add up, and pancreatitis is the recognised serious risk of the class. No trial has tested two of them together.",
  },
  "gip-agonist": {
    severity: "high",
    why: "The gastrointestinal effects are additive, and no trial has tested two of them together.",
  },
  "glucagon-agonist": {
    severity: "high",
    why: "Glucagon agonism raises heart rate and hepatic glucose output. Two at once compounds both, and has not been studied.",
  },
  "amylin-analogue": {
    severity: "high",
    why: "Amylin analogues slow gastric emptying and suppress appetite through the same pathway, so the nausea is additive rather than complementary.",
  },
  "ghrh-analogue": {
    severity: "medium",
    why: "Both act on the same pituitary receptor, so the second mostly adds side effects and cost rather than more growth hormone.",
  },
  "ghrelin-agonist": {
    severity: "medium",
    why: "Both act on the same receptor and the pituitary response saturates, so the second adds hunger and cortisol more than effect.",
  },
};

interface ActiveCompound {
  protocolId: string;
  protocolName: string;
  peptideId: string;
  name: string;
  peptide: Peptide;
  /** Classes contributed by the compound itself and by any blend components. */
  classes: Set<MechanismClass>;
}

export interface StackInput {
  protocols: Protocol[];
  resolve: (peptideId: string) => Peptide | undefined;
  nowMs: number;
}

function activeCompounds({ protocols, resolve }: StackInput): ActiveCompound[] {
  const out: ActiveCompound[] = [];

  for (const p of protocols) {
    if (!p.active) continue;
    const peptide = resolve(p.peptideId);
    if (!peptide) continue;

    const classes = new Set<MechanismClass>(peptide.mechanismClass ?? []);
    // A blend inherits whatever its components act on, so a blend containing a
    // GLP-1 collides with a standalone GLP-1 even if the blend itself is untagged.
    for (const c of peptide.components ?? []) {
      const sub = c.peptideId ? resolve(c.peptideId) : undefined;
      for (const cls of sub?.mechanismClass ?? []) classes.add(cls);
    }

    out.push({
      protocolId: p.id,
      protocolName: p.name,
      peptideId: p.peptideId,
      name: peptide.name,
      peptide,
      classes,
    });
  }

  return out;
}

function duplicateCompounds(compounds: ActiveCompound[]): StackIssue[] {
  const byPeptide = new Map<string, ActiveCompound[]>();
  for (const c of compounds) {
    const list = byPeptide.get(c.peptideId) ?? [];
    list.push(c);
    byPeptide.set(c.peptideId, list);
  }

  return [...byPeptide.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      kind: "duplicate-compound" as const,
      severity: "high" as const,
      title: `${group[0].name} is running in ${group.length} protocols at once`,
      detail: `${group
        .map((g) => g.protocolName)
        .join(" and ")} both deliver ${group[0].name}, so your real exposure is the sum of them. If that is deliberate, one protocol with the combined dose keeps the totals and the stock count honest.`,
      protocolIds: group.map((g) => g.protocolId),
      compounds: [group[0].name],
    }));
}

function sharedMechanisms(compounds: ActiveCompound[]): StackIssue[] {
  const byClass = new Map<MechanismClass, Map<string, ActiveCompound>>();

  for (const c of compounds) {
    for (const cls of c.classes) {
      const seen = byClass.get(cls) ?? new Map<string, ActiveCompound>();
      // Keyed by compound, so the same compound in two protocols is left to the
      // duplicate check rather than reported twice.
      seen.set(c.peptideId, c);
      byClass.set(cls, seen);
    }
  }

  const issues: StackIssue[] = [];

  for (const [cls, seen] of byClass) {
    if (seen.size < 2) continue;
    const involved = [...seen.values()];
    const risk = CLASS_RISK[cls];

    issues.push({
      kind: "shared-mechanism",
      severity: risk.severity,
      title: `${involved.map((c) => c.name).join(" and ")} are both ${CLASS_LABEL[cls]}`,
      detail: `${risk.why} Their effects on this pathway do not simply add up to a better result.`,
      protocolIds: involved.map((c) => c.protocolId),
      compounds: involved.map((c) => c.name),
    });
  }

  return issues;
}

/**
 * The same underlying compound arriving from more than one protocol, which is
 * what happens when a blend and a standalone overlap. Reports the combined
 * weekly exposure against the compound's own documented weekly range.
 */
function componentOverlap({ protocols, resolve, nowMs }: StackInput): StackIssue[] {
  interface Contribution {
    peptideId?: string;
    name: string;
    weeklyMcg: number;
    typicalWeeklyHighMcg: number | null;
  }

  /**
   * What one protocol delivers, per underlying compound.
   *
   * A blend is broken into its parts; a standalone compound is its own single
   * contribution. That second case matters, decomposeDose returns nothing for a
   * peptide with no components, so without it a blend could only ever overlap
   * with another blend, and the common case of a blend alongside a standalone
   * would go unreported.
   */
  const contributions = (peptide: Peptide, doseMcg: number, perWeek: number): Contribution[] => {
    if (peptide.components?.length) {
      return decomposeDose(peptide, doseMcg, resolve, perWeek || undefined).map((part) => ({
        peptideId: part.peptideId,
        name: part.name,
        weeklyMcg: part.weeklyMcg ?? part.mcg * perWeek,
        typicalWeeklyHighMcg: part.typicalWeeklyHighMcg,
      }));
    }

    const range = peptide.doseRanges?.[0];
    return [
      {
        peptideId: peptide.id,
        name: peptide.name,
        weeklyMcg: doseMcg * perWeek,
        // Expressed weekly on the range's own frequency, so it lines up with
        // how decomposeDose states a component's ceiling.
        typicalWeeklyHighMcg:
          range && range.perWeek > 0 ? range.highMcg * range.perWeek : null,
      },
    ];
  };

  interface Tally {
    name: string;
    weeklyMcg: number;
    typicalHighWeekly: number | null;
    protocols: Map<string, string>;
  }

  const byComponent = new Map<string, Tally>();

  for (const p of protocols) {
    if (!p.active) continue;
    const peptide = resolve(p.peptideId);
    if (!peptide) continue;

    const perWeek = dosesPerWeek(p.schedule);
    const parts = contributions(peptide, scheduledDoseMcg(p, nowMs), perWeek);

    for (const part of parts) {
      // Only compounds with a library identity can be summed reliably.
      if (!part.peptideId) continue;

      const weekly = part.weeklyMcg;
      const tally =
        byComponent.get(part.peptideId) ??
        ({
          name: part.name,
          weeklyMcg: 0,
          typicalHighWeekly: part.typicalWeeklyHighMcg,
          protocols: new Map<string, string>(),
        } satisfies Tally);

      tally.weeklyMcg += weekly;
      tally.protocols.set(p.id, p.name);
      // A blend may not carry a ceiling for a component the standalone entry
      // does, so take the first one that is known.
      if (tally.typicalHighWeekly == null) tally.typicalHighWeekly = part.typicalWeeklyHighMcg;
      byComponent.set(part.peptideId, tally);
    }
  }

  const issues: StackIssue[] = [];

  for (const tally of byComponent.values()) {
    if (tally.protocols.size < 2) continue;

    const mg = (mcg: number) => `${Number((mcg / 1000).toFixed(3))} mg`;
    const names = [...tally.protocols.values()].join(" and ");
    const over =
      tally.typicalHighWeekly != null && tally.weeklyMcg > tally.typicalHighWeekly;

    issues.push({
      kind: "component-overlap",
      severity: over ? "high" : "medium",
      title: over
        ? `${tally.name} totals ${mg(tally.weeklyMcg)} a week, above its usual range`
        : `${tally.name} is coming from ${tally.protocols.size} protocols`,
      detail: over
        ? `${names} together deliver ${mg(tally.weeklyMcg)} of ${tally.name} a week, against a usual ceiling of ${mg(tally.typicalHighWeekly!)}. Neither protocol looks high on its own. It is the overlap that takes it over.`
        : `${names} both contain ${tally.name}, adding up to ${mg(tally.weeklyMcg)} a week. Worth knowing, since neither protocol shows the combined figure on its own.`,
      protocolIds: [...tally.protocols.keys()],
      compounds: [tally.name],
    });
  }

  return issues;
}

/**
 * Two or more 17-alpha-alkylated orals at once.
 *
 * Not a receptor collision, so it does not fall out of the mechanism check, it
 * is the same liver metabolising both. Worth its own rule because running two
 * orals together is a common enough plan and the hepatotoxicity is additive.
 */
function stackedOrals(compounds: ActiveCompound[]): StackIssue[] {
  const orals = compounds.filter((c) => c.peptide.c17AlphaAlkylated);
  if (orals.length < 2) return [];

  return [
    {
      kind: "shared-mechanism",
      severity: "high",
      title: `${orals.map((c) => c.name).join(" and ")} are both 17-alpha-alkylated orals`,
      detail:
        "The alkylation that lets these survive first-pass metabolism is exactly what strains the liver, and the effect is additive. Two at once also compounds the fall in HDL, which is already steeper on orals than on injectables. Liver enzymes and a lipid panel are worth having before and during.",
      protocolIds: orals.map((c) => c.protocolId),
      compounds: orals.map((c) => c.name),
    },
  ];
}

const SEVERITY_ORDER: Record<StackSeverity, number> = { high: 0, medium: 1 };

/**
 * Everything worth saying about the combination currently running, most serious
 * first. An empty array means nothing collided, which is the normal case.
 */
export function stackIssues(input: StackInput): StackIssue[] {
  const compounds = activeCompounds(input);
  if (compounds.length < 2) return [];

  return [
    ...duplicateCompounds(compounds), ...sharedMechanisms(compounds), ...stackedOrals(compounds), ...componentOverlap(input),
  ].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
