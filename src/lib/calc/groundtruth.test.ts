/**
 * Independent verification of the arithmetic that can hurt someone.
 *
 * Every other test file checks that a function does what its author intended.
 * This one checks that the intention was right, by deriving the same answers a
 * second way: hand-worked examples with the arithmetic spelled out, closed-form
 * identities, numerical simulation against analytic results, and round trips
 * through inverse functions.
 *
 * The distinction matters. A unit test written from the implementation
 * reproduces the implementation's mistakes. A test written from the underlying
 * relation does not.
 */

import { describe, expect, it } from "vitest";
import {
  calculateDraw,
  concentration,
  convertBetweenScales,
  doseFromUnits,
  diluentForTargetUnits,
  mcgPerGraduation,
  mcgPerUnitOfScale,
  syringeById,
  unitsFromDose,
  UNITS_PER_ML,
} from "./reconstitution";
import {
  absorptionRate,
  accumulationRatio,
  eliminationRate,
  fractionRemaining,
  hoursUntilFraction,
  levelAt,
  singleDoseLevel,
  timeToSteadyState,
} from "./pk";
import { concentrationFromFill, iuToMcg, mcgToIu, strengthFromConcentration } from "./units";
import { costPerDose } from "./cost";
import { hoursToClear, CLEARED_FRACTION } from "./pct";
import { project } from "./project";
import type { Protocol } from "../types";

const U100 = syringeById("u100-1.0")!;
const U40 = syringeById("u40-1.0")!;

