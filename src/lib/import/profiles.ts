/**
 * Recognising where an exported file came from, and reading it.
 *
 * A profile is a set of header names plus the rules for turning one row into
 * canonical records. Detection is a score rather than a match so a file with an
 * extra column, a renamed column or a missing one still resolves to the right
 * profile, and the generic reader picks up whatever is left.
 *
 * The generic profile is what makes this useful beyond one app: almost every
 * tracker exports a table with a date, something naming what was taken, a dose
 * and sometimes a weight, and those are recognised by their header names.
 */

import type { InjectionSite, Peptide } from "../types";
import { normaliseHeader } from "./delimited";
import { isBlank, parseDate, parseDoseMcg, parseNumber } from "./values";
import { lbToKg } from "../calc/outcomes";

/** One thing read out of a file, before it becomes app data. */
export type CanonicalRecord =
  | {
      kind: "dose";
      at: number;
      /** Text naming the compound, still to be resolved against the library. */
      label: string;
      doseMcg: number | null;
      site?: InjectionSite;
      notes?: string;
      sourceRow: number;
    }
  | {
      kind: "weight";
      at: number;
      weightKg: number;
      sourceRow: number;
    };

export interface RowProblem {
  sourceRow: number;
  reason: string;
}

export interface ProfileResult {
  records: CanonicalRecord[];
  problems: RowProblem[];
}

