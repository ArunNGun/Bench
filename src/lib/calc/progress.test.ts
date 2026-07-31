import { describe, expect, it } from "vitest";
import {
  currentStreak,
  dayProgress,
  recentDays,
  steadyStateProgress,
  todayProgress,
  weeklyExposure,
} from "./progress";
import { addLocalDays, atTimeOfDay, startOfLocalDay } from "./schedule";
import type { DoseLog, Protocol, Schedule } from "../types";

type Log = Pick<DoseLog, "at" | "peptideId" | "protocolId" | "skipped">;

const local = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 0, 0, 0).getTime();

const NOW = local(2026, 7, 29, 18);
const START = local(2026, 7, 1, 0);

const protocol = (over: Partial<Protocol> = {}): Protocol => ({
  id: "p1",
  profileId: "me",
  peptideId: "klow",
  name: "Daily",
  active: true,
  startedAt: START,
  doseMcg: 1000,
  route: "subcutaneous",
  schedule: { kind: "daily", timeOfDay: "09:00" } as Schedule,
  titrationAutoAdvance: false, ...over,
});

/** A dose logged at 09:00 on the day `daysAgo` before NOW. */
const dose = (daysAgo: number, over: Partial<Log> = {}): Log => ({
  at: atTimeOfDay(addLocalDays(NOW, -daysAgo), "09:00"),
  peptideId: "klow",
  protocolId: "p1", ...over,
});

describe("dayProgress", () => {
  it("counts one scheduled dose for a daily protocol", () => {
    const d = dayProgress([protocol()], [], NOW);
    expect(d.expected).toBe(1);
    expect(d.taken).toBe(0);
    expect(d.complete).toBe(false);
    expect(d.fraction).toBe(0);
  });

  it("completes once the dose is logged", () => {
    const d = dayProgress([protocol()], [dose(0)], NOW);
    expect(d.taken).toBe(1);
    expect(d.fraction).toBe(1);
    expect(d.complete).toBe(true);
  });

  it("counts across several active protocols", () => {
    const two = [protocol(), protocol({ id: "p2", peptideId: "bpc-157" })];
    const d = dayProgress(two, [dose(0)], NOW);
    expect(d.expected).toBe(2);
    expect(d.taken).toBe(1);
    expect(d.fraction).toBeCloseTo(0.5, 10);
    expect(d.complete).toBe(false);
  });

  it("ignores paused protocols", () => {
    const d = dayProgress([protocol({ active: false })], [], NOW);
    expect(d.expected).toBe(0);
    expect(d.restDay).toBe(true);
  });

  it("treats a day with nothing scheduled as a rest day, not a miss", () => {
    const weekly = protocol({ schedule: { kind: "interval-days", intervalDays: 7, timeOfDay: "09:00" } });
    // NOW is 28 days after START, which is a dose day; the day before is not.
    const d = dayProgress([weekly], [], addLocalDays(NOW, -1));
    expect(d.expected).toBe(0);
    expect(d.restDay).toBe(true);
    expect(d.complete).toBe(true);
    expect(d.fraction).toBe(1);
  });

  it("separates skipped doses from taken ones", () => {
    const d = dayProgress([protocol()], [dose(0, { skipped: true })], NOW);
    expect(d.taken).toBe(0);
    expect(d.skipped).toBe(1);
    expect(d.complete).toBe(false);
  });

  it("does not count a dose logged on a different day", () => {
    expect(dayProgress([protocol()], [dose(1)], NOW).taken).toBe(0);
  });

  it("caps the fraction when more doses are logged than scheduled", () => {
    const d = dayProgress([protocol()], [dose(0), { ...dose(0), at: dose(0).at + 3600_000 }], NOW);
    expect(d.taken).toBe(2);
    expect(d.fraction).toBe(1);
  });

  it("reports the day as local midnight", () => {
    expect(dayProgress([protocol()], [], NOW).day).toBe(startOfLocalDay(NOW));
  });
});

describe("todayProgress", () => {
  it("is dayProgress for now", () => {
    expect(todayProgress([protocol()], [dose(0)], NOW)).toEqual(dayProgress([protocol()], [dose(0)], NOW));
  });
});

