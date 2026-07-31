import { describe, expect, it } from "vitest";
import {
  beyondUseDate,
  calculateDraw,
  capacityUnits,
  concentration,
  convertBetweenScales,
  diluentForMcgPerUnit,
  diluentForTargetUnits,
  doseFromUnits,
  doseVolumeMl,
  graduationMl,
  mcgToMg,
  mgToMcg,
  mlPerUnit,
  mlToUnits,
  remainingInVial,
  suggestDiluents,
  SYRINGES,
  syringeById,
  unitsFromDose,
  unitsToMl,
  type SyringeSpec,
} from "./reconstitution";

const U100_1U = syringeById("u100-1.0-fine")!;
const U100_2U = syringeById("u100-1.0")!;
const U100_HALF = syringeById("u100-0.3-half")!;
const U100_05 = syringeById("u100-0.5")!;
const U40_1U = syringeById("u40-1.0")!;

describe("unit conversion", () => {
  it("converts between mg and mcg", () => {
    expect(mgToMcg(2.5)).toBe(2500);
    expect(mcgToMg(250)).toBe(0.25);
  });

  it("puts one U-100 mark at 0.01 mL and one U-40 mark at 0.025 mL", () => {
    expect(mlPerUnit("U100")).toBeCloseTo(0.01, 12);
    expect(mlPerUnit("U40")).toBeCloseTo(0.025, 12);
  });

  it("marks 100 units to the millilitre on a U-100 barrel", () => {
    expect(mlToUnits(1, "U100")).toBe(100);
    expect(mlToUnits(0.1, "U100")).toBeCloseTo(10, 10);
    expect(unitsToMl(25, "U100")).toBeCloseTo(0.25, 10);
  });

  it("marks 40 units to the millilitre on a U-40 barrel", () => {
    expect(mlToUnits(1, "U40")).toBe(40);
    expect(unitsToMl(40, "U40")).toBe(1);
    expect(unitsToMl(20, "U40")).toBeCloseTo(0.5, 12);
  });
});

describe("the U-40 trap", () => {
  it("reads one volume as 2.5x more units on U-100 than on U-40", () => {
    expect(convertBetweenScales(10, "U40", "U100")).toBeCloseTo(25, 10);
    expect(convertBetweenScales(25, "U100", "U40")).toBeCloseTo(10, 10);
  });

  it("shows that the '20' mark is 0.2 mL on U-100 but 0.5 mL on U-40", () => {
    expect(unitsToMl(20, "U100")).toBeCloseTo(0.2, 12);
    expect(unitsToMl(20, "U40")).toBeCloseTo(0.5, 12);
  });

  it("delivers 2.5x the volume when a U-40 barrel is read as U-100", () => {
    const intended = unitsToMl(20, "U100");
    const actualIfWrongBarrel = unitsToMl(20, "U40");
    expect(actualIfWrongBarrel / intended).toBeCloseTo(2.5, 12);
  });

  it("gives the same physical volume for one dose regardless of scale", () => {
    const input = { vialMcg: mgToMcg(30), diluentMl: 3, doseMcg: mgToMcg(4) };
    const a = calculateDraw({ ...input, syringe: U100_1U });
    const b = calculateDraw({ ...input, syringe: U40_1U });
    expect(a.volumeMl).toBeCloseTo(b.volumeMl, 12);
    // ...but a very different number printed on the barrel.
    expect(a.units).toBeCloseTo(40, 10);
    expect(b.units).toBeCloseTo(16, 10);
  });

  it("numbers a 1 mL U-40 barrel 0 to 40", () => {
    expect(capacityUnits(U40_1U)).toBeCloseTo(40, 10);
    expect(capacityUnits(U100_1U)).toBeCloseTo(100, 10);
  });
});

describe("syringe specs", () => {
  it("never infers graduation from capacity", () => {
    const oneMl = SYRINGES.filter((s) => s.capacityMl === 1 && s.scale === "U100");
    const grads = new Set(oneMl.map((s) => s.graduationUnits));
    expect(grads.size).toBeGreaterThan(1);
  });

  it("offers no 0.4 mL U-100 barrel, because none is sold", () => {
    expect(SYRINGES.some((s) => s.capacityMl === 0.4)).toBe(false);
  });

  it("computes graduation volume in the barrel's own scale", () => {
    expect(graduationMl(U100_1U)).toBeCloseTo(0.01, 12);
    expect(graduationMl(U100_2U)).toBeCloseTo(0.02, 12);
    expect(graduationMl(U100_HALF)).toBeCloseTo(0.005, 12);
    expect(graduationMl(U40_1U)).toBeCloseTo(0.025, 12);
  });

  it("gives every preset a unique id", () => {
    expect(new Set(SYRINGES.map((s) => s.id)).size).toBe(SYRINGES.length);
  });
});

