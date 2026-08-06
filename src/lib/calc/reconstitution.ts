/**
 * Reconstitution and dose arithmetic.
 *
 * Everything here is pure. Mass is carried in micrograms and volume in
 * millilitres so that sub-milligram doses never accumulate float error at the
 * milligram scale.
 *
 * THE ONE THING THIS MODULE EXISTS TO GET RIGHT: an insulin syringe's barrel
 * markings are VOLUME graduations, not a measure of biological activity. What
 * volume one mark represents depends entirely on the barrel's scale:
 *
 *   U-100 barrel: 100 marks to 1 mL  ->  1 mark = 0.01  mL
 *   U-40  barrel:  40 marks to 1 mL  ->  1 mark = 0.025 mL
 *
 * Reading a U-40 barrel as though it were U-100 delivers 2.5x the intended
 * volume. Nothing in this module assumes a scale; the caller must state one.
 */

export type SyringeScale = "U100" | "U40";

/** Marks printed on the barrel per millilitre of liquid. */
export const UNITS_PER_ML: Record<SyringeScale, number> = {
  U100: 100,
  U40: 40,
};

/** Volume represented by a single mark on a given scale, in millilitres. */
export function mlPerUnit(scale: SyringeScale) {
  return 1 / UNITS_PER_ML[scale];
}

export interface SyringeSpec {
  id: string;
  scale: SyringeScale;
  /** Barrel capacity in millilitres. */
  capacityMl: number;
  /**
   * Spacing of the smallest printed mark, expressed in the barrel's OWN
   * units. Graduation is a property of the specific product, not of the
   * capacity, 1 mL barrels commonly carry 2-unit marks while some 0.3 mL
   * barrels carry half-unit marks, so it is stated, never inferred.
   */
  graduationUnits: number;
  label: string;
  note?: string;
}

/** Barrel capacity expressed in the scale's own units. */
export function capacityUnits(spec: SyringeSpec) {
  return spec.capacityMl * UNITS_PER_ML[spec.scale];
}

/** Volume of one printed mark, in millilitres. */
export function graduationMl(spec: SyringeSpec) {
  return spec.graduationUnits * mlPerUnit(spec.scale);
}

/**
 * Syringes people actually buy. Capacities are standard; graduations are the
 * common case for each and remain user-overridable.
 *
 * Note the absence of a 0.4 mL U-100 barrel: it is not a commercial product.
 * Someone asking for a "40 unit syringe" is most likely holding a 1 mL U-40
 * veterinary barrel, which is numbered 0-40.
 */
export const SYRINGES: SyringeSpec[] = [
  {
    id: "u100-0.3-half",
    scale: "U100",
    capacityMl: 0.3,
    graduationUnits: 0.5,
    label: "0.3 mL U-100, half-unit marks",
    note: "Finest resolution available. Best for doses under 15 units.",
  },
  {
    id: "u100-0.3",
    scale: "U100",
    capacityMl: 0.3,
    graduationUnits: 1,
    label: "0.3 mL U-100, 1-unit marks",
  },
  {
    id: "u100-0.5",
    scale: "U100",
    capacityMl: 0.5,
    graduationUnits: 1,
    label: "0.5 mL U-100, 1-unit marks",
    note: "The usual choice for peptide volumes.",
  },
  {
    id: "u100-1.0",
    scale: "U100",
    capacityMl: 1.0,
    graduationUnits: 2,
    label: "1 mL U-100, 2-unit marks",
    note: "Most 1 mL barrels step in 2 units. Check yours before trusting odd numbers.",
  },
  {
    id: "u100-1.0-fine",
    scale: "U100",
    capacityMl: 1.0,
    graduationUnits: 1,
    label: "1 mL U-100, 1-unit marks",
  },
  {
    id: "u40-1.0",
    scale: "U40",
    capacityMl: 1.0,
    graduationUnits: 1,
    label: "1 mL U-40, 1-unit marks",
    note: "Veterinary scale, numbered 0-40. One mark is 0.025 mL, not 0.01 mL.",
  },
  {
    id: "u40-0.5",
    scale: "U40",
    capacityMl: 0.5,
    graduationUnits: 1,
    label: "0.5 mL U-40, 1-unit marks",
    note: "Veterinary scale. One mark is 0.025 mL.",
  },
];

