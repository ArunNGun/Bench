/**
 * Pharmacokinetics for the "right now" view.
 *
 * Subcutaneous dosing is modelled as a one-compartment system with
 * first-order absorption, the Bateman function:
 *
 *   C(t) = A · (e^(-ke·t) − e^(-ka·t))
 *
 * ke is fixed by the published elimination half-life. ka is solved from the
 * published time-to-peak. Where a compound has no published Tmax the curve
 * falls back to instant absorption and pure exponential decay.
 *
 * IMPORTANT: absolute plasma concentration needs bioavailability and volume of
 * distribution, which are unpublished for most of these compounds. Every curve
 * here is therefore normalised so that a single dose peaks at 1.0. The output
 * is a RELATIVE level, useful for "how much is still on board" and for
 * comparing today against yesterday, and meaningless as an absolute ng/mL.
 */

export const LN2 = Math.LN2;

/** Elimination rate constant from a half-life. */
export function eliminationRate(halfLifeHours: number) {
  return LN2 / halfLifeHours;
}

/** Fraction of a single dose still present after a given time. */
export function fractionRemaining(hoursElapsed: number, halfLifeHours: number) {
  if (hoursElapsed <= 0) return 1;
  if (!(halfLifeHours > 0)) return 0;
  return Math.pow(2, -hoursElapsed / halfLifeHours);
}

/**
 * Absorption rate constant implied by a time-to-peak.
 *
 * Tmax = ln(ka/ke) / (ka − ke) has no closed-form inverse, so ka is found by
 * bisection. Tmax approaches 1/ke as ka approaches ke from above, which caps
 * how slow an absorption the model can represent; a Tmax at or beyond that
 * limit is clamped just under it.
 */
export function absorptionRate(tmaxHours: number, halfLifeHours: number) {
  const ke = eliminationRate(halfLifeHours);
  const limit = 1 / ke;
  if (!(tmaxHours > 0)) return ke * 1000; // effectively instant
  const target = Math.min(tmaxHours, limit * 0.999);

  const tmaxFor = (ka: number) => Math.log(ka / ke) / (ka - ke);

  // tmax decreases monotonically as ka grows, so bracket and bisect.
  let lo = ke * 1.000001;
  let hi = ke * 1e6;
  for (let i = 0; i < 200; i++) {
    const mid = Math.sqrt(lo * hi); // geometric midpoint spans the wide range
    if (tmaxFor(mid) > target) lo = mid;
    else hi = mid;
  }
  return Math.sqrt(lo * hi);
}

export interface CurveParams {
  halfLifeHours: number;
  /** Time to peak plasma concentration. Omit for instant absorption. */
  tmaxHours?: number;
}

/**
 * Relative concentration from one dose, normalised so the peak is 1.0.
 * Returns 0 before the dose is given.
 */
/**
 * The constants a curve is built from, derived once per compound.
 *
 * `ka` costs a 200 step bisection to find, and it depends only on the half-life
 * and the time to peak. Those are fixed for a compound, while `singleDoseLevel`
 * is called once per dose per plotted point: a year of daily dosing on a 240
 * point chart is 87,000 calls, and solving the same `ka` 87,000 times made the
 * bisection roughly 15 times the cost of everything else combined. Measured at
 * 2.4 ms per chart before this cache and 0.2 ms after.
 */
interface CurveConstants {
  ke: number;
  /** Null when there is no absorption phase to model. */
  ka: number | null;
  /** Peak of the unnormalised shape, so the curve can be scaled to 1.0. */
  peak: number;
  degenerate: boolean;
}

/**
 * Keyed on the two inputs. Bounded because a user can define custom compounds,
 * and an unbounded cache on user input is a leak. Clearing wholesale rather
 * than evicting one entry is fine: refilling costs one bisection per compound
 * actually on screen.
 */
const CURVE_CACHE = new Map<string, CurveConstants>();
const CURVE_CACHE_LIMIT = 256;

export function curveConstants(halfLifeHours: number, tmaxHours?: number): CurveConstants {
  const key = `${halfLifeHours}:${tmaxHours ?? 0}`;
  const hit = CURVE_CACHE.get(key);
  if (hit) return hit;

  const ke = eliminationRate(halfLifeHours);
  let value: CurveConstants;

  if (!tmaxHours || tmaxHours <= 0) {
    value = { ke, ka: null, peak: 1, degenerate: false };
  } else {
    const ka = absorptionRate(tmaxHours, halfLifeHours);
    if (Math.abs(ka - ke) < 1e-12) {
      value = { ke, ka, peak: 1 / Math.E, degenerate: true };
    } else {
      const tmaxActual = Math.log(ka / ke) / (ka - ke);
      const peak = Math.exp(-ke * tmaxActual) - Math.exp(-ka * tmaxActual);
      value = { ke, ka, peak, degenerate: false };
    }
  }

  if (CURVE_CACHE.size >= CURVE_CACHE_LIMIT) CURVE_CACHE.clear();
  CURVE_CACHE.set(key, value);
  return value;
}

