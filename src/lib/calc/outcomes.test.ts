import { describe, expect, it } from "vitest";
import {
  averageFeeling,
  kgToLb,
  latestWeightKg,
  lbToKg,
  sideEffectTally,
  toleranceByStep,
  weightChange,
  weightSeries,
} from "./outcomes";
import type { DoseLog, Measurement, TitrationStep } from "../types";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 6, 29, 12);

const m = (daysAgo: number, weightKg?: number, over: Partial<Measurement> = {}): Measurement => ({
  id: `m${daysAgo}`,
  profileId: "me",
  at: NOW - daysAgo * DAY,
  weightKg, ...over,
});

type L = Pick<DoseLog, "at" | "feeling" | "sideEffects" | "skipped">;
const log = (daysAgo: number, over: Partial<L> = {}): L => ({
  at: NOW - daysAgo * DAY, ...over,
});

describe("weight units", () => {
  it("round-trips kg and lb", () => {
    expect(lbToKg(220.462)).toBeCloseTo(100, 3);
    expect(kgToLb(100)).toBeCloseTo(220.462, 3);
    expect(kgToLb(lbToKg(180))).toBeCloseTo(180, 9);
  });
});

describe("weightSeries", () => {
  it("returns readings oldest first", () => {
    const s = weightSeries([m(1, 90), m(10, 94), m(5, 92)]);
    expect(s.map((p) => p.kg)).toEqual([94, 92, 90]);
  });

  it("ignores entries with no weight", () => {
    expect(weightSeries([m(1), m(2, 90), m(3, 0)])).toHaveLength(1);
  });

  it("copes with nothing recorded", () => {
    expect(weightSeries([])).toEqual([]);
  });
});

describe("weightChange", () => {
  it("needs two readings to call anything a trend", () => {
    expect(weightChange([])).toBeNull();
    expect(weightChange([m(1, 90)])).toBeNull();
  });

  it("measures a loss as a negative delta", () => {
    const c = weightChange([m(28, 100), m(0, 94)])!;
    expect(c.deltaKg).toBeCloseTo(-6, 9);
    expect(c.deltaPercent).toBeCloseTo(-6, 9);
    expect(c.days).toBeCloseTo(28, 6);
  });

  it("measures a gain as positive", () => {
    expect(weightChange([m(14, 80), m(0, 82)])!.deltaKg).toBeCloseTo(2, 9);
  });

  it("averages the change per week", () => {
    // 6 kg over 28 days is 1.5 kg a week.
    expect(weightChange([m(28, 100), m(0, 94)])!.perWeekKg).toBeCloseTo(-1.5, 6);
  });

  it("uses the earliest and latest, not the extremes", () => {
    // Dipped to 90 mid-window but ended at 96.
    const c = weightChange([m(28, 100), m(14, 90), m(0, 96)])!;
    expect(c.first.kg).toBe(100);
    expect(c.latest.kg).toBe(96);
    expect(c.deltaKg).toBeCloseTo(-4, 9);
  });

  it("can be limited to a window", () => {
    const all = [m(60, 110), m(28, 100), m(0, 94)];
    expect(weightChange(all)!.deltaKg).toBeCloseTo(-16, 9);
    expect(weightChange(all, NOW - 30 * DAY)!.deltaKg).toBeCloseTo(-6, 9);
  });

  it("has no weekly rate for two readings on the same day", () => {
    expect(weightChange([m(0, 90), { ...m(0, 89), id: "x", at: NOW + 1000 }])!.perWeekKg).toBeNull();
  });
});

describe("latestWeightKg", () => {
  it("returns the most recent reading", () => {
    expect(latestWeightKg([m(10, 94), m(1, 90), m(5, 92)])).toBe(90);
  });

  it("is null with nothing recorded", () => {
    expect(latestWeightKg([])).toBeNull();
  });
});

