import { describe, expect, it } from "vitest";
import {
  addLocalDays,
  adherence,
  atTimeOfDay,
  daysBetween,
  doseTimesBetween,
  dosesPerWeek,
  dueStatus,
  endOfLocalDay,
  isDoseDay,
  isOnCycle,
  nextDoseTime,
  previousDoseTime,
  scheduledDoseMcg,
  startOfLocalDay,
  titrationStepAt,
  titrationStepStartWeeks,
  titrationTotalWeeks,
} from "./schedule";
import type { Protocol, Schedule, TitrationStep } from "../types";

const HOUR = 3_600_000;

/** A local-time date, so tests match the local reasoning the module uses. */
const local = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min, 0, 0).getTime();

describe("local day arithmetic", () => {
  it("snaps to local midnight", () => {
    const d = new Date(startOfLocalDay(local(2026, 3, 15, 17, 42)));
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getDate()).toBe(15);
  });

  it("counts whole days regardless of time of day", () => {
    expect(daysBetween(local(2026, 3, 1, 23, 0), local(2026, 3, 2, 1, 0))).toBe(1);
    expect(daysBetween(local(2026, 3, 1), local(2026, 3, 1))).toBe(0);
    expect(daysBetween(local(2026, 3, 8), local(2026, 3, 1))).toBe(-7);
  });

  it("keeps the wall-clock hour across a daylight-saving change", () => {
    // US DST springs forward on 8 March 2026.
    const before = local(2026, 3, 7, 9, 0);
    const after = addLocalDays(before, 2);
    expect(new Date(after).getHours()).toBe(9);
    expect(new Date(after).getDate()).toBe(9);
  });

  it("counts DST days as whole days, not 23- or 25-hour ones", () => {
    expect(daysBetween(local(2026, 3, 7), local(2026, 3, 9))).toBe(2);
    expect(daysBetween(local(2026, 11, 1), local(2026, 11, 3))).toBe(2);
  });

  it("applies a time of day, defaulting to 09:00", () => {
    expect(new Date(atTimeOfDay(local(2026, 5, 4), "20:30")).getHours()).toBe(20);
    expect(new Date(atTimeOfDay(local(2026, 5, 4), "20:30")).getMinutes()).toBe(30);
    expect(new Date(atTimeOfDay(local(2026, 5, 4))).getHours()).toBe(9);
  });
});

describe("isDoseDay", () => {
  const start = local(2026, 4, 1); // a Wednesday

  it("hits every day for a daily schedule", () => {
    const s: Schedule = { kind: "daily" };
    for (let i = 0; i < 10; i++) {
      expect(isDoseDay(s, start, addLocalDays(start, i))).toBe(true);
    }
  });

  it("never fires before the start date", () => {
    const s: Schedule = { kind: "daily" };
    expect(isDoseDay(s, start, addLocalDays(start, -1))).toBe(false);
  });

  it("counts intervals from the start date", () => {
    const s: Schedule = { kind: "interval-days", intervalDays: 3 };
    expect(isDoseDay(s, start, start)).toBe(true);
    expect(isDoseDay(s, start, addLocalDays(start, 1))).toBe(false);
    expect(isDoseDay(s, start, addLocalDays(start, 3))).toBe(true);
    expect(isDoseDay(s, start, addLocalDays(start, 6))).toBe(true);
  });

  it("keeps weekly dosing on the same weekday across a DST change", () => {
    const march1 = local(2026, 3, 1); // Sunday
    const s: Schedule = { kind: "interval-days", intervalDays: 7 };
    for (let w = 0; w < 8; w++) {
      const day = addLocalDays(march1, w * 7);
      expect(new Date(day).getDay()).toBe(0);
      expect(isDoseDay(s, march1, day)).toBe(true);
    }
  });

  it("matches named weekdays", () => {
    const s: Schedule = { kind: "days-of-week", daysOfWeek: [1, 4] }; // Mon, Thu
    const monday = local(2026, 4, 6);
    expect(new Date(monday).getDay()).toBe(1);
    expect(isDoseDay(s, start, monday)).toBe(true);
    expect(isDoseDay(s, start, addLocalDays(monday, 1))).toBe(false);
    expect(isDoseDay(s, start, addLocalDays(monday, 3))).toBe(true);
  });

  it("never fires for an as-needed schedule", () => {
    expect(isDoseDay({ kind: "as-needed" }, start, start)).toBe(false);
  });
});

