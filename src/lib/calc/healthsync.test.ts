import { describe, expect, it } from "vitest";
import * as healthsync from "./healthsync";
import { dailyRestingHr, mergeIntervals, nightlySleep } from "./healthsync";
import {
  describeSync,
  MATCH_WEIGHT_KG,
  MATCH_WINDOW_MS,
  newestSample,
  planPull,
  sampleToMeasurement,
  summarise,
  type HealthSample,
} from "./healthsync";
import type { Measurement } from "../types";

const NOW = Date.UTC(2026, 6, 30, 8);

const local = (over: Partial<Measurement> & { id: string }): Measurement => ({
  profileId: "me",
  at: NOW,
  weightKg: 89.7, ...over,
});

const sample = (over: Partial<HealthSample> & { externalId: string }): HealthSample => ({
  at: NOW,
  weightKg: 89.7, ...over,
});

describe("planPull, bringing readings in", () => {
  it("adds a sample that has never been seen", () => {
    const plan = planPull([], [sample({ externalId: "hc-1" })]);
    expect(plan.toAdd).toHaveLength(1);
    expect(plan.toLink).toHaveLength(0);
    expect(plan.skipped).toBe(0);
  });

  it("skips a sample already stored under its own id", () => {
    const existing = [local({ id: "a", externalId: "hc-1" })];
    const plan = planPull(existing, [sample({ externalId: "hc-1" })]);
    expect(plan.toAdd).toHaveLength(0);
    expect(plan.skipped).toBe(1);
  });

  it("links a hand-typed reading rather than duplicating it", () => {
    // Weighed in, typed it, and the scale synced a minute later.
    const existing = [local({ id: "a", at: NOW, weightKg: 89.7 })];
    const plan = planPull(existing, [
      sample({ externalId: "hc-1", at: NOW + 60_000, weightKg: 89.72 }),
    ]);
    expect(plan.toAdd).toHaveLength(0);
    expect(plan.toLink).toEqual([{ id: "a", externalId: "hc-1" }]);
  });

  it("treats a reading far enough apart in time as separate", () => {
    const existing = [local({ id: "a", at: NOW })];
    const plan = planPull(existing, [
      sample({ externalId: "hc-1", at: NOW + MATCH_WINDOW_MS + 1000 }),
    ]);
    expect(plan.toAdd).toHaveLength(1);
    expect(plan.toLink).toHaveLength(0);
  });

  it("treats a different weight at the same moment as separate", () => {
    const existing = [local({ id: "a", weightKg: 89.7 })];
    const plan = planPull(existing, [
      sample({ externalId: "hc-1", weightKg: 89.7 + MATCH_WEIGHT_KG + 0.1 }),
    ]);
    expect(plan.toAdd).toHaveLength(1);
  });

  it("never links two samples to the same reading", () => {
    const existing = [local({ id: "a" })];
    const plan = planPull(existing, [
      sample({ externalId: "hc-1" }),
      sample({ externalId: "hc-2", at: NOW + 1000 }),
    ]);
    expect(plan.toLink).toHaveLength(1);
    expect(plan.toAdd).toHaveLength(1);
  });

  it("does not re-link a reading that already has an external id", () => {
    const existing = [local({ id: "a", externalId: "hc-old" })];
    const plan = planPull(existing, [sample({ externalId: "hc-new" })]);
    expect(plan.toLink).toHaveLength(0);
    expect(plan.toAdd).toHaveLength(1);
  });

  it("ignores readings with no weight when matching", () => {
    const existing = [local({ id: "a", weightKg: undefined, waistCm: 90 })];
    const plan = planPull(existing, [sample({ externalId: "hc-1" })]);
    expect(plan.toAdd).toHaveLength(1);
    expect(plan.toLink).toHaveLength(0);
  });

  it("is idempotent, a second sync of the same samples changes nothing", () => {
    const samples = [sample({ externalId: "hc-1" }), sample({ externalId: "hc-2", at: NOW + 86_400_000 })];
    const first = planPull([], samples);
    const stored = first.toAdd.map((s, i) => sampleToMeasurement(s, "me", `m${i}`));

    const second = planPull(stored, samples);
    expect(second.toAdd).toHaveLength(0);
    expect(second.toLink).toHaveLength(0);
    expect(second.skipped).toBe(2);
  });

  it("copes with nothing on either side", () => {
    expect(planPull([], [])).toEqual({ toAdd: [], toLink: [], skipped: 0 });
  });
});

