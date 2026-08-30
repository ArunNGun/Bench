import { describe, expect, it } from "vitest";
import {
  addLocalDays,
  adherence,
  logsForProtocol,
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
  scheduleTimes,
  scheduledDailyMcg,
  scheduledDoseMcg,
  startOfLocalDay,
  titrationStepAt,
  unloggedDoseTimes,
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

  it("lists every time a dose day carries, in order", () => {
    const times = doseTimesBetween(
      { kind: "daily", timesOfDay: ["22:00", "07:00"] },
      start,
      start,
      endOfLocalDay(addLocalDays(start, 1)));
    expect(times).toEqual([
      local(2026, 6, 1, 7, 0),
      local(2026, 6, 1, 22, 0),
      local(2026, 6, 2, 7, 0),
      local(2026, 6, 2, 22, 0),
    ]);
  });

  it("keeps several times on the days a schedule actually doses", () => {
    // Twice a day, every other day, is four injections across four days.
    const times = doseTimesBetween(
      { kind: "interval-days", intervalDays: 2, timesOfDay: ["08:00", "20:00"] },
      start,
      start,
      endOfLocalDay(addLocalDays(start, 3)));
    expect(times).toHaveLength(4);
    expect(times.map((t) => new Date(t).getDate())).toEqual([1, 1, 3, 3]);
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

  it("walks the times within a day before moving on to the next", () => {
    const twice: Schedule = { kind: "daily", timesOfDay: ["07:00", "22:00"] };
    const midday = local(2026, 6, 8, 12, 0);
    expect(nextDoseTime(twice, start, midday)).toBe(local(2026, 6, 8, 22, 0));
    expect(previousDoseTime(twice, start, midday)).toBe(local(2026, 6, 8, 7, 0));
  });

  it("crosses midnight in both directions", () => {
    const twice: Schedule = { kind: "daily", timesOfDay: ["07:00", "22:00"] };
    const night = local(2026, 6, 8, 23, 30);
    expect(nextDoseTime(twice, start, night)).toBe(local(2026, 6, 9, 7, 0));
    expect(previousDoseTime(twice, start, local(2026, 6, 9, 6, 0)))
      .toBe(local(2026, 6, 8, 22, 0));
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

  it("counts injections, not dose days", () => {
    // Days of supply, cost per week and the burn rate all count what comes out
    // of the vial, so twice a day is fourteen.
    expect(dosesPerWeek({ kind: "daily", timesOfDay: ["07:00", "22:00"] })).toBe(14);
    expect(dosesPerWeek({ kind: "days-of-week", daysOfWeek: [1, 4], timesOfDay: ["08:00", "20:00"] }))
      .toBe(4);
  });
});

describe("scheduleTimes", () => {
  it("falls back to the single time, and to nine o'clock", () => {
    expect(scheduleTimes({ kind: "daily", timeOfDay: "07:00" })).toEqual(["07:00"]);
    expect(scheduleTimes({ kind: "daily" })).toEqual(["09:00"]);
  });

  it("prefers the list when it has anything in it", () => {
    expect(scheduleTimes({ kind: "daily", timeOfDay: "07:00", timesOfDay: ["08:00", "20:00"] }))
      .toEqual(["08:00", "20:00"]);
    // An empty list is not an instruction to dose never.
    expect(scheduleTimes({ kind: "daily", timeOfDay: "07:00", timesOfDay: [] })).toEqual(["07:00"]);
  });

  it("sorts, pads and drops repeats", () => {
    expect(scheduleTimes({ kind: "daily", timesOfDay: ["22:00", "7:5", "07:05"] }))
      .toEqual(["07:05", "22:00"]);
  });

  it("keeps an unreadable time out of the maths rather than making it NaN", () => {
    expect(scheduleTimes({ kind: "daily", timesOfDay: ["nonsense"] })).toEqual(["09:00"]);
  });
});

describe("splitting a day's dose across its times", () => {
  const start = local(2026, 6, 1, 7, 0);
  const base: Protocol = {
    id: "p1",
    profileId: "me",
    peptideId: "bpc-157",
    name: "BPC",
    active: true,
    startedAt: start,
    doseMcg: 500,
    route: "subcutaneous",
    schedule: { kind: "daily", timesOfDay: ["07:00", "22:00"] },
    titrationAutoAdvance: false,
  };

  it("gives half the day's dose to each of two times", () => {
    expect(scheduledDailyMcg(base, start)).toBe(500);
    expect(scheduledDoseMcg(base, start)).toBe(250);
  });

  it("leaves a single time exactly as it was", () => {
    const once = { ...base, schedule: { kind: "daily", timeOfDay: "07:00" } as Schedule };
    expect(scheduledDoseMcg(once, start)).toBe(500);
  });

  it("splits the dose of whichever band is in force", () => {
    const banded: Protocol = {
      ...base,
      phases: [
        { step: 1, doseMcg: 250, weeks: 4 },
        { step: 2, doseMcg: 500, weeks: 4 },
      ],
    };
    expect(scheduledDoseMcg(banded, addLocalDays(start, 7))).toBe(125);
    expect(scheduledDoseMcg(banded, addLocalDays(start, 28))).toBe(250);
  });

  it("splits by the band's own times when it carries its own frequency", () => {
    const banded: Protocol = {
      ...base,
      schedule: { kind: "daily", timeOfDay: "07:00" },
      phases: [
        { step: 1, doseMcg: 500, weeks: 4, schedule: { kind: "daily", timesOfDay: ["07:00", "22:00"] } },
        { step: 2, doseMcg: 500, weeks: 4 },
      ],
    };
    expect(scheduledDoseMcg(banded, addLocalDays(start, 7))).toBe(250);
    // The second band inherits the protocol's single time, so nothing is split.
    expect(scheduledDoseMcg(banded, addLocalDays(start, 28))).toBe(500);
  });

  it("never divides an as-needed protocol by however many times it lists", () => {
    const asNeeded = {
      ...base,
      schedule: { kind: "as-needed", timesOfDay: ["07:00", "22:00"] } as Schedule,
    };
    expect(scheduledDoseMcg(asNeeded, start)).toBe(500);
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

  /*
   * Taking the dose before the clock says to.
   *
   * The morning injection happens when you get up, which is rarely the minute
   * the plan names. These fix a reading where an early log counted against
   * yesterday, so the dose already taken stayed on the list as due.
   */
  const morning = { ...p, schedule: { kind: "daily", timeOfDay: "07:00" } as Schedule };

  it("clears the dose logged half an hour before it was due", () => {
    const at = local(2026, 9, 8, 6, 30);
    const s = dueStatus(morning, at, { lastLoggedAt: at });
    expect(s.state).toBe("scheduled");
    expect(s.at).toBe(local(2026, 9, 9, 7, 0));
  });

  it("still asks for the dose when nothing was logged this morning", () => {
    // Same moment, but the last log was yesterday's dose.
    const s = dueStatus(morning, local(2026, 9, 8, 6, 30), {
      lastLoggedAt: local(2026, 9, 7, 7, 0),
    });
    expect(s.state).toBe("due-now");
    expect(s.at).toBe(local(2026, 9, 8, 7, 0));
  });

  it("does not let a dose taken late in the evening cancel tomorrow's", () => {
    // Thirteen hours after this morning's dose, which is nearer to tomorrow's
    // than to today's, and would be read as tomorrow's by distance alone.
    const at = local(2026, 9, 8, 20, 0);
    const s = dueStatus(morning, at, { lastLoggedAt: at });
    expect(s.state).toBe("scheduled");
    expect(s.at).toBe(local(2026, 9, 9, 7, 0));
  });

  it("does not let last night's dose cover this morning's", () => {
    // Reported from use: BPC-157 daily at seven, logged at 23:32, and the next
    // morning the compound was absent from Today altogether. The old window
    // reached a flat twelve hours back, which on a daily protocol is half the
    // gap, so any evening dose swallowed the following morning's.
    const s = dueStatus(morning, local(2026, 9, 9, 8, 0), {
      lastLoggedAt: local(2026, 9, 8, 23, 32),
    });
    expect(s.state).toBe("due-now");
    expect(s.at).toBe(local(2026, 9, 9, 7, 0));
  });

  it("still clears a dose taken a couple of hours early", () => {
    // Five hours before seven, inside the quarter-gap window, which is the
    // case the twelve hours was there for in the first place.
    const s = dueStatus(morning, local(2026, 9, 9, 8, 0), {
      lastLoggedAt: local(2026, 9, 9, 2, 0),
    });
    expect(s.state).toBe("scheduled");
  });

  it("keeps the full tolerance for a weekly protocol", () => {
    // Eleven hours early on a weekly dose is nowhere near the dose before it,
    // so narrowing the window for daily protocols must not narrow this one.
    const s = dueStatus(p, local(2026, 9, 14, 10, 0), {
      lastLoggedAt: local(2026, 9, 13, 22, 0),
    });
    expect(s.state).toBe("scheduled");
    expect(s.at).toBe(loggedOn(14));
  });

  it("asks for both halves of a day taken twice", () => {
    const twice = {
      ...p,
      schedule: { kind: "daily", timesOfDay: ["07:00", "22:00"] } as Schedule,
    };
    const evening = local(2026, 9, 8, 22, 30);

    // The morning dose is logged, and the evening one is still asked for.
    const s = dueStatus(twice, evening, { lastLoggedAt: local(2026, 9, 8, 7, 5) });
    expect(s.state).toBe("due-now");
    expect(s.at).toBe(local(2026, 9, 8, 22, 0));

    // Once it is taken, attention moves to the morning, not to the day after.
    const after = dueStatus(twice, evening, { lastLoggedAt: evening });
    expect(after.at).toBe(local(2026, 9, 9, 7, 0));
  });

  it("does not read the morning dose as the evening one taken early", () => {
    // Fifteen hours apart, so a quarter of the gap is under four hours and the
    // morning log cannot reach the evening dose.
    const twice = {
      ...p,
      schedule: { kind: "daily", timesOfDay: ["07:00", "22:00"] } as Schedule,
    };
    const s = dueStatus(twice, local(2026, 9, 8, 23, 0), {
      lastLoggedAt: local(2026, 9, 8, 7, 0),
    });
    expect(s.state).toBe("due-now");
    expect(s.at).toBe(local(2026, 9, 8, 22, 0));
  });

  it("does not read a dose taken just after its time as the next one", () => {
    const s = dueStatus(morning, local(2026, 9, 8, 7, 20), {
      lastLoggedAt: local(2026, 9, 8, 7, 5),
    });
    expect(s.state).toBe("scheduled");
    expect(s.at).toBe(local(2026, 9, 9, 7, 0));
  });

  it("clears an early log on a weekly protocol too", () => {
    // Weekly, so the previous dose is seven days back and the grace window is
    // what has to do the work rather than the gap.
    const at = local(2026, 9, 14, 7, 30);
    const s = dueStatus(p, at, { lastLoggedAt: at });
    expect(s.state).toBe("scheduled");
    expect(s.at).toBe(loggedOn(14));
  });

  it("reports no dose scheduled for an as-needed protocol", () => {
    const s = dueStatus({ ...p, schedule: { kind: "as-needed" } }, start);
    expect(s.state).toBe("none");
    expect(s.at).toBeNull();
  });
});

describe("unloggedDoseTimes", () => {
  const start = local(2026, 9, 7, 7, 0);
  const twice: Protocol = {
    id: "p1",
    profileId: "me",
    peptideId: "bpc-157",
    name: "BPC",
    active: true,
    startedAt: start,
    doseMcg: 500,
    route: "subcutaneous",
    schedule: { kind: "daily", timesOfDay: ["07:00", "19:00"] },
    titrationAutoAdvance: false,
  };

  const day = (h: number, min = 0) => local(2026, 9, 8, h, min);
  const rest = (from: number) => unloggedDoseTimes(twice, logs, from, local(2026, 9, 8, 23, 59));
  let logs: { at: number; skipped?: boolean }[] = [];

  it("shows the evening dose while the morning one is still outstanding", () => {
    // The whole reason for this function: asking only for the next dose hides
    // the evening one for as long as the morning one goes unlogged.
    logs = [];
    expect(rest(day(8))).toEqual([day(19)]);
  });

  it("drops a dose once it has been logged", () => {
    logs = [{ at: day(19, 4) }];
    expect(rest(day(19, 30))).toEqual([]);
  });

  it("drops a dose taken a little early", () => {
    logs = [{ at: day(17, 30) }];
    expect(rest(day(17, 45))).toEqual([]);
  });

  it("does not let the morning dose answer for the evening", () => {
    // Twelve hours apart, so the window that clears the evening dose is three
    // hours, and a log at five past seven is nowhere near it.
    logs = [{ at: day(7, 5) }];
    expect(rest(day(8))).toEqual([day(19)]);
  });

  it("keeps asking for a dose that was marked skipped", () => {
    // Consistent with dueStatus, which counts only doses actually taken.
    logs = [{ at: day(19), skipped: true }];
    expect(rest(day(12))).toEqual([day(19)]);
  });

  it("is empty once the day is out", () => {
    logs = [];
    expect(rest(day(20))).toEqual([]);
  });
});

describe("logsForProtocol", () => {
  const protocol = { id: "p1", peptideId: "semaglutide" };
  const rows = [
    { id: "a", protocolId: "p1", peptideId: "semaglutide", at: 1 },
    { id: "b", protocolId: undefined, peptideId: "semaglutide", at: 2 },
    { id: "c", protocolId: "p2", peptideId: "tirzepatide", at: 3 },
    { id: "d", protocolId: "p1", peptideId: "tirzepatide", at: 4 },
  ];

  it("keeps doses attributed to the protocol by id", () => {
    expect(logsForProtocol(protocol, rows).map((r) => r.id)).toContain("a");
  });

  it("keeps unattributed doses of the same compound, which is what an import produces", () => {
    expect(logsForProtocol(protocol, rows).map((r) => r.id)).toContain("b");
  });

  it("excludes another compound's doses", () => {
    // The bug this exists to prevent: without it, adherence for a protocol
    // counts every other protocol's doses and reports a figure for a compound
    // that was never taken.
    expect(logsForProtocol(protocol, rows).map((r) => r.id)).not.toContain("c");
  });

  it("keeps a dose explicitly attributed to this protocol even under another compound", () => {
    expect(logsForProtocol(protocol, rows).map((r) => r.id)).toContain("d");
  });

  it("reports zero adherence for a protocol with nothing logged against it", () => {
    const p: Protocol = {
      id: "ai",
      profileId: "me",
      peptideId: "anastrozole",
      name: "AI",
      active: true,
      startedAt: local(2026, 6, 1),
      doseMcg: 250,
      route: "oral",
      schedule: { kind: "interval-days", intervalDays: 3 },
      titrationAutoAdvance: false,
    };
    const otherCompoundLogs = [
      { at: local(2026, 6, 1), peptideId: "testosterone-enanthate" },
      { at: local(2026, 6, 8), peptideId: "testosterone-enanthate" },
      { at: local(2026, 6, 15), peptideId: "testosterone-enanthate" },
    ];
    const a = adherence(p, logsForProtocol(p, otherCompoundLogs), local(2026, 6, 1), local(2026, 6, 20));
    expect(a.expected).toBeGreaterThan(0);
    expect(a.taken).toBe(0);
  });
});

describe("adherence matching, against a brute-force reference", () => {
  /**
   * The original quadratic algorithm, kept here verbatim as the definition of
   * correct. The optimised version must agree with it on every input, not just
   * on the cases someone thought to write down.
   */
  function referenceAdherence(
    protocol: Protocol,
    logs: { at: number; skipped?: boolean }[],
    fromMs: number,
    toMs: number,
    toleranceHours = 36,
  ) {
    const scheduled = doseTimesBetween(
      protocol.schedule,
      protocol.startedAt,
      fromMs,
      toMs,
      protocol.endedAt,
    );
    const tolerance = toleranceHours * 3_600_000;
    const unmatched = logs.filter((l) => l.at >= fromMs - tolerance && l.at <= toMs + tolerance);
    const used = new Set<number>();
    let taken = 0;
    let skipped = 0;

    for (const time of scheduled) {
      let bestIdx = -1;
      let bestDist = Infinity;
      for (let i = 0; i < unmatched.length; i++) {
        if (used.has(i)) continue;
        const dist = Math.abs(unmatched[i].at - time);
        if (dist <= tolerance && dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0) {
        used.add(bestIdx);
        if (unmatched[bestIdx].skipped) skipped++;
        else taken++;
      }
    }
    return { expected: scheduled.length, taken, skipped };
  }

  // A deterministic generator, so a failure is reproducible.
  function rng(seed: number) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  const HOUR = 3_600_000;

  it("agrees with the reference across 300 randomised histories", () => {
    const rand = rng(20260731);
    const schedules: Schedule[] = [
      { kind: "daily" },
      { kind: "interval-days", intervalDays: 2 },
      { kind: "interval-days", intervalDays: 7 },
      { kind: "days-of-week", daysOfWeek: [1, 4] },
      { kind: "interval-days", intervalDays: 3, cycleWeeksOn: 4, cycleWeeksOff: 2 },
    ];

    for (let n = 0; n < 300; n++) {
      const start = local(2026, 1, 1);
      const days = 20 + Math.floor(rand() * 120);
      const to = start + days * 86_400_000;
      const protocol: Protocol = {
        id: "p",
        profileId: "me",
        peptideId: "x",
        name: "x",
        active: true,
        startedAt: start,
        doseMcg: 100,
        route: "subcutaneous",
        schedule: schedules[Math.floor(rand() * schedules.length)],
        titrationAutoAdvance: false,
      };

      // Logs scattered around the schedule, some on time, some drifting well
      // past tolerance, some duplicated onto the same instant to force ties.
      const logs: { at: number; skipped?: boolean }[] = [];
      const count = Math.floor(rand() * 60);
      for (let i = 0; i < count; i++) {
        const at = start + Math.floor(rand() * days) * 86_400_000 + Math.floor((rand() - 0.5) * 90 * HOUR);
        logs.push({ at, skipped: rand() < 0.15 });
        if (rand() < 0.1) logs.push({ at, skipped: rand() < 0.5 });
      }
      // Deliberately unsorted, which is how the store hands them over.
      logs.sort(() => (rand() < 0.5 ? 1 : -1));

      const tolerance = [12, 36, 72][Math.floor(rand() * 3)];
      const got = adherence(protocol, logs, start, to, tolerance);
      const want = referenceAdherence(protocol, logs, start, to, tolerance);

      expect({ expected: got.expected, taken: got.taken, skipped: got.skipped }, `case ${n}`).toEqual(
        want,
      );
    }
  });

  it("never counts one log against two scheduled doses", () => {
    const protocol: Protocol = {
      id: "p",
      profileId: "me",
      peptideId: "x",
      name: "x",
      active: true,
      startedAt: local(2026, 1, 1),
      doseMcg: 100,
      route: "subcutaneous",
      schedule: { kind: "daily" },
      titrationAutoAdvance: false,
    };
    // One dose, five scheduled days, a tolerance wide enough to reach several.
    const a = adherence(protocol, [{ at: local(2026, 1, 3) }], local(2026, 1, 1), local(2026, 1, 5), 72);
    // The point is the one dose is consumed once, however many scheduled days
    // it sits within reach of.
    expect(a.expected).toBeGreaterThan(1);
    expect(a.taken).toBe(1);
    expect(a.skipped).toBe(0);
    expect(a.missed).toBe(a.expected - 1);
  });
});
