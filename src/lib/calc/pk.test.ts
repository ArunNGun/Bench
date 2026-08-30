import { describe, expect, it } from "vitest";
import {
  absorptionRate,
  accumulationRatio,
  breakdownAt,
  eliminationRate,
  fractionRemaining,
  hoursUntilFraction,
  levelAt,
  levelSeries,
  singleDoseLevel,
  snapshot,
  timeToSteadyState,
} from "./pk";

const HOUR = 3_600_000;

describe("half-life arithmetic", () => {
  it("halves once per half-life", () => {
    expect(fractionRemaining(0, 24)).toBe(1);
    expect(fractionRemaining(24, 24)).toBeCloseTo(0.5, 12);
    expect(fractionRemaining(48, 24)).toBeCloseTo(0.25, 12);
    expect(fractionRemaining(120, 24)).toBeCloseTo(0.03125, 12);
  });

  it("derives ke such that e^(-ke·t½) is one half", () => {
    const ke = eliminationRate(6);
    expect(Math.exp(-ke * 6)).toBeCloseTo(0.5, 12);
  });

  it("inverts the decay to find when a fraction is left", () => {
    expect(hoursUntilFraction(0.5, 24)).toBeCloseTo(24, 10);
    expect(hoursUntilFraction(0.25, 24)).toBeCloseTo(48, 10);
    // Round trip.
    const h = hoursUntilFraction(0.1, 165);
    expect(fractionRemaining(h, 165)).toBeCloseTo(0.1, 10);
  });
});

describe("absorptionRate", () => {
  it("recovers the Tmax it was solved from", () => {
    const cases = [
      { tmax: 4, halfLife: 24 },
      { tmax: 24, halfLife: 120 },
      { tmax: 48, halfLife: 165 },
      { tmax: 0.5, halfLife: 2 },
    ];
    for (const c of cases) {
      const ka = absorptionRate(c.tmax, c.halfLife);
      const ke = eliminationRate(c.halfLife);
      const tmaxBack = Math.log(ka / ke) / (ka - ke);
      expect(tmaxBack).toBeCloseTo(c.tmax, 6);
    }
  });

  it("always returns an absorption faster than elimination", () => {
    const ka = absorptionRate(10, 12);
    expect(ka).toBeGreaterThan(eliminationRate(12));
  });

  it("clamps a Tmax that the one-compartment model cannot represent", () => {
    // The model caps Tmax at 1/ke; ask for well beyond it.
    const halfLife = 4;
    const limit = 1 / eliminationRate(halfLife);
    const ka = absorptionRate(limit * 5, halfLife);
    expect(Number.isFinite(ka)).toBe(true);
    expect(ka).toBeGreaterThan(eliminationRate(halfLife));
  });
});

