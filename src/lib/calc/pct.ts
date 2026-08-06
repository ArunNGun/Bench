/**
 * When suppressive compounds will have cleared, and what recovery looks like.
 *
 * The one number this exists to produce is the earliest date a recovery
 * protocol can sensibly start. Starting while an ester is still releasing means
 * the SERM is fighting exogenous androgen instead of restarting the axis, which
 * wastes the protocol and the weeks it takes.
 *
 * Two decisions worth knowing about.
 *
 * First, the app will refuse. Where a compound's half-life has never been
 * established in humans, which covers trenbolone, boldenone, Masteron and NPP,
 * there is no honest clearance date and none is offered. Every other tool in
 * this space prints a number anyway. A confidently wrong date here is worse
 * than no date, because it is acted on.
 *
 * Second, nothing here is a recommendation to run one. The templates are the
 * published protocols, reproduced so the timing can be checked against the
 * clearance maths, and every one of them is off-label. The app computes when
 * androgen will be gone; whether to take anything at that point is a
 * conversation with a doctor.
 */

import type { DoseLog, Peptide } from "../types";
import { fractionRemaining } from "./pk";

const HOUR = 3_600_000;
const DAY = 86_400_000;

/**
 * How much of a dose has to be gone before the axis is considered unopposed.
 *
 * Five half-lives leaves about 3%, the usual pharmacological definition of
 * cleared. It is a convention rather than a physiological threshold, and it is
 * stated in the output so nobody reads it as one.
 */
export const CLEARED_FRACTION = 0.03;

export interface SuppressiveCompound {
  peptideId: string;
  name: string;
  /** Last non-skipped dose of it. */
  lastDoseAt: number;
  halfLifeHours: number | null;
  /** Null when the half-life is unknown, so no date can be given. */
  clearedAt: number | null;
  /** Why a date could not be computed. */
  unknownReason?: string;
}

export interface PctPlan {
  /** Everything currently suppressing, newest last dose first. */
  compounds: SuppressiveCompound[];
  /**
   * The latest clearance across all of them, which is when recovery can start.
   * Null if any compound's half-life is unknown, because the true answer is
   * then at least this and possibly much later.
   */
  earliestStart: number | null;
  /** Set when at least one compound blocked the calculation. */
  blockedBy: string[];
  /** True once everything computable has cleared. */
  clear: boolean;
}

/**
 * Work out when the last suppressive dose will have gone.
 *
 * `logs` should be the profile's dose history. Skipped doses are ignored, since
 * nothing entered the body.
 */
export function pctPlan(
  logs: Pick<DoseLog, "peptideId" | "at" | "skipped">[],
  resolve: (peptideId: string) => Peptide | undefined,
  nowMs = Date.now(),
): PctPlan {
  const lastByCompound = new Map<string, number>();

  for (const log of logs) {
    if (log.skipped) continue;
    const peptide = resolve(log.peptideId);
    if (!peptide?.suppressesNaturalProduction) continue;
    const seen = lastByCompound.get(log.peptideId);
    if (seen == null || log.at > seen) lastByCompound.set(log.peptideId, log.at);
  }

  const compounds: SuppressiveCompound[] = [...lastByCompound].map(([peptideId, lastDoseAt]) => {
    const peptide = resolve(peptideId)!;
    const halfLifeHours = peptide.halfLifeHours;

    if (!halfLifeHours || halfLifeHours <= 0) {
      return {
        peptideId,
        name: peptide.name,
        lastDoseAt,
        halfLifeHours: null,
        clearedAt: null,
        unknownReason:
          peptide.halfLifeNote ??
          "No half-life established in humans, so there is no honest clearance date.",
      };
    }

    return {
      peptideId,
      name: peptide.name,
      lastDoseAt,
      halfLifeHours,
      clearedAt: lastDoseAt + hoursToClear(halfLifeHours) * HOUR,
    };
  });

  compounds.sort((a, b) => b.lastDoseAt - a.lastDoseAt);

  const blockedBy = compounds.filter((c) => c.clearedAt == null).map((c) => c.name);
  const known = compounds.filter((c) => c.clearedAt != null).map((c) => c.clearedAt!);

  return {
    compounds,
    earliestStart: blockedBy.length || !known.length ? null : Math.max(...known),
    blockedBy,
    clear: compounds.length > 0 && !blockedBy.length && Math.max(...known, 0) <= nowMs,
  };
}