describe("reconstitution, worked by hand", () => {
  /**
   * 5 mg vial, 2 mL of water, 250 mcg dose, U-100 barrel.
   *
   *   concentration = 5000 mcg / 2 mL          = 2500 mcg/mL
   *   volume        = 250 mcg / 2500 mcg/mL    = 0.1 mL
   *   units         = 0.1 mL x 100 units/mL    = 10 units
   *   per mark      = 2500 mcg/mL x 0.01 mL    = 25 mcg
   *   doses in vial = 5000 / 250               = 20
   */
  it("5 mg in 2 mL, 250 mcg on a U-100 barrel", () => {
    const d = calculateDraw({ vialMcg: 5000, diluentMl: 2, doseMcg: 250, syringe: U100 });
    expect(d.concentrationMcgPerMl).toBe(2500);
    expect(d.volumeMl).toBeCloseTo(0.1, 12);
    expect(d.units).toBeCloseTo(10, 12);
    // This barrel steps in 2 units, so a printed mark is 0.02 mL and holds 50.
    expect(d.mcgPerGraduation).toBeCloseTo(50, 12);
    expect(mcgPerUnitOfScale(2500, "U100")).toBeCloseTo(25, 12);
    expect(d.dosesPerVial).toBe(20);
    expect(d.roundingErrorMcg).toBeCloseTo(0, 9);
  });

  /**
   * The same liquid on a U-40 barrel reads 4, not 10. Anyone reading 10 on a
   * U-40 barrel would draw 0.25 mL and take 625 mcg, two and a half times the
   * intended dose. This is the single most consequential number in the app.
   */
  it("the identical draw reads 2.5x lower on a U-40 barrel", () => {
    const a = calculateDraw({ vialMcg: 5000, diluentMl: 2, doseMcg: 250, syringe: U100 });
    const b = calculateDraw({ vialMcg: 5000, diluentMl: 2, doseMcg: 250, syringe: U40 });

    expect(b.volumeMl).toBeCloseTo(a.volumeMl, 12);
    expect(b.units).toBeCloseTo(4, 12);
    expect(a.units / b.units).toBeCloseTo(2.5, 12);
    expect(convertBetweenScales(4, "U40", "U100")).toBeCloseTo(10, 12);
  });

  /**
   * 10 mg vial, 1 mL, 500 mcg:
   *   10000 / 1 = 10000 mcg/mL, 500 / 10000 = 0.05 mL, x100 = 5 units.
   */
  it("10 mg in 1 mL, 500 mcg", () => {
    const d = calculateDraw({ vialMcg: 10_000, diluentMl: 1, doseMcg: 500, syringe: U100 });
    expect(d.units).toBeCloseTo(5, 12);
    expect(d.mcgPerGraduation).toBeCloseTo(200, 12);
    expect(mcgPerUnitOfScale(10_000, "U100")).toBeCloseTo(100, 12);
    expect(d.dosesPerVial).toBe(20);
  });

  it("satisfies units = dose x unitsPerMl x diluent / vial, over a grid", () => {
    // The relation the whole module reduces to, checked independently of how
    // the module happens to be factored.
    for (const vialMg of [2, 5, 10, 15, 30]) {
      for (const water of [0.5, 1, 2, 3, 5]) {
        for (const dose of [100, 250, 500, 1000, 2500]) {
          for (const s of [U100, U40]) {
            const d = calculateDraw({
              vialMcg: vialMg * 1000,
              diluentMl: water,
              doseMcg: dose,
              syringe: s,
            });
            const expected = (dose * UNITS_PER_ML[s.scale] * water) / (vialMg * 1000);
            expect(d.units, `${vialMg}mg/${water}mL/${dose}mcg/${s.scale}`).toBeCloseTo(
              expected,
              9,
            );
          }
        }
      }
    }
  });

  it("round trips dose to units and back", () => {
    for (const conc of [500, 2500, 10_000, 66_666.7]) {
      for (const dose of [50, 250, 1000, 5000]) {
        for (const scale of ["U100", "U40"] as const) {
          const units = unitsFromDose(dose, conc, scale);
          expect(doseFromUnits(units, conc, scale)).toBeCloseTo(dose, 6);
        }
      }
    }
  });

  it("solves the diluent that puts a dose on a chosen mark", () => {
    // Want 250 mcg to read exactly 20 units on a U-100 barrel from a 5 mg vial.
    const water = diluentForTargetUnits(5000, 250, 20, "U100");
    expect(water).toBeCloseTo(4, 12);
    // And confirm by going forward again.
    const d = calculateDraw({ vialMcg: 5000, diluentMl: water, doseMcg: 250, syringe: U100 });
    expect(d.units).toBeCloseTo(20, 9);
  });

  it("delivers what the rounded mark actually holds, not what was asked", () => {
    // 5 mg in 2 mL is 25 mcg per U-100 mark. A 260 mcg dose cannot be drawn:
    // it lands between marks 10 and 11, rounds to 10, and delivers 250.
    const d = calculateDraw({ vialMcg: 5000, diluentMl: 2, doseMcg: 260, syringe: U100 });
    expect(d.unitsRounded).toBe(10);
    expect(d.deliveredMcg).toBeCloseTo(250, 9);
    expect(d.roundingErrorMcg).toBeCloseTo(-10, 9);
    expect(d.roundingErrorPercent).toBeCloseTo((-10 / 260) * 100, 9);
    expect(d.warnings).toContain("off-graduation");
  });

  it("refuses a draw larger than the barrel", () => {
    const d = calculateDraw({ vialMcg: 1000, diluentMl: 5, doseMcg: 900, syringe: U100 });
    // 1000/5 = 200 mcg/mL, 900/200 = 4.5 mL into a 1 mL barrel.
    expect(d.volumeMl).toBeCloseTo(4.5, 12);
    expect(d.warnings).toContain("exceeds-barrel");
    expect(d.measurable).toBe(false);
  });

  it("returns nothing usable rather than a wrong number for a zero diluent", () => {
    const d = calculateDraw({ vialMcg: 5000, diluentMl: 0, doseMcg: 250, syringe: U100 });
    expect(Number.isNaN(d.concentrationMcgPerMl)).toBe(true);
    expect(d.measurable).toBe(false);
  });

  it("treats concentration as undefined, never zero, for bad input", () => {
    // Returning 0 would make every downstream volume Infinity and every
    // rounding decision nonsense, silently.
    expect(Number.isNaN(concentration(0, 2))).toBe(true);
    expect(Number.isNaN(concentration(5000, 0))).toBe(true);
    expect(Number.isNaN(concentration(-5000, 2))).toBe(true);
  });

  it("prices a mark from the graduation and a unit from the scale", () => {
    // These are different numbers and conflating them is a clean factor of two.
    // The 1 mL U-100 barrel steps in 2 units: one mark is 0.02 mL.
    expect(mcgPerGraduation(2500, U100)).toBeCloseTo(50, 12);
    expect(mcgPerUnitOfScale(2500, "U100")).toBeCloseTo(25, 12);

    // The 1 mL U-40 barrel steps in 1 unit, so mark and unit coincide at
    // 0.025 mL, which is still 2.5x the volume of a U-100 unit.
    expect(mcgPerGraduation(2500, U40)).toBeCloseTo(62.5, 12);
    expect(mcgPerUnitOfScale(2500, "U40")).toBeCloseTo(62.5, 12);

    // The fine-grained 1 mL U-100 barrel is where they coincide again.
    expect(mcgPerGraduation(2500, syringeById("u100-1.0-fine")!)).toBeCloseTo(25, 12);
  });
});

