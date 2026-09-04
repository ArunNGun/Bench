/**
 * Reading something useful out of daily subjective ratings.
 *
 * The question these exist to answer is "is this doing anything", and for most
 * of this library weight cannot answer it. Someone on testosterone or growth
 * hormone is chasing energy, libido, sleep and recovery, and those are exactly
 * the things memory is worst at. Two weeks in, everyone remembers feeling
 * better; the log is the only thing that knows whether they did.
 *
 * On correlation, deliberately: nothing here computes a coefficient. Daily
 * self-ratings on a five point scale, from one person, over a few weeks, against
 * a protocol they chose because they expected it to work, cannot support that
 * claim, and dressing it up as statistics would make a guess look like a
 * finding. What it does instead is put the two periods side by side, say how
 * many days each rests on, and leave the reader to judge. That is honest and
 * still useful.
 */

import type { CheckIn, SymptomId } from "../types";
import { SYMPTOMS } from "../types";
import { startOfLocalDay, addLocalDays } from "./schedule";

const DAY = 86_400_000;

/** How few days makes a period not worth reporting on at all. */
export const MIN_DAYS_FOR_TREND = 4;

export interface SymptomAverage {
  id: SymptomId;
  label: string;
  /** Mean rating across the days that carried one, or null if none did. */
  mean: number | null;
  /** How many days contributed. Small numbers here should be shown, not hidden. */
  days: number;
  higherIsBetter?: boolean;
}

/** Mean rating per symptom across a set of check-ins. */
export function averages(checkIns: CheckIn[]): SymptomAverage[] {
  return SYMPTOMS.map((s) => {
    const values = checkIns
      .map((c) => c.ratings[s.id])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

    return {
      id: s.id,
      label: s.label,
      days: values.length,
      mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
      higherIsBetter: s.higherIsBetter,
    };
  });
}

/** Check-ins falling inside a half-open window, [from, to). */
export function inWindow(checkIns: CheckIn[], fromMs: number, toMs: number): CheckIn[] {
  return checkIns.filter((c) => c.at >= fromMs && c.at < toMs);
}

export interface SymptomShift {
  id: SymptomId;
  label: string;
  before: number | null;
  after: number | null;
  /** after minus before, or null when either side has no data. */
  delta: number | null;
  daysBefore: number;
  daysAfter: number;
  higherIsBetter?: boolean;
}

/**
 * How the ratings either side of a moment compare.
 *
 * Used to put "before this protocol started" next to "since", which is the
 * comparison people actually want. `windowDays` bounds both sides so a protocol
 * running for years is not compared against its own distant past.
 */
export function shiftAround(
  checkIns: CheckIn[],
  atMs: number,
  windowDays = 28,
  nowMs = Date.now(),
): SymptomShift[] {
  const pivot = startOfLocalDay(atMs);
  const span = windowDays * DAY;

  const before = averages(inWindow(checkIns, pivot - span, pivot));
  // Cap the forward edge at today, so a future pivot cannot include days that
  // have not happened. A clock that has jumped forward makes this reachable.
  const after = averages(inWindow(checkIns, pivot, Math.min(pivot + span, nowMs + DAY)));

  return SYMPTOMS.map((s, i) => {
    const b = before[i].mean;
    const a = after[i].mean;
    return {
      id: s.id,
      label: s.label,
      before: b,
      after: a,
      delta: b != null && a != null ? a - b : null,
      daysBefore: before[i].days,
      daysAfter: after[i].days,
      higherIsBetter: s.higherIsBetter,
    };
  });
}

/**
 * Whether a shift rests on enough days to be worth showing.
 *
 * A single rated day either side produces a delta of 4.0 and means nothing.
 * Rather than hiding thin comparisons, the UI shows the day counts and uses
 * this to decide whether to draw attention to one.
 */
export function isTrendworthy(shift: SymptomShift): boolean {
  return (
    shift.delta != null &&
    shift.daysBefore >= MIN_DAYS_FOR_TREND &&
    shift.daysAfter >= MIN_DAYS_FOR_TREND
  );
}

