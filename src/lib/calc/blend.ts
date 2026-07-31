/**
 * Blend decomposition.
 *
 * A blend is sold as one number, "80 mg KLOW", but what goes into you is
 * four separate peptides in a fixed ratio, each with its own half-life, its own
 * typical standalone dose, and its own risks. Tracking the blend as a single
 * opaque compound hides all of that.
 *
 * This splits a blend dose into what each component actually delivers, and
 * compares that against the dose the component is normally used at on its own.
 */

import type { Peptide } from "../types";

export type BlendDosing =
  /** Stated dose is the total mass, divided among components by their ratio. */
  | "split"
  /** Stated dose applies to each component in full (e.g. CagriSema 2.4/2.4). */
  | "per-component";

export function isBlend(p: Peptide | undefined | null): boolean {
  return !!p?.components?.length;
}

/** How this blend's stated dose maps onto its components. */
export function blendDosing(p: Peptide): BlendDosing {
  return p.blendDosing ?? "split";
}

export type RelativeToTypical = "below" | "within" | "above" | "unknown";

export interface ComponentDose {
  peptideId?: string;
  name: string;
  /** Micrograms of this component delivered by one dose. */
  mcg: number;
  /** Share of the blend's total mass. 1 for per-component dosing. */
  fraction: number;
  /** The component's own typical standalone per-dose range, when documented. */
  typicalLowMcg: number | null;
  typicalHighMcg: number | null;
  /** How often that standalone range is taken. */
  typicalPerWeek: number | null;
  /** Human-readable frequency for the standalone range. */
  typicalFrequency: string | null;
  /** This component's weekly exposure on your schedule, when it is known. */
  weeklyMcg: number | null;
  /** The standalone range expressed weekly, for a like-for-like comparison. */
  typicalWeeklyLowMcg: number | null;
  typicalWeeklyHighMcg: number | null;
  /** Where the exposure sits against the range. Weekly when both are known. */
  relativeToTypical: RelativeToTypical;
  /** Whether the verdict was reached weekly or per dose. */
  comparedOn: "weekly" | "per-dose" | "none";
  /** The component's own library entry, when it has one. */
  peptide?: Peptide;
}

/**
 * Split a blend dose into per-component amounts.
 *
 * Components carrying `mgPerVial` set the ratio. Where they do not, some
 * blends vary by vendor, the mass is divided equally. That is the 1:1 case,
 * which covers the common two-peptide blends.
 */
/**
 * @param dosesPerWeek How often the blend is taken. Supplying it switches the
 *   comparison from per-dose to weekly exposure, which is the only fair basis
 *   when the blend and the standalone protocol run on different schedules.
 *   500 mcg daily and 2.5 mg twice weekly are close weekly, and five-fold
 *   apart per dose.
 */
export function decomposeDose(
  blend: Peptide,
  doseMcg: number,
  resolve?: (id: string) => Peptide | undefined,
  dosesPerWeek?: number): ComponentDose[] {
  const components = blend.components ?? [];
  if (!components.length) return [];

  const mode = blendDosing(blend);
  const masses = components.map((c) => c.mgPerVial ?? 0);
  const total = masses.reduce((s, m) => s + m, 0);

  return components.map((c, i) => {
    const fraction =
      mode === "per-component" ? 1 : total > 0 ? masses[i] / total : 1 / components.length;

    const mcg = Math.max(0, doseMcg) * fraction;
    const peptide = c.peptideId && resolve ? resolve(c.peptideId) : undefined;

    // Compare against the component's strongest-evidence dose range.
    const range = peptide?.doseRanges?.[0];
    const low = range?.lowMcg ?? null;
    const high = range?.highMcg ?? null;
    const perWeek = range?.perWeek ?? null;

    const canCompareWeekly =
      low != null && high != null && perWeek != null && perWeek > 0 && !!dosesPerWeek;

    const weeklyMcg = dosesPerWeek ? mcg * dosesPerWeek : null;
    const weeklyLow = canCompareWeekly ? low! * perWeek! : null;
    const weeklyHigh = canCompareWeekly ? high! * perWeek! : null;

    // Prefer the weekly comparison; fall back to per-dose only when the
    // schedule is unknown.
    const [value, lo, hi, comparedOn] = canCompareWeekly
      ? ([weeklyMcg, weeklyLow, weeklyHigh, "weekly"] as const)
      : ([mcg, low, high, "per-dose"] as const);

    let relativeToTypical: RelativeToTypical = "unknown";
    let basis: ComponentDose["comparedOn"] = "none";
    if (lo != null && hi != null && value != null && value > 0) {
      basis = comparedOn;
      if (value < lo) relativeToTypical = "below";
      else if (value > hi) relativeToTypical = "above";
      else relativeToTypical = "within";
    }

    return {
      peptideId: c.peptideId,
      name: c.name,
      mcg,
      fraction,
      typicalLowMcg: low,
      typicalHighMcg: high,
      typicalPerWeek: perWeek,
      typicalFrequency: range?.frequency ?? null,
      weeklyMcg,
      typicalWeeklyLowMcg: weeklyLow,
      typicalWeeklyHighMcg: weeklyHigh,
      relativeToTypical,
      comparedOn: basis,
      peptide,
    };
  });
}

/**
 * The blend dose at which a chosen component lands on a target amount.
 *
 * Answers "how much KLOW do I take to get 250 mcg of BPC-157", which is the
 * question people are actually asking when they pick a blend dose.
 */
export function blendDoseForComponent(
  blend: Peptide,
  componentId: string,
  targetMcg: number): number {
  const parts = decomposeDose(blend, 1000, undefined);
  const part = parts.find((p) => p.peptideId === componentId);
  if (!part || !(part.fraction > 0) || !(targetMcg > 0)) return NaN;
  return targetMcg / part.fraction;
}

/** Components that can be modelled, i.e. have a published half-life. */
export function modellableComponents(parts: ComponentDose[]) {
  return parts.filter((p) => p.peptide?.halfLifeHours != null);
}

/**
 * A one-line summary of what a blend dose is doing, for the dashboard.
 * Names the components that land outside their usual standalone range,
 * because that is the thing a fixed ratio makes easy to miss.
 */
export function describeBlendDose(parts: ComponentDose[]): string | null {
  const above = parts.filter((p) => p.relativeToTypical === "above");
  const below = parts.filter((p) => p.relativeToTypical === "below");

  const basis = parts.find((p) => p.comparedOn !== "none")?.comparedOn ?? "per-dose";
  const per = basis === "weekly" ? "for a week" : "at this dose";

  if (above.length) {
    return `${above.map((p) => p.name).join(" and ")} ${
      above.length === 1 ? "is" : "are"
    } above the usual standalone amount ${per}.`;
  }
  if (below.length === parts.length) {
    return "Every component lands below its usual standalone dose.";
  }
  if (below.length) {
    return `${below.map((p) => p.name).join(" and ")} ${
      below.length === 1 ? "is" : "are"
    } below the usual standalone amount ${per}.`;
  }
  return null;
}