describe("sideEffectTally", () => {
  const logs: L[] = [
    log(1, { sideEffects: ["Nausea", "Fatigue"] }),
    log(2, { sideEffects: ["Nausea"] }),
    log(3, { sideEffects: [] }),
    log(4, { sideEffects: ["Nausea", "Headache"] }),
  ];

  it("counts each effect and its rate", () => {
    const t = sideEffectTally(logs);
    expect(t.total).toBe(4);
    expect(t.effects[0]).toMatchObject({ effect: "Nausea", count: 3 });
    expect(t.effects[0].rate).toBeCloseTo(0.75, 9);
  });

  it("orders by frequency", () => {
    const counts = sideEffectTally(logs).effects.map((e) => e.count);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  it("excludes skipped doses from the denominator", () => {
    const t = sideEffectTally([...logs, log(5, { skipped: true, sideEffects: ["Nausea"] })]);
    expect(t.total).toBe(4);
    expect(t.effects[0].count).toBe(3);
  });

  it("returns nothing when no effects were recorded", () => {
    const t = sideEffectTally([log(1), log(2)]);
    expect(t.total).toBe(2);
    expect(t.effects).toEqual([]);
  });
});

describe("averageFeeling", () => {
  it("averages only the doses that were rated", () => {
    expect(averageFeeling([log(1, { feeling: 4 }), log(2, { feeling: 2 }), log(3)])).toBe(3);
  });

  it("is null when nothing was rated", () => {
    expect(averageFeeling([log(1), log(2)])).toBeNull();
  });

  it("ignores skipped doses", () => {
    expect(averageFeeling([log(1, { feeling: 5 }), log(2, { feeling: 1, skipped: true })])).toBe(5);
  });
});

describe("toleranceByStep", () => {
  const steps: TitrationStep[] = [
    { step: 1, doseMcg: 2000, weeks: 4 },
    { step: 2, doseMcg: 4000, weeks: 4 },
    { step: 3, doseMcg: 8000, weeks: 4 },
  ];
  const startedAt = NOW - 70 * DAY;

  // Weeks 0-3 are step 1, 4-7 step 2, 8-11 step 3.
  const at = (weeksIn: number) => startedAt + weeksIn * 7 * DAY;

  const logs: L[] = [
    { at: at(1), feeling: 4, sideEffects: [] },
    { at: at(2), feeling: 5, sideEffects: [] },
    { at: at(5), feeling: 3, sideEffects: ["Nausea"] },
    { at: at(6), feeling: 3, sideEffects: [] },
    { at: at(9), feeling: 2, sideEffects: ["Nausea", "Fatigue"] },
    { at: at(10), feeling: 1, sideEffects: ["Nausea"] },
  ];

  it("groups doses under the step that was running", () => {
    const rows = toleranceByStep(logs, steps, startedAt);
    expect(rows.map((r) => r.stepIndex)).toEqual([0, 1, 2]);
    expect(rows.map((r) => r.doses)).toEqual([2, 2, 2]);
    expect(rows.map((r) => r.doseMcg)).toEqual([2000, 4000, 8000]);
  });

  it("shows tolerance worsening as the dose climbs", () => {
    const rows = toleranceByStep(logs, steps, startedAt);
    expect(rows[0].averageFeeling).toBe(4.5);
    expect(rows[1].averageFeeling).toBe(3);
    expect(rows[2].averageFeeling).toBe(1.5);
    expect(rows[0].sideEffectRate).toBe(0);
    expect(rows[1].sideEffectRate).toBe(0.5);
    expect(rows[2].sideEffectRate).toBe(1);
  });

  it("names the commonest effects at a step", () => {
    const rows = toleranceByStep(logs, steps, startedAt);
    expect(rows[2].topEffects[0].effect).toBe("Nausea");
    expect(rows[2].topEffects[0].count).toBe(2);
  });

  it("omits steps with no doses rather than showing empty rows", () => {
    const sparse = [{ at: at(1), feeling: 4 }];
    expect(toleranceByStep(sparse, steps, startedAt).map((r) => r.stepIndex)).toEqual([0]);
  });

  it("returns nothing without a titration plan", () => {
    expect(toleranceByStep(logs, [], startedAt)).toEqual([]);
  });

  it("ignores doses logged before the protocol began", () => {
    const early = [{ at: startedAt - 10 * DAY, feeling: 5 }];
    expect(toleranceByStep(early, steps, startedAt)).toEqual([]);
  });

  it("leaves the average null at a step where nothing was rated", () => {
    const unrated = [{ at: at(1), sideEffects: ["Nausea"] }];
    const rows = toleranceByStep(unrated, steps, startedAt);
    expect(rows[0].averageFeeling).toBeNull();
    expect(rows[0].sideEffectRate).toBe(1);
  });
});