describe("sampleToMeasurement", () => {
  it("records where the reading came from", () => {
    const m = sampleToMeasurement(sample({ externalId: "hc-1" }), "me", "m1");
    expect(m.source).toBe("health-connect");
    expect(m.externalId).toBe("hc-1");
    expect(m.profileId).toBe("me");
    expect(m.weightKg).toBe(89.7);
  });
});

describe("newestSample, what the weight field is prefilled from", () => {
  it("finds nothing in an empty read", () => {
    expect(newestSample([])).toBeNull();
  });

  it("takes the most recent reading regardless of the order given", () => {
    const s = newestSample([
      sample({ externalId: "old", at: NOW - 2 * 86_400_000, weightKg: 91 }),
      sample({ externalId: "new", at: NOW, weightKg: 89.4 }),
      sample({ externalId: "mid", at: NOW - 86_400_000, weightKg: 90.2 }),
    ]);
    expect(s?.externalId).toBe("new");
    expect(s?.weightKg).toBe(89.4);
  });

  it("ignores readings with no usable weight", () => {
    expect(newestSample([sample({ externalId: "a", weightKg: 0 })])).toBeNull();
  });

  it("prefers a real earlier reading over a later empty one", () => {
    const s = newestSample([
      sample({ externalId: "good", at: NOW - 1000, weightKg: 88 }),
      sample({ externalId: "empty", at: NOW, weightKg: 0 }),
    ]);
    expect(s?.externalId).toBe("good");
  });
});

describe("summarise and describeSync", () => {
  it("counts what happened", () => {
    const plan = planPull([local({ id: "a" })], [
      sample({ externalId: "hc-1" }),
      sample({ externalId: "hc-2", at: NOW + 86_400_000 }),
    ]);
    const s = summarise(plan);
    expect(s).toEqual({ added: 1, linked: 1, skipped: 0 });
  });

  it("says so when there was nothing to do", () => {
    expect(describeSync({ added: 0, linked: 0, skipped: 4 })).toBe("Already up to date.");
  });

  it("reads as a sentence", () => {
    expect(describeSync({ added: 2, linked: 1, skipped: 0 })).toBe(
      "2 brought in, 1 matched to yours.");
  });

  it("never claims anything was sent out", () => {
    expect(describeSync({ added: 2, linked: 1, skipped: 0 })).not.toMatch(/sent|out|push/i);
  });
});

describe("the read-only guarantee", () => {
  /**
   * The sync is one-way by design: nothing the app holds is written back to the
   * health store, and it does not hold write permission to do so. These lock
   * that in at the module boundary, so reintroducing a push has to be a
   * deliberate act that breaks a test rather than a quiet addition.
   */
  it("exposes no way to send a reading out", () => {
    const surface = Object.keys(healthsync);
    expect(surface).not.toContain("planPush");
    for (const name of surface) {
      expect(name, `${name} looks like a write`).not.toMatch(/push|write|save|upload|send/i);
    }
  });

  it("summarises a sync without any notion of what went out", () => {
    const plan = planPull([], [sample({ externalId: "hc-1" })]);
    expect(Object.keys(summarise(plan)).sort()).toEqual(["added", "linked", "skipped"]);
  });
});

describe("mergeIntervals", () => {
  const span = (a: number, b: number) => ({ startAt: a, endAt: b });

  it("leaves disjoint spans alone", () => {
    expect(mergeIntervals([span(0, 10), span(20, 30)])).toEqual([span(0, 10), span(20, 30)]);
  });

  it("merges an overlap into one", () => {
    expect(mergeIntervals([span(0, 20), span(10, 30)])).toEqual([span(0, 30)]);
  });

  it("merges a span fully inside another", () => {
    // A stage record sitting inside its parent session. Summing both would
    // report roughly twice the sleep actually had.
    expect(mergeIntervals([span(0, 100), span(20, 40)])).toEqual([span(0, 100)]);
  });

  it("does not care what order they arrive in", () => {
    expect(mergeIntervals([span(10, 30), span(0, 20)])).toEqual([span(0, 30)]);
  });

  it("drops zero and negative length spans", () => {
    expect(mergeIntervals([span(10, 10), span(30, 20)])).toEqual([]);
  });
});

