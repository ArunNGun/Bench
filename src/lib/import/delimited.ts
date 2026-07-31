/**
 * Reading delimited text: CSV, TSV, semicolon-separated.
 *
 * Written rather than pulled in because the whole app is offline and
 * dependency-light, and because the awkward cases are the ones that actually
 * matter with exported health data: a note containing a comma, a note containing
 * a newline, a quote inside a quoted field. Getting any of those wrong shifts
 * every following column silently, which is the worst possible failure for a file
 * of doses.
 *
 * Follows RFC 4180, plus the two deviations real exporters produce: a trailing
 * newline, and a UTF-8 byte order mark on the front.
 */

/** Delimiters worth guessing between, in the order they are tried. */
const CANDIDATES = [",", "\t", ";", "|"] as const;

export type Delimiter = (typeof CANDIDATES)[number];

const BOM = "﻿";

export function stripBom(text: string): string {
  return text.startsWith(BOM) ? text.slice(1) : text;
}

/**
 * Guess the delimiter from the header line.
 *
 * Counts only separators outside quotes, so `"Smith, John",42` is not read as a
 * semicolon file. Ties break towards the earlier candidate, which puts comma
 * first, the overwhelmingly common case.
 */
export function sniffDelimiter(text: string): Delimiter {
  const line = firstLogicalLine(stripBom(text));

  let best: Delimiter = ",";
  let bestCount = 0;

  for (const d of CANDIDATES) {
    const count = countOutsideQuotes(line, d);
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/** The first line, treating a quoted newline as part of the line. */
function firstLogicalLine(text: string): string {
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      // A doubled quote inside a quoted field is an escaped quote.
      if (quoted && text[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted && (ch === "\n" || ch === "\r")) {
      return text.slice(0, i);
    }
  }
  return text;
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let quoted = false;
  let count = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted && ch === delimiter) {
      count++;
    }
  }
  return count;
}

/**
 * Parse delimited text into rows of raw cell strings.
 *
 * Cells are returned exactly as written apart from unwrapping quotes and
 * unescaping doubled quotes, no trimming, no type coercion, no empty-string to
 * null. Interpretation is the caller's job, and doing it here would throw away
 * the difference between a blank cell and a zero.
 */
export function parseDelimited(text: string, delimiter?: Delimiter): string[][] {
  const src = stripBom(text);
  const d = delimiter ?? sniffDelimiter(src);

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let cellWasQuoted = false;

  const endCell = () => {
    row.push(cell);
    cell = "";
    cellWasQuoted = false;
  };

  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"' && cell === "") {
      // Only a quote at the start of a cell opens a quoted field; a stray quote
      // mid-cell is data, which is what a sloppy exporter produces.
      quoted = true;
      cellWasQuoted = true;
      continue;
    }

    if (ch === d) {
      endCell();
      continue;
    }

    if (ch === "\r") {
      // Consume CRLF as one break.
      if (src[i + 1] === "\n") i++;
      endRow();
      continue;
    }

    if (ch === "\n") {
      endRow();
      continue;
    }

    cell += ch;
  }

  // A file almost always ends with a newline; only keep a final row if there is
  // something in it, so a trailing break does not become a row of blanks.
  if (cell !== "" || cellWasQuoted || row.length) endRow();

  return rows;
}

export interface Table {
  headers: string[];
  /** One object per row, keyed by header. Duplicate headers get a numeric suffix. */
  records: Record<string, string>[];
  /** Rows that had a different cell count than the header. */
  raggedRows: number;
}

/** Normalised form of a header, for matching: lower case, alphanumeric only. */
export function normaliseHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Turn rows into keyed records using the first non-empty row as headers.
 *
 * Extra cells beyond the header are kept under a positional key rather than
 * dropped, so a malformed file loses nothing silently.
 */
export function toTable(rows: string[][]): Table {
  const headerIndex = rows.findIndex((r) => r.some((c) => c.trim() !== ""));
  if (headerIndex === -1) return { headers: [], records: [], raggedRows: 0 };

  const seen = new Map<string, number>();
  const headers = rows[headerIndex].map((h, i) => {
    const name = h.trim() || `column ${i + 1}`;
    const n = seen.get(name) ?? 0;
    seen.set(name, n + 1);
    return n === 0 ? name : `${name} ${n + 1}`;
  });

  const records: Record<string, string>[] = [];
  let raggedRows = 0;

  for (const row of rows.slice(headerIndex + 1)) {
    // Skip rows that are entirely blank, a common artefact of spreadsheet edits.
    if (!row.some((c) => c.trim() !== "")) continue;
    if (row.length !== headers.length) raggedRows++;

    const rec: Record<string, string> = {};
    headers.forEach((h, i) => {
      rec[h] = row[i] ?? "";
    });
    for (let i = headers.length; i < row.length; i++) {
      rec[`column ${i + 1}`] = row[i];
    }
    records.push(rec);
  }

  return { headers, records, raggedRows };
}
