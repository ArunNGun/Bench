/**
 * Turning a protocol's schedule into concrete dose times.
 *
 * All reasoning happens in local time, because "every Monday at 8am" means the
 * user's Monday, not UTC's. Dates are handled through Date's local accessors
 * rather than by adding fixed millisecond offsets, so daylight-saving shifts
 * keep a dose at the same wall-clock time.
 */

import type { Protocol, Schedule, TitrationStep } from "../types";

export const DAY_MS = 86_400_000;

/** Midnight local time on the day containing `ms`. */
export function startOfLocalDay(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** The last instant of the local day containing `ms`. */
export function endOfLocalDay(ms: number) {
  const d = new Date(ms);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** Add whole days in local time, surviving daylight-saving transitions. */
export function addLocalDays(ms: number, days: number) {
  const d = new Date(ms);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** Whole local days between two instants, ignoring time of day. */
export function daysBetween(fromMs: number, toMs: number) {
  return Math.round((startOfLocalDay(toMs) - startOfLocalDay(fromMs)) / DAY_MS);
}

/** Apply "HH:MM" to a day, defaulting to 09:00 when unset. */
export function atTimeOfDay(dayMs: number, timeOfDay?: string) {
  const d = new Date(startOfLocalDay(dayMs));
  const [h, m] = (timeOfDay ?? "09:00").split(":").map(Number);
  d.setHours(Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0, 0, 0);
  return d.getTime();
}

/**
 * Whether a cycling protocol is in an "on" week on a given day.
 * A protocol with no cycle configured is always on.
 */
export function isOnCycle(schedule: Schedule, startedAt: number, dayMs: number) {
  const on = schedule.cycleWeeksOn ?? 0;
  const off = schedule.cycleWeeksOff ?? 0;
  if (on <= 0 || off <= 0) return true;

  const days = daysBetween(startedAt, dayMs);
  if (days < 0) return false;
  const period = (on + off) * 7;
  return days % period < on * 7;
}

/** Whether a dose is scheduled on a given local day. */
export function isDoseDay(schedule: Schedule, startedAt: number, dayMs: number) {
  const day = startOfLocalDay(dayMs);
  if (day < startOfLocalDay(startedAt)) return false;
  if (!isOnCycle(schedule, startedAt, day)) return false;

  switch (schedule.kind) {
    case "daily":
      return true;
    case "interval-days": {
      const n = schedule.intervalDays ?? 1;
      if (n < 1) return false;
      return daysBetween(startedAt, day) % n === 0;
    }
    case "days-of-week":
      return (schedule.daysOfWeek ?? []).includes(new Date(day).getDay());
    case "as-needed":
      return false;
  }
}

/** Scheduled dose times within a window, inclusive of both ends. */
export function doseTimesBetween(
  schedule: Schedule,
  startedAt: number,
  fromMs: number,
  toMs: number,
  endedAt?: number): number[] {
  if (schedule.kind === "as-needed") return [];
  const out: number[] = [];
  const limit = endedAt ?? Infinity;

  let day = startOfLocalDay(Math.max(fromMs, startedAt));
  const last = startOfLocalDay(toMs);
  // Guard against a pathological window rather than looping forever.
  let guard = 0;

  while (day <= last && guard++ < 4000) {
    if (isDoseDay(schedule, startedAt, day)) {
      const t = atTimeOfDay(day, schedule.timeOfDay);
      if (t >= fromMs && t <= toMs && t <= limit) out.push(t);
    }
    day = addLocalDays(day, 1);
  }
  return out;
}

/** The next scheduled dose at or after `fromMs`. */
export function nextDoseTime(
  schedule: Schedule,
  startedAt: number,
  fromMs: number,
  endedAt?: number): number | null {
  if (schedule.kind === "as-needed") return null;

  let day = startOfLocalDay(Math.max(fromMs, startedAt));
  for (let i = 0; i < 400; i++) {
    if (isDoseDay(schedule, startedAt, day)) {
      const t = atTimeOfDay(day, schedule.timeOfDay);
      if (t >= fromMs && (endedAt == null || t <= endedAt)) return t;
    }
    day = addLocalDays(day, 1);
  }
  return null;
}

/** The most recent scheduled dose at or before `fromMs`. */
export function previousDoseTime(
  schedule: Schedule,
  startedAt: number,
  fromMs: number): number | null {
  if (schedule.kind === "as-needed") return null;

  let day = startOfLocalDay(fromMs);
  const floor = startOfLocalDay(startedAt);
  for (let i = 0; i < 400 && day >= floor; i++) {
    if (isDoseDay(schedule, startedAt, day)) {
      const t = atTimeOfDay(day, schedule.timeOfDay);
      if (t <= fromMs) return t;
    }
    day = addLocalDays(day, -1);
  }
  return null;
}

/** Scheduled doses per week, for burn-rate and inventory maths. */
export function dosesPerWeek(schedule: Schedule) {
  let base: number;
  switch (schedule.kind) {
    case "daily":
      base = 7;
      break;
    case "interval-days":
      base = 7 / Math.max(1, schedule.intervalDays ?? 1);
      break;
    case "days-of-week":
      base = (schedule.daysOfWeek ?? []).length;
      break;
    case "as-needed":
      return 0;
  }
  const on = schedule.cycleWeeksOn ?? 0;
  const off = schedule.cycleWeeksOff ?? 0;
  if (on > 0 && off > 0) base *= on / (on + off);
  return base;
}

// ---------------------------------------------------------------------------
// Titration
// ---------------------------------------------------------------------------

/** Cumulative week at which each titration step begins. */
export function titrationStepStartWeeks(steps: TitrationStep[]) {
  const starts: number[] = [];
  let acc = 0;
  for (const s of steps) {
    starts.push(acc);
    acc += Math.max(0, s.weeks);
  }
  return starts;
}

export function titrationTotalWeeks(steps: TitrationStep[]) {
  return steps.reduce((sum, s) => sum + Math.max(0, s.weeks), 0);
}

/**
 * Which titration step applies at a given moment.
 * Past the end of the plan, the final step holds indefinitely.
 */
export function titrationStepAt(steps: TitrationStep[], startedAt: number, atMs: number) {
  if (!steps.length) return null;
  const days = daysBetween(startedAt, atMs);
  if (days < 0) return null;

  const week = Math.floor(days / 7);
  let acc = 0;
  for (let i = 0; i < steps.length; i++) {
    acc += Math.max(0, steps[i].weeks);
    if (week < acc) return { index: i, step: steps[i] };
  }
  return { index: steps.length - 1, step: steps[steps.length - 1] };
}

/** The dose a protocol calls for at a given moment. */
export function scheduledDoseMcg(protocol: Protocol, atMs: number) {
  if (protocol.titration?.length && protocol.titrationAutoAdvance) {
    const current = titrationStepAt(protocol.titration, protocol.startedAt, atMs);
    if (current) return current.step.doseMcg;
  }
  return protocol.doseMcg;
}

// ---------------------------------------------------------------------------
// Adherence
// ---------------------------------------------------------------------------

export interface AdherenceWindow {
  expected: number;
  taken: number;
  skipped: number;
  missed: number;
  /** Taken as a share of expected. 1 means every scheduled dose was logged. */
  rate: number;
}

/**
 * Compare scheduled doses against what was logged.
 *
 * A logged dose counts against the nearest scheduled time within
 * `toleranceHours`, so taking Monday's dose on Monday evening still counts.
 * Doses explicitly marked skipped are separated from ones simply never logged.
 */
/**
 * The doses belonging to a protocol.
 *
 * `adherence` cannot do this itself: it only sees timestamps, by design, so it
 * can be reused for anything with a schedule. That makes forgetting to filter
 * an easy and silent mistake, and a costly one. Passing every log matches other
 * compounds' doses against this protocol's schedule and reports adherence for a
 * compound that was never taken. Use this rather than filtering by hand.
 */
export function logsForProtocol<T extends { protocolId?: string; peptideId: string }>(
  protocol: Pick<Protocol, "id" | "peptideId">,
  logs: T[],
): T[] {
  return logs.filter((l) => l.protocolId === protocol.id || l.peptideId === protocol.peptideId);
}

/**
 * Compare scheduled doses against what was logged.
 *
 * **`logs` must already be narrowed to this protocol**, via `logsForProtocol`.
 * Anything else in the array will be matched against the schedule and counted.
 */
export function adherence(
  protocol: Protocol,
  logs: { at: number; skipped?: boolean }[],
  fromMs: number,
  toMs: number,
  toleranceHours = 36): AdherenceWindow {
  const scheduled = doseTimesBetween(
    protocol.schedule,
    protocol.startedAt,
    fromMs,
    toMs,
    protocol.endedAt);
  const tolerance = toleranceHours * 3_600_000;
  const unmatched = logs.filter((l) => l.at >= fromMs - tolerance && l.at <= toMs + tolerance);

  /*
   * Greedy nearest matching, over a sliding window rather than the whole array.
   *
   * The obvious version compares every scheduled time against every log, which
   * is fine for a month and quadratic for a history: two years of daily dosing
   * is 730 scheduled times against 730 logs, half a million comparisons, and it
   * measured at over 5 ms for three protocols.
   *
   * Both sides are ordered in time and a log can only match within a fixed
   * tolerance, so only a handful of logs are ever candidates for a given
   * scheduled time. Walking a window over the sorted logs finds exactly the
   * same candidate set the full scan would have accepted.
   *
   * The result is identical, including ties. The original scanned in array
   * order and kept the first strictly-nearest, so equal distances resolved to
   * the lowest original index; that rule is preserved explicitly below.
   */
  const order = unmatched
    .map((l, i) => ({ at: l.at, skipped: l.skipped, i }))
    .sort((a, b) => a.at - b.at || a.i - b.i);

  const used = new Set<number>();
  let taken = 0;
  let skipped = 0;
  let windowStart = 0;

  for (const time of scheduled) {
    // Drop entries that can no longer reach this or any later scheduled time.
    while (windowStart < order.length && order[windowStart].at < time - tolerance) windowStart++;

    let bestIdx = -1;
    let bestDist = Infinity;

    for (let w = windowStart; w < order.length; w++) {
      const entry = order[w];
      if (entry.at > time + tolerance) break;
      if (used.has(entry.i)) continue;

      const dist = Math.abs(entry.at - time);
      // Strictly nearer wins; on a tie the lower original index wins, which is
      // what scanning the unsorted array in order used to do.
      if (dist < bestDist || (dist === bestDist && bestIdx >= 0 && entry.i < bestIdx)) {
        bestDist = dist;
        bestIdx = entry.i;
      }
    }

    if (bestIdx >= 0) {
      used.add(bestIdx);
      if (unmatched[bestIdx].skipped) skipped++;
      else taken++;
    }
  }

  const expected = scheduled.length;
  return {
    expected,
    taken,
    skipped,
    missed: expected - taken - skipped,
    rate: expected > 0 ? taken / expected : 1,
  };
}

export type DueState = "overdue" | "due-now" | "upcoming" | "scheduled" | "none";

export interface DueStatus {
  state: DueState;
  at: number | null;
  /** Hours until due; negative when overdue. */
  hoursAway: number;
  label: string;
}

export interface DueOptions {
  /**
   * When the most recent dose was logged. Required to tell "overdue" from
   * "already taken, waiting for the next one", without it every protocol
   * would read as overdue for most of the gap between doses.
   */
  lastLoggedAt?: number | null;
  /** Hours either side of the scheduled time that still count as on time. */
  graceHours?: number;
  /** How close a log must be to a scheduled dose to be counted against it. */
  toleranceHours?: number;
}

/**
 * How a protocol's next dose should be presented.
 *
 * The most recent scheduled dose is only overdue when nothing has been logged
 * against it. Once it is covered, attention moves to the next one.
 */
export function dueStatus(protocol: Protocol, nowMs: number, options: DueOptions = {}): DueStatus {
  const { lastLoggedAt = null, graceHours = 4, toleranceHours = 12 } = options;
  if (!protocol.active) return { state: "none", at: null, hoursAway: 0, label: "Paused" };

  const grace = graceHours * 3_600_000;
  const tolerance = toleranceHours * 3_600_000;
  const prev = previousDoseTime(protocol.schedule, protocol.startedAt, nowMs);
  const prevCovered = prev != null && lastLoggedAt != null && lastLoggedAt >= prev - tolerance;

  if (prev != null && !prevCovered && (protocol.endedAt == null || prev <= protocol.endedAt)) {
    const hoursAway = (prev - nowMs) / 3_600_000;
    if (nowMs - prev <= grace) {
      return { state: "due-now", at: prev, hoursAway, label: "Due now" };
    }
    return { state: "overdue", at: prev, hoursAway, label: "Overdue" };
  }

  const next = nextDoseTime(protocol.schedule, protocol.startedAt, nowMs, protocol.endedAt);
  if (next == null) return { state: "none", at: null, hoursAway: 0, label: "No dose scheduled" };

  const hours = (next - nowMs) / 3_600_000;
  if (hours <= graceHours) {
    return { state: "due-now", at: next, hoursAway: hours, label: "Due now" };
  }
  if (next <= endOfLocalDay(nowMs)) {
    return { state: "upcoming", at: next, hoursAway: hours, label: "Due today" };
  }
  return { state: "scheduled", at: next, hoursAway: hours, label: "Scheduled" };
}