export function syringeById(id: string) {
  return SYRINGES.find((s) => s.id === id);
}

export const MCG_PER_MG = 1000;
export const mgToMcg = (mg: number) => mg * MCG_PER_MG;
export const mcgToMg = (mcg: number) => mcg / MCG_PER_MG;

/**
 * Draws below this many marks are not worth trusting: reading error and the
 * syringe's dead space start to rival the dose itself.
 */
export const MIN_RELIABLE_UNITS = 5;

/**
 * Concentration of the reconstituted vial, in mcg/mL.
 *
 * Lyophilised peptide displaces roughly 0.7 microlitres per milligram of
 * solid, so a 10 mg vial shifts a 2 mL reconstitution by about 0.35%, an
 * order of magnitude below the finest graduation on any barrel. Displacement
 * is therefore ignored and the diluent volume is taken as the final volume.
 */
export function concentration(vialMcg: number, diluentMl: number) {
  if (!(vialMcg > 0) || !(diluentMl > 0)) return NaN;
  return vialMcg / diluentMl;
}

/** Volume of solution that carries the requested dose. */
export function doseVolumeMl(doseMcg: number, concentrationMcgPerMl: number) {
  if (!(doseMcg > 0) || !(concentrationMcgPerMl > 0)) return NaN;
  return doseMcg / concentrationMcgPerMl;
}

/** Convert a volume to the number it reads as on a given barrel scale. */
export function mlToUnits(ml: number, scale: SyringeScale) {
  return ml * UNITS_PER_ML[scale];
}

/** Convert a reading on a given barrel scale back to a volume. */
export function unitsToMl(units: number, scale: SyringeScale) {
  return units / UNITS_PER_ML[scale];
}

/**
 * The same liquid volume as it reads on two different barrel scales.
 * A U-100 barrel reads 2.5x the number a U-40 barrel reads for one volume.
 */
export function convertBetweenScales(units: number, from: SyringeScale, to: SyringeScale) {
  return unitsToMl(units, from) * UNITS_PER_ML[to];
}

/**
 * Mass delivered by a single printed mark on the barrel.
 *
 * Per mark, not per unit, and the two are different on any barrel graduated
 * more coarsely than 1: a 1 mL U-100 syringe usually steps in 2 units, so one
 * mark is 0.02 mL and carries twice what one unit does. Named for the
 * graduation because a function called `mcgPerUnit` that returned this was read
 * as per-unit and the mistake is a clean factor of two.
 */
export function mcgPerGraduation(concentrationMcgPerMl: number, spec: SyringeSpec) {
  return concentrationMcgPerMl * graduationMl(spec);
}

/**
 * Mass in one barrel unit, which is what the numbers printed on the barrel
 * count, independent of how far apart the marks are.
 */
export function mcgPerUnitOfScale(concentrationMcgPerMl: number, scale: SyringeScale) {
  return concentrationMcgPerMl * mlPerUnit(scale);
}

export type DrawWarning =
  | "exceeds-barrel"
  | "below-graduation"
  | "off-graduation"
  | "low-volume"
  | "exceeds-vial";

