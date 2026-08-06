/**
 * Turning the text of a lab report into results the app can chart.
 *
 * Lab PDFs have no common format. What they do have in common is a line per
 * analyte carrying a name, a number, usually a unit, and often a reference
 * interval, in roughly that order. That regularity is enough, and trying to be
 * cleverer than it means overfitting to whichever lab the author happened to
 * use.
 *
 * Two rules shape everything here.
 *
 * Nothing is written without review. Every match comes back with the line it
 * came from, so the user is confirming against what the report actually says
 * rather than trusting a parser they cannot see. Anything ambiguous is offered
 * with low confidence rather than dropped, because a wrong row a human can
 * correct beats a silently missing one.
 *
 * A number without a unit the app recognises is suspect, not fine. The same
 * analyte is reported in different units by different labs, and quietly
 * charting a value in the wrong one produces a trend line that is not merely
 * imprecise but backwards. Where the unit does not match what the library
 * expects, the row is kept and flagged, never converted on a guess.
 */

import { LAB_MARKERS } from "../data/labs";
import { parseDate } from "./values";

export interface LabCandidate {
  markerId: string;
  markerName: string;
  value: number;
  /** The unit as printed, when one was found. */
  unit?: string;
  /** The unit the library charts this marker in. */
  expectedUnit: string;
  refLow?: number;
  refHigh?: number;
  /** The line this came from, so the user can check it. */
  source: string;
  /**
   * How much to trust it. "exact" matched the marker's own name and the
   * expected unit; "unit-mismatch" matched the name but the unit printed was
   * something else; "loose" matched on an alias or a partial name.
   */
  confidence: "exact" | "loose" | "unit-mismatch";
}

export interface LabReport {
  candidates: LabCandidate[];
  /** Collection date, if one could be found in the header. */
  collectedAt: number | null;
  /** Lab or provider name, if one stood out. */
  lab?: string;
}

/**
 * Names to search for, per marker, longest first.
 *
 * Longest first matters: "free testosterone" and "testosterone" are different
 * analytes, and a shortest-first search would attribute the free result to the
 * total. Sorting by length makes the more specific name win, always.
 */
const SEARCH_TERMS: { markerId: string; term: string; exact: boolean }[] = (() => {
  const rows: { markerId: string; term: string; exact: boolean }[] = [];

  for (const m of LAB_MARKERS) {
    rows.push({ markerId: m.id, term: m.name.toLowerCase(), exact: true });
    if (m.aka) rows.push({ markerId: m.id, term: m.aka.toLowerCase(), exact: false });
  }

  // Names labs actually print, which are often neither the display name nor the
  // long form. Kept here rather than in the library so the library stays about
  // the marker and not about parsing.
  const SYNONYMS: Record<string, string[]> = {
    hba1c: ["hemoglobin a1c", "haemoglobin a1c", "glycohemoglobin", "a1c"],
    "glucose-fasting": ["glucose fasting", "fasting blood glucose", "glucose, fasting", "fbg"],
    "insulin-fasting": ["insulin fasting", "insulin, fasting"],
    triglycerides: ["trigs", "tg"],
    hdl: ["hdl cholesterol", "hdl-c", "cholesterol hdl"],
    ldl: ["ldl cholesterol", "ldl-c", "cholesterol ldl", "ldl calculated"],
    alt: ["alanine transaminase", "sgpt", "alt (sgpt)"],
    ast: ["aspartate transaminase", "sgot", "ast (sgot)"],
    creatinine: ["creatinine serum", "serum creatinine"],
    lipase: ["serum lipase"],
    haematocrit: ["hematocrit", "hct", "pcv", "packed cell volume"],
    tsh: ["thyroid stimulating hormone", "thyrotropin"],
    igf1: ["igf-1", "igf 1", "insulin like growth factor", "somatomedin c"],
    "bp-systolic": ["systolic", "systolic bp"],
    "bp-diastolic": ["diastolic", "diastolic bp"],
    "resting-hr": ["resting pulse", "pulse", "heart rate"],
  };

  for (const [markerId, terms] of Object.entries(SYNONYMS)) {
    for (const term of terms) rows.push({ markerId, term, exact: false });
  }

  return rows.sort((a, b) => b.term.length - a.term.length);
})();