describe("cycling", () => {
  const start = local(2026, 1, 5);

  it("runs continuously with no cycle set", () => {
    expect(isOnCycle({ kind: "daily" }, start, addLocalDays(start, 200))).toBe(true);
  });

  it("switches off after the on-weeks and back on after the off-weeks", () => {
    const s: Schedule = { kind: "daily", cycleWeeksOn: 4, cycleWeeksOff: 2 };
    expect(isOnCycle(s, start, start)).toBe(true);
    expect(isOnCycle(s, start, addLocalDays(start, 27))).toBe(true); // last on day
    expect(isOnCycle(s, start, addLocalDays(start, 28))).toBe(false); // first off day
    expect(isOnCycle(s, start, addLocalDays(start, 41))).toBe(false); // last off day
    expect(isOnCycle(s, start, addLocalDays(start, 42))).toBe(true); // cycle restarts
  });

  it("suppresses dose days during an off week", () => {
    const s: Schedule = { kind: "daily", cycleWeeksOn: 1, cycleWeeksOff: 1 };
    expect(isDoseDay(s, start, addLocalDays(start, 3))).toBe(true);
    expect(isDoseDay(s, start, addLocalDays(start, 10))).toBe(false);
  });
});

describe("doseTimesBetween", () => {
  const start = local(2026, 6, 1);

  it("lists every daily dose in the window at the right hour", () => {
    const times = doseTimesBetween(
      { kind: "daily", timeOfDay: "08:00" },
      start,
      start,
      endOfLocalDay(addLocalDays(start, 6)));
    expect(times).toHaveLength(7);
    expect(new Date(times[0]).getHours()).toBe(8);
    expect(new Date(times[6]).getDate()).toBe(7);
  });

  it("only returns times inside the window, not whole dose days", () => {
    const noon = local(2026, 6, 1, 12, 0);
    // The window opens after 1 June 08:00, so that dose is already past.
    const times = doseTimesBetween(
      { kind: "daily", timeOfDay: "08:00" },
      start,
      noon,
      endOfLocalDay(addLocalDays(noon, 2)));
    expect(times).toHaveLength(2);
    expect(new Date(times[0]).getDate()).toBe(2);
  });

  it("stops at the protocol's end date", () => {
    const times = doseTimesBetween(
      { kind: "daily" },
      start,
      start,
      endOfLocalDay(addLocalDays(start, 30)),
      endOfLocalDay(addLocalDays(start, 4)));
    expect(times).toHaveLength(5);
  });

  it("returns nothing for as-needed", () => {
    expect(doseTimesBetween({ kind: "as-needed" }, start, start, addLocalDays(start, 30))).toEqual([]);
  });

  it("returns nothing for an inverted window", () => {
    expect(doseTimesBetween({ kind: "daily" }, start, addLocalDays(start, 5), start)).toEqual([]);
  });

  it("gives exactly one dose per week for weekly dosing over a year", () => {
    const times = doseTimesBetween(
      { kind: "interval-days", intervalDays: 7 },
      start,
      start,
      endOfLocalDay(addLocalDays(start, 364)));
    expect(times).toHaveLength(53);
    // Every gap is exactly seven local days, DST changes included.
    for (let i = 1; i < times.length; i++) {
      expect(daysBetween(times[i - 1], times[i])).toBe(7);
    }
  });
});

describe("nextDoseTime and previousDoseTime", () => {
  const start = local(2026, 6, 1, 0, 0);
  const schedule: Schedule = { kind: "interval-days", intervalDays: 7, timeOfDay: "10:00" };

  it("finds the next dose after a moment", () => {
    const now = local(2026, 6, 1, 12, 0); // after the 10:00 dose
    const next = nextDoseTime(schedule, start, now);
    expect(next).toBe(local(2026, 6, 8, 10, 0));
  });

  it("returns the dose happening right now", () => {
    const now = local(2026, 6, 8, 10, 0);
    expect(nextDoseTime(schedule, start, now)).toBe(now);
  });

  it("finds the previous dose before a moment", () => {
    const now = local(2026, 6, 10, 12, 0);
    expect(previousDoseTime(schedule, start, now)).toBe(local(2026, 6, 8, 10, 0));
  });

  it("has no previous dose before the protocol began", () => {
    expect(previousDoseTime(schedule, start, local(2026, 5, 20))).toBeNull();
  });

  it("has no next dose past the end date", () => {
    const next = nextDoseTime(schedule, start, local(2026, 6, 10), local(2026, 6, 5));
    expect(next).toBeNull();
  });

  it("has neither for as-needed", () => {
    expect(nextDoseTime({ kind: "as-needed" }, start, start)).toBeNull();
    expect(previousDoseTime({ kind: "as-needed" }, start, start)).toBeNull();
  });

  it("skips over an off-cycle stretch to the next on week", () => {
    const s: Schedule = { kind: "daily", cycleWeeksOn: 1, cycleWeeksOff: 1, timeOfDay: "09:00" };
    // Day 8 is in the off week; the next dose is day 14.
    const next = nextDoseTime(s, start, addLocalDays(start, 8));
    expect(next).toBe(atTimeOfDay(addLocalDays(start, 14), "09:00"));
  });
});

