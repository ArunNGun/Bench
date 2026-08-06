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

// ---------------------------------------------------------------------------
// Sleep and resting heart rate
// ---------------------------------------------------------------------------

/**
 * These two exist to give the daily check-in something objective beside it.
 *
 * A check-in records that sleep felt broken. Sleep duration and resting heart
 * rate are the two numbers a phone already has that move with that, so a claim
 * like "sleep is worse on this dose" can be held against something other than
 * memory. Still read-only: the app takes these and never writes them back.
 */

/** One stretch of sleep as the platform reports it. */
export interface SleepSegment {
  externalId: string;
  startAt: number;
  endAt: number;
  /** Stage label where the platform gave one: asleep, rem, deep, light, awake, inBed. */
  state?: string;
}

/** Sleep for one night, attributed to the morning you woke up. */
export interface NightSleep {
  /** Local midnight of the day the sleep is credited to. */
  day: number;
  hours: number;
  /** How many segments were summed, for spotting a fragmented night. */
  segments: number;
}

/**
 * States that are time in bed rather than time asleep.
 *
 * Counting these would inflate every night by however long someone lay awake,
 * which is exactly the number a person complaining about their sleep cares
 * about most.
 */
const NOT_ASLEEP = new Set(["awake", "inbed"]);

/**
 * Merge overlapping intervals.
 *
 * Health Connect can return a session and its stage breakdown covering the same
 * minutes. Summing both would report roughly twice the sleep actually had, and
 * a doubled figure looks plausible enough that nobody would question it.
 */
export function mergeIntervals(
  spans: { startAt: number; endAt: number }[],
): { startAt: number; endAt: number }[] {
  const sorted = [...spans]
    .filter((s) => s.endAt > s.startAt)
    .sort((a, b) => a.startAt - b.startAt);

  const out: { startAt: number; endAt: number }[] = [];
  for (const span of sorted) {
    const last = out[out.length - 1];
    if (last && span.startAt <= last.endAt) last.endAt = Math.max(last.endAt, span.endAt);
    else out.push({ ...span });
  }
  return out;
}

/**
 * Total sleep per night.
 *
 * Credited to the day you woke, not the day you lay down, because that is the
 * day whose energy and mood a check-in is describing. A nap is folded into
 * whatever day it happened on, which is the same rule applied consistently
 * rather than a special case.
 *
 * `startOfDay` is injected so this stays testable across timezones without the
 * module reaching for a date library.
 */
export function nightlySleep(
  segments: SleepSegment[],
  startOfDay: (ms: number) => number,
): NightSleep[] {
  const byDay = new Map<number, { startAt: number; endAt: number }[]>();

  for (const s of segments) {
    if (!(s.endAt > s.startAt)) continue;
    if (s.state && NOT_ASLEEP.has(s.state.toLowerCase())) continue;
    const day = startOfDay(s.endAt);
    const list = byDay.get(day) ?? [];
    list.push({ startAt: s.startAt, endAt: s.endAt });
    byDay.set(day, list);
  }

  return [...byDay]
    .map(([day, spans]) => {
      const merged = mergeIntervals(spans);
      const ms = merged.reduce((sum, m) => sum + (m.endAt - m.startAt), 0);
      return { day, hours: ms / 3_600_000, segments: merged.length };
    })
    .sort((a, b) => b.day - a.day);
}

/** A resting heart rate reading. */
export interface HeartRateSample {
  externalId: string;
  at: number;
  bpm: number;
}

/**
 * The lowest reading of each day, which is the one worth keeping.
 *
 * Health Connect returns several resting readings a day and they disagree by a
 * few beats. Taking the minimum gives a consistent figure across days, and
 * consistency is what a trend needs; an average drifts with how many times the
 * watch happened to sample.
 */
export function dailyRestingHr(
  samples: HeartRateSample[],
  startOfDay: (ms: number) => number,
): { day: number; bpm: number }[] {
  const byDay = new Map<number, number>();

  for (const s of samples) {
    if (!(s.bpm > 0)) continue;
    const day = startOfDay(s.at);
    const seen = byDay.get(day);
    if (seen == null || s.bpm < seen) byDay.set(day, s.bpm);
  }

  return [...byDay]
    .map(([day, bpm]) => ({ day, bpm }))
    .sort((a, b) => b.day - a.day);
}