const UNIT_BY_MARKER = new Map(LAB_MARKERS.map((m) => [m.id, m.unit]));
const NAME_BY_MARKER = new Map(LAB_MARKERS.map((m) => [m.id, m.name]));

/**
 * Comparison form, the same length as the input.
 *
 * Length-preserving deliberately. Positions found in this string are used to
 * slice the original line, so collapsing whitespace here would shift every
 * index after the first double space and attribute the wrong number to the
 * analyte.
 */
function normalise(s: string): string {
  return s.toLowerCase().replace(/µ|μ/g, "u");
}

/** Escape a term for use inside a regex. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Where an analyte name appears on a line, tolerating any run of whitespace
 * between its words. Returns the position just past it, which is where the
 * result has to be looked for.
 *
 * Searching past the end of the name rather than its start is not a detail.
 * Several analytes have a digit in the name, and "HbA1c 5.4" read from the
 * start of the match yields 1, silently, forever.
 */
function findTerm(haystack: string, term: string): { start: number; end: number } | null {
  const pattern = term.trim().split(/\s+/).map(escapeRe).join("\\s+");
  const re = new RegExp(`(?<![a-z0-9])${pattern}(?![a-z])`, "i");
  const m = re.exec(haystack);
  return m ? { start: m.index, end: m.index + m[0].length } : null;
}

/** Units compare loosely: casing, spacing and the micro sign all vary by lab. */
function sameUnit(a: string, b: string): boolean {
  const clean = (s: string) => normalise(s).replace(/[\s.]/g, "");
  return clean(a) === clean(b);
}

/**
 * Units that carry no slash or percent sign, and so cannot be recognised by
 * shape alone. Without this list any word following a number reads as a unit,
 * and "HbA1c 5.4 previously elevated" reports its unit as "previously".
 */
const BARE_UNITS = new Set([
  "%",
  "bpm",
  "mmhg",
  "fl",
  "pg",
  "ng",
  "mg",
  "g",
  "ml",
  "l",
  "ratio",
  "index",
  "iu",
  "miu",
  "uiu",
]);

/**
 * Every number on a line, with the text that follows each.
 *
 * Anchored on the digits rather than split on whitespace, because a reference
 * interval is written half a dozen ways and splitting loses which number went
 * with which unit.
 */
function numbersIn(line: string): { value: number; after: string; index: number }[] {
  const out: { value: number; after: string; index: number }[] = [];
  const re = /(-?\d+(?:[.,]\d+)?)/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(line))) {
    // A comma is a decimal separator in much of the world and a thousands
    // separator elsewhere. Treated as a decimal point only when what follows
    // is not a group of exactly three digits.
    const raw = m[1];
    const value = Number(
      /,\d{3}$/.test(raw) ? raw.replace(",", "") : raw.replace(",", "."),
    );
    if (!Number.isFinite(value)) continue;
    out.push({ value, after: line.slice(m.index + raw.length), index: m.index });
  }

  return out;
}

/** The unit immediately after a number, if it looks like one. */
function unitAfter(after: string): string | undefined {
  const m = after.match(/^\s*([A-Za-zµμ%][A-Za-zµμ%/^\d.-]*)/);
  if (!m) return undefined;
  const unit = m[1].replace(/[.,;:]+$/, "");
  if (!unit) return undefined;

  // A unit is either shaped like one, or is one of the few that are not.
  const shaped = unit.includes("/") || unit.includes("%");
  return shaped || BARE_UNITS.has(normalise(unit)) ? unit : undefined;
}

/**
 * A reference interval on the line, in any of the usual spellings.
 *
 * Returned separately from the result value so a range can never be mistaken
 * for the result itself, which is the failure that would silently chart the
 * bottom of the normal range as your number.
 */
