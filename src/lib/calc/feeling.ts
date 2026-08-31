import type { Tone } from "@/components/ui";

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
