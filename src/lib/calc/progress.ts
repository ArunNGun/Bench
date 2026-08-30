/**
 * Day-level progress and consistency.
 *
 * The dashboard needs a single "how am I doing today" figure and a streak,
 * both of which have to be honest: a day with nothing scheduled is neither a
 * win nor a miss, and today should never break a streak just because the
 * evening dose has not happened yet.
 */

import type { DoseLog, Protocol } from "../types";
import { protocolDoseTimesBetween, endOfLocalDay, startOfLocalDay, addLocalDays } from "./schedule";

export interface DayProgress {
  /** Midnight local time for the day. */
  day: number;
  /** Doses scheduled across every active protocol. */
  expected: number;
  /** Scheduled doses that were logged. */
  taken: number;
  /** Doses explicitly marked skipped. */
  skipped: number;
  /** taken / expected, or 1 when nothing was scheduled. */
  fraction: number;
  /** Nothing was scheduled, so the day is neither a win nor a miss. */
  restDay: boolean;
  complete: boolean;
}

/**
 * How a single day went.
 *
 * A logged dose counts toward the day it was logged on, which is what a person
 * means by "did I take it today". Which scheduled time inside that day it
 * belongs to is the adherence calculation's job and not this one.
 *
 * Which protocol it belongs to is this one's job, though, and it used to be
 * skipped: the day counted logs against a total of scheduled doses without
 * asking what had been logged. A day needing one dose each of three compounds
 * came out complete when two of one and none of a third were logged, and the
 * dot went green over a compound that was never taken. Reported after a second
 * KPV dose covered a missing BPC-157 one.
 *
 * So each log is attributed to a protocol, exactly where it names one and by
 * compound otherwise, and no protocol can be credited past what it asked for.
 * A dose outside the plan altogether, of a compound with nothing scheduled
 * today, counts towards nothing rather than towards anything: the ring is a
 * report on the plan.
 */
export function dayProgress(
  protocols: Protocol[],
  logs: Pick<DoseLog, "at" | "peptideId" | "protocolId" | "skipped">[],
  dayMs: number): DayProgress {
  const day = startOfLocalDay(dayMs);
  const end = endOfLocalDay(dayMs);

  const active = protocols.filter((p) => p.active);
  const slots = active.map((p) => protocolDoseTimesBetween(p, day, end).length);
  const expected = slots.reduce((sum, n) => sum + n, 0);

  const onDay = logs.filter((l) => l.at >= day && l.at <= end);
  const credited = active.map(() => ({ taken: 0, skipped: 0 }));
  const room = (i: number) => slots[i] - credited[i].taken - credited[i].skipped;
  const claimed = new Set<number>();

  const credit = (i: number, l: { skipped?: boolean }, idx: number) => {
    if (l.skipped) credited[i].skipped++;
    else credited[i].taken++;
    claimed.add(idx);
  };

  // Named protocols first, so a dose logged against one is never taken by
  // another that happens to run the same compound.
  onDay.forEach((l, idx) => {
    const i = active.findIndex((p) => l.protocolId === p.id);
    if (i >= 0 && room(i) > 0) credit(i, l, idx);
  });

  onDay.forEach((l, idx) => {
    if (claimed.has(idx)) return;
    const i = active.findIndex((p, x) => p.peptideId === l.peptideId && room(x) > 0);
    if (i >= 0) credit(i, l, idx);
  });

  const taken = credited.reduce((sum, c) => sum + c.taken, 0);
  const skipped = credited.reduce((sum, c) => sum + c.skipped, 0);

  const restDay = expected === 0;

  return {
    day,
    expected,
    taken,
    skipped,
    fraction: restDay ? 1 : Math.min(1, taken / expected),
    restDay,
    complete: restDay || taken >= expected,
  };
}

/** Today, as a ring-ready figure. */
export function todayProgress(
  protocols: Protocol[],
  logs: Pick<DoseLog, "at" | "peptideId" | "protocolId" | "skipped">[],
  nowMs: number) {
  return dayProgress(protocols, logs, nowMs);
}

/**
 * Consecutive days where every scheduled dose was taken.
 *
 * Days with nothing scheduled pass through without counting or breaking, so a
 * weeks-on/weeks-off protocol does not reset the streak during its off weeks.
 * Today counts only once it is complete, an unfinished today is not a miss.
 */
export function currentStreak(
  protocols: Protocol[],
  logs: Pick<DoseLog, "at" | "peptideId" | "protocolId" | "skipped">[],
  nowMs: number,
  maxLookbackDays = 400): number {
  let streak = 0;
  let cursor = startOfLocalDay(nowMs);

  for (let i = 0; i < maxLookbackDays; i++) {
    const d = dayProgress(protocols, logs, cursor);

    if (i === 0 && !d.complete) {
      // Today is still in progress; look at yesterday instead of failing.
      cursor = addLocalDays(cursor, -1);
      continue;
    }

    if (!d.complete) break;
    if (!d.restDay) streak++;

    cursor = addLocalDays(cursor, -1);
  }

  return streak;
}

/** The last N days, oldest first, for the little week strip. */
export function recentDays(
  protocols: Protocol[],
  logs: Pick<DoseLog, "at" | "peptideId" | "protocolId" | "skipped">[],
  nowMs: number,
  days = 7): DayProgress[] {
  const out: DayProgress[] = [];
  for (let i = days - 1; i >= 0; i--) {
    out.push(dayProgress(protocols, logs, addLocalDays(nowMs, -i)));
  }
  return out;
}


export interface WeekExposure {
  /** Midnight local on the Monday (or configured start) of the week. */
  weekStart: number;
  /** Total mass taken that week, micrograms. */
  totalMcg: number;
  doses: number;
}

/**
 * Total mass taken per week, oldest first.
 *
 * Makes a titration visible as a staircase and a lapse visible as a gap,
 * neither of which is obvious from a list of individual doses.
 */
export function weeklyExposure(
  logs: Pick<DoseLog, "at" | "doseMcg" | "peptideId" | "skipped">[],
  nowMs: number,
  weeks = 8,
  peptideId?: string): WeekExposure[] {
  const relevant = logs.filter(
    (l) => !l.skipped && (!peptideId || l.peptideId === peptideId));

  const out: WeekExposure[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const anchor = addLocalDays(nowMs, -i * 7);
    const start = startOfLocalDay(addLocalDays(anchor, -6));
    const end = endOfLocalDay(anchor);
    const inWeek = relevant.filter((l) => l.at >= start && l.at <= end);
    out.push({
      weekStart: start,
      totalMcg: inWeek.reduce((s, l) => s + l.doseMcg, 0),
      doses: inWeek.length,
    });
  }
  return out;
}

/**
 * How far along the climb to steady state a compound is.
 *
 * Returns null when the compound has no half-life, or when dosing is too
 * infrequent for accumulation to mean anything.
 */
export function steadyStateProgress(
  halfLifeHours: number | null,
  firstDoseAt: number | null,
  nowMs: number): { fraction: number; hoursElapsed: number; hoursNeeded: number } | null {
  if (halfLifeHours == null || !(halfLifeHours > 0) || firstDoseAt == null) return null;
  // Five half-lives reaches about 97% of steady state.
  const hoursNeeded = halfLifeHours * 5;
  const hoursElapsed = Math.max(0, (nowMs - firstDoseAt) / 3_600_000);
  return {
    fraction: Math.min(1, hoursElapsed / hoursNeeded),
    hoursElapsed,
    hoursNeeded,
  };
}