export function singleDoseLevel(hoursSinceDose: number, { halfLifeHours, tmaxHours }: CurveParams) {
  if (hoursSinceDose < 0) return 0;
  if (!(halfLifeHours > 0)) return 0;

  const { ke, ka, peak, degenerate } = curveConstants(halfLifeHours, tmaxHours);

  if (ka == null) return Math.exp(-ke * hoursSinceDose);

  if (degenerate) {
    // The Bateman function collapses to t·ke·e^(-ke·t) when ka meets ke.
    return (ke * hoursSinceDose * Math.exp(-ke * hoursSinceDose)) / peak;
  }

  if (!(peak > 0)) return 0;
  return (Math.exp(-ke * hoursSinceDose) - Math.exp(-ka * hoursSinceDose)) / peak;
}

/**
 * The curve to draw for a compound, and whether it is a claim about people.
 *
 * Three states, not two. A published human half-life gives a curve that means
 * what it looks like. A measurement from another species or another route gives
 * a curve whose shape is informative and whose height is not, and callers are
 * told so rather than left to notice. Neither gives nothing to draw.
 *
 * Structural rather than typed against `Peptide`, so the calc layer keeps
 * knowing nothing about the library it serves.
 */
export function curveFor(p: {
  halfLifeHours: number | null;
  tmaxHours?: number;
  halfLifeEstimate?: { hours: number };
}): { params: CurveParams; estimated: boolean } | null {
  if (p.halfLifeHours != null) {
    return { params: { halfLifeHours: p.halfLifeHours, tmaxHours: p.tmaxHours }, estimated: false };
  }
  if (p.halfLifeEstimate) {
    return {
      params: { halfLifeHours: p.halfLifeEstimate.hours, tmaxHours: p.tmaxHours },
      estimated: true,
    };
  }
  return null;
}

export interface DoseEvent {
  /** Epoch milliseconds. */
  at: number;
  /** Dose in micrograms. Scales the curve so a double dose reads double. */
  amountMcg: number;
  /**
   * The vial it was drawn from, where one was recorded. Carried through so a
   * reading can say which vial is behind a dose. Nothing in the model uses it,
   * and a dose without one is drawn exactly as before.
   */
  vialId?: string;
}

/**
 * Combined level from a dose history, by superposition.
 *
 * Scaled by dose relative to `referenceMcg`, so a compound taken at its usual
 * dose peaks near 1.0 and a double dose peaks near 2.0.
 */
export function levelAt(
  atMs: number,
  doses: DoseEvent[],
  params: CurveParams,
  referenceMcg: number): number {
  if (!(referenceMcg > 0)) return 0;
  let total = 0;
  for (const dose of doses) {
    if (dose.at > atMs) continue;
    const hours = (atMs - dose.at) / 3_600_000;
    // Beyond 10 half-lives the contribution is under 0.1%, skip it.
    if (hours > params.halfLifeHours * 10) continue;
    total += singleDoseLevel(hours, params) * (dose.amountMcg / referenceMcg);
  }
  return total;
}

export interface DoseContribution {
  dose: DoseEvent;
  /** What this dose alone accounts for at that moment, on the same scale. */
  level: number;
  /** Its share of the total, 0 to 1. */
  share: number;
}

export interface LevelBreakdown {
  /** The whole level, including doses too small to be listed. */
  total: number;
  /** The doses worth naming, largest first. */
  contributions: DoseContribution[];
}

/**
 * The same level, with the doses that make it up.
 *
 * `levelAt` answers "how much" and a reader looking at a curve usually wants
 * "from what". Halfway between two injections the honest answer is that both
 * are present in different amounts, and a single number cannot say it.
 *
 * Superposition is what makes this possible at all: the model adds independent
 * single-dose curves, so pulling them apart again is exact rather than an
 * apportionment after the fact.
 *
 * `minShare` drops the long tail. A dose from three half-lives ago contributes
 * something, and listing it next to this morning's injection suggests the two
 * are comparable. The total keeps every dose regardless, so the parts can add
 * up to less than the whole, which is the correct thing to happen: the
 * remainder is real, it is just not worth a line each.
 */