describe("concentration", () => {
  it("divides vial mass by diluent volume", () => {
    expect(concentration(mgToMcg(5), 2)).toBe(2500);
    expect(concentration(mgToMcg(10), 1)).toBe(10000);
    expect(concentration(mgToMcg(15), 3)).toBe(5000);
  });

  it("rejects nonsense rather than returning a number", () => {
    expect(concentration(0, 2)).toBeNaN();
    expect(concentration(5000, 0)).toBeNaN();
    expect(concentration(-5000, 2)).toBeNaN();
  });
});

describe("dose volume", () => {
  it("divides dose by concentration", () => {
    expect(doseVolumeMl(250, 2500)).toBeCloseTo(0.1, 12);
    expect(doseVolumeMl(2500, 10000)).toBeCloseTo(0.25, 12);
  });
});

/**
 * Table verified independently three ways: long form via concentration, the
 * collapsed form units = dose_mcg * water_ml / (vial_mg * 10), and the
 * mcg-per-mark reciprocal.
 */
describe("calculateDraw, verified worked examples", () => {
  const rows: {
    vialMg: number;
    waterMl: number;
    doseMcg: number;
    concMgMl: number;
    volumeMl: number;
    u100: number;
    u40: number;
    mcgPerMark: number;
    dosesPerVial: number;
  }[] = [
    { vialMg: 5, waterMl: 2, doseMcg: 250, concMgMl: 2.5, volumeMl: 0.1, u100: 10, u40: 4, mcgPerMark: 25, dosesPerVial: 20 },
    { vialMg: 10, waterMl: 1, doseMcg: 2500, concMgMl: 10, volumeMl: 0.25, u100: 25, u40: 10, mcgPerMark: 100, dosesPerVial: 4 },
    { vialMg: 15, waterMl: 3, doseMcg: 500, concMgMl: 5, volumeMl: 0.1, u100: 10, u40: 4, mcgPerMark: 50, dosesPerVial: 30 },
    { vialMg: 10, waterMl: 2, doseMcg: 300, concMgMl: 5, volumeMl: 0.06, u100: 6, u40: 2.4, mcgPerMark: 50, dosesPerVial: 33 },
    { vialMg: 5, waterMl: 3, doseMcg: 250, concMgMl: 5 / 3, volumeMl: 0.15, u100: 15, u40: 6, mcgPerMark: 50 / 3, dosesPerVial: 20 },
    { vialMg: 30, waterMl: 3, doseMcg: 5000, concMgMl: 10, volumeMl: 0.5, u100: 50, u40: 20, mcgPerMark: 100, dosesPerVial: 6 },
    { vialMg: 2, waterMl: 1, doseMcg: 100, concMgMl: 2, volumeMl: 0.05, u100: 5, u40: 2, mcgPerMark: 20, dosesPerVial: 20 },
    { vialMg: 5, waterMl: 2, doseMcg: 333, concMgMl: 2.5, volumeMl: 0.1332, u100: 13.32, u40: 5.328, mcgPerMark: 25, dosesPerVial: 15 },
  ];

  for (const r of rows) {
    it(`${r.vialMg} mg in ${r.waterMl} mL, ${r.doseMcg} mcg -> ${r.volumeMl} mL / ${r.u100} U-100 marks`, () => {
      const base = { vialMcg: mgToMcg(r.vialMg), diluentMl: r.waterMl, doseMcg: r.doseMcg };
      const u100 = calculateDraw({ ...base, syringe: U100_1U });

      expect(u100.concentrationMgPerMl).toBeCloseTo(r.concMgMl, 9);
      expect(u100.volumeMl).toBeCloseTo(r.volumeMl, 9);
      expect(u100.units).toBeCloseTo(r.u100, 8);
      expect(u100.mcgPerUnit).toBeCloseTo(r.mcgPerMark, 8);
      expect(u100.dosesPerVial).toBe(r.dosesPerVial);
      expect(u100.mlPerUnit).toBeCloseTo(0.01, 12);

      // Cross-check against the collapsed algebraic form.
      expect(u100.units).toBeCloseTo((r.doseMcg * r.waterMl) / (r.vialMg * 10), 8);
      // Cross-check against the mcg-per-mark reciprocal.
      expect(u100.units * u100.mcgPerUnit).toBeCloseTo(r.doseMcg, 6);

      const u40 = calculateDraw({ ...base, syringe: U40_1U });
      expect(u40.units).toBeCloseTo(r.u40, 8);
      expect(u40.volumeMl).toBeCloseTo(r.volumeMl, 9);
      expect(u40.mlPerUnit).toBeCloseTo(0.025, 12);
    });
  }
});

