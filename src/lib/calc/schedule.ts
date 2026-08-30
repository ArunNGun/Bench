/**
 * Turning a protocol's schedule into concrete dose times.
 *
 * All reasoning happens in local time, because "every Monday at 8am" means the
 * user's Monday, not UTC's. Dates are handled through Date's local accessors
 * rather than by adding fixed millisecond offsets, so daylight-saving shifts
 * keep a dose at the same wall-clock time.
 */

import type { Protocol, ProtocolPhase, Schedule, TitrationStep } from "../types";

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

/** "7:5" and "07:05" are the same time. Anything unreadable is nine o'clock. */
function normalizeTime(raw: string): string {
  const [h, m] = String(raw).split(":").map(Number);
  const hh = Number.isFinite(h) ? Math.min(23, Math.max(0, Math.trunc(h))) : 9;
  const mm = Number.isFinite(m) ? Math.min(59, Math.max(0, Math.trunc(m))) : 0;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * Every time a dose day carries, in order, deduplicated.
 *
 * The one place `timesOfDay` and `timeOfDay` are reconciled. Two fields for
 * one fact is a smell, and the alternative was migrating every protocol and
 * every phase inside it on the promise that no importer, no backup and no
 * older copy of the app would ever hand back the old shape. This is the
 * cheaper half of that trade, on the condition that nothing reads either field
 * directly, which is what makes this function the rule rather than a helper.
 */
export function scheduleTimes(schedule: Schedule): string[] {
  // Blanks are dropped rather than read as midnight or as nine o'clock: a time
  // field being edited is empty for a keystroke or two, and a schedule must not
  // grow a dose out of that.
  const listed = (schedule.timesOfDay ?? []).filter((t) => String(t).trim());
  const raw = listed.length ? listed : [schedule.timeOfDay ?? "09:00"];
  const seen = new Set<string>();

  for (const t of raw) seen.add(normalizeTime(t));
  return [...seen].sort();
}

/** How many injections a dose day asks for. Never zero, so it is safe to divide by. */
export function dosesPerDoseDay(schedule: Schedule): number {
  return schedule.kind === "as-needed" ? 1 : scheduleTimes(schedule).length;
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

  const times = scheduleTimes(schedule);

  while (day <= last && guard++ < 4000) {
    if (isDoseDay(schedule, startedAt, day)) {
      for (const time of times) {
        const t = atTimeOfDay(day, time);
        if (t >= fromMs && t <= toMs && t <= limit) out.push(t);
      }
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

  const times = scheduleTimes(schedule);

  let day = startOfLocalDay(Math.max(fromMs, startedAt));
  for (let i = 0; i < 400; i++) {
    if (isDoseDay(schedule, startedAt, day)) {
      for (const time of times) {
        const t = atTimeOfDay(day, time);
        if (t >= fromMs && (endedAt == null || t <= endedAt)) return t;
      }
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

  const times = [...scheduleTimes(schedule)].reverse();

  let day = startOfLocalDay(fromMs);
  const floor = startOfLocalDay(startedAt);
  for (let i = 0; i < 400 && day >= floor; i++) {
    if (isDoseDay(schedule, startedAt, day)) {
      for (const time of times) {
        const t = atTimeOfDay(day, time);
        if (t <= fromMs) return t;
      }
    }
    day = addLocalDays(day, -1);
  }
  return null;
}

/**
 * Scheduled doses per week, for burn-rate and inventory maths.
 *
 * Counts injections rather than dose days, because everything downstream of it
 * counts injections: doses left in a vial, days of supply, cost per week.
 */
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
  base *= scheduleTimes(schedule).length;

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

// ---------------------------------------------------------------------------
// Phases
//
// A phase list is the general form of a titration: weeks that each carry a dose
// and may carry their own frequency. Everything below resolves that list onto
// the calendar and then defers to the schedule primitives above, so a protocol
// with no phases takes exactly the same path it always did.
// ---------------------------------------------------------------------------

/** A phase placed on the calendar, ready to be asked for dose times. */
export interface PhaseSpan {
  index: number;
  phase: ProtocolPhase;
  /** The frequency in force, the phase's own or the protocol's. */
  schedule: Schedule;
  /**
   * What interval and cycle maths count from. Each phase counts from its own
   * beginning, so "from week 4, every 3 days" means every third day starting at
   * week 4 rather than a rhythm inherited from a start date months earlier.
   */
  anchor: number;
  /** First instant covered. */
  from: number;
  /** Last instant covered. Infinity for the final phase, which runs on. */
  to: number;
}

/**
 * The phase list governing a protocol, or null when none does.
 *
 * An auto-advancing titration is read as a phase list with no frequency of its
 * own, which is exactly what it is. That way one set of functions serves both
 * and there is no second code path to keep in step.
 */
export function protocolPhases(protocol: Protocol): ProtocolPhase[] | null {
  if (protocol.phases?.length) return protocol.phases;
  if (protocol.titration?.length && protocol.titrationAutoAdvance) {
    return protocol.titration.map((s) => ({
      step: s.step,
      doseMcg: s.doseMcg,
      weeks: s.weeks,
      note: s.note,
    }));
  }
  return null;
}

/**
 * What a band's frequency actually comes to.
 *
 * A band overrides only what it names. It was written as a whole copy of the
 * protocol's schedule taken at the moment the band was given a frequency of its
 * own, which means it silently pins whatever the protocol said that day, and
 * anything added to a schedule afterwards can never reach it.
 *
 * That is not theory. Times of day arrived after these copies existed: someone
 * with a plan in bands added an evening dose at the top of the form, the form
 * accepted it, the plan carried on dosing once a day, and nothing on screen
 * admitted the difference. Merging means an existing band picks up the evening
 * dose, and a band that sets its own times still keeps them.
 */
export function bandSchedule(protocol: Schedule, band?: Schedule): Schedule {
  return band ? { ...protocol, ...band } : protocol;
}

/**
 * Phases resolved onto the calendar.
 *
 * A protocol without phases yields a single span covering all of time, carrying
 * the protocol's own schedule and start. That is what keeps the phase-aware
 * functions bit for bit identical to the plain ones for existing data.
 */
export function phaseSpans(protocol: Protocol): PhaseSpan[] {
  const phases = protocolPhases(protocol);

  if (!phases) {
    return [
      {
        index: 0,
        phase: { step: 1, doseMcg: protocol.doseMcg, weeks: 0 },
        schedule: protocol.schedule,
        anchor: protocol.startedAt,
        from: protocol.startedAt,
        to: Infinity,
      },
    ];
  }

  const dayZero = startOfLocalDay(protocol.startedAt);
  const spans: PhaseSpan[] = [];
  let weeksSoFar = 0;

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const last = i === phases.length - 1;

    // The first phase begins when the protocol does, so that a protocol started
    // at midday does not appear to have begun at that morning's midnight.
    const anchor = i === 0 ? protocol.startedAt : addLocalDays(dayZero, weeksSoFar * 7);
    weeksSoFar += Math.max(0, phase.weeks);
    const to = last ? Infinity : addLocalDays(dayZero, weeksSoFar * 7) - 1;

    spans.push({
      index: i,
      phase,
      schedule: bandSchedule(protocol.schedule, phase.schedule),
      anchor,
      from: anchor,
      to,
    });
  }

  return spans;
}

/** The phase in force at a moment, or null before the protocol starts. */
export function phaseSpanAt(protocol: Protocol, atMs: number): PhaseSpan | null {
  if (atMs < startOfLocalDay(protocol.startedAt)) return null;
  const spans = phaseSpans(protocol);
  for (const span of spans) {
    if (atMs <= span.to) return span;
  }
  return spans[spans.length - 1] ?? null;
}

/**
 * Scheduled dose times for a protocol, phase by phase.
 *
 * Spans are consecutive and ordered, so concatenating their results keeps the
 * output sorted without a second pass.
 */
export function protocolDoseTimesBetween(
  protocol: Protocol,
  fromMs: number,
  toMs: number): number[] {
  const out: number[] = [];

  for (const span of phaseSpans(protocol)) {
    const lo = Math.max(fromMs, span.from);
    const hi = Math.min(toMs, span.to);
    if (lo > hi) continue;

    const limit = Math.min(protocol.endedAt ?? Infinity, span.to);
    out.push(
      ...doseTimesBetween(
        span.schedule,
        span.anchor,
        lo,
        hi,
        Number.isFinite(limit) ? limit : undefined));
  }

  return out;
}

/** The next scheduled dose for a protocol at or after `fromMs`. */
export function protocolNextDoseTime(protocol: Protocol, fromMs: number): number | null {
  for (const span of phaseSpans(protocol)) {
    if (span.to < fromMs) continue;

    const limit = Math.min(protocol.endedAt ?? Infinity, span.to);
    if (limit < fromMs) continue;

    const t = nextDoseTime(
      span.schedule,
      span.anchor,
      Math.max(fromMs, span.from),
      Number.isFinite(limit) ? limit : undefined);
    if (t != null) return t;
  }
  return null;
}

/** The most recent scheduled dose for a protocol at or before `fromMs`. */
export function protocolPreviousDoseTime(protocol: Protocol, fromMs: number): number | null {
  const spans = phaseSpans(protocol);

  for (let i = spans.length - 1; i >= 0; i--) {
    const span = spans[i];
    if (span.from > fromMs) continue;

    // Floored to the day rather than the instant, matching previousDoseTime's
    // own floor. A protocol started at three in the afternoon still counts that
    // morning's nine o'clock slot as its first scheduled dose.
    const t = previousDoseTime(span.schedule, span.anchor, Math.min(fromMs, span.to));
    if (t != null && t >= startOfLocalDay(span.from)) return t;
  }
  return null;
}

/**
 * Doses per week for a protocol as it stands at a moment.
 *
 * Deliberately the current phase's rate rather than an average over the plan.
 * This feeds burn rate and days of supply, and the question those answer is how
 * fast the vial is emptying now, not how fast it will empty on average.
 */
export function protocolDosesPerWeek(protocol: Protocol, atMs: number) {
  const span = phaseSpanAt(protocol, atMs);
  return dosesPerWeek(span?.schedule ?? protocol.schedule);
}

/**
 * The dose a protocol calls for on a dose day, before it is split.
 *
 * This is the figure a plan is written in and the one the form asks for. It is
 * not what goes in a syringe unless the day carries a single time, so almost
 * everything wants `scheduledDoseMcg` instead.
 */
export function scheduledDailyMcg(protocol: Protocol, atMs: number) {
  if (protocol.phases?.length) {
    const span = phaseSpanAt(protocol, atMs);
    if (span) return span.phase.doseMcg;
  }
  if (protocol.titration?.length && protocol.titrationAutoAdvance) {
    const current = titrationStepAt(protocol.titration, protocol.startedAt, atMs);
    if (current) return current.step.doseMcg;
  }
  return protocol.doseMcg;
}

/**
 * The dose for one injection at a given moment.
 *
 * A day's dose divided by the times that day carries. Every caller wants this
 * one: what to draw up, what to log, what to take off the vial, what to feed a
 * curve. A day with one time divides by one and is unchanged, which is why
 * nothing had to move when splitting arrived.
 */
export function scheduledDoseMcg(protocol: Protocol, atMs: number) {
  const span = phaseSpanAt(protocol, atMs);
  const per = dosesPerDoseDay(span?.schedule ?? protocol.schedule);
  const daily = scheduledDailyMcg(protocol, atMs);
  return per > 1 ? daily / per : daily;
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
  const scheduled = protocolDoseTimesBetween(protocol, fromMs, toMs);
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
 * Whether a log taken before a scheduled dose was that dose.
 *
 * People take the morning injection when they get up, not when the plan says.
 * Log at half six for a seven o'clock dose and the log lands before the only
 * scheduled time it could belong to, so matching backwards counts it against
 * yesterday and leaves today's still asking to be taken. That reading is the
 * bug: the card said Due now for a dose already in the leg.
 *
 * Two conditions, both needed. The log has to be inside the same grace window
 * that already decides what counts as on time, which stops a dose taken very
 * late in the evening from quietly cancelling tomorrow morning's. And it has
 * to sit nearer to the coming dose than to the one behind it, so a log that
 * plainly belongs to the previous dose is never read as the next one.
 */
function loggedEarlyFor(
  next: number,
  prev: number | null,
  lastLoggedAt: number,
  graceMs: number): boolean {
  const early = next - lastLoggedAt;
  if (early < 0 || early > graceMs) return false;
  return prev == null || early < lastLoggedAt - prev;
}

/**
 * How long before a scheduled dose a log can be and still be that dose.
 *
 * A fixed twelve hours was half a day, which is fine for a weekly injection
 * and exactly wrong for a daily one: a dose taken at half eleven at night sits
 * seven hours before the seven o'clock dose, so the following morning read as
 * already taken and the compound quietly dropped off the Today page.
 *
 * A quarter of the gap to the dose before it keeps both. Daily allows six
 * hours, so an evening dose belongs to the evening it was taken in. Weekly
 * allows the full twelve, so a Sunday night injection still covers Monday
 * morning. Where there is no earlier dose to measure against, there is nothing
 * for the log to be confused with, and the plain tolerance stands.
 */
function earlyWindowMs(gapMs: number | null, capMs: number): number {
  return gapMs == null ? capMs : Math.min(capMs, gapMs / 4);
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
  const prev = protocolPreviousDoseTime(protocol, nowMs);
  const before = prev != null ? protocolPreviousDoseTime(protocol, prev - 1) : null;
  const early = earlyWindowMs(prev != null && before != null ? prev - before : null, tolerance);
  const prevCovered = prev != null && lastLoggedAt != null && lastLoggedAt >= prev - early;

  if (prev != null && !prevCovered && (protocol.endedAt == null || prev <= protocol.endedAt)) {
    const hoursAway = (prev - nowMs) / 3_600_000;
    if (nowMs - prev <= grace) {
      return { state: "due-now", at: prev, hoursAway, label: "Due now" };
    }
    return { state: "overdue", at: prev, hoursAway, label: "Overdue" };
  }

  let next = protocolNextDoseTime(protocol, nowMs);
  // Taken ahead of the clock, so the one being asked for is the one after it.
  if (next != null && lastLoggedAt != null && loggedEarlyFor(next, prev, lastLoggedAt, grace)) {
    next = protocolNextDoseTime(protocol, next + 1);
  }
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
