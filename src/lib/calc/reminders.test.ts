import { describe, expect, it } from "vitest";
import { REMINDER_HORIZON_DAYS, reminderId, remindersFor } from "./reminders";
import { DEFAULT_REMINDERS, type Protocol, type RemindersSettings } from "../types";

const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Monday, in local time, so the fixtures read the way a user would see them. */
const NOW = new Date(2026, 0, 5, 6, 0, 0).getTime();

const on = (over: Partial<RemindersSettings> = {}): RemindersSettings => ({
  ...DEFAULT_REMINDERS,
  enabled: true,
  ...over,
});

const protocol = (over: Partial<Protocol> = {}): Protocol => ({
  id: "p1",
  profileId: "me",
  peptideId: "bpc-157",
  name: "",
  active: true,
  startedAt: new Date(2026, 0, 1, 7, 0, 0).getTime(),
  doseMcg: 250,
  route: "subcutaneous",
  schedule: { kind: "daily", timesOfDay: ["07:00"] },
  titrationAutoAdvance: false,
  ...over,
});

const peptides = [{ id: "bpc-157", name: "BPC-157" }];

const run = (over: Partial<Parameters<typeof remindersFor>[0]> = {}) =>
  remindersFor({
    protocols: [protocol()],
    logs: [],
    peptides,
    settings: on(),
    nowMs: NOW,
    ...over,
  });

describe("switched off", () => {
  it("arms nothing at all", () => {
    expect(run({ settings: DEFAULT_REMINDERS })).toEqual([]);
  });

  it("is what a fresh install has", () => {
    // The whole feature is opt in. If this ever flips, someone gets a lock
    // screen naming a peptide without having asked for it.
    expect(DEFAULT_REMINDERS.enabled).toBe(false);
    expect(DEFAULT_REMINDERS.showCompound).toBe(false);
  });
});

describe("what gets armed", () => {
  it("covers the horizon and stops there", () => {
    const out = run();
    // One a day. A daylight-saving shift inside the window can let one more
    // under a horizon measured in milliseconds, which is the horizon behaving.
    expect(out.length).toBeGreaterThanOrEqual(REMINDER_HORIZON_DAYS);
    expect(out.length).toBeLessThanOrEqual(REMINDER_HORIZON_DAYS + 1);
    expect(out[0].doseAt).toBe(new Date(2026, 0, 5, 7, 0, 0).getTime());
  });

  it("never arms a time that has already passed", () => {
    const out = run({ nowMs: new Date(2026, 0, 5, 7, 30, 0).getTime() });
    expect(out.every((r) => r.at > new Date(2026, 0, 5, 7, 30, 0).getTime())).toBe(true);
    expect(out[0].doseAt).toBe(new Date(2026, 0, 6, 7, 0, 0).getTime());
  });

  it("leaves a paused protocol alone", () => {
    expect(run({ protocols: [protocol({ active: false })] })).toEqual([]);
  });

  it("leaves an as-needed protocol alone, since it has no hour to fire at", () => {
    expect(run({ protocols: [protocol({ schedule: { kind: "as-needed" } })] })).toEqual([]);
  });

  it("leaves a protocol that has already ended alone", () => {
    expect(run({ protocols: [protocol({ endedAt: NOW - DAY })] })).toEqual([]);
  });

  it("arms both times when a day carries two", () => {
    const out = run({
      protocols: [protocol({ schedule: { kind: "daily", timesOfDay: ["07:00", "19:00"] } })],
    });
    expect(out.length).toBeGreaterThanOrEqual(REMINDER_HORIZON_DAYS * 2);
    expect(out[0].doseAt).toBe(new Date(2026, 0, 5, 7, 0, 0).getTime());
    expect(out[1].doseAt).toBe(new Date(2026, 0, 5, 19, 0, 0).getTime());
  });

  it("follows an every-other-day rhythm rather than firing daily", () => {
    const out = run({
      protocols: [protocol({ schedule: { kind: "interval-days", intervalDays: 2, timesOfDay: ["07:00"] } })],
    });
    for (let i = 1; i < out.length; i++) {
      expect(out[i].doseAt - out[i - 1].doseAt).toBe(2 * DAY);
    }
  });
});