describe("calculateDraw, guard rails", () => {
  it("warns when the draw is larger than the barrel", () => {
    const r = calculateDraw({
      vialMcg: mgToMcg(10),
      diluentMl: 5,
      doseMcg: mgToMcg(5),
      syringe: U100_1U,
    });
    expect(r.volumeMl).toBeCloseTo(2.5, 12);
    expect(r.warnings).toContain("exceeds-barrel");
    expect(r.measurable).toBe(false);
  });

  it("does not warn when the draw exactly fills the barrel", () => {
    const r = calculateDraw({
      vialMcg: mgToMcg(5),
      diluentMl: 1,
      doseMcg: mgToMcg(5),
      syringe: U100_1U,
    });
    expect(r.volumeMl).toBeCloseTo(1, 12);
    expect(r.warnings).not.toContain("exceeds-barrel");
  });

  it("warns when the draw is smaller than one printed mark", () => {
    // 10 mg/mL, 50 mcg needs 0.005 mL, half a mark on a 1-unit U-100 barrel.
    const r = calculateDraw({ vialMcg: mgToMcg(10), diluentMl: 1, doseMcg: 50, syringe: U100_1U });
    expect(r.volumeMl).toBeCloseTo(0.005, 12);
    expect(r.warnings).toContain("below-graduation");
    expect(r.measurable).toBe(false);
  });

  it("measures that same draw on a half-unit barrel", () => {
    const r = calculateDraw({ vialMcg: mgToMcg(10), diluentMl: 1, doseMcg: 50, syringe: U100_HALF });
    expect(r.warnings).not.toContain("below-graduation");
    expect(r.unitsRounded).toBeCloseTo(0.5, 10);
    expect(r.measurable).toBe(true);
  });

  it("warns when a draw falls between two printed marks", () => {
    const r = calculateDraw({ vialMcg: mgToMcg(5), diluentMl: 2, doseMcg: 333, syringe: U100_1U });
    expect(r.units).toBeCloseTo(13.32, 8);
    expect(r.warnings).toContain("off-graduation");
    expect(r.unitsRounded).toBeCloseTo(13, 10);
    expect(r.deliveredMcg).toBeCloseTo(325, 6);
    expect(r.roundingErrorMcg).toBeCloseTo(-8, 6);
    expect(r.roundingErrorPercent).toBeCloseTo(-2.402, 2);
  });

  it("warns on a draw too small to read reliably", () => {
    // 10 mg/mL, 200 mcg is 2 marks, measurable, but under the reliable floor.
    const r = calculateDraw({ vialMcg: mgToMcg(10), diluentMl: 1, doseMcg: 200, syringe: U100_1U });
    expect(r.units).toBeCloseTo(2, 10);
    expect(r.warnings).toContain("low-volume");
  });

  it("stays quiet when the draw lands on a mark at a readable size", () => {
    const r = calculateDraw({ vialMcg: mgToMcg(5), diluentMl: 2, doseMcg: 250, syringe: U100_1U });
    expect(r.warnings).toEqual([]);
    expect(r.measurable).toBe(true);
  });

  it("rounds to the 2-unit marks on a standard 1 mL barrel", () => {
    // 5 mg/mL, 1250 mcg wants 0.25 mL = 25 marks, unreachable in 2-unit steps.
    const r = calculateDraw({ vialMcg: mgToMcg(10), diluentMl: 2, doseMcg: 1250, syringe: U100_2U });
    expect(r.units).toBeCloseTo(25, 10);
    expect(r.unitsRounded).toBeCloseTo(26, 10);
    expect(r.warnings).toContain("off-graduation");
    expect(r.deliveredMcg).toBeCloseTo(1300, 6);
  });

  it("rounds on a U-40 barrel using U-40 mark spacing", () => {
    // 10 mg/mL, 1000 mcg is 0.1 mL = 4 marks of 0.025 mL. Exact.
    const exact = calculateDraw({ vialMcg: mgToMcg(10), diluentMl: 1, doseMcg: 1000, syringe: U40_1U });
    expect(exact.unitsRounded).toBeCloseTo(4, 10);
    expect(exact.warnings).not.toContain("off-graduation");

    // 1100 mcg is 0.11 mL = 4.4 marks. Rounds to 4 marks = 0.1 mL = 1000 mcg.
    const off = calculateDraw({ vialMcg: mgToMcg(10), diluentMl: 1, doseMcg: 1100, syringe: U40_1U });
    expect(off.unitsRounded).toBeCloseTo(4, 10);
    expect(off.deliveredMcg).toBeCloseTo(1000, 6);
    expect(off.warnings).toContain("off-graduation");
  });

  it("warns when the dose needs more liquid than the vial holds", () => {
    const r = calculateDraw({ vialMcg: mgToMcg(5), diluentMl: 0.3, doseMcg: mgToMcg(6), syringe: U100_1U });
    expect(r.warnings).toContain("exceeds-vial");
  });
});

