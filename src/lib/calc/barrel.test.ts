import { describe, expect, it } from "vitest";
import { barrelTicks, majorEveryFor } from "./barrel";
import { capacityUnits, syringeById, SYRINGES } from "./reconstitution";

const HALF_03 = syringeById("u100-0.3-half")!;
const PLAIN_03 = syringeById("u100-0.3")!;
const HALF_ML = syringeById("u100-0.5")!;
const ONE_ML = syringeById("u100-1.0")!;
const ONE_ML_FINE = syringeById("u100-1.0-fine")!;
const VET_ML = syringeById("u40-1.0")!;

/** Real spacing between adjacent marks, which is the number that decides everything. */
const spacing = (spec: (typeof SYRINGES)[number], width: number) => {
  const { ticks } = barrelTicks(spec, width, { allowMagnify: true });
  return width * (ticks[1].fraction - ticks[0].fraction) * (ticks.length > 1 ? 1 : 0);
};

describe("majorEveryFor", () => {
  it("numbers small barrels every five and 1 mL barrels every ten", () => {
    expect(majorEveryFor(30)).toBe(5);
    expect(majorEveryFor(50)).toBe(5);
    expect(majorEveryFor(40)).toBe(5);
    expect(majorEveryFor(100)).toBe(10);
  });
});

describe("barrelTicks at full size", () => {
  it("puts a mark at every printed graduation", () => {
    const { ticks } = barrelTicks(ONE_ML_FINE, 400);
    expect(ticks).toHaveLength(101);
    expect(ticks[0].units).toBe(0);
    expect(ticks[ticks.length - 1].units).toBe(100);
  });

  it("draws half as many marks on a 2-unit barrel as on a 1-unit one", () => {
    const coarse = barrelTicks(ONE_ML, 400).ticks.length;
    const fine = barrelTicks(ONE_ML_FINE, 400).ticks.length;
    expect(fine).toBe(coarse * 2 - 1);
  });

  it("numbers a veterinary barrel 0 to 40", () => {
    const { ticks } = barrelTicks(VET_ML, 400);
    const numbered = ticks.filter((t) => t.major).map((t) => t.units);
    expect(numbered[numbered.length - 1]).toBe(40);
    expect(numbered).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40]);
  });

  it("places the far mark at the far end", () => {
    const { ticks } = barrelTicks(HALF_ML, 300);
    expect(ticks[0].fraction).toBe(0);
    expect(ticks[ticks.length - 1].fraction).toBeCloseTo(1, 12);
  });

  it("never magnifies unless asked, however narrow", () => {
    const { magnified, shownUnits } = barrelTicks(ONE_ML_FINE, 40);
    expect(magnified).toBe(false);
    expect(shownUnits).toBe(capacityUnits(ONE_ML_FINE));
  });
});

/**
 * The reason this module exists.
 *
 * A picker offers the 0.3 mL barrel twice, once with half-unit marks and once
 * with whole ones, and the marks are the only difference between them. The
 * drawing that thinned its marks when they got tight rendered the finer barrel
 * with fewer marks than the blunter one, which is not a small inaccuracy, it is
 * the opposite of the fact the picture is there to convey.
 */
describe("a barrel too fine for its width", () => {
  it("magnifies rather than thinning, and says so", () => {
    const { magnified, shownUnits, ticks } = barrelTicks(ONE_ML_FINE, 120, { allowMagnify: true });
    expect(magnified).toBe(true);
    expect(shownUnits).toBeLessThan(100);
    // Still every printed mark, just over a shorter stretch.
    expect(ticks).toHaveLength(shownUnits / ONE_ML_FINE.graduationUnits + 1);
  });

  it("ends the magnified stretch on a numbered mark", () => {
    const { shownUnits, majorEvery } = barrelTicks(ONE_ML_FINE, 120, { allowMagnify: true });
    expect(shownUnits % majorEvery).toBe(0);
  });

  it("keeps every mark at least the minimum apart", () => {
    for (const spec of SYRINGES) {
      const { ticks } = barrelTicks(spec, 120, { allowMagnify: true, minSpacingPx: 2.5 });
      const gap = 120 * (ticks[1].fraction - ticks[0].fraction);
      expect(gap, spec.id).toBeGreaterThanOrEqual(2.5);
    }
  });

  it("never draws a finer barrel with coarser marks than a blunter one", () => {
    /*
     * The bug, stated as the property it violated: of two barrels of the same
     * capacity, the one with the finer marks must never be drawn with its
     * marks further apart.
     *
     * Only meaningful where both are drawn whole. Two magnified drawings are
     * at different magnifications and are not to the same scale, which is why
     * a magnified drawing has to announce itself and why the picker is laid
     * out to avoid needing one. The widths below are the ones where nothing
     * magnifies, which is everything from roughly 260px up.
     */
    for (const width of [260, 300, 330, 400]) {
      expect(barrelTicks(ONE_ML_FINE, width, { allowMagnify: true }).magnified).toBe(false);
      expect(spacing(HALF_03, width), `0.3 mL at ${width}px`).toBeLessThanOrEqual(
        spacing(PLAIN_03, width) + 1e-9);
      expect(spacing(ONE_ML_FINE, width), `1 mL at ${width}px`).toBeLessThanOrEqual(
        spacing(ONE_ML, width) + 1e-9);
    }
  });

  it("declares itself whenever it is not showing the whole barrel", () => {
    // The magnified flag is the entire defence against the drawing lying, so
    // it can never be false while the drawing is short of the capacity.
    for (const spec of SYRINGES) {
      for (const width of [60, 90, 120, 200, 300, 500]) {
        const { magnified, shownUnits } = barrelTicks(spec, width, { allowMagnify: true });
        expect(magnified, `${spec.id} at ${width}px`).toBe(shownUnits < capacityUnits(spec));
      }
    }
  });

  it("draws every barrel in full at the width the picker actually uses", () => {
    /*
     * The picker's own numbers, and the reason for its layout. One card per
     * row on a phone and two from `sm` up gives the barrel 260px, and at two
     * pixels a mark nothing in the library needs magnifying there. If a card
     * is ever narrowed, or a finer barrel added, this fails rather than the
     * drawing quietly starting to lie.
     *
     * This caught the first version, which computed marks against a fixed
     * viewBox of 232 while the card rendered it at 300, and magnified the 1 mL
     * barrel that had room to draw in full.
     */
    for (const spec of SYRINGES) {
      const scale = barrelTicks(spec, 260, { allowMagnify: true, minSpacingPx: 2 });
      expect(scale.magnified, spec.id).toBe(false);
    }
  });

  it("magnifies in the small thumbnail, where there really is no room", () => {
    // 120px beside the closed Settings row. The 1 mL barrels do not fit and
    // are expected to show a stretch, which is the honest outcome, not a bug.
    const fine = barrelTicks(ONE_ML_FINE, 120, { allowMagnify: true, minSpacingPx: 2 });
    expect(fine.magnified).toBe(true);
    expect(barrelTicks(HALF_03, 120, { allowMagnify: true, minSpacingPx: 2 }).magnified).toBe(false);
  });
});