export interface DrawResult {
  concentrationMcgPerMl: number;
  concentrationMgPerMl: number;
  /** Exact volume to draw. This is the primary answer. */
  volumeMl: number;
  /** Exact reading on the chosen barrel, before rounding to a mark. */
  units: number;
  /** Nearest printed mark. */
  unitsRounded: number;
  /** Volume actually drawn once settled on a printed mark. */
  volumeRoundedMl: number;
  /** Dose actually delivered at that mark. */
  deliveredMcg: number;
  /** Delivered minus requested. Negative means under-dosed. */
  roundingErrorMcg: number;
  /** Rounding error as a share of the requested dose. */
  roundingErrorPercent: number;
  /** Volume one mark represents on this barrel. */
  mlPerUnit: number;
  /** Mass one printed mark represents at this concentration. */
  mcgPerGraduation: number;
  /** Whole doses obtainable from the vial. */
  dosesPerVial: number;
  warnings: DrawWarning[];
  /** True when the draw can be measured at all. */
  measurable: boolean;
}

export interface DrawInput {
  vialMcg: number;
  diluentMl: number;
  doseMcg: number;
  /** Required. There is no safe default between U-100 and U-40. */
  syringe: SyringeSpec;
}

export function calculateDraw({ vialMcg, diluentMl, doseMcg, syringe }: DrawInput): DrawResult {
  const concentrationMcgPerMl = concentration(vialMcg, diluentMl);
  const volumeMl = doseVolumeMl(doseMcg, concentrationMcgPerMl);
  const units = mlToUnits(volumeMl, syringe.scale);

  const gradMl = graduationMl(syringe);
  const volumeRoundedMl = Math.round(volumeMl / gradMl) * gradMl;
  const unitsRounded = mlToUnits(volumeRoundedMl, syringe.scale);
  const deliveredMcg = volumeRoundedMl * concentrationMcgPerMl;

  const warnings: DrawWarning[] = [];
  if (volumeMl > syringe.capacityMl + 1e-9) warnings.push("exceeds-barrel");
  if (volumeMl > 0 && volumeMl < gradMl - 1e-12) warnings.push("below-graduation");
  else if (Math.abs(volumeMl - volumeRoundedMl) > 1e-9) warnings.push("off-graduation");
  if (units > 0 && units < MIN_RELIABLE_UNITS) warnings.push("low-volume");
  if (volumeMl > diluentMl + 1e-9) warnings.push("exceeds-vial");

  return {
    concentrationMcgPerMl,
    concentrationMgPerMl: concentrationMcgPerMl / MCG_PER_MG,
    volumeMl,
    units,
    unitsRounded,
    volumeRoundedMl,
    deliveredMcg,
    roundingErrorMcg: deliveredMcg - doseMcg,
    roundingErrorPercent: doseMcg > 0 ? ((deliveredMcg - doseMcg) / doseMcg) * 100 : 0,
    mlPerUnit: mlPerUnit(syringe.scale),
    mcgPerGraduation: mcgPerGraduation(concentrationMcgPerMl, syringe),
    dosesPerVial: Math.floor(vialMcg / doseMcg),
    warnings,
    measurable:
      Number.isFinite(volumeMl) &&
      !warnings.includes("exceeds-barrel") &&
      !warnings.includes("below-graduation"),
  };
}

/**
 * Mass sitting in a given number of barrel marks.
 *
 * The inverse of the usual dose-to-units direction, so a reading taken off a
 * syringe can be turned back into a dose. Which scale the barrel is printed in
 * changes the answer by 2.5x, so it is required rather than assumed.
 */
export function doseFromUnits(
  units: number,
  concentrationMcgPerMl: number,
  scale: SyringeScale) {
  if (!(units > 0) || !(concentrationMcgPerMl > 0)) return 0;
  return unitsToMl(units, scale) * concentrationMcgPerMl;
}

/** Marks a given mass occupies on the barrel. The forward direction. */
export function unitsFromDose(
  doseMcg: number,
  concentrationMcgPerMl: number,
  scale: SyringeScale) {
  if (!(doseMcg > 0) || !(concentrationMcgPerMl > 0)) return 0;
  return mlToUnits(doseVolumeMl(doseMcg, concentrationMcgPerMl), scale);
}