describe("diluentForTargetUnits", () => {
  it("inverts the draw calculation", () => {
    const ml = diluentForTargetUnits(mgToMcg(5), 250, 10, "U100");
    expect(ml).toBeCloseTo(2, 12);
    const check = calculateDraw({ vialMcg: mgToMcg(5), diluentMl: ml, doseMcg: 250, syringe: U100_1U });
    expect(check.units).toBeCloseTo(10, 10);
  });

  it("round-trips across vials, doses, targets and both scales", () => {
    const cases = [
      { vialMg: 10, doseMcg: 500, target: 20, scale: "U100" as const, spec: U100_1U },
      { vialMg: 15, doseMcg: 2000, target: 30, scale: "U100" as const, spec: U100_1U },
      { vialMg: 2, doseMcg: 100, target: 5, scale: "U100" as const, spec: U100_1U },
      { vialMg: 50, doseMcg: 5000, target: 20, scale: "U40" as const, spec: U40_1U },
      { vialMg: 30, doseMcg: 4000, target: 16, scale: "U40" as const, spec: U40_1U },
    ];
    for (const c of cases) {
      const ml = diluentForTargetUnits(mgToMcg(c.vialMg), c.doseMcg, c.target, c.scale);
      const r = calculateDraw({ vialMcg: mgToMcg(c.vialMg), diluentMl: ml, doseMcg: c.doseMcg, syringe: c.spec });
      expect(r.units).toBeCloseTo(c.target, 9);
    }
  });

  it("rejects nonsense", () => {
    expect(diluentForTargetUnits(0, 250, 10, "U100")).toBeNaN();
    expect(diluentForTargetUnits(mgToMcg(5), 0, 10, "U100")).toBeNaN();
  });
});

describe("diluentForMcgPerUnit", () => {
  it("makes one mark represent the requested mass", () => {
    // 5 mg vial, want 25 mcg per U-100 mark -> 2 mL.
    const ml = diluentForMcgPerUnit(mgToMcg(5), 25, U100_1U);
    expect(ml).toBeCloseTo(2, 12);
    const r = calculateDraw({ vialMcg: mgToMcg(5), diluentMl: ml, doseMcg: 250, syringe: U100_1U });
    expect(r.mcgPerUnit).toBeCloseTo(25, 9);
  });

  it("accounts for the barrel's own mark spacing", () => {
    // A U-40 mark is 2.5x the volume of a U-100 mark, so reaching the same
    // mass per mark needs 2.5x the diluent.
    const u100 = diluentForMcgPerUnit(mgToMcg(10), 50, U100_1U);
    const u40 = diluentForMcgPerUnit(mgToMcg(10), 50, U40_1U);
    expect(u40 / u100).toBeCloseTo(2.5, 10);
  });
});