describe("nightlySleep", () => {
  const startOfDay = (ms: number) => new Date(ms).setHours(0, 0, 0, 0);
  const night = (dayOfMonth: number, fromHour: number, toHour: number, state?: string) => ({
    externalId: `s${dayOfMonth}-${fromHour}`,
    startAt: new Date(2026, 5, dayOfMonth, fromHour).getTime(),
    endAt: new Date(2026, 5, dayOfMonth, toHour).getTime(),
    state,
  });

  it("sums a night into hours", () => {
    const out = nightlySleep([night(14, 1, 8)], startOfDay);
    expect(out).toHaveLength(1);
    expect(out[0].hours).toBe(7);
  });

  it("credits sleep to the morning you woke, not the night you lay down", () => {
    // The day whose energy the check-in is describing.
    const seg = {
      externalId: "overnight",
      startAt: new Date(2026, 5, 14, 23, 0).getTime(),
      endAt: new Date(2026, 5, 15, 7, 0).getTime(),
    };
    const out = nightlySleep([seg], startOfDay);
    expect(out[0].day).toBe(new Date(2026, 5, 15).setHours(0, 0, 0, 0));
    expect(out[0].hours).toBe(8);
  });

  it("excludes time awake and time merely in bed", () => {
    const out = nightlySleep(
      [night(14, 1, 8, "asleep"), night(14, 8, 9, "awake"), night(14, 0, 1, "inBed")],
      startOfDay);
    expect(out[0].hours).toBe(7);
  });

  it("counts a session with no stage label at all", () => {
    // Not every platform reports stages. Dropping unlabelled sleep would report
    // zero for anyone whose device does not.
    expect(nightlySleep([night(14, 1, 8)], startOfDay)[0].hours).toBe(7);
  });

  it("does not double count a stage that sits inside its session", () => {
    const session = night(14, 1, 8, "asleep");
    const stage = { ...night(14, 2, 4, "deep"), externalId: "stage" };
    expect(nightlySleep([session, stage], startOfDay)[0].hours).toBe(7);
  });

  it("reports how many separate stretches made up the night", () => {
    const out = nightlySleep([night(14, 1, 3), night(14, 5, 8)], startOfDay);
    expect(out[0].segments).toBe(2);
    expect(out[0].hours).toBe(5);
  });

  it("returns newest first", () => {
    const out = nightlySleep([night(14, 1, 8), night(16, 1, 8), night(15, 1, 8)], startOfDay);
    expect(out.map((n) => new Date(n.day).getDate())).toEqual([16, 15, 14]);
  });

  it("returns nothing for nothing", () => {
    expect(nightlySleep([], startOfDay)).toEqual([]);
  });
});

describe("dailyRestingHr", () => {
  const startOfDay = (ms: number) => new Date(ms).setHours(0, 0, 0, 0);
  const reading = (dayOfMonth: number, hour: number, bpm: number) => ({
    externalId: `r${dayOfMonth}-${hour}`,
    at: new Date(2026, 5, dayOfMonth, hour).getTime(),
    bpm,
  });

  it("keeps the lowest reading of the day", () => {
    // Several readings a day that disagree by a few beats. The minimum is
    // consistent across days; an average drifts with sampling frequency.
    const out = dailyRestingHr([reading(14, 3, 58), reading(14, 9, 64)], startOfDay);
    expect(out).toEqual([{ day: new Date(2026, 5, 14).setHours(0, 0, 0, 0), bpm: 58 }]);
  });

  it("keeps days apart", () => {
    const out = dailyRestingHr([reading(14, 3, 58), reading(15, 3, 61)], startOfDay);
    expect(out).toHaveLength(2);
  });

  it("ignores a nonsense reading", () => {
    expect(dailyRestingHr([reading(14, 3, 0)], startOfDay)).toEqual([]);
  });

  it("returns newest first", () => {
    const out = dailyRestingHr([reading(14, 3, 58), reading(16, 3, 60)], startOfDay);
    expect(new Date(out[0].day).getDate()).toBe(16);
  });
});
