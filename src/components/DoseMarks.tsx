"use client";

/**
 * How far to draw the plunger, next to the dose it belongs to.
 *
 * Micrograms are the unit the app thinks in and the wrong one to be holding a
 * syringe over. This says the same dose in the marks on the barrel, from the
 * vial that dose would actually come out of and the syringe you told the app
 * you use.
 *
 * It renders nothing at all when there is no reconstituted vial to measure
 * against. A dose has a mass whatever is on the shelf, but marks are a property
 * of a concentration, and inventing one to fill a gap in the layout would put a
 * number in front of someone that no vial supports.
 */

import { marksForDose, pickVialForDose } from "@/lib/calc/inventory";
import { mcgPerSpray, mlForSprays, spraysForDose } from "@/lib/calc/spray";
import { SYRINGES, syringeById, unitsToMl } from "@/lib/calc/reconstitution";
import { useStore, useProfileData } from "@/lib/store";
import { formatDose, trim } from "@/lib/format";
import type { Route } from "@/lib/types";

/** The scale of the syringe in Settings, falling back the way the log sheet does. */
export function useSyringeScale() {
  const settings = useStore((s) => s.settings);
  return (syringeById(settings.defaultSyringeId ?? "") ?? SYRINGES[2]).scale;
}

export function DoseMarks({
  peptideId,
  doseMcg,
  nowMs,
  route,
  className = "text-[var(--faint)]",
}: {
  peptideId: string;
  doseMcg: number;
  nowMs: number;
  /** How the dose is taken. Absent means an injection, which is nearly all of them. */
  route?: Route;
  className?: string;
}) {
  const { vials } = useProfileData();
  const scale = useSyringeScale();

  /*
   * A nasal dose reads in presses, everywhere a syringe dose reads in marks.
   *
   * Asked for by name: "when viewing the administration schedule, I simply want
   * to see how many pumps I need to use in the morning. I should not have to
   * manually calculate the number of pumps based on the volume of liquid."
   * Micrograms are the unit the app thinks in and the wrong one to be holding a
   * pump over, which is the same argument that put marks here in the first
   * place.
   */
  if (route === "intranasal") {
    const bottle = pickVialForDose(vials, peptideId, doseMcg, nowMs, "spray");
    if (!bottle || mcgPerSpray(bottle) <= 0) return null;

    const presses = spraysForDose(bottle, doseMcg);
    return (
      <span
        className={`tnum font-mono ${className}`}
        title={`${trim(mlForSprays(bottle, presses), 2)} mL in total, ${formatDose(
          mcgPerSpray(bottle))} a press`}
      >
        {presses} press{presses === 1 ? "" : "es"}
      </span>
    );
  }

  const marks = marksForDose(vials, peptideId, doseMcg, scale, nowMs);
  if (marks == null) return null;

  return (
    /*
      One word on screen, the rest on hover. "Marks" is the word the
      calculator, the log and the about page already use, and millilitres are
      the reading that cannot be mistaken for anything else: IU means activity
      elsewhere in the app, so it is the one abbreviation these graduations
      must not borrow.
    */
    <span
      className={`tnum font-mono ${className}`}
      title={`${trim(marks, 2)} marks on a ${
        scale === "U40" ? "U-40" : "U-100"
      } barrel, ${trim(unitsToMl(marks, scale), 3)} mL`}
    >
      {trim(marks, 2)} marks{scale === "U40" ? " (U-40)" : ""}
    </span>
  );
}
