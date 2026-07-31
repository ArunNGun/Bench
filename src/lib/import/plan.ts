/**
 * Turning canonical records into an import you can inspect before committing.
 *
 * Nothing here writes anything. It produces a plan, what would be added, what
 * would be skipped as already present, and what could not be read, so the screen
 * can show it and the user decides. Importing a year of someone's dose history
 * blind, into the same store that holds their real data, is not something to do on
 * a single tap.
 *
 * Duplicates are the main hazard. Re-importing the same export after adding a few
 * more doses is the normal way this feature gets used, and it has to be safe.
 */

import type { DoseLog, Measurement, Peptide } from "../types";
import type { CanonicalRecord, RowProblem } from "./profiles";
import { resolvePeptide } from "./profiles";

/**
 * How close two records must be in time to count as the same event.
 *
 * A minute, not zero: a file that stores only the date lands at midnight while an
 * existing log has a real clock time, and one that stores seconds will not match a
 * stored value rounded to the minute. Two genuine doses of the same compound
 * within a minute of each other do not happen.
 */
export const DOSE_MATCH_MS = 60_000;

/**
 * Weights get a wider window. A scale reading imported as a bare date sits at
 * midnight, and the same reading pulled from Health Connect carries the real time,
 * so same-day is the only workable comparison.
 */
export const WEIGHT_MATCH_MS = 12 * 60 * 60_000;
export const WEIGHT_MATCH_KG = 0.05;

export interface PlannedDose {
  at: number;
  peptideId: string;
  peptideName: string;
  doseMcg: number;
  site?: DoseLog["site"];
  notes?: string;
  sourceRow: number;
}

export interface PlannedWeight {
  at: number;
  weightKg: number;
  sourceRow: number;
}

export interface ImportPlan {
  doses: PlannedDose[];
  weights: PlannedWeight[];
  /** Rows that duplicate something already stored. */
  duplicateDoses: number;
  duplicateWeights: number;
  /** Rows that could not be turned into anything usable, and why. */
  problems: RowProblem[];
  /** Compound names in the file that no library entry matched. */
  unresolved: { label: string; rows: number[] }[];
}

export interface PlanInput {
  records: CanonicalRecord[];
  problems: RowProblem[];
  peptides: Peptide[];
  existingLogs: Pick<DoseLog, "at" | "peptideId">[];
  existingMeasurements: Pick<Measurement, "at" | "weightKg">[];
}

export function buildImportPlan({
  records,
  problems,
  peptides,
  existingLogs,
  existingMeasurements,
}: PlanInput): ImportPlan {
  const doses: PlannedDose[] = [];
  const weights: PlannedWeight[] = [];
  const allProblems: RowProblem[] = [...problems];
  const unresolved = new Map<string, number[]>();

  let duplicateDoses = 0;
  let duplicateWeights = 0;

  const doseExists = (at: number, peptideId: string) =>
    existingLogs.some((l) => l.peptideId === peptideId && Math.abs(l.at - at) <= DOSE_MATCH_MS) ||
    // Also check what this same import has already accepted, so a file listing a
    // dose twice does not produce two.
    doses.some((d) => d.peptideId === peptideId && Math.abs(d.at - at) <= DOSE_MATCH_MS);

  const weightExists = (at: number, kg: number) =>
    existingMeasurements.some(
      (m) =>
        m.weightKg != null &&
        Math.abs(m.at - at) <= WEIGHT_MATCH_MS &&
        Math.abs(m.weightKg - kg) <= WEIGHT_MATCH_KG) ||
    weights.some(
      (w) => Math.abs(w.at - at) <= WEIGHT_MATCH_MS && Math.abs(w.weightKg - kg) <= WEIGHT_MATCH_KG);

  for (const record of records) {
    if (record.kind === "weight") {
      if (weightExists(record.at, record.weightKg)) {
        duplicateWeights++;
        continue;
      }
      weights.push({ at: record.at, weightKg: record.weightKg, sourceRow: record.sourceRow });
      continue;
    }

    const peptide = resolvePeptide(record.label, peptides);
    if (!peptide) {
      const rows = unresolved.get(record.label) ?? [];
      rows.push(record.sourceRow);
      unresolved.set(record.label, rows);
      continue;
    }

    if (record.doseMcg == null || !(record.doseMcg > 0)) {
      allProblems.push({
        sourceRow: record.sourceRow,
        reason: `No readable dose for ${peptide.name}. A dose in mg or mcg is needed, syringe units cannot be converted without the vial's concentration.`,
      });
      continue;
    }

    if (doseExists(record.at, peptide.id)) {
      duplicateDoses++;
      continue;
    }

    doses.push({
      at: record.at,
      peptideId: peptide.id,
      peptideName: peptide.name,
      doseMcg: record.doseMcg,
      site: record.site,
      notes: record.notes,
      sourceRow: record.sourceRow,
    });
  }

  // Oldest first, so the history reads in order once imported.
  doses.sort((a, b) => a.at - b.at);
  weights.sort((a, b) => a.at - b.at);
  allProblems.sort((a, b) => a.sourceRow - b.sourceRow);

  return {
    doses,
    weights,
    duplicateDoses,
    duplicateWeights,
    problems: allProblems,
    unresolved: [...unresolved.entries()].map(([label, rows]) => ({ label, rows })),
  };
}

/** Whether there is anything at all to apply. */
export function planIsEmpty(plan: ImportPlan): boolean {
  return plan.doses.length === 0 && plan.weights.length === 0;
}

/** One-line summary for the confirm button and the result message. */
export function describePlan(plan: ImportPlan): string {
  const bits: string[] = [];
  if (plan.doses.length) bits.push(`${plan.doses.length} dose${plan.doses.length === 1 ? "" : "s"}`);
  if (plan.weights.length) {
    bits.push(`${plan.weights.length} weight${plan.weights.length === 1 ? "" : "s"}`);
  }
  if (!bits.length) return "Nothing new to import.";
  return bits.join(" and ");
}

/** The date range the plan covers, for the preview header. */
export function planSpan(plan: ImportPlan): { from: number; to: number } | null {
  const times = [...plan.doses, ...plan.weights].map((r) => r.at);
  if (!times.length) return null;
  return { from: Math.min(...times), to: Math.max(...times) };
}
