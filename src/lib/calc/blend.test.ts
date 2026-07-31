import { describe, expect, it } from "vitest";
import {
  blendDoseForComponent,
  blendDosing,
  decomposeDose,
  describeBlendDose,
  isBlend,
  modellableComponents,
} from "./blend";
import { PEPTIDE_BY_ID } from "../data/peptides";
import type { Peptide } from "../types";

const resolve = (id: string) => PEPTIDE_BY_ID.get(id);
const klow = PEPTIDE_BY_ID.get("klow")!;
const wolverine = PEPTIDE_BY_ID.get("wolverine")!;
const cagrisema = PEPTIDE_BY_ID.get("cagrisema")!;
const bpc = PEPTIDE_BY_ID.get("bpc-157")!;

describe("isBlend", () => {
  it("recognises the blends", () => {
    expect(isBlend(klow)).toBe(true);
    expect(isBlend(wolverine)).toBe(true);
    expect(isBlend(cagrisema)).toBe(true);
  });

  it("does not treat a single peptide as a blend", () => {
    expect(isBlend(bpc)).toBe(false);
    expect(isBlend(undefined)).toBe(false);
  });
});

describe("blendDosing", () => {
  it("splits by default", () => {
    expect(blendDosing(klow)).toBe("split");
    expect(blendDosing(wolverine)).toBe("split");
  });

  it("gives CagriSema the full dose per component", () => {
    expect(blendDosing(cagrisema)).toBe("per-component");
  });
});

describe("decomposeDose, KLOW at its verified 5:1:1:1 ratio", () => {
  // 80 mg total = GHK-Cu 50 + BPC-157 10 + TB-500 10 + KPV 10.
  const parts = decomposeDose(klow, 4000, resolve);
  const by = Object.fromEntries(parts.map((p) => [p.peptideId, p]));

  it("splits every component out", () => {
    expect(parts).toHaveLength(4);
  });

  it("gives GHK-Cu five eighths of the mass", () => {
    expect(by["ghk-cu"].fraction).toBeCloseTo(50 / 80, 12);
    expect(by["ghk-cu"].mcg).toBeCloseTo(2500, 9);
  });

  it("gives each of the other three an eighth", () => {
    for (const id of ["bpc-157", "tb-500", "kpv"]) {
      expect(by[id].fraction).toBeCloseTo(10 / 80, 12);
      expect(by[id].mcg).toBeCloseTo(500, 9);
    }
  });

  it("conserves the total mass", () => {
    expect(parts.reduce((s, p) => s + p.mcg, 0)).toBeCloseTo(4000, 9);
    expect(parts.reduce((s, p) => s + p.fraction, 0)).toBeCloseTo(1, 12);
  });

  it("scales linearly with the dose", () => {
    const double = decomposeDose(klow, 8000, resolve);
    expect(double.find((p) => p.peptideId === "bpc-157")!.mcg).toBeCloseTo(1000, 9);
  });

  it("resolves each component's library entry", () => {
    expect(by["bpc-157"].peptide?.name).toBe("BPC-157");
    expect(by["ghk-cu"].peptide?.halfLifeHours).toBeNull();
  });

  it("reproduces the copper warning quantitatively", () => {
    // A dose giving a conventional 250 mcg of BPC-157 also gives 1.25 mg GHK-Cu.
    const dose = blendDoseForComponent(klow, "bpc-157", 250);
    const p = decomposeDose(klow, dose, resolve);
    expect(p.find((x) => x.peptideId === "bpc-157")!.mcg).toBeCloseTo(250, 6);
    expect(p.find((x) => x.peptideId === "ghk-cu")!.mcg).toBeCloseTo(1250, 6);
  });
});

describe("decomposeDose, dose position against standalone ranges", () => {
  it("marks a component sitting inside its usual range", () => {
    // 4 mg KLOW gives 500 mcg BPC-157; standalone range is 250 to 500.
    const parts = decomposeDose(klow, 4000, resolve);
    expect(parts.find((p) => p.peptideId === "bpc-157")!.relativeToTypical).toBe("within");
  });

  it("marks a component pushed above its usual range", () => {
    // 8 mg KLOW gives 1000 mcg BPC-157, over the 500 mcg top of the range.
    const parts = decomposeDose(klow, 8000, resolve);
    expect(parts.find((p) => p.peptideId === "bpc-157")!.relativeToTypical).toBe("above");
  });

  it("marks a component left below its usual range", () => {
    const parts = decomposeDose(klow, 800, resolve);
    expect(parts.find((p) => p.peptideId === "bpc-157")!.relativeToTypical).toBe("below");
  });

  it("says unknown when the component has no resolvable entry", () => {
    const mystery: Peptide = {
      ...klow,
      id: "mystery",
      components: [{ name: "Unnamed", mgPerVial: 10 }],
    };
    expect(decomposeDose(mystery, 1000, resolve)[0].relativeToTypical).toBe("unknown");
  });
});