export interface ImportProfile {
  id: string;
  name: string;
  /** 0 means "not this format". Higher wins. */
  score(headers: string[]): number;
  read(records: Record<string, string>[], headers: string[]): ProfileResult;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Find the first header whose normalised form matches one of `wanted`. */
function pick(headers: string[], wanted: string[]): string | undefined {
  const normalised = headers.map((h) => ({ h, n: normaliseHeader(h) }));
  for (const w of wanted) {
    const hit = normalised.find((x) => x.n === w);
    if (hit) return hit.h;
  }
  // Fall back to a containment match, which catches "date of injection".
  for (const w of wanted) {
    const hit = normalised.find((x) => x.n.includes(w));
    if (hit) return hit.h;
  }
  return undefined;
}

const has = (headers: string[], wanted: string[]) => (pick(headers, wanted) ? 1 : 0);

/**
 * Map free-text site names onto the app's own set.
 *
 * Built from words rather than a lookup table of exact strings, so "Stomach -
 * Upper Left", "abdomen upper left" and "Left Abdomen (upper)" all land on the
 * same site. Returns undefined rather than a guess when the region is unclear.
 * A wrong site is worse in the rotation view than no site at all.
 */
export function mapSite(text: string | undefined): InjectionSite | undefined {
  if (isBlank(text)) return undefined;
  const t = text!.toLowerCase();

  const left = /\bleft\b|\bl\b/.test(t);
  const right = /\bright\b|\br\b/.test(t);
  const middle = /\bmid\b|\bmiddle\b|\bcentre\b|\bcenter\b/.test(t);
  const upper = /\bupper\b|\btop\b/.test(t);
  const lower = /\blower\b|\bbottom\b/.test(t);

  if (/stomach|abdomen|abdominal|belly|tummy/.test(t)) {
    const side = middle ? "m" : left ? "l" : right ? "r" : null;
    if (!side) return undefined;
    // Shotsy and others only distinguish upper from lower; default to upper
    // rather than dropping the row, since the side is the part that matters for
    // rotation.
    const band = lower ? "l" : upper ? "u" : "u";
    return `abdomen-${band}${side}` as InjectionSite;
  }

  if (/thigh|leg|quad/.test(t)) {
    if (left) return "thigh-l";
    if (right) return "thigh-r";
    return undefined;
  }

  if (/arm|delt|tricep|shoulder/.test(t)) {
    if (left) return "arm-l";
    if (right) return "arm-r";
    return undefined;
  }

  if (/glute|buttock|butt|hip/.test(t)) {
    if (left) return "glute-l";
    if (right) return "glute-r";
    return undefined;
  }

  return undefined;
}

/**
 * Strip a trailing dose off a product name.
 *
 * "Mounjaro® 10.0 mg" is one field in most exports, carrying both what was taken
 * and how much. Returns the name and the dose separately.
 */
export function splitLabelAndDose(label: string): { name: string; doseMcg: number | null } {
  const doseMatch = /([\d.]+)\s*(mcg|µg|μg|ug|mg|g)\b/i.exec(label);
  const doseMcg = doseMatch ? parseDoseMcg(doseMatch[0]) : null;

  const name = label
    .replace(/([\d.]+)\s*(mcg|µg|μg|ug|mg|g)\b/i, " ")
    .replace(/[®™©]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { name, doseMcg };
}

/**
 * Resolve a product name to a library peptide.
 *
 * Matches the entry's own name and its `aka` list, which is where the brand names
 * live, Mounjaro and Zepbound are both listed under tirzepatide. Exact matches
 * are preferred over partial ones so "Semaglutide" cannot be captured by a
 * blend that merely contains it.
 */
export function resolvePeptide(name: string, peptides: Peptide[]): Peptide | undefined {
  const clean = name.toLowerCase().replace(/[®™©]/g, "").replace(/\s+/g, " ").trim();
  if (!clean) return undefined;

  const names = (p: Peptide) => [p.name, ...p.aka].map((n) => n.toLowerCase());

  const exact = peptides.find((p) => names(p).includes(clean));
  if (exact) return exact;

  // A word-boundary match, longest candidate first, so "cagrisema" is not
  // matched by "sema".
  const candidates = peptides
    .flatMap((p) => names(p).map((n) => ({ p, n })))
    .sort((a, b) => b.n.length - a.n.length);

  for (const { p, n } of candidates) {
    if (n.length < 4) continue;
    const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(clean)) return p;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Shotsy
// ---------------------------------------------------------------------------

const SHOTSY_HEADERS = ["jab", "jab notes", "pain level", "recorded weight", "food noise"];

export const shotsyProfile: ImportProfile = {
  id: "shotsy",
  name: "Shotsy",

  score(headers) {
    const seen = headers.map(normaliseHeader);
    const hits = SHOTSY_HEADERS.filter((h) => seen.includes(h)).length;
    // "Jab" plus one other Shotsy-specific column is conclusive; nothing else
    // names a column that.
    return hits >= 2 ? 100 + hits : 0;
  },

  read(records) {
    const out: CanonicalRecord[] = [];
    const problems: RowProblem[] = [];

    records.forEach((r, i) => {
      // Row 1 is the header, so the first body row is row 2 to a human.
      const sourceRow = i + 2;
      const at = parseDate(r["Date"], r["Time"]);

      if (at == null) {
        if (!isBlank(r["Date"])) {
          problems.push({ sourceRow, reason: `Could not read the date "${r["Date"]}".` });
        }
        return;
      }

      // A row can carry an injection, a weight, both, or only symptoms.
      if (!isBlank(r["Jab"])) {
        const { name, doseMcg } = splitLabelAndDose(r["Jab"]);
        out.push({
          kind: "dose",
          at,
          label: name || r["Jab"],
          doseMcg,
          site: mapSite(r["Site"]),
          notes: [r["Jab Notes"], r["Day Notes"]].filter((n) => !isBlank(n)).join(" · ") || undefined,
          sourceRow,
        });
      }

      const weight = parseNumber(r["Recorded Weight (kg)"]);
      if (weight != null && weight > 0) {
        out.push({ kind: "weight", at, weightKg: weight, sourceRow });
      }
    });

    return { records: out, problems };
  },
};

// ---------------------------------------------------------------------------
// Generic tabular
// ---------------------------------------------------------------------------

const DATE_HEADERS = ["date", "date time", "datetime", "timestamp", "day", "when", "date of dose"];
const TIME_HEADERS = ["time", "time of day", "clock"];
const NAME_HEADERS = [
  "peptide",
  "compound",
  "medication",
  "med",
  "drug",
  "product",
  "name",
  "jab",
  "shot",
  "injection",
  "substance",
];
const DOSE_HEADERS = ["dose", "dose mg", "dose mcg", "amount", "quantity", "strength", "dosage"];
const SITE_HEADERS = ["site", "injection site", "location", "body site"];
const WEIGHT_HEADERS = ["weight", "recorded weight", "body weight", "mass"];
const NOTE_HEADERS = ["notes", "note", "comment", "comments", "jab notes"];

/** Above this, a figure cannot be a person's weight in kilograms. */
const IMPLAUSIBLE_KG = 250;

/**
 * The unit a weight column declares, from the raw header.
 *
 * Read off the original text rather than the normalised form, because
 * normalisation strips parenthesised content and "Weight (lb)" is exactly where
 * the unit lives.
 */
export function weightUnitFromHeader(header: string): "kg" | "lb" | null {
  const t = header.toLowerCase();
  if (/\blbs?\b|pound/.test(t)) return "lb";
  if (/\bkgs?\b|kilogram/.test(t)) return "kg";
  return null;
}

export const genericProfile: ImportProfile = {
  id: "generic",
  name: "Generic spreadsheet",

  score(headers) {
    // A date plus either something named or a weight is the minimum that can be
    // read at all. Scored below any specific profile so those always win.
    const date = has(headers, DATE_HEADERS);
    if (!date) return 0;
    const useful = has(headers, NAME_HEADERS) + has(headers, WEIGHT_HEADERS);
    return useful ? 1 + useful : 0;
  },

  read(records, headers) {
    const col = {
      date: pick(headers, DATE_HEADERS),
      time: pick(headers, TIME_HEADERS),
      name: pick(headers, NAME_HEADERS),
      dose: pick(headers, DOSE_HEADERS),
      site: pick(headers, SITE_HEADERS),
      weight: pick(headers, WEIGHT_HEADERS),
      notes: pick(headers, NOTE_HEADERS),
    };

    const out: CanonicalRecord[] = [];
    const problems: RowProblem[] = [];

    records.forEach((r, i) => {
      const sourceRow = i + 2;
      const rawDate = col.date ? r[col.date] : undefined;
      const at = parseDate(rawDate, col.time ? r[col.time] : undefined);

      if (at == null) {
        if (!isBlank(rawDate)) {
          problems.push({
            sourceRow,
            reason: `Could not read the date "${rawDate}". Dates must lead with the year, like 2026-07-26, a day-first or month-first date is ambiguous.`,
          });
        }
        return;
      }

      const label = col.name ? r[col.name] : "";
      if (!isBlank(label)) {
        const split = splitLabelAndDose(label);
        // A dedicated dose column beats a dose embedded in the name.
        const fromColumn = col.dose ? parseDoseMcg(r[col.dose]) : null;
        out.push({
          kind: "dose",
          at,
          label: split.name || label,
          doseMcg: fromColumn ?? split.doseMcg,
          site: col.site ? mapSite(r[col.site]) : undefined,
          notes: col.notes && !isBlank(r[col.notes]) ? r[col.notes] : undefined,
          sourceRow,
        });
      }

      if (col.weight) {
        const w = parseNumber(r[col.weight]);
        if (w != null && w > 0) {
          const unit = weightUnitFromHeader(col.weight);
          if (unit === "lb") {
            out.push({ kind: "weight", at, weightKg: lbToKg(w), sourceRow });
          } else if (unit === "kg" || w <= IMPLAUSIBLE_KG) {
            out.push({ kind: "weight", at, weightKg: w, sourceRow });
          } else {
            // Unitless and too large to be a person's weight in kilograms. It is
            // almost certainly pounds, but "almost certainly" is not good enough
            // to silently rewrite someone's weight history by a factor of 2.2.
            problems.push({
              sourceRow,
              reason: `Weight of ${w} is too high to be kilograms and the column does not say its unit. Label the column "Weight (lb)" or convert it.`,
            });
          }
        }
      }
    });

    return { records: out, problems };
  },
};

export const PROFILES: ImportProfile[] = [shotsyProfile, genericProfile];

/** The best-scoring profile for these headers, or null if none can read them. */
export function detectProfile(headers: string[]): ImportProfile | null {
  let best: ImportProfile | null = null;
  let bestScore = 0;
  for (const p of PROFILES) {
    const score = p.score(headers);
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return best;
}