/** Hours for a single dose to fall to CLEARED_FRACTION of its peak. */
export function hoursToClear(halfLifeHours: number): number {
  if (!(halfLifeHours > 0)) return 0;
  return halfLifeHours * Math.log2(1 / CLEARED_FRACTION);
}

/** What is left of the last dose right now, 0 to 1. Null when unknowable. */
export function remainingFraction(c: SuppressiveCompound, nowMs = Date.now()): number | null {
  if (c.halfLifeHours == null) return null;
  // A dose logged in the future, from a clock that has moved, is treated as
  // just taken rather than as more than a full dose still to come.
  const hours = Math.max(0, (nowMs - c.lastDoseAt) / HOUR);
  return fractionRemaining(hours, c.halfLifeHours);
}

export interface PctTemplate {
  id: string;
  name: string;
  summary: string;
  /** Compound ids in the library this template uses. */
  compoundIds: string[];
  weeks: { week: number; detail: string }[];
  /** Where the protocol comes from, and what it was studied for. */
  source: string;
  citationUrl: string;
}

/**
 * Published recovery protocols.
 *
 * Reproduced rather than invented, and each one carries what it was actually
 * studied for, which in every case is not "after a steroid cycle". None of them
 * is an approved use.
 */
export const PCT_TEMPLATES: PctTemplate[] = [
  {
    id: "enclomiphene",
    name: "Enclomiphene",
    summary:
      "The isomer of clomiphene that raises LH and FSH without the slow-clearing one that causes most of the visual and mood complaints.",
    compoundIds: ["enclomiphene"],
    weeks: [
      { week: 1, detail: "12.5 to 25 mg daily" },
      { week: 2, detail: "12.5 to 25 mg daily" },
      { week: 3, detail: "12.5 mg daily" },
      { week: 4, detail: "12.5 mg daily, then stop and retest" },
    ],
    source:
      "Doses from the phase II trials of enclomiphene in men with secondary hypogonadism. The trials treated hypogonadism, not steroid-induced suppression.",
    citationUrl: "https://bjui-journals.onlinelibrary.wiley.com/doi/full/10.1111/bju.12363",
  },
  {
    id: "tamoxifen",
    name: "Tamoxifen",
    summary:
      "Blocks oestrogen feedback at the pituitary, raising LH and FSH. The longest-standing option and the one with the most human data behind the molecule, though not for this use.",
    compoundIds: ["tamoxifen"],
    weeks: [
      { week: 1, detail: "20 mg daily" },
      { week: 2, detail: "20 mg daily" },
      { week: 3, detail: "10 mg daily" },
      { week: 4, detail: "10 mg daily, then stop and retest" },
    ],
    source:
      "Doses are at or below the approved 20 to 40 mg range for breast cancer. Recovery of the axis is not an approved indication.",
    citationUrl: "https://pubmed.ncbi.nlm.nih.gov/1458563/",
  },
  {
    id: "hcg-then-serm",
    name: "hCG, then a SERM",
    summary:
      "hCG first to wake the testis directly, then a SERM once it stops, to restore the pituitary signal. Running hCG and the SERM together defeats the point: hCG suppresses the very signal the SERM is trying to raise.",
    compoundIds: ["hcg", "enclomiphene"],
    weeks: [
      { week: 1, detail: "hCG 1000 IU every other day" },
      { week: 2, detail: "hCG 1000 IU every other day, then stop hCG" },
      { week: 3, detail: "Enclomiphene 25 mg daily" },
      { week: 4, detail: "Enclomiphene 25 mg daily" },
      { week: 5, detail: "Enclomiphene 12.5 mg daily" },
      { week: 6, detail: "Enclomiphene 12.5 mg daily, then stop and retest" },
    ],
    source:
      "hCG doses are within the clinical range for hypogonadotropic hypogonadism. The sequence is community practice, not a studied protocol.",
    citationUrl: "https://www.fertstert.org/article/S0015-0282(16)60906-8/pdf",
  },
];

/**
 * When bloodwork is worth taking after recovery finishes.
 *
 * Four weeks after the last dose of the protocol, because a SERM raises
 * testosterone while it is still present, and testing during it measures the
 * drug rather than the recovery.
 */
export function retestAfter(protocolEndsAt: number, weeks = 4): number {
  return protocolEndsAt + weeks * 7 * DAY;
}