describe("decomposeDose, per-component blends", () => {
  it("gives CagriSema components the full stated dose each", () => {
    const parts = decomposeDose(cagrisema, 2400, resolve);
    expect(parts).toHaveLength(2);
    for (const p of parts) {
      expect(p.fraction).toBe(1);
      expect(p.mcg).toBeCloseTo(2400, 9);
    }
  });

  it("does not conserve total mass, by design", () => {
    const total = decomposeDose(cagrisema, 2400, resolve).reduce((s, p) => s + p.mcg, 0);
    expect(total).toBeCloseTo(4800, 9);
  });
});

describe("decomposeDose, blends with no stated ratio", () => {
  it("splits evenly when components carry no mass", () => {
    const parts = decomposeDose(wolverine, 1000, resolve);
    expect(parts).toHaveLength(2);
    for (const p of parts) {
      expect(p.fraction).toBeCloseTo(0.5, 12);
      expect(p.mcg).toBeCloseTo(500, 9);
    }
  });
});

describe("decomposeDose, edge cases", () => {
  it("returns nothing for a non-blend", () => {
    expect(decomposeDose(bpc, 1000, resolve)).toEqual([]);
  });

  it("handles a zero dose without dividing by zero", () => {
    const parts = decomposeDose(klow, 0, resolve);
    expect(parts.every((p) => p.mcg === 0)).toBe(true);
    expect(parts.every((p) => Number.isFinite(p.fraction))).toBe(true);
  });

  it("clamps a negative dose to zero", () => {
    expect(decomposeDose(klow, -500, resolve).every((p) => p.mcg === 0)).toBe(true);
  });

  it("works without a resolver, just without library detail", () => {
    const parts = decomposeDose(klow, 4000);
    expect(parts).toHaveLength(4);
    expect(parts[0].peptide).toBeUndefined();
    expect(parts[0].relativeToTypical).toBe("unknown");
    expect(parts.reduce((s, p) => s + p.mcg, 0)).toBeCloseTo(4000, 9);
  });
});

describe("blendDoseForComponent", () => {
  it("inverts the split", () => {
    // BPC-157 is an eighth of KLOW, so 250 mcg of it needs 2 mg of blend.
    expect(blendDoseForComponent(klow, "bpc-157", 250)).toBeCloseTo(2000, 9);
    expect(blendDoseForComponent(klow, "ghk-cu", 2500)).toBeCloseTo(4000, 9);
  });

  it("round-trips through decomposeDose", () => {
    for (const target of [100, 250, 500, 1000]) {
      const dose = blendDoseForComponent(klow, "bpc-157", target);
      const got = decomposeDose(klow, dose, resolve).find((p) => p.peptideId === "bpc-157")!.mcg;
      expect(got).toBeCloseTo(target, 6);
    }
  });

  it("is one-to-one for a per-component blend", () => {
    expect(blendDoseForComponent(cagrisema, "semaglutide", 1700)).toBeCloseTo(1700, 9);
  });

  it("returns NaN for an unknown component or nonsense target", () => {
    expect(blendDoseForComponent(klow, "nope", 250)).toBeNaN();
    expect(blendDoseForComponent(klow, "bpc-157", 0)).toBeNaN();
  });
});

describe("modellableComponents", () => {
  it("keeps only components with a published half-life", () => {
    const parts = decomposeDose(klow, 4000, resolve);
    const modellable = modellableComponents(parts);
    // Of KLOW's four, only BPC-157 has one.
    expect(modellable.map((p) => p.peptideId)).toEqual(["bpc-157"]);
  });

  it("keeps both halves of CagriSema", () => {
    const parts = decomposeDose(cagrisema, 2400, resolve);
    expect(modellableComponents(parts)).toHaveLength(2);
  });
});

describe("describeBlendDose", () => {
  it("calls out a component pushed above its range", () => {
    const s = describeBlendDose(decomposeDose(klow, 8000, resolve));
    expect(s).toContain("BPC-157");
    expect(s).toContain("above");
  });

  it("says nothing when everything sits in range", () => {
    const parts = decomposeDose(klow, 4000, resolve).map((p) => ({
      ...p,
      relativeToTypical: "within" as const,
    }));
    expect(describeBlendDose(parts)).toBeNull();
  });

  it("notes when the whole blend is underdosed", () => {
    const parts = decomposeDose(klow, 4000, resolve).map((p) => ({
      ...p,
      relativeToTypical: "below" as const,
    }));
    expect(describeBlendDose(parts)).toContain("Every component");
  });
});