export function breakdownAt(
  atMs: number,
  doses: DoseEvent[],
  params: CurveParams,
  referenceMcg: number,
  minShare = 0.05): LevelBreakdown {
  if (!(referenceMcg > 0)) return { total: 0, contributions: [] };

  const parts: DoseContribution[] = [];
  let total = 0;

  for (const dose of doses) {
    if (dose.at > atMs) continue;
    const hours = (atMs - dose.at) / 3_600_000;
    if (hours > params.halfLifeHours * 10) continue;

    const level = singleDoseLevel(hours, params) * (dose.amountMcg / referenceMcg);
    if (level <= 0) continue;
    total += level;
    parts.push({ dose, level, share: 0 });
  }

  if (total <= 0) return { total: 0, contributions: [] };

  const contributions = parts
    .map((p) => ({ ...p, share: p.level / total }))
    .filter((p) => p.share >= minShare)
    .sort((a, b) => b.level - a.level);

  return { total, contributions };
}

export interface SeriesPoint {
  t: number;
  level: number;
}

/** Sample the combined curve across a window, for plotting. */
export function levelSeries(
  fromMs: number,
  toMs: number,
  steps: number,
  doses: DoseEvent[],
  params: CurveParams,
  referenceMcg: number): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  const span = toMs - fromMs;
  if (span <= 0 || steps < 2) return out;
  for (let i = 0; i < steps; i++) {
    const t = fromMs + (span * i) / (steps - 1);
    out.push({ t, level: levelAt(t, doses, params, referenceMcg) });
  }
  return out;
}

/**
 * Accumulation ratio for repeated dosing at a fixed interval:
 * steady-state peak divided by first-dose peak.
 */
export function accumulationRatio(intervalHours: number, halfLifeHours: number) {
  if (!(intervalHours > 0) || !(halfLifeHours > 0)) return 1;
  const ke = eliminationRate(halfLifeHours);
  return 1 / (1 - Math.exp(-ke * intervalHours));
}

/** Hours to reach a given fraction of steady state. Five half-lives ≈ 97%. */
export function timeToSteadyState(halfLifeHours: number, fraction = 0.97) {
  if (!(halfLifeHours > 0)) return 0;
  return -halfLifeHours * Math.log2(1 - fraction);
}

/** How long until a single dose decays to a given fraction of its peak. */
export function hoursUntilFraction(fraction: number, halfLifeHours: number) {
  if (!(fraction > 0) || fraction >= 1) return 0;
  return halfLifeHours * Math.log2(1 / fraction);
}

export type PhaseId = "absorbing" | "peak" | "active" | "trailing" | "cleared";

export interface Phase {
  id: PhaseId;
  label: string;
  /** Plain-language description of what the number means. */
  detail: string;
}

/**
 * Describe where a compound sits on its curve, for the dashboard copy.
 * `rising` distinguishes the climb to peak from the fall after it.
 */
export function describePhase(level: number, rising: boolean, nearPeak: boolean): Phase {
  if (level < 0.05) {
    return { id: "cleared", label: "Cleared", detail: "Under 5% of peak. Effectively out of your system." };
  }
  if (nearPeak) {
    return { id: "peak", label: "At peak", detail: "Near the highest level this dose will reach." };
  }
  if (rising) {
    return { id: "absorbing", label: "Absorbing", detail: "Still climbing toward peak." };
  }
  if (level >= 0.4) {
    return { id: "active", label: "Active", detail: "Past peak and still well within the active range." };
  }
  return { id: "trailing", label: "Trailing off", detail: "Falling toward the tail of the curve." };
}

export interface LevelSnapshot {
  level: number;
  rising: boolean;
  nearPeak: boolean;
  phase: Phase;
  /** Percentage of a single reference-dose peak. */
  percentOfPeak: number;
}

/** Everything the dashboard needs about one compound at one instant. */
export function snapshot(
  atMs: number,
  doses: DoseEvent[],
  params: CurveParams,
  referenceMcg: number): LevelSnapshot {
  const level = levelAt(atMs, doses, params, referenceMcg);
  const step = 6 * 60 * 1000; // look 6 minutes either side to find the slope
  const before = levelAt(atMs - step, doses, params, referenceMcg);
  const after = levelAt(atMs + step, doses, params, referenceMcg);

  const rising = after > level;
  const nearPeak = level > 0.05 && after <= level && before <= level;

  return {
    level,
    rising,
    nearPeak,
    phase: describePhase(level, rising, nearPeak),
    percentOfPeak: level * 100,
  };
}