describe("currentStreak", () => {
  it("is zero with no history", () => {
    expect(currentStreak([protocol()], [], NOW)).toBe(0);
  });

  it("counts consecutive complete days", () => {
    const logs = [0, 1, 2, 3].map((d) => dose(d));
    expect(currentStreak([protocol()], logs, NOW)).toBe(4);
  });

  it("does not break on an unfinished today", () => {
    // Yesterday and the day before are done; today has not happened yet.
    const logs = [1, 2, 3].map((d) => dose(d));
    expect(currentStreak([protocol()], logs, NOW)).toBe(3);
  });

  it("breaks at the first missed day", () => {
    // Missed two days ago.
    const logs = [0, 1, 3, 4].map((d) => dose(d));
    expect(currentStreak([protocol()], logs, NOW)).toBe(2);
  });

  it("treats a skipped dose as breaking the streak", () => {
    const logs = [dose(0), dose(1, { skipped: true }), dose(2)];
    expect(currentStreak([protocol()], logs, NOW)).toBe(1);
  });

  it("passes through rest days without counting or breaking", () => {
    // Weekly protocol: only one day in seven is scheduled.
    const weekly = protocol({ schedule: { kind: "interval-days", intervalDays: 7, timeOfDay: "09:00" } });
    // NOW is day 28 from START, so dose days are 0, 7, 14, 21, 28 days after start.
    const logs = [0, 7, 14, 21].map((d) => ({
      ...dose(0),
      at: atTimeOfDay(addLocalDays(START, d), "09:00"),
    }));
    // Four complete dose days, everything between them is a rest day.
    expect(currentStreak([weekly], logs, NOW)).toBe(4);
  });

  it("keeps a cycled protocol's streak alive through its off weeks", () => {
    const cycled = protocol({
      schedule: { kind: "daily", timeOfDay: "09:00", cycleWeeksOn: 1, cycleWeeksOff: 1 },
    });
    // Log every day the cycle actually calls for, across the whole window.
    const logs: Log[] = [];
    for (let d = 0; d <= 28; d++) {
      const day = addLocalDays(START, d);
      if (dayProgress([cycled], [], day).expected > 0) {
        logs.push({ ...dose(0), at: atTimeOfDay(day, "09:00") });
      }
    }
    // Every on-day was taken, so the streak covers all of them.
    expect(currentStreak([cycled], logs, NOW)).toBeGreaterThanOrEqual(14);
  });

  it("stops at the lookback limit rather than running forever", () => {
    const logs: Log[] = [];
    for (let d = 0; d < 30; d++) logs.push(dose(d));
    expect(currentStreak([protocol()], logs, NOW, 10)).toBeLessThanOrEqual(10);
  });

  it("is zero when there are no protocols at all", () => {
    expect(currentStreak([], [], NOW)).toBe(0);
  });
});

describe("recentDays", () => {
  it("returns the requested number of days, oldest first", () => {
    const days = recentDays([protocol()], [], NOW, 7);
    expect(days).toHaveLength(7);
    for (let i = 1; i < days.length; i++) {
      expect(days[i].day).toBeGreaterThan(days[i - 1].day);
    }
    expect(days[6].day).toBe(startOfLocalDay(NOW));
  });

  it("marks which days were completed", () => {
    const logs = [0, 1, 4].map((d) => dose(d));
    const days = recentDays([protocol()], logs, NOW, 7);
    expect(days.map((d) => d.complete)).toEqual([false, false, true, false, false, true, true]);
  });
});

describe("weeklyExposure", () => {
  const logs = [
    { at: addLocalDays(NOW, -1), doseMcg: 1000, peptideId: "klow", skipped: false },
    { at: addLocalDays(NOW, -2), doseMcg: 1000, peptideId: "klow", skipped: false },
    { at: addLocalDays(NOW, -9), doseMcg: 500, peptideId: "klow", skipped: false },
    { at: addLocalDays(NOW, -3), doseMcg: 4000, peptideId: "reta", skipped: false },
    { at: addLocalDays(NOW, -4), doseMcg: 9999, peptideId: "klow", skipped: true },
  ];

  it("returns the requested number of weeks, oldest first", () => {
    const w = weeklyExposure(logs, NOW, 4);
    expect(w).toHaveLength(4);
    for (let i = 1; i < w.length; i++) {
      expect(w[i].weekStart).toBeGreaterThan(w[i - 1].weekStart);
    }
  });

  it("totals the mass taken in the current week", () => {
    const w = weeklyExposure(logs, NOW, 4);
    expect(w[3].totalMcg).toBe(6000);
    expect(w[3].doses).toBe(3);
  });

  it("puts an older dose in an earlier week", () => {
    const w = weeklyExposure(logs, NOW, 4);
    expect(w[2].totalMcg).toBe(500);
  });

  it("excludes skipped doses", () => {
    const only = weeklyExposure(
      [{ at: NOW, doseMcg: 1000, peptideId: "klow", skipped: true }],
      NOW,
      1);
    expect(only[0].totalMcg).toBe(0);
  });

  it("can filter to one peptide", () => {
    const w = weeklyExposure(logs, NOW, 4, "reta");
    expect(w[3].totalMcg).toBe(4000);
    expect(w[3].doses).toBe(1);
  });

  it("reports zeros for a week with nothing in it", () => {
    const w = weeklyExposure([], NOW, 3);
    expect(w.every((x) => x.totalMcg === 0 && x.doses === 0)).toBe(true);
  });
});

describe("steadyStateProgress", () => {
  it("is null without a half-life or a first dose", () => {
    expect(steadyStateProgress(null, NOW, NOW)).toBeNull();
    expect(steadyStateProgress(144, null, NOW)).toBeNull();
    expect(steadyStateProgress(0, NOW, NOW)).toBeNull();
  });

  it("starts at zero on the first dose", () => {
    expect(steadyStateProgress(144, NOW, NOW)!.fraction).toBe(0);
  });

  it("reaches one after five half-lives", () => {
    const firstDose = NOW - 144 * 5 * 3_600_000;
    expect(steadyStateProgress(144, firstDose, NOW)!.fraction).toBeCloseTo(1, 10);
  });

  it("is halfway at two and a half half-lives", () => {
    const firstDose = NOW - 144 * 2.5 * 3_600_000;
    expect(steadyStateProgress(144, firstDose, NOW)!.fraction).toBeCloseTo(0.5, 10);
  });

  it("clamps past steady state rather than exceeding one", () => {
    const firstDose = NOW - 144 * 50 * 3_600_000;
    expect(steadyStateProgress(144, firstDose, NOW)!.fraction).toBe(1);
  });

  it("reports the hours it is working from", () => {
    const s = steadyStateProgress(24, NOW - 48 * 3_600_000, NOW)!;
    expect(s.hoursElapsed).toBeCloseTo(48, 6);
    expect(s.hoursNeeded).toBe(120);
  });
});
