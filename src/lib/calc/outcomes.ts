/**
 * Outcomes: whether any of this is doing anything, and how it feels.
 *
 * The rest of the app records inputs, doses, volumes, sites, stock. This is
 * the other side of the ledger. Weight against the dose staircase answers "is
 * it working"; side effects against the titration step answers "can I tolerate
 * going up", which is the actual decision during an escalation.
 */

import type { DoseLog, Measurement, TitrationStep } from "../types";
import { titrationStepAt } from "./schedule";

export const KG_PER_LB = 0.45359237;
export const lbToKg = (lb: number) => lb * KG_PER_LB;
export const kgToLb = (kg: number) => kg / KG_PER_LB;

export interface WeightPoint {
  at: number;
  kg: number;
}

/** Weight entries with a value, oldest first. */
export function weightSeries(measurements: Measurement[]): WeightPoint[] {
  return measurements
    .filter((m) => m.weightKg != null && m.weightKg > 0)
    .map((m) => ({ at: m.at, kg: m.weightKg! }))
    .sort((a, b) => a.at - b.at);
}

export interface WeightChange {
  first: WeightPoint;
  latest: WeightPoint;
  /** Negative means loss. */
  deltaKg: number;
  deltaPercent: number;
  days: number;
  /** Average change per week over the span. */
  perWeekKg: number | null;
}

/**
 * Change between the earliest and latest weight in a window.
 * Returns null with fewer than two readings, one point is not a trend.
 */
export function weightChange(
  measurements: Measurement[],
  sinceMs?: number): WeightChange | null {
  const all = weightSeries(measurements);
  const series = sinceMs != null ? all.filter((p) => p.at >= sinceMs) : all;
  if (series.length < 2) return null;

  const first = series[0];
  const latest = series[series.length - 1];
  const deltaKg = latest.kg - first.kg;
  const days = (latest.at - first.at) / 86_400_000;

  return {
    first,
    latest,
    deltaKg,
    deltaPercent: first.kg > 0 ? (deltaKg / first.kg) * 100 : 0,
    days,
    perWeekKg: days >= 1 ? (deltaKg / days) * 7 : null,
  };
}

/** The most recent weight on record. */
export function latestWeightKg(measurements: Measurement[]): number | null {
  const s = weightSeries(measurements);
  return s.length ? s[s.length - 1].kg : null;
}

// ---------------------------------------------------------------------------
// How it felt
// ---------------------------------------------------------------------------

export interface SideEffectCount {
  effect: string;
  count: number;
  /** Share of the doses in scope that reported it. */
  rate: number;
}

/** Side effects across a set of doses, most frequent first. */
export function sideEffectTally(
  logs: Pick<DoseLog, "sideEffects" | "skipped">[]): { total: number; effects: SideEffectCount[] } {
  const dosed = logs.filter((l) => !l.skipped);
  const counts = new Map<string, number>();

  for (const l of dosed) {
    for (const e of l.sideEffects ?? []) {
      counts.set(e, (counts.get(e) ?? 0) + 1);
    }
  }

  return {
    total: dosed.length,
    effects: [...counts.entries()]
      .map(([effect, count]) => ({
        effect,
        count,
        rate: dosed.length ? count / dosed.length : 0,
      }))
      .sort((a, b) => b.count - a.count || a.effect.localeCompare(b.effect)),
  };
}

/** Mean of the 1-5 ratings that were actually filled in. */
export function averageFeeling(logs: Pick<DoseLog, "feeling" | "skipped">[]): number | null {
  const rated = logs.filter((l) => !l.skipped && typeof l.feeling === "number");
  if (!rated.length) return null;
  return rated.reduce((s, l) => s + l.feeling!, 0) / rated.length;
}

export interface StepTolerance {
  stepIndex: number;
  doseMcg: number;
  doses: number;
  averageFeeling: number | null;
  /** Share of doses at this step that reported any side effect. */
  sideEffectRate: number;
  topEffects: SideEffectCount[];
}

/**
 * How each titration step went.
 *
 * This is the comparison that matters when deciding whether to step up: did
 * 8 mg actually feel worse than 4 mg, or does it only feel that way in memory.
 */
export function toleranceByStep(
  logs: Pick<DoseLog, "at" | "feeling" | "sideEffects" | "skipped">[],
  titration: TitrationStep[],
  startedAt: number): StepTolerance[] {
  if (!titration.length) return [];

  const buckets = new Map<number, typeof logs>();
  for (const l of logs) {
    if (l.skipped) continue;
    const step = titrationStepAt(titration, startedAt, l.at);
    if (!step) continue;
    if (!buckets.has(step.index)) buckets.set(step.index, []);
    buckets.get(step.index)!.push(l);
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([stepIndex, rows]) => {
      const tally = sideEffectTally(rows);
      const withEffects = rows.filter((r) => (r.sideEffects?.length ?? 0) > 0).length;
      return {
        stepIndex,
        doseMcg: titration[stepIndex].doseMcg,
        doses: rows.length,
        averageFeeling: averageFeeling(rows),
        sideEffectRate: rows.length ? withEffects / rows.length : 0,
        topEffects: tally.effects.slice(0, 3),
      };
    });
}
