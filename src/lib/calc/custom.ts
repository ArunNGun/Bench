/**
 * Building a compound the library does not have.
 *
 * The library is opinionated and cited, which is exactly why it will never be
 * complete, a new research peptide appears faster than anyone can source a
 * half-life for it. Rather than leave those users unable to log anything, this
 * turns a short form into a valid library entry.
 *
 * The one rule worth stating: a custom entry never pretends to be researched. It
 * carries no citations, and its dose range is tagged `anecdotal` whatever the
 * user believes, because the app has no way to check it. A user-typed number
 * displayed with the same authority as an FDA label would undermine the whole
 * point of tagging evidence in the first place.
 */

import type { DoseRange, Peptide, PeptideCategory, Route } from "../types";

export interface CustomDraft {
  name: string;
  category: PeptideCategory;
  aka?: string;
  summary?: string;
  /** Blank when unknown, which is the honest default for most research peptides. */
  halfLifeHours?: number | null;
  routes: Route[];
  preparation: "powder" | "solution";
  /** Typical dose per administration, in micrograms. */
  doseLowMcg?: number;
  doseHighMcg?: number;
  frequency?: string;
  perWeek?: number;
  vialSizeMg?: number;
  iuPerMg?: number;
  notes?: string;
}

export interface DraftProblem {
  field: keyof CustomDraft;
  message: string;
}

/** Custom ids are namespaced so they can never collide with a built-in. */
export const CUSTOM_PREFIX = "custom-";

export function slugifyCompound(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    // Drop the combining marks NFKD just split off, rather than letting the
    // next step turn each one into a hyphen and make "peptide" into "pe-ptide".
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return CUSTOM_PREFIX + (slug || "compound");
}

export const isCustomId = (id: string) => id.startsWith(CUSTOM_PREFIX);

/**
 * What is wrong with the draft, in the order the fields appear.
 *
 * An empty array means it can be saved. Validation is deliberately loose about
 * the pharmacology, the app cannot know whether 400 mcg is right for something
 * it has never heard of, and strict about the things that would break the app
 * itself: a missing name, a dose range the wrong way round, a schedule of zero
 * doses a week that would make burn rate and supply-days divide by zero.
 */
export function validateDraft(draft: CustomDraft, existing: Peptide[]): DraftProblem[] {
  const problems: DraftProblem[] = [];
  const name = draft.name.trim();

  if (!name) {
    problems.push({ field: "name", message: "Give it a name." });
  } else if (existing.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    problems.push({
      field: "name",
      message: `${name} is already in the library. Use that entry, or pick a different name.`,
    });
  } else if (existing.some((p) => p.id === slugifyCompound(name))) {
    problems.push({ field: "name", message: "You already have a compound with that name." });
  }

  if (!draft.routes.length) {
    problems.push({ field: "routes", message: "Pick at least one route." });
  }

  if (draft.halfLifeHours != null && !(draft.halfLifeHours > 0)) {
    problems.push({ field: "halfLifeHours", message: "A half-life has to be more than zero hours." });
  }

  const { doseLowMcg: low, doseHighMcg: high } = draft;

  if (low != null && !(low > 0)) {
    problems.push({ field: "doseLowMcg", message: "A dose has to be more than zero." });
  }
  if (low != null && high != null && high < low) {
    problems.push({ field: "doseHighMcg", message: "The high end cannot be below the low end." });
  }
  if (draft.perWeek != null && !(draft.perWeek > 0)) {
    problems.push({
      field: "perWeek",
      message: "Doses per week has to be more than zero, or supply and burn rate cannot be worked out.",
    });
  }
  if (draft.iuPerMg != null && !(draft.iuPerMg > 0)) {
    problems.push({ field: "iuPerMg", message: "Units per milligram has to be more than zero." });
  }
  if (draft.vialSizeMg != null && !(draft.vialSizeMg > 0)) {
    problems.push({ field: "vialSizeMg", message: "A vial size has to be more than zero." });
  }

  return problems;
}

/**
 * Turn a validated draft into a library entry.
 *
 * Everything the user did not supply is left genuinely absent rather than filled
 * with a plausible default, an invented half-life would draw a curve, and a
 * curve is a claim.
 */
export function draftToPeptide(draft: CustomDraft): Peptide {
  const name = draft.name.trim();
  const low = draft.doseLowMcg;
  const high = draft.doseHighMcg ?? draft.doseLowMcg;

  const doseRanges: DoseRange[] =
    low != null && high != null
      ? [
          {
            lowMcg: low,
            highMcg: high,
            frequency: draft.frequency?.trim() || "as planned",
            perWeek: draft.perWeek ?? 7,
            // Never anything stronger. The app cannot verify a user-typed number,
            // and showing it as "clinical" beside a real trial figure would make
            // the evidence tags worthless.
            evidence: "anecdotal",
            note: "Your own figure, not from any published source.",
          },
        ]
      : [];

  return {
    id: slugifyCompound(name),
    name,
    aka: draft.aka
      ? draft.aka
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean)
      : [],
    category: draft.category,
    summary: draft.summary?.trim() || "A compound you added yourself.",
    mechanism:
      draft.notes?.trim() ||
      "Not recorded. Add what you know under notes when you edit this entry.",
    halfLifeHours: draft.halfLifeHours ?? null,
    halfLifeNote:
      draft.halfLifeHours == null
        ? "You did not give a half-life, so no curve is drawn for this compound. Doses are still logged and counted."
        : "Your own figure. Not checked against any published source.",
    routes: draft.routes,
    preparation: draft.preparation,
    iuPerMg: draft.iuPerMg,
    vialSizesMg: draft.vialSizeMg ? [draft.vialSizeMg] : [],
    reconstitutedDays: draft.preparation === "powder" ? 28 : undefined,
    doseRanges,
    sideEffects: [],
    contraindications: [],
    status: "Added by you. The app knows nothing about this compound beyond what you typed.",
    citations: [],
    cautionBanner:
      "You created this entry. Every figure in it is yours, and none of it has been checked against a published source.",
  };
}