describe("a dose already taken", () => {
  it("stops asking once it is logged", () => {
    const first = new Date(2026, 0, 5, 7, 0, 0).getTime();
    const out = run({ logs: [{ at: first, peptideId: "bpc-157", protocolId: "p1" }] });
    expect(out.some((r) => r.doseAt === first)).toBe(false);
  });

  it("stops asking when it was taken a little early", () => {
    // Up at half six, injected, went to work. The reminder must not go off at
    // seven for something already in the leg.
    const first = new Date(2026, 0, 5, 7, 0, 0).getTime();
    const out = run({
      logs: [{ at: first - 30 * 60_000, peptideId: "bpc-157", protocolId: "p1" }],
    });
    expect(out.some((r) => r.doseAt === first)).toBe(false);
  });

  it("keeps asking for a dose belonging to a different compound", () => {
    const first = new Date(2026, 0, 5, 7, 0, 0).getTime();
    const out = run({ logs: [{ at: first, peptideId: "tb-500", protocolId: "p2" }] });
    expect(out.some((r) => r.doseAt === first)).toBe(true);
  });
});

describe("lead time", () => {
  it("fires early by the minutes asked for, without moving the dose", () => {
    const out = run({ settings: on({ leadMinutes: 15 }) });
    expect(out[0].doseAt).toBe(new Date(2026, 0, 5, 7, 0, 0).getTime());
    expect(out[0].at).toBe(out[0].doseAt - 15 * 60_000);
  });

  it("still arms a dose whose lead time has not yet arrived", () => {
    // 06:50 for a 07:00 dose, asked at 06:45. The lead must widen the window
    // that is searched, or this dose is silently skipped.
    const out = run({
      nowMs: new Date(2026, 0, 5, 6, 45, 0).getTime(),
      settings: on({ leadMinutes: 10 }),
    });
    expect(out[0].at).toBe(new Date(2026, 0, 5, 6, 50, 0).getTime());
  });

  it("treats a negative lead as none rather than firing after the dose", () => {
    const out = run({ settings: on({ leadMinutes: -30 }) });
    expect(out[0].at).toBe(out[0].doseAt);
  });
});

describe("what it says", () => {
  it("names nothing by default", () => {
    const [first] = run();
    expect(first.title).toBe("Bench");
    expect(first.body).toBe("A dose is due.");
    expect(`${first.title} ${first.body}`).not.toContain("BPC");
  });

  it("names the compound and the dose once that is turned on", () => {
    const [first] = run({ settings: on({ showCompound: true }) });
    expect(first.title).toBe("BPC-157");
    expect(first.body).toBe("250 mcg due.");
  });

  it("prefers the name the user gave the protocol", () => {
    const [first] = run({
      protocols: [protocol({ name: "Morning healing" })],
      settings: on({ showCompound: true }),
    });
    expect(first.title).toBe("Morning healing");
  });

  it("says the split dose, not the day's dose", () => {
    // 500 a day across two times is 250 in the syringe, and the syringe is what
    // the reminder is about.
    const [first] = run({
      protocols: [
        protocol({ doseMcg: 500, schedule: { kind: "daily", timesOfDay: ["07:00", "19:00"] } }),
      ],
      settings: on({ showCompound: true }),
    });
    expect(first.body).toBe("250 mcg due.");
  });

  it("follows the phase each dose falls in, not the phase in force today", () => {
    // Started 1 January, one week at 250, then 500. The horizon spans the
    // boundary, so the alarms armed today have to carry two different doses.
    const out = run({
      protocols: [
        protocol({
          doseMcg: 250,
          phases: [
            { step: 1, doseMcg: 250, weeks: 1 },
            { step: 2, doseMcg: 500, weeks: 4 },
          ],
        }),
      ],
      settings: on({ showCompound: true }),
    });

    const bodyOn = (day: number) =>
      out.find((r) => r.doseAt === new Date(2026, 0, day, 7, 0, 0).getTime())?.body;

    expect(bodyOn(5)).toBe("250 mcg due.");
    expect(bodyOn(7)).toBe("250 mcg due.");
    expect(bodyOn(8)).toBe("500 mcg due.");
  });
});