describe("suggestDiluents", () => {
  it("puts a mark-aligned, readable draw first", () => {
    const s = suggestDiluents(mgToMcg(5), 250, U100_1U);
    expect(s.length).toBeGreaterThan(0);
    expect(s[0].landsOnMark).toBe(true);
    expect(s[0].units).toBeGreaterThanOrEqual(5);
  });

  it("never suggests a dilution that overflows the barrel", () => {
    for (const s of suggestDiluents(mgToMcg(5), mgToMcg(2), U100_05)) {
      expect(s.volumeMl).toBeLessThanOrEqual(U100_05.capacityMl + 1e-9);
    }
  });

  it("respects a 2-unit barrel when judging mark alignment", () => {
    const s = suggestDiluents(mgToMcg(10), 750, U100_2U);
    for (const c of s.filter((x) => x.landsOnMark)) {
      const marks = c.volumeMl / graduationMl(U100_2U);
      expect(Math.abs(marks - Math.round(marks))).toBeLessThan(1e-9);
    }
  });

  it("works on the U-40 scale", () => {
    const s = suggestDiluents(mgToMcg(10), 1000, U40_1U);
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((c) => c.volumeMl <= U40_1U.capacityMl + 1e-9)).toBe(true);
  });

  it("returns nothing for nonsense input", () => {
    expect(suggestDiluents(0, 250, U100_1U)).toEqual([]);
    expect(suggestDiluents(mgToMcg(5), 0, U100_1U)).toEqual([]);
  });

  it("returns nothing when no candidate fits the barrel", () => {
    // A 5 mg dose from a 5 mg vial needs the whole reconstitution volume,
    // which is larger than a 0.3 mL barrel at every candidate dilution.
    const tiny: SyringeSpec = { ...U100_HALF };
    expect(suggestDiluents(mgToMcg(5), mgToMcg(5), tiny)).toEqual([]);
  });
});

describe("remainingInVial", () => {
  it("tracks volume and mass drawn down together", () => {
    const r = remainingInVial(mgToMcg(10), 2, 0.5);
    expect(r.remainingMl).toBeCloseTo(1.5, 12);
    expect(r.remainingMcg).toBeCloseTo(7500, 9);
    expect(r.fractionRemaining).toBeCloseTo(0.75, 12);
  });

  it("floors at empty rather than going negative", () => {
    const r = remainingInVial(mgToMcg(10), 2, 3);
    expect(r.remainingMl).toBe(0);
    expect(r.remainingMcg).toBe(0);
  });

  it("stays at zero for an unreconstituted vial", () => {
    const r = remainingInVial(mgToMcg(10), 0, 0);
    expect(r.remainingMcg).toBe(0);
    expect(r.fractionRemaining).toBe(0);
  });
});

describe("beyondUseDate", () => {
  it("lands 28 days after first puncture", () => {
    const punctured = Date.UTC(2026, 0, 1);
    expect(beyondUseDate(punctured)).toBe(Date.UTC(2026, 0, 29));
  });

  it("accepts a shorter window when a compound needs one", () => {
    const punctured = Date.UTC(2026, 0, 1);
    expect(beyondUseDate(punctured, 14)).toBe(Date.UTC(2026, 0, 15));
  });
});

describe("two-way dose and unit conversion", () => {
  // 10 mg in 2 mL = 5 mg/mL = 5000 mcg/mL.
  const conc = concentration(mgToMcg(10), 2);

  it("turns marks back into a mass", () => {
    // 10 U-100 marks is 0.1 mL, which at 5 mg/mL is 500 mcg.
    expect(doseFromUnits(10, conc, "U100")).toBeCloseTo(500, 9);
    // The same 10 marks on U-40 is 0.25 mL, so 1250 mcg.
    expect(doseFromUnits(10, conc, "U40")).toBeCloseTo(1250, 9);
  });

  it("turns a mass into marks", () => {
    expect(unitsFromDose(500, conc, "U100")).toBeCloseTo(10, 9);
    expect(unitsFromDose(500, conc, "U40")).toBeCloseTo(4, 9);
  });

  it("round-trips in both directions", () => {
    for (const mcg of [50, 250, 500, 1000, 2500]) {
      for (const scale of ["U100", "U40"] as const) {
        const u = unitsFromDose(mcg, conc, scale);
        expect(doseFromUnits(u, conc, scale)).toBeCloseTo(mcg, 6);
      }
    }
  });

  it("agrees with calculateDraw", () => {
    const r = calculateDraw({
      vialMcg: mgToMcg(10),
      diluentMl: 2,
      doseMcg: 500,
      syringe: syringeById("u100-1.0-fine")!,
    });
    expect(unitsFromDose(500, conc, "U100")).toBeCloseTo(r.units, 9);
    expect(doseFromUnits(r.units, conc, "U100")).toBeCloseTo(500, 6);
  });

  it("shows the 2.5x gap between the scales for one reading", () => {
    expect(doseFromUnits(20, conc, "U40") / doseFromUnits(20, conc, "U100")).toBeCloseTo(2.5, 10);
  });

  it("returns zero rather than NaN for unusable input", () => {
    expect(doseFromUnits(0, conc, "U100")).toBe(0);
    expect(doseFromUnits(-5, conc, "U100")).toBe(0);
    expect(doseFromUnits(10, NaN, "U100")).toBe(0);
    expect(unitsFromDose(500, 0, "U100")).toBe(0);
  });
});