describe("singleDoseLevel", () => {
  it("is zero before the dose", () => {
    expect(singleDoseLevel(-1, { halfLifeHours: 24, tmaxHours: 4 })).toBe(0);
  });

  it("starts at zero and peaks at exactly 1.0 at Tmax", () => {
    const p = { halfLifeHours: 165, tmaxHours: 48 };
    expect(singleDoseLevel(0, p)).toBeCloseTo(0, 10);
    expect(singleDoseLevel(48, p)).toBeCloseTo(1, 6);
  });

  it("never exceeds its peak anywhere on the curve", () => {
    const p = { halfLifeHours: 120, tmaxHours: 24 };
    for (let t = 0; t <= 600; t += 0.5) {
      expect(singleDoseLevel(t, p)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("rises to Tmax then falls, monotonically on each side", () => {
    const p = { halfLifeHours: 72, tmaxHours: 12 };
    for (let t = 0.5; t <= 12; t += 0.5) {
      expect(singleDoseLevel(t, p)).toBeGreaterThan(singleDoseLevel(t - 0.5, p));
    }
    for (let t = 12.5; t <= 200; t += 0.5) {
      expect(singleDoseLevel(t, p)).toBeLessThan(singleDoseLevel(t - 0.5, p));
    }
  });

  it("decays with the published half-life once absorption is finished", () => {
    // Long after Tmax the elimination phase dominates, so the level should
    // halve over one half-life.
    const p = { halfLifeHours: 24, tmaxHours: 2 };
    const a = singleDoseLevel(100, p);
    const b = singleDoseLevel(124, p);
    expect(b / a).toBeCloseTo(0.5, 4);
  });

  it("falls back to pure decay with no Tmax", () => {
    const p = { halfLifeHours: 10 };
    expect(singleDoseLevel(0, p)).toBeCloseTo(1, 12);
    expect(singleDoseLevel(10, p)).toBeCloseTo(0.5, 12);
    expect(singleDoseLevel(20, p)).toBeCloseTo(0.25, 12);
  });

  it("returns zero for a compound with no usable half-life", () => {
    expect(singleDoseLevel(5, { halfLifeHours: 0 })).toBe(0);
  });
});

describe("levelAt", () => {
  const params = { halfLifeHours: 24, tmaxHours: 4 };
  const now = Date.UTC(2026, 0, 10, 12, 0, 0);

  it("ignores doses that have not happened yet", () => {
    const level = levelAt(now, [{ at: now + 5 * HOUR, amountMcg: 1000 }], params, 1000);
    expect(level).toBe(0);
  });

  it("scales linearly with dose", () => {
    const single = levelAt(now, [{ at: now - 4 * HOUR, amountMcg: 1000 }], params, 1000);
    const double = levelAt(now, [{ at: now - 4 * HOUR, amountMcg: 2000 }], params, 1000);
    expect(double).toBeCloseTo(single * 2, 10);
  });

  it("peaks at 1.0 for one reference dose taken Tmax ago", () => {
    const level = levelAt(now, [{ at: now - 4 * HOUR, amountMcg: 500 }], params, 500);
    expect(level).toBeCloseTo(1, 6);
  });

  it("adds overlapping doses together", () => {
    const doses = [
      { at: now - 4 * HOUR, amountMcg: 1000 },
      { at: now - 28 * HOUR, amountMcg: 1000 },
    ];
    const combined = levelAt(now, doses, params, 1000);
    const first = levelAt(now, [doses[0]], params, 1000);
    const second = levelAt(now, [doses[1]], params, 1000);
    expect(combined).toBeCloseTo(first + second, 10);
    expect(combined).toBeGreaterThan(first);
  });

  it("drops a dose given many half-lives ago", () => {
    const ancient = levelAt(now, [{ at: now - 400 * HOUR, amountMcg: 1000 }], params, 1000);
    expect(ancient).toBe(0);
  });

  it("approaches the predicted accumulation ratio after repeated dosing", () => {
    // Weekly dosing of a 165-hour half-life compound, dosed for a long time.
    const p = { halfLifeHours: 165, tmaxHours: 48 };
    const interval = 168; // hours
    const doses = Array.from({ length: 40 }, (_, i) => ({
      at: now - (39 - i) * interval * HOUR,
      amountMcg: 1000,
    }));
    // Sample at the same point in the cycle as a single dose's peak.
    const steadyPeak = levelAt(now + 48 * HOUR, doses, p, 1000);
    const expected = accumulationRatio(interval, 165);
    // Superposition peak sits slightly off the single-dose Tmax, so allow 8%.
    expect(steadyPeak / 1).toBeGreaterThan(expected * 0.92);
    expect(steadyPeak / 1).toBeLessThan(expected * 1.08);
  });

  it("returns zero when no reference dose is known", () => {
    expect(levelAt(now, [{ at: now - HOUR, amountMcg: 100 }], params, 0)).toBe(0);
  });
});

describe("accumulationRatio", () => {
  it("is 2.0 when the interval equals the half-life", () => {
    expect(accumulationRatio(24, 24)).toBeCloseTo(2, 12);
  });

  it("approaches 1.0 when the interval far exceeds the half-life", () => {
    expect(accumulationRatio(240, 6)).toBeCloseTo(1, 6);
  });

  it("grows as dosing gets more frequent relative to half-life", () => {
    expect(accumulationRatio(24, 165)).toBeGreaterThan(accumulationRatio(168, 165));
  });
});

describe("timeToSteadyState", () => {
  it("is about five half-lives for 97%", () => {
    expect(timeToSteadyState(24, 0.97) / 24).toBeCloseTo(5.06, 1);
  });

  it("is exactly four half-lives for 93.75%", () => {
    expect(timeToSteadyState(10, 0.9375)).toBeCloseTo(40, 8);
  });
});

describe("levelSeries", () => {
  it("samples inclusive of both endpoints", () => {
    const now = Date.now();
    const s = levelSeries(now, now + 24 * HOUR, 5, [], { halfLifeHours: 12 }, 1000);
    expect(s).toHaveLength(5);
    expect(s[0].t).toBe(now);
    expect(s[4].t).toBe(now + 24 * HOUR);
  });

  it("returns nothing for an inverted or degenerate window", () => {
    const now = Date.now();
    expect(levelSeries(now, now - HOUR, 10, [], { halfLifeHours: 12 }, 1000)).toEqual([]);
    expect(levelSeries(now, now + HOUR, 1, [], { halfLifeHours: 12 }, 1000)).toEqual([]);
  });
});

describe("snapshot", () => {
  const params = { halfLifeHours: 24, tmaxHours: 6 };
  const now = Date.UTC(2026, 0, 10, 12, 0, 0);

  it("calls it absorbing on the way up", () => {
    const s = snapshot(now, [{ at: now - 2 * HOUR, amountMcg: 1000 }], params, 1000);
    expect(s.rising).toBe(true);
    expect(s.phase.id).toBe("absorbing");
  });

  it("calls it peak at Tmax", () => {
    const s = snapshot(now, [{ at: now - 6 * HOUR, amountMcg: 1000 }], params, 1000);
    expect(s.phase.id).toBe("peak");
    expect(s.percentOfPeak).toBeGreaterThan(99);
  });

  it("calls it active shortly after peak", () => {
    const s = snapshot(now, [{ at: now - 20 * HOUR, amountMcg: 1000 }], params, 1000);
    expect(s.rising).toBe(false);
    expect(s.phase.id).toBe("active");
  });

  it("calls it cleared long after the last dose", () => {
    const s = snapshot(now, [{ at: now - 200 * HOUR, amountMcg: 1000 }], params, 1000);
    expect(s.phase.id).toBe("cleared");
  });

  it("calls it cleared when nothing has ever been logged", () => {
    expect(snapshot(now, [], params, 1000).phase.id).toBe("cleared");
  });

  it("reports percent of peak consistently with level", () => {
    const s = snapshot(now, [{ at: now - 10 * HOUR, amountMcg: 1000 }], params, 1000);
    expect(s.percentOfPeak).toBeCloseTo(s.level * 100, 10);
  });
});

describe("curve constant caching", () => {
  it("returns bit-identical results on repeat calls", () => {
    // The cache must be a pure speed-up. If a cached call ever differs from a
    // cold one, every chart silently changes shape depending on what was drawn
    // before it.
    const params = { halfLifeHours: 108, tmaxHours: 48 };
    const first = Array.from({ length: 50 }, (_, i) => singleDoseLevel(i * 4, params));
    const second = Array.from({ length: 50 }, (_, i) => singleDoseLevel(i * 4, params));
    expect(second).toEqual(first);
  });

  it("keeps different compounds apart", () => {
    // A cache keyed too loosely would hand one compound another's curve.
    const fast = singleDoseLevel(6, { halfLifeHours: 6, tmaxHours: 1 });
    const slow = singleDoseLevel(6, { halfLifeHours: 108, tmaxHours: 48 });
    expect(fast).not.toBeCloseTo(slow, 3);
    // And re-reading the first must not have been poisoned by the second.
    expect(singleDoseLevel(6, { halfLifeHours: 6, tmaxHours: 1 })).toBe(fast);
  });

  it("distinguishes the same half-life at different times to peak", () => {
    const a = singleDoseLevel(4, { halfLifeHours: 24, tmaxHours: 2 });
    const b = singleDoseLevel(4, { halfLifeHours: 24, tmaxHours: 12 });
    expect(a).not.toBeCloseTo(b, 6);
  });

  it("distinguishes a compound with no tmax from the same one with a tmax", () => {
    const withTmax = singleDoseLevel(10, { halfLifeHours: 24, tmaxHours: 4 });
    const without = singleDoseLevel(10, { halfLifeHours: 24 });
    expect(withTmax).not.toBeCloseTo(without, 6);
    expect(without).toBeCloseTo(Math.pow(2, -10 / 24), 12);
  });

  it("still peaks at tmax after caching", () => {
    for (const [tmax, hl] of [[2, 12], [48, 108]]) {
      const params = { halfLifeHours: hl, tmaxHours: tmax };
      const atPeak = singleDoseLevel(tmax, params);
      expect(singleDoseLevel(tmax * 0.85, params)).toBeLessThan(atPeak);
      expect(singleDoseLevel(tmax * 1.15, params)).toBeLessThan(atPeak);
      // Normalised so the peak is 1.0.
      expect(atPeak).toBeCloseTo(1, 6);
    }
  });

  it("survives more distinct compounds than the cache holds", () => {
    // Custom compounds mean the key space is user-controlled. Overflowing the
    // cache must cost time, never correctness.
    const probe = { halfLifeHours: 108, tmaxHours: 48 };
    const before = singleDoseLevel(72, probe);
    for (let i = 0; i < 400; i++) singleDoseLevel(10, { halfLifeHours: 10 + i * 0.5, tmaxHours: 3 });
    expect(singleDoseLevel(72, probe)).toBe(before);
  });
});

describe("breakdownAt", () => {
  const params = { halfLifeHours: 24, tmaxHours: 2 };
  const t0 = 1_700_000_000_000;

  it("adds up to the level the curve already reports", () => {
    const doses = [
      { at: t0, amountMcg: 1000 },
      { at: t0 + 24 * HOUR, amountMcg: 1000 },
      { at: t0 + 48 * HOUR, amountMcg: 1000 },
    ];
    const at = t0 + 50 * HOUR;
    const { total } = breakdownAt(at, doses, params, 1000);
    expect(total).toBeCloseTo(levelAt(at, doses, params, 1000), 12);
  });

  it("names the doses largest first", () => {
    const doses = [
      { at: t0, amountMcg: 1000 },
      { at: t0 + 24 * HOUR, amountMcg: 1000 },
    ];
    const { contributions } = breakdownAt(t0 + 26 * HOUR, doses, params, 1000);
    expect(contributions).toHaveLength(2);
    expect(contributions[0].dose.at).toBe(t0 + 24 * HOUR);
    expect(contributions[0].level).toBeGreaterThan(contributions[1].level);
  });

  it("gives a lone dose the whole share", () => {
    const doses = [{ at: t0, amountMcg: 500 }];
    const { contributions } = breakdownAt(t0 + 6 * HOUR, doses, params, 500);
    expect(contributions).toHaveLength(1);
    expect(contributions[0].share).toBeCloseTo(1, 12);
  });

  it("drops the tail without dropping it from the total", () => {
    // Five days on, at a 24 h half-life, the first dose is worth about 3%.
    const doses = [
      { at: t0, amountMcg: 1000 },
      { at: t0 + 120 * HOUR, amountMcg: 1000 },
    ];
    const at = t0 + 122 * HOUR;
    const { total, contributions } = breakdownAt(at, doses, params, 1000);
    expect(contributions).toHaveLength(1);
    const listed = contributions.reduce((sum, c) => sum + c.level, 0);
    expect(listed).toBeLessThan(total);
    expect(total).toBeCloseTo(levelAt(at, doses, params, 1000), 12);
  });

  it("ignores doses in the future", () => {
    const doses = [{ at: t0 + HOUR, amountMcg: 1000 }];
    expect(breakdownAt(t0, doses, params, 1000)).toEqual({ total: 0, contributions: [] });
  });

  it("carries the vial through untouched", () => {
    const doses = [{ at: t0, amountMcg: 1000, vialId: "v1" }];
    const { contributions } = breakdownAt(t0 + 3 * HOUR, doses, params, 1000);
    expect(contributions[0].dose.vialId).toBe("v1");
  });

  it("refuses a reference dose that is not a dose", () => {
    const doses = [{ at: t0, amountMcg: 1000 }];
    expect(breakdownAt(t0 + HOUR, doses, params, 0)).toEqual({ total: 0, contributions: [] });
  });
});
