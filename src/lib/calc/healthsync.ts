/**
 * Reconciling weight readings from a platform health store.
 *
 * One direction only: readings come in, nothing goes back out. All of the hard
 * part is here and platform-free, deciding which incoming samples are new and
 * which already exist under another name, so the behaviour can be tested
 * without an Android device.
 *
 * The rule that drives everything: a sample already seen, either by its own
 * record id or by closely matching a reading you entered, is never added twice.
 * Anything else turns one weigh-in into a duplicate on every sync.
 */

import type { Measurement, MeasurementSource } from "../types";

/** A weight reading as the platform reports it. */
export interface HealthSample {
  /** The platform's own record id. Stable across reads. */
  externalId: string;
  at: number;
  weightKg: number;
}

/**
 * How close two readings must be to count as the same event.
 * Scales default to a tenth of a kilogram, and the timestamp a platform
 * records can drift a little from the one the app stored.
 */
export const MATCH_WINDOW_MS = 5 * 60_000;
export const MATCH_WEIGHT_KG = 0.15;

const isSameReading = (a: { at: number; weightKg?: number }, b: HealthSample) =>
  a.weightKg != null &&
  Math.abs(a.at - b.at) <= MATCH_WINDOW_MS &&
  Math.abs(a.weightKg - b.weightKg) <= MATCH_WEIGHT_KG;

export interface PullPlan {
  /** Samples not previously seen, ready to be stored. */
  toAdd: HealthSample[];
  /**
   * Readings you typed that turn out to match a platform sample. Adopting the
   * external id stops the next sync importing the same reading again.
   */
  toLink: { id: string; externalId: string }[];
  /** Samples already accounted for. */
  skipped: number;
}

/**
 * Work out what a read from the platform should change.
 *
 * A sample is skipped when its record id is already stored. Otherwise, if it
 * closely matches a reading you entered by hand, that reading is linked to it
 * rather than a duplicate being created, which is what happens when you weigh
 * yourself, type it in, and the scale syncs a moment later.
 */
export function planPull(existing: Measurement[], incoming: HealthSample[]): PullPlan {
  const knownIds = new Set(
    existing.map((m) => m.externalId).filter((x): x is string => !!x));

  const toAdd: HealthSample[] = [];
  const toLink: { id: string; externalId: string }[] = [];
  const claimed = new Set<string>();
  let skipped = 0;

  for (const sample of incoming) {
    if (knownIds.has(sample.externalId)) {
      skipped++;
      continue;
    }

    const match = existing.find(
      (m) => !m.externalId && !claimed.has(m.id) && isSameReading(m, sample));

    if (match) {
      claimed.add(match.id);
      toLink.push({ id: match.id, externalId: sample.externalId });
    } else {
      toAdd.push(sample);
    }
  }

  return { toAdd, toLink, skipped };
}

/**
 * The most recent sample, or null if there are none.
 *
 * Used to prefill the weight field, so it has to be the newest rather than the
 * last in the array, nothing guarantees the platform returns them in order.
 */
export function newestSample(samples: HealthSample[]): HealthSample | null {
  let best: HealthSample | null = null;
  for (const s of samples) {
    if (!(s.weightKg > 0)) continue;
    if (!best || s.at > best.at) best = s;
  }
  return best;
}

/** Turn an accepted sample into a stored reading. */
export function sampleToMeasurement(
  sample: HealthSample,
  profileId: string,
  id: string): Measurement {
  return {
    id,
    profileId,
    at: sample.at,
    weightKg: sample.weightKg,
    source: "health-connect" satisfies MeasurementSource,
    externalId: sample.externalId,
  };
}

export interface SyncSummary {
  added: number;
  linked: number;
  skipped: number;
}

export function summarise(plan: PullPlan): SyncSummary {
  return {
    added: plan.toAdd.length,
    linked: plan.toLink.length,
    skipped: plan.skipped,
  };
}

/** A sentence for the settings screen, rather than four raw counts. */
export function describeSync(s: SyncSummary): string {
  const bits: string[] = [];
  if (s.added) bits.push(`${s.added} brought in`);
  if (s.linked) bits.push(`${s.linked} matched to yours`);
  if (!bits.length) return "Already up to date.";
  return `${bits.join(", ")}.`;
}
