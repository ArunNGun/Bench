/**
 * Doses that are conventionally counted in international units.
 *
 * Growth hormone is the reason this exists. Every pen, every label and every
 * conversation about it is in IU, but an IU is a unit of biological activity, not
 * of mass, the conversion is a property of the specific preparation. For
 * recombinant somatropin the WHO standard fixes it at 3 IU per milligram, so the
 * app stores micrograms like everything else and converts at the edges.
 *
 * Storing IU directly would have been the mistake: it makes a vial's contents
 * incomparable with every other compound, and breaks the moment a preparation
 * with a different potency shows up.
 */

const MCG_PER_MG = 1000;

/** Micrograms to international units, for a preparation of known potency. */
export function mcgToIu(mcg: number, iuPerMg: number): number {
  if (!(iuPerMg > 0) || !Number.isFinite(mcg)) return NaN;
  return (mcg / MCG_PER_MG) * iuPerMg;
}

/** International units to micrograms. */
export function iuToMcg(iu: number, iuPerMg: number): number {
  if (!(iuPerMg > 0) || !Number.isFinite(iu)) return NaN;
  return (iu / iuPerMg) * MCG_PER_MG;
}

/** Whether this compound is one people count in IU. */
export function isIuDosed(p: { iuPerMg?: number } | undefined | null): boolean {
  return !!p?.iuPerMg && p.iuPerMg > 0;
}

const trimNumber = (n: number, places: number) =>
  String(Number(n.toFixed(places)));

/**
 * A dose written the way someone running this compound would write it.
 *
 * IU first for anything dosed that way, with the mass in brackets, the IU figure
 * is the one that has to match the pen, and the milligrams are the check.
 */
export function formatDoseWithIu(
  p: { iuPerMg?: number } | undefined | null,
  mcg: number): string {
  if (!Number.isFinite(mcg)) return "n/a";

  if (isIuDosed(p)) {
    const iu = mcgToIu(mcg, p!.iuPerMg!);
    return `${trimNumber(iu, 2)} IU (${trimNumber(mcg / MCG_PER_MG, 3)} mg)`;
  }

  return mcg < MCG_PER_MG
    ? `${trimNumber(mcg, 1)} mcg`
    : `${trimNumber(mcg / MCG_PER_MG, 3)} mg`;
}

/**
 * The concentration of a ready-made solution, in micrograms per millilitre.
 *
 * Identical arithmetic to a reconstituted vial, a manufacturer filling 10 mL of
 * oil with 2500 mg of testosterone has produced exactly the same thing as adding
 * 10 mL of water to a 2500 mg powder, as far as drawing a dose goes.
 */
export function concentrationFromFill(strengthMg: number, fillMl: number): number {
  if (!(fillMl > 0) || !(strengthMg > 0)) return NaN;
  return (strengthMg * MCG_PER_MG) / fillMl;
}

/** Label strength implied by a stated concentration and fill volume. */
export function strengthFromConcentration(mgPerMl: number, fillMl: number): number {
  if (!(mgPerMl > 0) || !(fillMl > 0)) return NaN;
  return mgPerMl * fillMl;
}

/** True when the compound arrives ready to draw rather than as a powder. */
export function isSolution(p: { preparation?: "powder" | "solution" } | undefined | null): boolean {
  return p?.preparation === "solution";
}