describe("comparing on weekly exposure rather than per dose", () => {
  // The reported case: 4 mg KLOW daily gives 500 mcg of each minor component.
  // TB-500 standalone is 2 to 2.5 mg twice weekly, so per-dose it looks 4 to 5x low
  // while weekly it is only slightly under.
  const daily = 7;

  it("calls TB-500 badly low when frequency is ignored", () => {
    const perDose = decomposeDose(klow, 4000, resolve);
    const tb = perDose.find((p) => p.peptideId === "tb-500")!;
    expect(tb.comparedOn).toBe("per-dose");
    expect(tb.relativeToTypical).toBe("below");
    // 500 mcg against a 2000 to 2500 mcg per-dose range.
    expect(tb.typicalLowMcg).toBe(2000);
    expect(tb.typicalHighMcg).toBe(2500);
  });

  it("compares weekly once the schedule is known", () => {
    const weekly = decomposeDose(klow, 4000, resolve, daily);
    const tb = weekly.find((p) => p.peptideId === "tb-500")!;
    expect(tb.comparedOn).toBe("weekly");
    // 500 mcg x 7 = 3.5 mg/week against 4 to 5 mg/week standalone.
    expect(tb.weeklyMcg).toBeCloseTo(3500, 6);
    expect(tb.typicalWeeklyLowMcg).toBeCloseTo(4000, 6);
    expect(tb.typicalWeeklyHighMcg).toBeCloseTo(5000, 6);
    expect(tb.relativeToTypical).toBe("below");
  });

  it("shows the weekly gap is far smaller than the per-dose one", () => {
    const perDose = decomposeDose(klow, 4000, resolve);
    const weekly = decomposeDose(klow, 4000, resolve, daily);
    const pd = perDose.find((p) => p.peptideId === "tb-500")!;
    const wk = weekly.find((p) => p.peptideId === "tb-500")!;

    const perDoseShortfall = pd.typicalLowMcg! / pd.mcg;
    const weeklyShortfall = wk.typicalWeeklyLowMcg! / wk.weeklyMcg!;

    expect(perDoseShortfall).toBeCloseTo(4, 6);
    expect(weeklyShortfall).toBeCloseTo(1.143, 2);
    expect(weeklyShortfall).toBeLessThan(perDoseShortfall);
  });

  it("puts BPC-157 and KPV comfortably in range weekly", () => {
    const weekly = decomposeDose(klow, 4000, resolve, daily);
    for (const id of ["bpc-157", "kpv"]) {
      const p = weekly.find((x) => x.peptideId === id)!;
      // 3.5 mg/week against 2.5 to 5 mg/week.
      expect(p.weeklyMcg).toBeCloseTo(3500, 6);
      expect(p.relativeToTypical, id).toBe("within");
    }
  });

  it("keeps GHK-Cu in range weekly", () => {
    const p = decomposeDose(klow, 4000, resolve, daily).find((x) => x.peptideId === "ghk-cu")!;
    expect(p.weeklyMcg).toBeCloseTo(17_500, 6);
    expect(p.relativeToTypical).toBe("within");
  });

  it("carries the standalone frequency through for display", () => {
    const p = decomposeDose(klow, 4000, resolve, daily).find((x) => x.peptideId === "tb-500")!;
    expect(p.typicalPerWeek).toBe(2);
    expect(p.typicalFrequency).toContain("weekly");
  });

  it("falls back to per-dose when the schedule is unknown", () => {
    const p = decomposeDose(klow, 4000, resolve).find((x) => x.peptideId === "tb-500")!;
    expect(p.comparedOn).toBe("per-dose");
    expect(p.weeklyMcg).toBeNull();
  });

  it("marks a component with no documented range as unknown either way", () => {
    const mystery: Peptide = { ...klow, id: "m", components: [{ name: "X", mgPerVial: 10 }] };
    for (const dpw of [undefined, 7]) {
      const p = decomposeDose(mystery, 1000, resolve, dpw)[0];
      expect(p.relativeToTypical).toBe("unknown");
      expect(p.comparedOn).toBe("none");
    }
  });

  it("says which basis the summary used", () => {
    const weekly = describeBlendDose(decomposeDose(klow, 4000, resolve, daily));
    expect(weekly).toContain("for a week");
    const perDose = describeBlendDose(decomposeDose(klow, 8000, resolve));
    expect(perDose).toContain("at this dose");
  });

  it("scales weekly exposure with a less frequent schedule", () => {
    // The same 4 mg dose taken twice a week, not daily.
    const p = decomposeDose(klow, 4000, resolve, 2).find((x) => x.peptideId === "tb-500")!;
    expect(p.weeklyMcg).toBeCloseTo(1000, 6);
    expect(p.relativeToTypical).toBe("below");
  });
});