describe("dosesPerWeek", () => {
  it("counts daily as seven", () => {
    expect(dosesPerWeek({ kind: "daily" })).toBe(7);
  });

  it("counts weekly as one", () => {
    expect(dosesPerWeek({ kind: "interval-days", intervalDays: 7 })).toBe(1);
  });

  it("counts every other day as three and a half", () => {
    expect(dosesPerWeek({ kind: "interval-days", intervalDays: 2 })).toBe(3.5);
  });

  it("counts named weekdays", () => {
    expect(dosesPerWeek({ kind: "days-of-week", daysOfWeek: [1, 3, 5] })).toBe(3);
  });

  it("is zero for as-needed", () => {
    expect(dosesPerWeek({ kind: "as-needed" })).toBe(0);
  });

  it("prorates for a cycled protocol", () => {
    // Five on, two off: five sevenths of the time dosing daily.
    expect(dosesPerWeek({ kind: "daily", cycleWeeksOn: 5, cycleWeeksOff: 2 })).toBeCloseTo(5, 10);
  });
});

describe("titration", () => {
  // The published retatrutide phase-2 escalation shape: four weeks per step.
  const steps: TitrationStep[] = [
    { step: 1, doseMcg: 2000, weeks: 4 },
    { step: 2, doseMcg: 4000, weeks: 4 },
    { step: 3, doseMcg: 8000, weeks: 4 },
    { step: 4, doseMcg: 12000, weeks: 12 },
  ];
  const start = local(2026, 1, 5);

  it("reports where each step begins", () => {
    expect(titrationStepStartWeeks(steps)).toEqual([0, 4, 8, 12]);
    expect(titrationTotalWeeks(steps)).toBe(24);
  });

  it("selects the step for a given date", () => {
    expect(titrationStepAt(steps, start, start)?.index).toBe(0);
    expect(titrationStepAt(steps, start, addLocalDays(start, 27))?.index).toBe(0);
    expect(titrationStepAt(steps, start, addLocalDays(start, 28))?.index).toBe(1);
    expect(titrationStepAt(steps, start, addLocalDays(start, 56))?.index).toBe(2);
    expect(titrationStepAt(steps, start, addLocalDays(start, 84))?.index).toBe(3);
  });

  it("holds the last step past the end of the plan", () => {
    const late = titrationStepAt(steps, start, addLocalDays(start, 400));
    expect(late?.index).toBe(3);
    expect(late?.step.doseMcg).toBe(12000);
  });

  it("has no step before the protocol starts", () => {
    expect(titrationStepAt(steps, start, addLocalDays(start, -1))).toBeNull();
  });

  it("handles an empty plan", () => {
    expect(titrationStepAt([], start, start)).toBeNull();
  });

  const protocol = (over: Partial<Protocol> = {}): Protocol => ({
    id: "p1",
    profileId: "me",
    peptideId: "retatrutide",
    name: "Test",
    active: true,
    startedAt: start,
    doseMcg: 1000,
    route: "subcutaneous",
    schedule: { kind: "interval-days", intervalDays: 7 },
    titrationAutoAdvance: false, ...over,
  });

  it("uses the titration dose when auto-advance is on", () => {
    const p = protocol({ titration: steps, titrationAutoAdvance: true });
    expect(scheduledDoseMcg(p, addLocalDays(start, 30))).toBe(4000);
  });

  it("uses the fixed dose when auto-advance is off", () => {
    const p = protocol({ titration: steps, titrationAutoAdvance: false });
    expect(scheduledDoseMcg(p, addLocalDays(start, 30))).toBe(1000);
  });

  it("falls back to the fixed dose with no titration plan", () => {
    expect(scheduledDoseMcg(protocol({ titrationAutoAdvance: true }), start)).toBe(1000);
  });
});

