import { describe, expect, it } from "vitest";
import {
  isPack,
  mcgForTablets,
  mcgPerTablet,
  mgPerTablet,
  packStrengthMg,
  tabletsForDose,
  tabletsRemaining,
} from "./tablet";
import type { Vial } from "../types";

/** Sixty tablets of 10 mg, which is the pack the request was about. */
const pack = (over: Partial<Vial> = {}): Vial => ({
  id: "p1",
  profileId: "me",
  peptideId: "slu-pp-332",
  strengthMg: 600,
  state: "sealed",
  container: "pack",
  mgPerTablet: 10,
  ...over,
});

describe("what a pack is", () => {
  it("knows one from a vial and from a bottle", () => {
    expect(isPack(pack())).toBe(true);
    expect(isPack({ container: "spray" })).toBe(false);
    expect(isPack({})).toBe(false);
  });

  it("is a mass, so the rest of the app needs no new unit", () => {
    expect(packStrengthMg(10, 60)).toBe(600);
  });

  it("counts whole tablets into a pack and not fractions of one", () => {
    expect(packStrengthMg(10, 60.7)).toBe(600);
  });

  it("refuses to build a pack out of nonsense", () => {
    expect(packStrengthMg(-10, 60)).toBe(0);
    expect(packStrengthMg(10, -1)).toBe(0);
  });
});

/*
 * The one real difference from the pump beside it. A bottle with no volume
 * recorded still counts, because 0.1 mL is the conventional press. Tablets have
 * no conventional size, so a pack with none recorded counts as nothing and the
 * screen says the size is missing.
 */
describe("a pack with no tablet size", () => {
  const nameless = pack({ mgPerTablet: undefined });

  it("reports no size rather than a guessed one", () => {
    expect(mgPerTablet(nameless)).toBe(0);
    expect(mcgPerTablet(nameless)).toBe(0);
  });

  it("counts nothing rather than counting wrongly", () => {
    expect(tabletsRemaining(nameless)).toBe(0);
    expect(tabletsForDose(nameless, 10_000)).toBe(0);
  });

  it("treats a zero or a negative size the same as none at all", () => {
    expect(mgPerTablet(pack({ mgPerTablet: 0 }))).toBe(0);
    expect(mgPerTablet(pack({ mgPerTablet: -5 }))).toBe(0);
  });
});

describe("tabletsForDose", () => {
  it("answers one tablet for one tablet", () => {
    expect(tabletsForDose(pack(), 10_000)).toBe(1);
  });

  /*
   * Kept as a fraction, which is where a tablet parts company with a press.
   * Rounding 1.5 up to 2 would be a fifth more drug than the plan asks for, and
   * whether a half is takeable is a fact about the tablet rather than about the
   * arithmetic.
   */
  it("keeps a half, because a scored tablet really is half a dose", () => {
    expect(tabletsForDose(pack(), 15_000)).toBe(1.5);
    expect(tabletsForDose(pack({ mgPerTablet: 25 }), 12_500)).toBe(0.5);
  });

  it("never answers with a negative number of tablets", () => {
    expect(tabletsForDose(pack(), -10_000)).toBe(0);
  });

  it("goes back the way it came", () => {
    expect(mcgForTablets(pack(), tabletsForDose(pack(), 15_000))).toBeCloseTo(15_000, 6);
  });
});

describe("tabletsRemaining", () => {
  it("counts a full pack", () => {
    expect(tabletsRemaining(pack())).toBe(60);
  });

  it("takes the taken ones off", () => {
    expect(tabletsRemaining(pack({ drawnMcg: 100_000 }))).toBe(50);
  });

  /*
   * Floored rather than rounded. Four tablets and a half-used one answers four
   * to "how many can I take", and a five would be a tablet that is not there.
   */
  it("floors, because half a tablet in the pack is not a tablet", () => {
    expect(tabletsRemaining(pack({ drawnMcg: 555_000 }))).toBe(4);
  });

  it("bottoms out at nothing rather than going negative", () => {
    expect(tabletsRemaining(pack({ drawnMcg: 700_000 }))).toBe(0);
  });
});
