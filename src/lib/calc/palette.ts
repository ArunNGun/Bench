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
  let next = 0;

  const take = () => SERIES_COLORS[next++ % SERIES_COLORS.length];

  for (const subject of subjects) {
    const keys = subject.componentKeys?.length
      ? subject.componentKeys.map((c) => `${subject.protocolId}:${c}`)
      : [subject.protocolId];

    for (const key of keys) {
      const color = take();
      byKey.set(key, color);
      if (!byProtocol.has(subject.protocolId)) byProtocol.set(subject.protocolId, color);
    }
  }

  return { byKey, byProtocol };
}