describe("adherence", () => {
  const start = local(2026, 2, 2, 9, 0);
  const p: Protocol = {
    id: "p1",
    profileId: "me",
    peptideId: "x",
    name: "Weekly",
    active: true,
    startedAt: start,
    doseMcg: 1000,
    route: "subcutaneous",
    schedule: { kind: "interval-days", intervalDays: 7, timeOfDay: "09:00" },
    titrationAutoAdvance: false,
  };
  const windowEnd = addLocalDays(start, 27);

  it("is perfect when every dose is logged on time", () => {
    const logs = [0, 7, 14, 21].map((d) => ({ at: atTimeOfDay(addLocalDays(start, d), "09:00") }));
    const a = adherence(p, logs, start, windowEnd);
    expect(a.expected).toBe(4);
    expect(a.taken).toBe(4);
    expect(a.rate).toBe(1);
  });

  it("still counts a dose taken later the same day", () => {
    const logs = [{ at: atTimeOfDay(start, "09:00") + 9 * HOUR }];
    const a = adherence(p, logs, start, addLocalDays(start, 6));
    expect(a.taken).toBe(1);
    expect(a.missed).toBe(0);
  });

  it("counts a never-logged dose as missed", () => {
    const logs = [0, 14, 21].map((d) => ({ at: atTimeOfDay(addLocalDays(start, d), "09:00") }));
    const a = adherence(p, logs, start, windowEnd);
    expect(a.taken).toBe(3);
    expect(a.missed).toBe(1);
    expect(a.rate).toBeCloseTo(0.75, 10);
  });

  it("separates a deliberate skip from a miss", () => {
    const logs = [
      { at: atTimeOfDay(start, "09:00") },
      { at: atTimeOfDay(addLocalDays(start, 7), "09:00"), skipped: true },
    ];
    const a = adherence(p, logs, start, addLocalDays(start, 13));
    expect(a.taken).toBe(1);
    expect(a.skipped).toBe(1);
    expect(a.missed).toBe(0);
  });

  it("never lets one log satisfy two scheduled doses", () => {
    const daily: Protocol = { ...p, schedule: { kind: "daily", timeOfDay: "09:00" } };
    const logs = [{ at: atTimeOfDay(start, "09:00") }];
    const a = adherence(daily, logs, start, addLocalDays(start, 2));
    expect(a.expected).toBe(3);
    expect(a.taken).toBe(1);
    expect(a.missed).toBe(2);
  });

  it("reports full adherence when nothing was scheduled", () => {
    const asNeeded: Protocol = { ...p, schedule: { kind: "as-needed" } };
    const a = adherence(asNeeded, [], start, windowEnd);
    expect(a.expected).toBe(0);
    expect(a.rate).toBe(1);
  });
});

describe("dueStatus", () => {
  const start = local(2026, 9, 7, 9, 0); // Monday
  const p: Protocol = {
    id: "p1",
    profileId: "me",
    peptideId: "x",
    name: "Weekly",
    active: true,
    startedAt: start,
    doseMcg: 1000,
    route: "subcutaneous",
    schedule: { kind: "interval-days", intervalDays: 7, timeOfDay: "09:00" },
    titrationAutoAdvance: false,
  };

  /** Shorthand: the dose scheduled for a given day was logged on time. */
  const loggedOn = (day: number) => atTimeOfDay(addLocalDays(start, day), "09:00");

  it("says paused for an inactive protocol", () => {
    expect(dueStatus({ ...p, active: false }, start).state).toBe("none");
  });

  it("says due now at the scheduled time", () => {
    expect(dueStatus(p, local(2026, 9, 7, 9, 0)).state).toBe("due-now");
  });

  it("stays due now inside the grace window", () => {
    expect(dueStatus(p, local(2026, 9, 7, 12, 0)).state).toBe("due-now");
  });

  it("goes overdue once the grace window passes with nothing logged", () => {
    expect(dueStatus(p, local(2026, 9, 7, 20, 0)).state).toBe("overdue");
  });

  it("is not overdue once that dose has been logged", () => {
    const s = dueStatus(p, local(2026, 9, 7, 20, 0), { lastLoggedAt: loggedOn(0) });
    expect(s.state).toBe("scheduled");
    expect(s.at).toBe(loggedOn(7));
  });

  it("says due today when the next dose is later the same day", () => {
    const s = dueStatus(p, local(2026, 9, 14, 2, 0), { lastLoggedAt: loggedOn(0) });
    expect(s.state).toBe("upcoming");
    expect(s.hoursAway).toBeCloseTo(7, 6);
  });

  it("says scheduled when the next dose is days away", () => {
    const s = dueStatus(p, local(2026, 9, 10, 9, 0), { lastLoggedAt: loggedOn(0) });
    expect(s.state).toBe("scheduled");
    expect(s.hoursAway).toBeCloseTo(96, 6);
  });

  it("does not treat an old log as covering the dose just missed", () => {
    // Logged week one, then nothing. By week three the last dose is overdue.
    const s = dueStatus(p, local(2026, 9, 21, 20, 0), { lastLoggedAt: loggedOn(0) });
    expect(s.state).toBe("overdue");
    expect(s.at).toBe(loggedOn(14));
  });

  it("stays quiet between doses on a daily protocol taken this morning", () => {
    const daily = { ...p, schedule: { kind: "daily", timeOfDay: "09:00" } as Schedule };
    const s = dueStatus(daily, local(2026, 9, 7, 18, 0), { lastLoggedAt: loggedOn(0) });
    expect(s.state).toBe("scheduled");
  });

  it("reports no dose scheduled for an as-needed protocol", () => {
    const s = dueStatus({ ...p, schedule: { kind: "as-needed" } }, start);
    expect(s.state).toBe("none");
    expect(s.at).toBeNull();
  });
});