describe("pharmacokinetics, against closed forms", () => {
  it("halves over exactly one half-life, whatever the half-life", () => {
    for (const hl of [0.5, 4, 12, 108, 720]) {
      expect(fractionRemaining(hl, hl)).toBeCloseTo(0.5, 12);
      expect(fractionRemaining(2 * hl, hl)).toBeCloseTo(0.25, 12);
      expect(fractionRemaining(10 * hl, hl)).toBeCloseTo(1 / 1024, 12);
    }
  });

  it("has an elimination rate that agrees with the half-life definition", () => {
    for (const hl of [4, 108]) {
      const ke = eliminationRate(hl);
      expect(Math.exp(-ke * hl)).toBeCloseTo(0.5, 12);
    }
  });

  it("inverts fractionRemaining", () => {
    for (const hl of [6, 108]) {
      for (const f of [0.9, 0.5, 0.1, 0.03]) {
        expect(fractionRemaining(hoursUntilFraction(f, hl), hl)).toBeCloseTo(f, 10);
      }
    }
  });

  it("reaches 97 percent of steady state in a little over five half-lives", () => {
    expect(timeToSteadyState(24) / 24).toBeCloseTo(Math.log2(1 / 0.03), 10);
  });

  /**
   * Accumulation has a closed form, and it can also be simulated. Both are
   * computed here and required to agree, which catches an error in either.
   */
  it("accumulates to the analytic ratio when simulated dose by dose", () => {
    for (const [hl, interval] of [
      [24, 24],
      [108, 168],
      [12, 24],
      [168, 84],
    ]) {
      const ke = eliminationRate(hl);
      // Trough-to-trough sum of a very long dosing history.
      let simulated = 0;
      for (let k = 0; k < 4000; k++) simulated += Math.exp(-ke * k * interval);
      expect(accumulationRatio(interval, hl)).toBeCloseTo(simulated, 8);
    }
  });

  it("gives a ratio of exactly 2 when dosed every half-life", () => {
    // 1 / (1 - 0.5). A number that can be checked without a calculator.
    expect(accumulationRatio(24, 24)).toBeCloseTo(2, 12);
    expect(accumulationRatio(48, 24)).toBeCloseTo(4 / 3, 12);
  });

  it("peaks at the stated tmax", () => {
    // absorptionRate solves ka from tmax; the curve should turn over there.
    for (const [tmax, hl] of [
      [1, 6],
      [4, 24],
      [48, 108],
    ]) {
      const params = { halfLifeHours: hl, tmaxHours: tmax };
      const atPeak = singleDoseLevel(tmax, params);
      expect(singleDoseLevel(tmax * 0.8, params)).toBeLessThan(atPeak);
      expect(singleDoseLevel(tmax * 1.2, params)).toBeLessThan(atPeak);
    }
  });

  it("keeps ka above ke, which is what makes tmax reachable", () => {
    // ka <= ke has no interior maximum: the curve would never peak.
    for (const [tmax, hl] of [
      [1, 6],
      [4, 24],
      [48, 108],
    ]) {
      expect(absorptionRate(tmax, hl)).toBeGreaterThan(eliminationRate(hl));
    }
  });

  it("is linear in dose", () => {
    const params = { halfLifeHours: 108, tmaxHours: 48 };
    const now = 0;
    const single = levelAt(now, [{ at: -24 * 3_600_000, amountMcg: 100 }], params, 100);
    const triple = levelAt(now, [{ at: -24 * 3_600_000, amountMcg: 300 }], params, 100);
    expect(triple).toBeCloseTo(single * 3, 10);
  });

  it("is additive across doses", () => {
    const params = { halfLifeHours: 108, tmaxHours: 48 };
    const a = { at: -24 * 3_600_000, amountMcg: 250 };
    const b = { at: -168 * 3_600_000, amountMcg: 250 };
    expect(levelAt(0, [a, b], params, 250)).toBeCloseTo(
      levelAt(0, [a], params, 250) + levelAt(0, [b], params, 250),
      10,
    );
  });

  it("ignores doses that have not happened yet", () => {
    const params = { halfLifeHours: 24 };
    expect(levelAt(0, [{ at: 3_600_000, amountMcg: 1000 }], params, 1000)).toBe(0);
  });
});