/**
 * Diluent volume that makes a dose land on a chosen barrel reading.
 *
 * From units = doseMcg x unitsPerMl x diluentMl / vialMcg, solved for diluent.
 */
export function diluentForTargetUnits(
  vialMcg: number,
  doseMcg: number,
  targetUnits: number,
  scale: SyringeScale) {
  if (!(vialMcg > 0) || !(doseMcg > 0) || !(targetUnits > 0)) return NaN;
  return (targetUnits * vialMcg) / (UNITS_PER_ML[scale] * doseMcg);
}

/** Diluent volume that makes one mark represent a round mass. */
export function diluentForMcgPerUnit(vialMcg: number, targetMcgPerUnit: number, spec: SyringeSpec) {
  if (!(vialMcg > 0) || !(targetMcgPerUnit > 0)) return NaN;
  return (vialMcg * graduationMl(spec)) / targetMcgPerUnit;
}

export interface DiluentSuggestion {
  diluentMl: number;
  units: number;
  volumeMl: number;
  concentrationMgPerMl: number;
  mcgPerGraduation: number;
  /** The draw falls exactly on a printed mark. */
  landsOnMark: boolean;
  score: number;
}

/**
 * Reconstitution volumes worth offering for a given vial and dose.
 *
 * Ranked by how cleanly the dose reads: a draw that lands exactly on a printed
 * mark, sits well above the reliable minimum, and fits the barrel can be
 * repeated accurately. One that falls between marks cannot.
 */
export function suggestDiluents(
  vialMcg: number,
  doseMcg: number,
  syringe: SyringeSpec,
  candidates: number[] = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5]): DiluentSuggestion[] {
  if (!(vialMcg > 0) || !(doseMcg > 0)) return [];
  const gradMl = graduationMl(syringe);

  return candidates
    .map((diluentMl) => {
      const conc = concentration(vialMcg, diluentMl);
      const volumeMl = doseVolumeMl(doseMcg, conc);
      const units = mlToUnits(volumeMl, syringe.scale);
      const marks = volumeMl / gradMl;
      const landsOnMark = Math.abs(marks - Math.round(marks)) < 1e-9;
      const fill = volumeMl / syringe.capacityMl;

      let score = 0;
      if (landsOnMark) score += 5;
      if (units >= MIN_RELIABLE_UNITS) score += 3;
      else score -= 4;
      if (fill >= 0.15 && fill <= 0.85) score += 2;
      if (volumeMl > syringe.capacityMl) score -= 20;

      return {
        diluentMl,
        units,
        volumeMl,
        concentrationMgPerMl: conc / MCG_PER_MG,
        mcgPerGraduation: mcgPerGraduation(conc, syringe),
        landsOnMark,
        score,
      };
    })
    .filter((c) => c.volumeMl <= syringe.capacityMl + 1e-9)
    .sort((a, b) => b.score - a.score || a.diluentMl - b.diluentMl);
}

/** Solution left in a vial after some volume has been drawn out. */
export function remainingInVial(vialMcg: number, diluentMl: number, drawnMl: number) {
  const conc = concentration(vialMcg, diluentMl);
  const remainingMl = Math.max(0, diluentMl - drawnMl);
  return {
    remainingMl,
    remainingMcg: Number.isFinite(conc) ? remainingMl * conc : 0,
    fractionRemaining: diluentMl > 0 ? remainingMl / diluentMl : 0,
  };
}

/**
 * Beyond-use date for a punctured multi-dose vial.
 *
 * The 28-day figure is the CDC and USP <797> limit on how long a multi-dose
 * container may be used after first puncture. It is an infection-control rule
 * about the container, NOT a statement that the peptide inside is still
 * potent, chemical stability is compound-specific and separately sourced.
 */
export const MULTI_DOSE_VIAL_BUD_DAYS = 28;

export function beyondUseDate(firstPunctureMs: number, days = MULTI_DOSE_VIAL_BUD_DAYS) {
  return firstPunctureMs + days * 86_400_000;
}
