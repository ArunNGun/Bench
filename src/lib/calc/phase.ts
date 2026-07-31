/**
 * What a compound is doing right now, in words.
 *
 * The library already carries a per-compound timeline, absorbing, peaking,
 * trailing off, written against hours since the dose. This turns "you injected
 * 14 hours ago" into the sentence that actually answers "how should I be
 * feeling", which a percentage on a chart does not.
 */

import type { Peptide } from "../types";

export interface Phase {
  fromHours: number;
  toHours: number;
  label: string;
  /** How far through this window you are, 0 to 1. */
  progress: number;
  /** Hours until the next window begins. Null on the final one. */
  hoursToNext: number | null;
}

/**
 * The timeline window covering a given number of hours since the last dose.
 *
 * Returns null before the dose, when the compound has no timeline, or once
 * past the end of it, saying nothing is better than stretching the last
 * window indefinitely.
 */
export function timelinePhaseAt(peptide: Peptide, hoursSinceDose: number): Phase | null {
  const timeline = peptide.timeline;
  if (!timeline?.length || hoursSinceDose < 0) return null;

  for (let i = 0; i < timeline.length; i++) {
    const w = timeline[i];
    const isLast = i === timeline.length - 1;
    const inWindow = hoursSinceDose >= w.fromHours && hoursSinceDose < w.toHours;

    if (inWindow) {
      const span = w.toHours - w.fromHours;
      return {
        ...w,
        progress: span > 0 ? (hoursSinceDose - w.fromHours) / span : 1,
        hoursToNext: isLast ? null : w.toHours - hoursSinceDose,
      };
    }
  }

  return null;
}

/** Every window, flagged with which one is current. */
export function timelineWithCurrent(peptide: Peptide, hoursSinceDose: number | null) {
  const timeline = peptide.timeline ?? [];
  return timeline.map((w) => ({
    ...w,
    current:
      hoursSinceDose != null && hoursSinceDose >= w.fromHours && hoursSinceDose < w.toHours,
    past: hoursSinceDose != null && hoursSinceDose >= w.toHours,
  }));
}

/** Hours since a dose, or null when nothing has been logged. */
export function hoursSince(lastDoseAt: number | null, nowMs: number): number | null {
  if (lastDoseAt == null) return null;
  return Math.max(0, (nowMs - lastDoseAt) / 3_600_000);
}
