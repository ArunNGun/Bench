/**
 * Where the printed marks go on a barrel.
 *
 * Pulled out of the syringe drawing because there are now two of them, a full
 * size one and a thumbnail in the picker, and a barrel that renders differently
 * in the two places is a barrel the person cannot trust either time.
 *
 * The number that matters is the spacing between marks in real pixels. A 1 mL
 * U-100 barrel carries 100 of them, and at thumbnail width they land closer
 * together than a hairline, which is not a drawing of a syringe, it is a grey
 * bar. Every implementation of this eventually grows a rule for that case, and
 * the rule is the whole reason this file exists.
 */

import { capacityUnits, type SyringeSpec } from "./reconstitution";

export interface BarrelTick {
  /** Units from the needle end. */
  units: number;
  /** 0 at the needle, 1 at the far end of the drawn stretch. */
  fraction: number;
  /** Numbered marks, drawn longer. */
  major: boolean;
}

export interface BarrelScale {
  ticks: BarrelTick[];
  /**
   * Units the drawing actually covers. Equal to the barrel's capacity unless
   * the drawing was magnified, in which case it is the stretch that fits.
   */
  shownUnits: number;
  /** True when only the first stretch of the barrel is drawn. */
  magnified: boolean;
  majorEvery: number;
}

/**
 * How often a mark is numbered.
 *
 * Real syringes number 0.3 and 0.5 mL barrels every 5 units and 1 mL barrels
 * every 10, and a U-40 barrel numbered 0 to 40 is numbered every 5. Fifty units
 * is the line that separates them.
 */
export function majorEveryFor(capacity: number): number {
  return capacity <= 50 ? 5 : 10;
}

/**
 * The marks to draw, and how much of the barrel they cover.
 *
 * `widthPx` is the width the barrel will actually occupy on screen, not a
 * viewBox number. They are the same thing only when the SVG happens to render
 * one to one, and the whole judgement here is about what an eye can separate.
 *
 * When the marks will not fit, the answer is **not** to draw every second one.
 * Thinning them is silent and it lies about the barrel: a 0.3 mL barrel with
 * half-unit marks thinned to every fifth unit is drawn coarser than the plain
 * 0.3 mL barrel beside it, so the finer instrument looks like the blunter one.
 * That is exactly backwards, and in a picker where those two are separate
 * options it erases the only difference between them.
 *
 * So a barrel too fine for its width is magnified instead: the first whole
 * number of numbered divisions that fit, drawn at true spacing, with
 * `magnified` set so the caller can say so. A picture of part of the barrel is
 * honest. A picture of a barrel that does not exist is not.
 */
export function barrelTicks(
  spec: SyringeSpec,
  widthPx: number,
  { minSpacingPx = 2.5, allowMagnify = false }: { minSpacingPx?: number; allowMagnify?: boolean } = {},
): BarrelScale {
  const capacity = capacityUnits(spec);
  const majorEvery = majorEveryFor(capacity);
  const step = spec.graduationUnits;

  const spacingFor = (units: number) => (units > 0 ? (widthPx * step) / units : Infinity);

  let shownUnits = capacity;
  let magnified = false;

  if (allowMagnify && capacity > 0 && spacingFor(capacity) < minSpacingPx) {
    /*
     * The largest whole number of numbered divisions whose marks still clear
     * the threshold. Whole divisions rather than an arbitrary count, so the
     * magnified stretch still ends on a number somebody can read.
     */
    const fits = Math.floor((widthPx * step) / minSpacingPx);
    const divisions = Math.max(1, Math.floor(fits / majorEvery));
    shownUnits = Math.min(capacity, divisions * majorEvery);
    magnified = shownUnits < capacity;
  }

  const ticks: BarrelTick[] = [];
  for (let u = 0; u <= shownUnits + 1e-9; u += step) {
    const units = Math.round(u * 1000) / 1000;
    ticks.push({
      units,
      fraction: shownUnits > 0 ? units / shownUnits : 0,
      major: Math.abs(units % majorEvery) < 1e-9,
    });
  }

  return { ticks, shownUnits, magnified, majorEvery };
}