/** The check-in covering a given day, if one was recorded. */
export function checkInFor(checkIns: CheckIn[], dayMs: number): CheckIn | undefined {
  const day = startOfLocalDay(dayMs);
  return checkIns.find((c) => c.at === day);
}

export interface StreakInfo {
  /** Consecutive days ending today, or yesterday if today is not yet rated. */
  current: number;
  /** Days rated in the last 30. */
  last30: number;
}

/**
 * How consistently the log is being kept.
 *
 * Not a reward and not shown as one. It exists because every average above is
 * only as good as its coverage, and a reader deserves to know they are looking
 * at nine days out of thirty before they conclude anything.
 *
 * Today not being rated yet does not break a streak. It is not missed until the
 * day is over.
 */
export function streak(checkIns: CheckIn[], nowMs = Date.now()): StreakInfo {
  const rated = new Set(checkIns.map((c) => startOfLocalDay(c.at)));
  const today = startOfLocalDay(nowMs);

  let cursor = rated.has(today) ? today : addLocalDays(today, -1);
  let current = 0;
  while (rated.has(cursor)) {
    current++;
    cursor = addLocalDays(cursor, -1);
  }

  let last30 = 0;
  for (let i = 0; i < 30; i++) {
    if (rated.has(addLocalDays(today, -i))) last30++;
  }

  return { current, last30 };
}

/** A rating series for one symptom, oldest first, for charting. */
export function series(
  checkIns: CheckIn[],
  id: SymptomId,
): { at: number; value: number }[] {
  return checkIns
    .map((c) => ({ at: c.at, value: c.ratings[id] }))
    .filter((p): p is { at: number; value: number } => typeof p.value === "number")
    .sort((a, b) => a.at - b.at);
}

/**
 * The day a rating would belong to, or null when that day has not happened.
 *
 * A rating is a report of a day that was lived. While the only way to give one
 * was the card on Today, that was true by construction. Once any day became
 * reachable, the day became whatever a date field held, and a date field holds
 * tomorrow the moment somebody types a four in the wrong box.
 *
 * Refusing beats clamping to today, which looks kinder and would silently
 * overwrite the rating already given for today with one meant for a day that
 * has not arrived. Lives here rather than in the store or the screen so that
 * both ask the same question and a third caller cannot invent its own answer.
 */
export function ratableDay(at: number, nowMs = Date.now()): number | null {
  const day = startOfLocalDay(at);
  return day > startOfLocalDay(nowMs) ? null : day;
}

export interface DiaryDay<T> {
  /** Local midnight of the day. */
  day: number;
  /** That day's doses, in the order they were given. */
  entries: T[];
  /** How the day was rated, if it was. */
  checkIn?: CheckIn;
}

/**
 * A day at a time: what was taken, and how the day went.
 *
 * The Log has always grouped doses by day and shown nothing else, so a check-in
 * note was written, saved, and readable exactly until midnight. Reported by
 * someone who had a bad night, wrote it down at the time, and then could not
 * find which night it had been.
 *
 * Days with a rating but no dose are included, and that is not a detail: a
 * night of side effects on a rest day is precisely the entry worth keeping, and
 * hiding it would leave the note as invisible as it was before.
 *
 * Newest first, matching the page it feeds, and within a day the entries are
 * left in the order they arrive rather than re-sorted, because the caller has
 * already decided what that order means.
 */
export function diaryDays<T extends { at: number }>(
  entries: T[],
  checkIns: CheckIn[]): DiaryDay<T>[] {
  const days = new Map<number, DiaryDay<T>>();

  const dayFor = (at: number) => {
    const key = startOfLocalDay(at);
    const hit = days.get(key);
    if (hit) return hit;
    const made: DiaryDay<T> = { day: key, entries: [] };
    days.set(key, made);
    return made;
  };

  for (const entry of entries) dayFor(entry.at).entries.push(entry);
  // Last write wins, matching the store, which keeps at most one per day.
  for (const c of checkIns) dayFor(c.at).checkIn = c;

  return [...days.values()].sort((a, b) => b.day - a.day);
}
