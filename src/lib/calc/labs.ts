/**
 * Reading blood results.
 *
 * Two separate questions, kept separate because they are different kinds of
 * claim. "Is this inside the interval my laboratory printed" is answered from the
 * result itself. "Which diagnostic band does this fall in" is answered only for
 * the markers where a guideline body defines the bands. When neither applies the
 * verdict is `unknown`, and the app says so rather than inventing one.
 */

import type { LabBand, LabGuideline, LabMarker, LabResult } from "../types";

export type LabStatus = "in-range" | "below" | "above" | "banded" | "unknown";

export interface LabVerdict {
  status: LabStatus;
  /** Short wording for the badge. */
  label: string;
  tone: "leaf" | "tangerine" | "rose" | "muted";
  /** Where the judgement came from, so it can be checked. */
  basis: string | null;
}

const UNKNOWN: LabVerdict = {
  status: "unknown",
  label: "no range",
  tone: "muted",
  basis: null,
};

function inBand(band: LabBand, value: number) {
  if (band.from != null && value < band.from) return false;
  if (band.under != null && value >= band.under) return false;
  return true;
}

function fromGuideline(guideline: LabGuideline, value: number): LabVerdict | null {
  const band = guideline.bands.find((b) => inBand(b, value));
  if (!band) return null;
  return {
    status: "banded",
    label: band.label,
    tone: band.tone,
    basis: guideline.source,
  };
}

/**
 * Judge one result.
 *
 * The laboratory's own interval wins when it is recorded, because it is specific
 * to the sample. A guideline band is used otherwise.
 */
export function verdictFor(marker: LabMarker | undefined, result: LabResult): LabVerdict {
  if (!marker || !Number.isFinite(result.value)) return UNKNOWN;

  const { refLow, refHigh, value } = result;
  const hasOwnRange = refLow != null || refHigh != null;

  if (hasOwnRange) {
    if (refLow != null && value < refLow) {
      return {
        status: "below",
        label: "below range",
        // For HDL, low is the bad direction; for everything else here, high is.
        tone: marker.higherIsBetter ? "rose" : "tangerine",
        basis: "your lab's range",
      };
    }
    if (refHigh != null && value > refHigh) {
      return {
        status: "above",
        label: "above range",
        tone: marker.higherIsBetter ? "tangerine" : "rose",
        basis: "your lab's range",
      };
    }
    return { status: "in-range", label: "in range", tone: "leaf", basis: "your lab's range" };
  }

  if (marker.guideline) {
    const banded = fromGuideline(marker.guideline, value);
    if (banded) return banded;
  }

  return UNKNOWN;
}

export interface LabPoint {
  at: number;
  value: number;
  id: string;
}

/** One marker's results, oldest first, ready to plot. */
export function labSeries(labs: LabResult[], markerId: string): LabPoint[] {
  return labs
    .filter((l) => l.markerId === markerId && Number.isFinite(l.value))
    .map((l) => ({ at: l.at, value: l.value, id: l.id }))
    .sort((a, b) => a.at - b.at);
}

export interface LabTrend {
  first: LabPoint;
  latest: LabPoint;
  delta: number;
  /** Percent change from the first reading. Null when the first is zero. */
  percent: number | null;
  days: number;
}

/**
 * Change across the whole record for one marker, or null with fewer than two
 * results, a single point is not a trend and should not be drawn as one.
 */
export function labTrend(labs: LabResult[], markerId: string): LabTrend | null {
  const series = labSeries(labs, markerId);
  if (series.length < 2) return null;

  const first = series[0];
  const latest = series[series.length - 1];
  const delta = latest.value - first.value;

  return {
    first,
    latest,
    delta,
    percent: first.value === 0 ? null : (delta / Math.abs(first.value)) * 100,
    days: (latest.at - first.at) / 86_400_000,
  };
}

/** The most recent result for a marker, or null. */
export function latestResult(labs: LabResult[], markerId: string): LabResult | null {
  let best: LabResult | null = null;
  for (const l of labs) {
    if (l.markerId !== markerId) continue;
    if (!best || l.at > best.at) best = l;
  }
  return best;
}

/** Marker ids that have at least one result, most recently measured first. */
export function trackedMarkerIds(labs: LabResult[]): string[] {
  const newest = new Map<string, number>();
  for (const l of labs) {
    const seen = newest.get(l.markerId);
    if (seen == null || l.at > seen) newest.set(l.markerId, l.at);
  }
  return [...newest.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

/**
 * Which markers are worth watching given what is actually being run.
 *
 * Keyed off the compound's own category and receptor classes rather than a
 * hand-maintained list per peptide, so a new library entry is covered the moment
 * it is categorised.
 */
export function suggestedMarkerIds(
  compounds: {
    category: string;
    mechanismClass?: string[];
    c17AlphaAlkylated?: boolean;
  }[]): string[] {
  const out = new Set<string>();

  for (const c of compounds) {
    const classes = c.mechanismClass ?? [];

    if (c.category === "anabolic") {
      // The three that actually change management on an androgen: red cell mass
      // rises dose-dependently and is the usual reason to cut back, HDL falls,
      // and blood pressure follows both.
      out.add("haematocrit");
      out.add("hdl");
      out.add("triglycerides");
      out.add("bp-systolic");
      out.add("bp-diastolic");

      // 17-alpha-alkylation is what makes an oral survive the liver, and what
      // makes it hard on the liver.
      if (c.c17AlphaAlkylated) {
        out.add("alt");
        out.add("ast");
      }
    }

    if (c.category === "metabolic" || classes.length) {
      out.add("hba1c");
      out.add("glucose-fasting");
      out.add("triglycerides");
    }

    // Pancreatitis is the recognised serious risk with incretin agonists, and
    // heart rate rises measurably on them.
    if (classes.includes("glp1-agonist") || classes.includes("gip-agonist")) {
      out.add("lipase");
      out.add("resting-hr");
    }

    if (
      c.category === "growth-hormone" ||
      classes.includes("ghrh-analogue") ||
      classes.includes("ghrelin-agonist")
    ) {
      // Growth hormone raises IGF-1 by design and worsens glucose handling as a
      // side effect, so both belong together.
      out.add("igf1");
      out.add("glucose-fasting");
      out.add("hba1c");
    }
  }

  return [...out];
}

/** Suggested markers that have no result recorded yet. */
export function missingMarkerIds(
  labs: LabResult[],
  compounds: Parameters<typeof suggestedMarkerIds>[0]): string[] {
  const have = new Set(labs.map((l) => l.markerId));
  return suggestedMarkerIds(compounds).filter((id) => !have.has(id));
}