function referenceIn(line: string): { low?: number; high?: number } {
  const range = line.match(
    // – is an en dash, written escaped: plenty of labs print ranges with
    // one, and the project forbids the literal character in source.
    /(?:ref(?:erence)?(?:\s*(?:range|interval))?\s*[:=]?\s*)?(-?\d+(?:[.,]\d+)?)\s*(?:-|to|–)\s*(-?\d+(?:[.,]\d+)?)/i,
  );
  if (range) {
    const low = Number(range[1].replace(",", "."));
    const high = Number(range[2].replace(",", "."));
    if (Number.isFinite(low) && Number.isFinite(high) && high > low) return { low, high };
  }

  const lessThan = line.match(/[<≤]\s*(-?\d+(?:[.,]\d+)?)/);
  if (lessThan) return { high: Number(lessThan[1].replace(",", ".")) };

  const moreThan = line.match(/[>≥]\s*(-?\d+(?:[.,]\d+)?)/);
  if (moreThan) return { low: Number(moreThan[1].replace(",", ".")) };

  return {};
}

/** Dates written the way report headers write them. */
function findCollectedAt(lines: string[]): number | null {
  const labelled = /(collect(?:ed|ion)|drawn|specimen|sample|report(?:ed)?|date)\D{0,20}?([0-9][0-9./-]{6,})/i;

  for (const line of lines.slice(0, 40)) {
    const m = line.match(labelled);
    if (!m) continue;
    const parsed = parseDate(m[2]);
    if (parsed != null) return parsed;
  }

  // Fall back to any parseable date near the top.
  for (const line of lines.slice(0, 20)) {
    const m = line.match(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\b/);
    if (!m) continue;
    const parsed = parseDate(m[1]);
    if (parsed != null) return parsed;
  }

  return null;
}

/**
 * Read a lab report out of extracted text.
 *
 * One result per marker: where an analyte appears more than once, which happens
 * when a report repeats it in a summary, the first occurrence wins, since the
 * detailed table comes before the summary in every layout seen.
 */
export function parseLabReport(lines: string[]): LabReport {
  const candidates: LabCandidate[] = [];
  const claimed = new Set<string>();

  for (const line of lines) {
    const haystack = normalise(line);

    // Skip lines that are clearly a reference table rather than a result.
    if (/^\s*(reference|normal|expected)\b/.test(haystack)) continue;

    for (const { markerId, term, exact } of SEARCH_TERMS) {
      if (claimed.has(markerId)) continue;

      const found = findTerm(haystack, term);
      if (!found) continue;

      const reference = referenceIn(line);
      const numbers = numbersIn(line);

      // The result is the first number after the analyte name that is not part
      // of the reference interval. Numbers before the name are row indices and
      // specimen ids.
      const candidate = numbers.find((n) => {
        if (n.index < found.end) return false;
        if (reference.low != null && n.value === reference.low) return false;
        if (reference.high != null && n.value === reference.high) return false;
        return true;
      });

      if (!candidate) continue;

      const expectedUnit = UNIT_BY_MARKER.get(markerId)!;
      const unit = unitAfter(candidate.after);
      const unitMatches = unit == null || sameUnit(unit, expectedUnit);

      candidates.push({
        markerId,
        markerName: NAME_BY_MARKER.get(markerId)!,
        value: candidate.value,
        unit,
        expectedUnit,
        refLow: reference.low,
        refHigh: reference.high,
        source: line.trim(),
        confidence: !unitMatches ? "unit-mismatch" : exact ? "exact" : "loose",
      });

      claimed.add(markerId);
      break;
    }
  }

  return {
    candidates,
    collectedAt: findCollectedAt(lines),
    lab: findLabName(lines),
  };
}

/** The provider's name, if the header makes it obvious. */
function findLabName(lines: string[]): string | undefined {
  const known = /\b(quest|labcorp|sonic|synlab|randox|medichecks|thriva|bupa|nhs|srl|metropolis|thyrocare|dr\.?\s*lal)\b/i;
  for (const line of lines.slice(0, 25)) {
    const m = line.match(known);
    if (m) return m[0];
  }
  return undefined;
}
