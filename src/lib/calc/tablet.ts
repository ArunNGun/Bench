/**
 * Tablets: a pack of them, and what one of them delivers.
 *
 * Asked for after somebody tried to record SLU-PP-332, which the library does
 * not carry and which he had as tablets. The app could hold the compound
 * straight away and had nowhere to put the tablets: stock was a mass in a
 * vial, optionally dissolved in a volume, and a pack of tablets is a mass in
 * a count.
 *
 * So a pack is a `Vial` with `container: "pack"`, which is the shape a nasal
 * spray bottle already established and for the same reason: mass remaining,
 * doses left, cost per dose, days of supply and the beyond-use rules are all
 * arithmetic about a mass in a container, and none of them care what the
 * container is. `strengthMg` is the whole pack, `mgPerTablet` is the unit it
 * is counted in. Sixty tablets of 10 mg is one pack of 600 mg.
 *
 * Two deliberate differences from the spray beside it.
 *
 * There is no default tablet size. A pump has a conventional 0.1 mL, so a
 * bottle with nothing recorded can still be counted; tablets come in whatever
 * the manufacturer chose, so a pack with nothing recorded is counted as
 * nothing rather than as a guess. The screen then says the size is missing,
 * which is true, instead of a press-count that is false.
 *
 * And a tablet can be halved. A pump delivers a fixed volume or it fails, so
 * `spraysForDose` rounds to whole presses; a scored tablet really is half a
 * dose, so `tabletsForDose` keeps the fraction and lets the screen round it
 * for reading. What is floored is the count left in the pack, because half a
 * tablet you have not cut yet is not half a tablet you can take.
 */

import type { Vial } from "../types";
import { MCG_PER_MG, vialRemainingMcg } from "./inventory";

export const isPack = (v: Pick<Vial, "container">) => v.container === "pack";

/** Milligrams in one tablet, or zero when nobody recorded it. */
export function mgPerTablet(v: Pick<Vial, "mgPerTablet">): number {
  const mg = v.mgPerTablet;
  return Number.isFinite(mg) && (mg ?? 0) > 0 ? mg! : 0;
}

/** The mass one tablet delivers. */
export function mcgPerTablet(v: Pick<Vial, "mgPerTablet">): number {
  return mgPerTablet(v) * MCG_PER_MG;
}

/** The mass a number of tablets delivers. */
export function mcgForTablets(v: Pick<Vial, "mgPerTablet">, tablets: number): number {
  return mcgPerTablet(v) * Math.max(0, tablets);
}

/**
 * How many tablets a dose comes to.
 *
 * The exact figure, fractions and all. A plan asking for 15 mg from a pack of
 * 10 mg tablets is one and a half tablets, and saying "2" would be a fifth
 * more drug than the plan says. Whether that fraction is takeable is a fact
 * about the tablet in the hand, not about arithmetic, so the number is
 * reported and the judgement is left where it belongs.
 */
export function tabletsForDose(v: Pick<Vial, "mgPerTablet">, doseMcg: number): number {
  const per = mcgPerTablet(v);
  return per > 0 ? Math.max(0, doseMcg / per) : 0;
}

/**
 * Whole tablets left in the pack.
 *
 * Floored, unlike the dose above. Mass remaining divided by the tablet size
 * can land at 4.5 when four tablets and a half-used one are in the pack, and
 * the answer to "how many can I take" is four.
 */
export function tabletsRemaining(
  v: Pick<Vial, "strengthMg" | "drawnMcg" | "mgPerTablet">): number {
  const per = mcgPerTablet(v);
  return per > 0 ? Math.floor(vialRemainingMcg(v) / per) : 0;
}

/**
 * The mass a pack of this many tablets holds.
 *
 * What the add form writes into `strengthMg`, so the pack is a mass like every
 * other container and nothing downstream has to learn a second unit.
 */
export function packStrengthMg(mgEach: number, tablets: number): number {
  return Math.max(0, mgEach) * Math.max(0, Math.floor(tablets));
}
