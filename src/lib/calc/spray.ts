/**
 * Nasal sprays: filling a bottle, and what one press of the pump delivers.
 *
 * The workflow this exists for, in the words of the person who asked for it:
 * the peptide is reconstituted in its vial, the whole contents are transferred
 * into a pump bottle, and the bottle is then made up with more saline. His
 * example, which is the test case below: 5 mg in 1 mL of saline is 5,000 mcg
 * per mL in the vial; poured into the bottle and made up with a further 4 mL it
 * becomes 5 mL at 1,000 mcg per mL, so 0.1 mL a press is 100 mcg.
 *
 * That transfer is the part the app had no model for. Everything else about a
 * bottle is a mass dissolved in a volume, which is what a vial already is, so a
 * bottle is a `Vial` with `container: "spray"` and reuses concentration,
 * depletion, cost and supply untouched.
 *
 * Two honest limits are built in rather than papered over. Nothing here asserts
 * a beyond-use date, because the twenty-eight days the app uses for a punctured
 * vial comes from a convention that has nothing to say about a preservative
 * free solution in a pump that some people carry in a pocket and others keep in
 * a fridge. And the number of presses left is an estimate and is named as one:
 * solution is lost in preparation and in transfer, priming delivers less than a
 * dose, and no arithmetic can know when a pump has stopped lifting liquid.
 */

import type { DiluentKind, Vial } from "../types";
import { MCG_PER_MG, vialConcentration, vialRemainingMcg, vialRemainingMl } from "./inventory";

/** What a pump delivers when nobody has measured it. */
export const DEFAULT_ML_PER_SPRAY = 0.1;

/** How to measure a bottle that did not come calibrated. */
export const MEASURE_A_PRESS =
  "Pull the plunger out of a syringe and spray once into the open barrel. What collects is what one press delivers. Cheap bottles vary, calibrated ones state it on the box.";

export const isSpray = (v: Pick<Vial, "container">) => v.container === "spray";

/** The volume one press delivers, falling back to the usual pump. */
export function mlPerSpray(v: Pick<Vial, "mlPerSpray">): number {
  const ml = v.mlPerSpray;
  return Number.isFinite(ml) && (ml ?? 0) > 0 ? ml! : DEFAULT_ML_PER_SPRAY;
}

/**
 * The mass one press delivers.
 *
 * Zero where the bottle has no volume recorded, because a concentration cannot
 * be had without one and a made-up number would be read standing over a nose.
 */
export function mcgPerSpray(v: Pick<Vial, "strengthMg" | "diluentMl" | "mlPerSpray">): number {
  const perMl = vialConcentration(v);
  return perMl > 0 ? perMl * mlPerSpray(v) : 0;
}

/** The mass a number of presses delivers. */
export function mcgForSprays(
  v: Pick<Vial, "strengthMg" | "diluentMl" | "mlPerSpray">,
  sprays: number): number {
  return mcgPerSpray(v) * Math.max(0, sprays);
}

/** The volume a number of presses delivers, for reporting it back. */
export function mlForSprays(v: Pick<Vial, "mlPerSpray">, sprays: number): number {
  return mlPerSpray(v) * Math.max(0, sprays);
}

/**
 * How many presses a dose comes to, rounded to whole ones.
 *
 * A pump delivers a fixed volume or it fails, so half a press is a failed dose
 * and not half a dose. Rounding rather than flooring, because a plan asking for
 * 250 mcg from a bottle giving 100 a press means two or three presses and the
 * nearer of those is the better suggestion.
 */
export function spraysForDose(
  v: Pick<Vial, "strengthMg" | "diluentMl" | "mlPerSpray">,
  doseMcg: number): number {
  const per = mcgPerSpray(v);
  return per > 0 ? Math.max(0, Math.round(doseMcg / per)) : 0;
}

/**
 * Roughly how many presses are left, and roughly is the word.
 *
 * Volume remaining divided by volume per press, floored, because a partial
 * press is not a press. It will read high: the last millilitre or so cannot be
 * lifted by the pump, priming costs some of it, and none of that is knowable
 * from here. The app says "about" wherever it shows this, and offers a way to
 * mark a bottle empty by hand, because the person holding it up to the light
 * knows better than the arithmetic does.
 */
export function spraysRemaining(
  v: Pick<Vial, "strengthMg" | "diluentMl" | "drawnMcg" | "mlPerSpray">): number {
  const ml = vialRemainingMl(v);
  return ml > 0 ? Math.floor(ml / mlPerSpray(v)) : 0;
}

export interface TransferPlan {
  /** The vial, emptied and closed. */
  source: Vial;
  /** The bottle, as it should be created. */
  bottle: Omit<Vial, "id" | "profileId">;
  /** Saline that has to come out of tracked stock, if any was named. */
  drawnMl: number;
}

/**
 * Empty a made-up vial into a pump bottle and make it up with more saline.
 *
 * The mass moves whole, which is what actually happens: the vial is rinsed into
 * the bottle. So the bottle's strength is whatever the vial had left, and the
 * vial is finished rather than left holding a remainder it no longer has.
 *
 * The money moves with it and is taken off the vial, or the same purchase would
 * be counted twice in Spent. The order stays behind, because shipping belongs
 * to the delivery that brought the vial and the bottle was never posted.
 *
 * No beyond-use date is set. That is the decision, not an omission.
 */
export function transferToSpray(
  source: Vial,
  options: {
    /** Saline added after the vial's contents go in. */
    addedMl: number;
    mlPerSpray: number;
    /** Which kind went in, since a nose does not take bacteriostatic water. */
    diluent?: DiluentKind;
    /** The ampoule or bottle it came from, when that is tracked. */
    diluentBottleId?: string;
    atMs: number;
  }): TransferPlan | null {
  const remainingMcg = vialRemainingMcg(source);
  if (remainingMcg <= 0) return null;

  const carriedMl = vialRemainingMl(source);
  const addedMl = Math.max(0, options.addedMl);
  const totalMl = carriedMl + addedMl;
  if (!(totalMl > 0)) return null;

  const bottle: Omit<Vial, "id" | "profileId"> = {
    peptideId: source.peptideId,
    // Expressed in milligrams because that is the unit a vial's strength is in,
    // and every figure downstream reads it from there.
    strengthMg: remainingMcg / MCG_PER_MG,
    state: "reconstituted",
    container: "spray",
    mlPerSpray: options.mlPerSpray > 0 ? options.mlPerSpray : DEFAULT_ML_PER_SPRAY,
    diluentMl: totalMl,
    diluent: options.diluent ?? source.diluent,
    diluentBottleId: options.diluentBottleId,
    drawnMcg: 0,
    // The moment it was filled is the moment it was opened, and it is the only
    // clock a bottle has. Deliberately not a beyond-use date.
    reconstitutedAt: options.atMs,
    filledFromVialId: source.id,
    supplier: source.supplier,
    lot: source.lot,
    cost: source.cost,
    currency: source.currency,
    acquiredAt: source.acquiredAt,
    notes: source.notes,
  };

  const emptied: Vial = {
    ...source,
    drawnMcg: (source.drawnMcg ?? 0) + remainingMcg,
    state: "finished",
    // Moved rather than copied, so the same purchase is not counted twice.
    cost: undefined,
  };

  return { source: emptied, bottle, drawnMl: options.diluentBottleId ? addedMl : 0 };
}

/**
 * The saline a transfer will use, for showing before it happens.
 *
 * Only what is added afterwards. What is already in the vial was drawn when it
 * was made up and has been accounted for once already.
 */
export const salineForTransfer = (addedMl: number) => Math.max(0, addedMl);
