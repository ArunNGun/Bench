/**
 * One colour per thing, agreed across every screen that shows it.
 *
 * The chart already coloured its lines, and it did so by position in the list
 * of series it happened to build: blends expand into one line per component,
 * and a compound with no half-life produces no line at all. Any other screen
 * that counted through the same protocols would therefore drift, and the first
 * blend or the first unplottable compound would be enough to make one compound
 * mint in one place and grape in another.
 *
 * So the assignment moves here and both screens ask the same function. A colour
 * still belongs to a position rather than to a compound, which means adding a
 * protocol can shift them, but it shifts them everywhere at once, which is the
 * property that was missing.
 */

import { decomposeDose, isBlend, modellableComponents } from "./blend";
import { protocolDosesPerWeek, scheduledDoseMcg } from "./schedule";
import type { Peptide, Protocol } from "../types";

/** Chosen to stay apart on a dark background, and to survive a colour blind eye. */
export const SERIES_COLORS = [
  "var(--mint)",
  "var(--grape)",
  "var(--tangerine)",
  "var(--sky)",
  "var(--rose)",
  "var(--leaf)",
];

export interface ColorSubject {
  protocolId: string;
  /**
   * The compound the protocol runs. The colour still belongs to the protocol,
   * this is carried so that a screen holding a dose rather than a plan has a
   * way back to it.
   */
  peptideId?: string;
  /**
   * The parts a blend is drawn as, if any. Empty for an ordinary compound, and
   * empty for a blend whose components have no half-life between them, which is
   * why it cannot be inferred from the peptide alone.
   */
  componentKeys?: string[];
}

export interface Palette {
  /** Colour for a chart line: a protocol id, or `${protocolId}:${component}`. */
  byKey: Map<string, string>;
  /**
   * Colour for a protocol as a whole, used anywhere a plan is listed rather
   * than plotted. For a blend this is its first component's colour, so the row
   * matches a line that is actually on the chart rather than a seventh colour
   * belonging to nothing.
   */
  byProtocol: Map<string, string>;
  /**
   * Colour for a compound, for a screen that has a dose in hand rather than a
   * protocol.
   *
   * Only holds compounds that exactly one active protocol runs. Two protocols
   * on the same compound are two colours on purpose, and there is no way to
   * tell which of them an untagged dose belonged to, so the honest answer is
   * to leave it uncoloured rather than pick one and be right half the time.
   */
  byPeptide: Map<string, string>;
}

/**
 * Hand out colours in list order.
 *
 * Every active protocol gets one whether or not it can be drawn. Reserving a
 * colour for a compound with no half-life costs a palette entry that the chart
 * will not use, and buys the guarantee that the plan and the chart cannot
 * disagree about the compounds they do share.
 */
export function assignColors(subjects: ColorSubject[]): Palette {
  const byKey = new Map<string, string>();
  const byProtocol = new Map<string, string>();
  const byPeptide = new Map<string, string>();
  let next = 0;

  const take = () => SERIES_COLORS[next++ % SERIES_COLORS.length];

  const runners = new Map<string, number>();
  for (const s of subjects) {
    if (s.peptideId) runners.set(s.peptideId, (runners.get(s.peptideId) ?? 0) + 1);
  }

  for (const subject of subjects) {
    const keys = subject.componentKeys?.length
      ? subject.componentKeys.map((c) => `${subject.protocolId}:${c}`)
      : [subject.protocolId];

    for (const key of keys) {
      const color = take();
      byKey.set(key, color);
      if (!byProtocol.has(subject.protocolId)) {
        byProtocol.set(subject.protocolId, color);
        if (subject.peptideId && runners.get(subject.peptideId) === 1) {
          byPeptide.set(subject.peptideId, color);
        }
      }
    }
  }

  return { byKey, byProtocol, byPeptide };
}

/**
 * The colours the app is running today, built the same way wherever it is asked.
 *
 * Three screens now want them, and the assignment depends on how many lines a
 * blend expands into, so three copies of that expansion would be three chances
 * to expand it slightly differently. The dose passed to `decomposeDose` does
 * not change which components are modellable, so the answer here is stable even
 * though it is built from a scheduled amount.
 */
export function colorSubjects(
  protocols: Protocol[],
  resolve: (id: string) => Peptide | undefined,
  nowMs: number): ColorSubject[] {
  return protocols.map((p) => {
    const peptide = resolve(p.peptideId);
    const parts = peptide && isBlend(peptide)
      ? decomposeDose(peptide, scheduledDoseMcg(p, nowMs), resolve, protocolDosesPerWeek(p, nowMs))
      : [];

    return {
      protocolId: p.id,
      peptideId: p.peptideId,
      componentKeys: modellableComponents(parts).map((c) => c.peptideId ?? c.name),
    };
  });
}

/**
 * The colour for one dose that has already been taken.
 *
 * A log carries the protocol it was logged against, when it was logged against
 * one, so that question is asked first and its answer is exact. A dose taken
 * outside any plan, or against a protocol since deleted, falls back to the
 * compound, which is unambiguous exactly when one protocol runs it.
 *
 * No colour is a real answer here, and a common one: the Log reaches back past
 * everything currently running, and a compound finished last spring reads
 * better plain than wearing a colour that now belongs to something else.
 */
export function doseColor(
  palette: Palette,
  dose: { protocolId?: string; peptideId: string }): string | undefined {
  const byProtocol = dose.protocolId ? palette.byProtocol.get(dose.protocolId) : undefined;
  return byProtocol ?? palette.byPeptide.get(dose.peptideId);
}