describe("identity", () => {
  it("gives the same dose the same id every time it is derived", () => {
    expect(run()[0].id).toBe(run()[0].id);
    expect(run()[0].key).toBe("p1:" + new Date(2026, 0, 5, 7, 0, 0).getTime());
  });

  it("gives different doses different ids", () => {
    const out = run();
    expect(new Set(out.map((r) => r.id)).size).toBe(out.length);
  });

  it("produces an id Android will accept", () => {
    // The platform wants a positive 32-bit integer, and a float or a negative
    // is rejected without saying so.
    for (const r of run()) {
      expect(Number.isSafeInteger(r.id)).toBe(true);
      expect(r.id).toBeGreaterThanOrEqual(0);
      expect(r.id).toBeLessThan(2_147_483_647);
    }
    expect(reminderId("")).toBeGreaterThanOrEqual(0);
  });
});

describe("several protocols", () => {
  it("returns them in the order they will fire", () => {
    const out = run({
      protocols: [
        protocol({ id: "evening", schedule: { kind: "daily", timesOfDay: ["19:00"] } }),
        protocol({ id: "morning", peptideId: "tb-500", schedule: { kind: "daily", timesOfDay: ["07:00"] } }),
      ],
    });
    for (let i = 1; i < out.length; i++) {
      expect(out[i].at).toBeGreaterThanOrEqual(out[i - 1].at);
    }
    expect(out[0].protocolId).toBe("morning");
  });
});

describe("the clocks changing", () => {
  it("keeps a 07:00 dose at 07:00 across the spring shift", () => {
    // Only meaningful where DST exists. Elsewhere this still asserts that every
    // dose lands at seven, which is the same promise.
    const march = new Date(2026, 2, 1, 6, 0, 0).getTime();
    const out = remindersFor({
      protocols: [protocol({ startedAt: new Date(2026, 1, 1, 7, 0, 0).getTime() })],
      logs: [],
      peptides,
      settings: on(),
      nowMs: march,
      horizonDays: 30,
    });

    for (const r of out) {
      const d = new Date(r.doseAt);
      expect(`${d.getHours()}:${d.getMinutes()}`).toBe("7:0");
    }
  });

  it("never lets two doses collapse onto the same instant", () => {
    const march = new Date(2026, 2, 1, 6, 0, 0).getTime();
    const out = remindersFor({
      protocols: [protocol({ startedAt: new Date(2026, 1, 1, 7, 0, 0).getTime() })],
      logs: [],
      peptides,
      settings: on(),
      nowMs: march,
      horizonDays: 30,
    });
    expect(new Set(out.map((r) => r.at)).size).toBe(out.length);
  });

  it("keeps roughly a day between daily doses either side of the shift", () => {
    const march = new Date(2026, 2, 1, 6, 0, 0).getTime();
    const out = remindersFor({
      protocols: [protocol({ startedAt: new Date(2026, 1, 1, 7, 0, 0).getTime() })],
      logs: [],
      peptides,
      settings: on(),
      nowMs: march,
      horizonDays: 30,
    });

    for (let i = 1; i < out.length; i++) {
      const gap = out[i].doseAt - out[i - 1].doseAt;
      // 23, 24 or 25 hours. A fixed 24 would drift the dose off its hour.
      expect(gap).toBeGreaterThanOrEqual(23 * HOUR);
      expect(gap).toBeLessThanOrEqual(25 * HOUR);
    }
  });
});