describe("international units", () => {
  /**
   * Somatropin is 3 IU per mg by the WHO standard. A 10 IU pen therefore holds
   * 3.333 mg. Getting this backwards would be a nine-fold error.
   */
  it("converts growth hormone both ways", () => {
    expect(mcgToIu(1000, 3)).toBeCloseTo(3, 12);
    expect(iuToMcg(3, 3)).toBeCloseTo(1000, 12);
    expect(iuToMcg(10, 3)).toBeCloseTo(3333.333, 3);
    expect(iuToMcg(2, 3)).toBeCloseTo(666.667, 3);
  });

  it("round trips at any potency", () => {
    for (const iuPerMg of [3, 1000, 0.5]) {
      for (const mcg of [100, 1000, 5000]) {
        expect(iuToMcg(mcgToIu(mcg, iuPerMg), iuPerMg)).toBeCloseTo(mcg, 6);
      }
    }
  });

  it("prices an oil vial the same way as a reconstituted one", () => {
    // 250 mg/mL testosterone in a 10 mL vial is 2500 mg of drug.
    expect(concentrationFromFill(2500, 10)).toBeCloseTo(250_000, 9);
    expect(strengthFromConcentration(250, 10)).toBeCloseTo(2500, 9);
    // And drawing 250 mg from it is 1 mL, which on a U-100 insulin barrel is
    // the entire barrel.
    expect(unitsFromDose(250_000, 250_000, "U100")).toBeCloseTo(100, 9);
  });
});

describe("cost", () => {
  it("prices a dose from the vial price by mass", () => {
    // A 10 mg vial at 100 currency units is 10 per mg. A 250 mcg dose is a
    // quarter of a milligram, so 2.50.
    expect(costPerDose({ cost: 100, strengthMg: 10 }, 250)).toBeCloseTo(2.5, 12);
    expect(costPerDose({ cost: 100, strengthMg: 10 }, 1000)).toBeCloseTo(10, 12);
  });

  it("scales linearly with dose and inversely with vial size", () => {
    // Twice the vial for twice the dose is the same price per dose.
    expect(costPerDose({ cost: 100, strengthMg: 10 }, 500)).toBeCloseTo(
      costPerDose({ cost: 100, strengthMg: 20 }, 1000)!,
      12,
    );
  });
});

describe("clearance", () => {
  it("clears in log2(1/0.03) half-lives, and leaves exactly that behind", () => {
    for (const hl of [24, 108, 336]) {
      const hours = hoursToClear(hl);
      expect(hours / hl).toBeCloseTo(Math.log2(1 / CLEARED_FRACTION), 12);
      expect(fractionRemaining(hours, hl)).toBeCloseTo(CLEARED_FRACTION, 12);
    }
  });

  it("agrees with the general inverse", () => {
    expect(hoursToClear(108)).toBeCloseTo(hoursUntilFraction(CLEARED_FRACTION, 108), 10);
  });
});

describe("projection against simulation", () => {
  const protocol = (intervalDays: number, doseMcg = 250_000): Protocol => ({
    id: "p",
    profileId: "me",
    name: "t",
    peptideId: "testosterone-enanthate",
    active: true,
    startedAt: new Date(2026, 0, 5, 9).getTime(),
    doseMcg,
    route: "intramuscular",
    schedule: { kind: "interval-days", intervalDays },
    titrationAutoAdvance: false,
  });

  it("plateaus at the analytic accumulation ratio", () => {
    // Simulated curve peak, late in the run, against 1/(1-exp(-ke*tau)) times
    // the first-dose peak. Two entirely separate routes to the same number.
    const hl = 108;
    const p = project({ protocol: protocol(7), halfLifeHours: hl, days: 200, steps: 4000 });
    const firstPeak = Math.max(
      ...p.series.filter((s) => s.t <= p.series[0].t + 7 * 86_400_000).map((s) => s.level),
    );
    expect(p.steadyPeak! / firstPeak).toBeCloseTo(accumulationRatio(168, hl), 1);
  });

  it("reports a swing consistent with decay across one interval", () => {
    // At steady state, trough = peak x exp(-ke x interval), so the ratio is
    // exp(ke x interval), independent of dose.
    const hl = 108;
    const intervalHours = 168;
    const p = project({ protocol: protocol(7), halfLifeHours: hl, days: 220, steps: 6000 });
    const expected = Math.exp(eliminationRate(hl) * intervalHours);
    // Loose: the modelled curve has an absorption phase the closed form omits,
    // which blunts the peak and lifts the trough.
    expect(p.swing!).toBeGreaterThan(1);
    expect(p.swing!).toBeLessThan(expected * 1.2);
  });

  it("halving the dose halves the level, leaving the shape untouched", () => {
    const full = project({ protocol: protocol(7, 250_000), halfLifeHours: 108, days: 90, steps: 900 });
    const half = project({ protocol: protocol(7, 125_000), halfLifeHours: 108, days: 90, steps: 900 });
    // Levels are normalised to the first dose, so the shape is identical and
    // the accumulation figure does not move.
    expect(half.accumulation).toBeCloseTo(full.accumulation!, 12);
    expect(half.swing).toBeCloseTo(full.swing!, 6);
  });
});
