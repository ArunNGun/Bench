import type { Peptide } from "../../types";
import { METABOLIC } from "./metabolic";
import { REPAIR } from "./repair";
import { GROWTH } from "./growth";
import { ANABOLIC } from "./anabolic";
import { ANCILLARY } from "./ancillary";

/**
 * The built-in reference library.
 *
 * Sources were prioritised in this order: FDA prescribing labels, published
 * trial protocols and peer-reviewed papers, then clinical trial registries.
 * Community practice is included where it is what people actually do, but it
 * is always tagged as such, never presented alongside trial data as if the
 * two carried equal weight.
 */
export const PEPTIDES: Peptide[] = [...METABOLIC, ...REPAIR, ...GROWTH, ...ANABOLIC, ...ANCILLARY].sort((a, b) =>
  a.name.localeCompare(b.name));

export const PEPTIDE_BY_ID = new Map(PEPTIDES.map((p) => [p.id, p]));

export { METABOLIC, REPAIR, GROWTH, ANABOLIC, ANCILLARY };
