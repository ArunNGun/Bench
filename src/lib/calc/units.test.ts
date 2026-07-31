import { describe, expect, it } from "vitest";
import {
  concentrationFromFill,
  formatDoseWithIu,
  isIuDosed,
  isSolution,
  iuToMcg,
  mcgToIu,
  strengthFromConcentration,
} from "./units";

/** Recombinant somatropin, per the WHO international standard. */
const HGH = { iuPerMg: 3 };

describe("mcgToIu and iuToMcg", () => {
  it("converts growth hormone at 3 IU per mg", () => {
    expect(mcgToIu(1000, 3)).toBe(3);
    expect(mcgToIu(2000, 3)).toBe(6);
    // The common 2 IU daily dose is two thirds of a milligram.
    expect(iuToMcg(2, 3)).toBeCloseTo(666.667, 3);
  });

  it("round-trips", () => {
    for (const iu of [0.5, 1, 2, 4, 8]) {
      expect(mcgToIu(iuToMcg(iu, 3), 3)).toBeCloseTo(iu, 10);
    }
  });

  it("honours a different potency rather than hard-coding 3", () => {
    // Older pituitary-derived standards were 2.6 IU/mg, and getting this wrong is
    // a 15% dosing error.
    expect(mcgToIu(1000, 2.6)).toBe(2.6);
    expect(iuToMcg(2.6, 2.6)).toBe(1000);
  });

  it("refuses a nonsensical potency", () => {
    expect(mcgToIu(1000, 0)).toBeNaN();
    expect(mcgToIu(1000, -3)).toBeNaN();
    expect(iuToMcg(1, 0)).toBeNaN();
  });

  it("refuses a non-finite dose", () => {
    expect(mcgToIu(NaN, 3)).toBeNaN();
  });
});

describe("isIuDosed", () => {
  it("is true only for a compound with a stated potency", () => {
    expect(isIuDosed(HGH)).toBe(true);
    expect(isIuDosed({})).toBe(false);
    expect(isIuDosed({ iuPerMg: 0 })).toBe(false);
    expect(isIuDosed(undefined)).toBe(false);
    expect(isIuDosed(null)).toBe(false);
  });
});

describe("formatDoseWithIu", () => {
  it("leads with IU for growth hormone and shows the mass as a check", () => {
    expect(formatDoseWithIu(HGH, 666.667)).toBe("2 IU (0.667 mg)");
    expect(formatDoseWithIu(HGH, 1000)).toBe("3 IU (1 mg)");
  });

  it("uses mass for everything else", () => {
    expect(formatDoseWithIu({}, 500)).toBe("500 mcg");
    expect(formatDoseWithIu({}, 10_000)).toBe("10 mg");
    expect(formatDoseWithIu({}, 2500)).toBe("2.5 mg");
  });

  it("copes with an unknown dose", () => {
    expect(formatDoseWithIu(HGH, NaN)).toBe("n/a");
  });
});

describe("solution concentration", () => {
  it("treats a manufacturer fill exactly like a reconstitution", () => {
    // 10 mL of testosterone enanthate at 250 mg/mL is 2500 mg in the vial.
    expect(concentrationFromFill(2500, 10)).toBe(250_000);
    expect(strengthFromConcentration(250, 10)).toBe(2500);
  });

  it("round-trips a stated concentration", () => {
    const strength = strengthFromConcentration(200, 10);
    expect(concentrationFromFill(strength, 10) / 1000).toBe(200);
  });

  it("refuses an empty or zero-volume vial", () => {
    expect(concentrationFromFill(2500, 0)).toBeNaN();
    expect(concentrationFromFill(0, 10)).toBeNaN();
    expect(strengthFromConcentration(0, 10)).toBeNaN();
  });
});

describe("isSolution", () => {
  it("only calls a compound ready-to-draw when it says so", () => {
    expect(isSolution({ preparation: "solution" })).toBe(true);
    expect(isSolution({ preparation: "powder" })).toBe(false);
    // Absent means powder, which is what the rest of the library is.
    expect(isSolution({})).toBe(false);
    expect(isSolution(undefined)).toBe(false);
  });
});
