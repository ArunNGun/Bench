import type { Tone } from "@/components/ui";
import { SYMPTOM_SCALE_MAX } from "../types";

/**
 * Rough reads red, great reads green.
 *
 * Lives here rather than in the log sheet because three screens now render a
 * feeling: the sheet where it is entered, the log where it is read back, and
 * the report a clinician sees. Three copies of the same mapping would drift,
 * and a rating that is amber in one place and green in another is worse than
 * one with no colour at all.
 */
export const FEELING_TONE: Record<number, Tone> = {
  1: "rose",
  2: "tangerine",
  3: "sky",
  4: "mint",
  5: "leaf",
};

/**
 * The same colours for a daily rating, where the direction is known.
 *
 * Check-in ratings run on the same one to five scale as a feeling and now sit
 * on the same page, so they take the same mapping. A second scale for the same
 * numbers, a few pixels apart, is the drift this file was written to prevent.
 *
 * Appetite is the exception and it is deliberate. `SYMPTOMS` marks five of six
 * with `higherIsBetter` and leaves appetite unmarked, because five is not good
 * and one is not bad, it is simply a figure. Colouring it would have the app
 * assert a direction the library declines to assert, so it stays neutral and
 * says only the number.
 */
export function ratingTone(rating: number, higherIsBetter?: boolean): Tone {
  if (higherIsBetter == null) return "neutral";
  return FEELING_TONE[scoreOf(rating, higherIsBetter)] ?? "neutral";
}

/**
 * The rating turned so that five is always the good end.
 *
 * Colours are keyed to a score, not to a number typed by a person, and until
 * food noise arrived those were the same thing. They are not: a five there is a
 * day spent thinking about food. Flipping here rather than in the colour table
 * keeps one mapping from score to colour and puts the only place that knows
 * which way an axis runs next to the flag that says so.
 *
 * `!higherIsBetter` used to stand in for "no direction", which quietly made
 * `false` and absent the same answer. They are not the same answer either.
 */
export function scoreOf(rating: number, higherIsBetter: boolean): number {
  return higherIsBetter ? rating : SYMPTOM_SCALE_MAX + 1 - rating;
}

/**
 * The worst thing about a day, for a glance down a month of them.
 *
 * "Which night was it" is the question the Log is asked, and reading thirty
 * rows to answer it is the thing worth removing. The lowest rating that has a
 * direction is what a bad day is remembered by, so that is what the row is
 * marked with. A day rated only on appetite has no worst, and gets no mark
 * rather than a made-up one.
 */
export function lowestRatedTone(
  ratings: { rating: number; higherIsBetter?: boolean }[]): Tone | null {
  /*
   * Compared as scores rather than as the numbers on screen.
   *
   * "Lowest" was the worst while every directional axis ran the same way. Food
   * noise runs the other way, so its worst day is a five, and taking the lowest
   * number would have marked a day spent entirely preoccupied with food as the
   * best thing about it. Turning each rating to a score first makes one
   * comparison correct for both directions.
   */
  const scored = ratings
    .filter((r) => r.higherIsBetter != null)
    .map((r) => scoreOf(r.rating, r.higherIsBetter!));
  if (!scored.length) return null;

  return FEELING_TONE[Math.min(...scored)] ?? null;
}
