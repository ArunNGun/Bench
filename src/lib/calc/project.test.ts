import { describe, expect, it } from "vitest";
import { defaultWindowDays, describeAccumulation, project } from "./project";
import { accumulationRatio } from "./pk";
import type { Protocol } from "../types";

const DAY = 86_400_000;
const START = new Date(2026, 0, 5, 9, 0).getTime();

const protocol = (over: Partial<Protocol> = {}): Protocol => ({
  id: "p",
  profileId: "me",
  name: "test",
  peptideId: "testosterone-enanthate",
  active: true,
  startedAt: START,
  doseMcg: 250_000,
  route: "intramuscular",
  schedule: { kind: "interval-days", intervalDays: 7 },
  titrationAutoAdvance: false,
  ...over,
});

describe("project", () => {
  it("generates a curve across the whole window", () => {
    const p = project({ protocol: protocol(), halfLifeHours: 108, days: 60, steps: 100 });
    expect(p.series).toHaveLength(100);
    expect(p.series[0].t).toBe(START);
    expect(p.series[99].t).toBe(START + 60 * DAY);
  });

  it("places a dose every interval", () => {
    const p = project({ protocol: protocol(), halfLifeHours: 108, days: 28 });
    // Days 0, 7, 14, 21 and 28 all fall inside an inclusive 28 day window.
    expect(p.doseTimes).toHaveLength(5);
  });

  it("climbs from the first dose toward a plateau", () => {
    const p = project({ protocol: protocol(), halfLifeHours: 108, days: 60, steps: 400 });
    const firstWeekPeak = Math.max(...p.series.filter((s) => s.t < START + 7 * DAY).map((s) => s.level));
    expect(p.steadyPeak!).toBeGreaterThan(firstWeekPeak);
  });

  it("matches the closed-form accumulation ratio", () => {
    const p = project({ protocol: protocol(), halfLifeHours: 108, days: 60 });
    expect(p.accumulation).toBeCloseTo(accumulationRatio(168, 108), 10);
  });

  it("reports a swing above one, since levels fall between doses", () => {
    const p = project({ protocol: protocol(), halfLifeHours: 108, days: 60, steps: 600 });
    expect(p.swing!).toBeGreaterThan(1);
  });

  it("gives a flatter swing for a shorter interval at the same half-life", () => {
    // The whole argument for splitting a weekly dose into two.
    const weekly = project({ protocol: protocol(), halfLifeHours: 108, days: 60, steps: 600 });
    const twiceWeekly = project({
      protocol: protocol({ schedule: { kind: "interval-days", intervalDays: 3 } }),
      halfLifeHours: 108,
      days: 60,
      steps: 600,
    });
    expect(twiceWeekly.swing!).toBeLessThan(weekly.swing!);
  });

  it("shows little accumulation when the half-life is short relative to the interval", () => {
    const p = project({ protocol: protocol(), halfLifeHours: 4, days: 60 });
    expect(p.accumulation!).toBeCloseTo(1, 5);
  });

  it("has no accumulation figure for an as-needed schedule", () => {
    const p = project({
      protocol: protocol({ schedule: { kind: "as-needed" } }),
      halfLifeHours: 108,
      days: 30,
    });
    expect(p.accumulation).toBeNull();
    expect(p.swing).toBeNull();
    expect(p.doseTimes).toEqual([]);
  });

  it("stops dosing at the protocol's end date", () => {
    const p = project({
      protocol: protocol({ endedAt: START + 14 * DAY }),
      halfLifeHours: 108,
      days: 60,
    });
    expect(Math.max(...p.doseTimes)).toBeLessThanOrEqual(START + 14 * DAY);
  });

  it("follows a titration ladder rather than the flat dose", () => {
    const p = project({
      protocol: protocol({
        doseMcg: 1000,
        titrationAutoAdvance: true,
        titration: [
          { step: 1, doseMcg: 1000, weeks: 4 },
          { step: 2, doseMcg: 4000, weeks: 4 },
        ],
      }),
      halfLifeHours: 108,
      days: 56,
      steps: 400,
    });
    const early = Math.max(...p.series.filter((s) => s.t < START + 21 * DAY).map((s) => s.level));
    const late = Math.max(...p.series.filter((s) => s.t > START + 42 * DAY).map((s) => s.level));
    expect(late).toBeGreaterThan(early * 2);
  });

  it("returns an empty curve rather than throwing on a zero-length window", () => {
    const p = project({ protocol: protocol(), halfLifeHours: 108, days: 0 });
    expect(p.series).toEqual([]);
  });
});

describe("defaultWindowDays", () => {
  it("covers the climb to steady state plus a couple of intervals", () => {
    // 108 h half-life reaches steady state around 22.8 days; weekly dosing
    // adds another fortnight to make the plateau visible.
    expect(defaultWindowDays(108, protocol())).toBe(37);
  });

  it("never drops below a fortnight, however short the half-life", () => {
    // A 2 hour half-life reaches steady state in under a day, so the floor and
    // the two-interval padding are what keep the window readable rather than
    // the climb. Weekly dosing makes the padding the binding constraint.
    expect(defaultWindowDays(2, protocol())).toBeGreaterThanOrEqual(14);
    expect(defaultWindowDays(2, protocol({ schedule: { kind: "daily" } }))).toBe(14);
  });

  it("is capped so a very long half-life does not project half a year", () => {
    expect(defaultWindowDays(30 * 24, protocol())).toBeLessThanOrEqual(180);
  });
});

describe("describeAccumulation", () => {
  it("says nothing without a figure", () => {
    expect(describeAccumulation(null)).toBeNull();
  });

  it("distinguishes no build-up from substantial build-up", () => {
    expect(describeAccumulation(1.02)).toMatch(/do not build/);
    expect(describeAccumulation(2.4)).toMatch(/not representative/);
    expect(describeAccumulation(5)).toMatch(/several times higher/);
  });
});
