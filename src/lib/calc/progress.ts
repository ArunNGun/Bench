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
 * means by "did I take it today", matching to a specific scheduled slot is the
 * adherence calculation's job, not this one.
 */
export function dayProgress(
  protocols: Protocol[],
  logs: Pick<DoseLog, "at" | "peptideId" | "protocolId" | "skipped">[],
  dayMs: number): DayProgress {
  const day = startOfLocalDay(dayMs);
  const end = endOfLocalDay(dayMs);

  const active = protocols.filter((p) => p.active);
  let expected = 0;
  for (const p of active) {
    expected += protocolDoseTimesBetween(p, day, end).length;
  }

  const onDay = logs.filter((l) => l.at >= day && l.at <= end);
  const taken = onDay.filter((l) => !l.skipped).length;
  const skipped = onDay.filter((l) => l.skipped).length;

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
