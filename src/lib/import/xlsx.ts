/**
 * Reading .xlsx well enough to import a table from it.
 *
 * An xlsx is a zip of XML. This unzips it, resolves shared strings, and reads the
 * first worksheet into the same `string[][]` shape the CSV reader produces, so
 * everything downstream is identical.
 *
 * The part that needs care is dates. Excel stores a date as a plain number and
 * records "this is a date" only in the cell's number format, so a reader that
 * ignores styles turns 26 July 2026 into "46229". Worse, Excel's 1900 calendar
 * contains a day that never existed, 29 February 1900, so serials on either
 * side of it need different arithmetic. Both are handled below, and both are
 * tested, because a date read wrongly here is a dose logged on the wrong day.
 *
 * NOT supported: the legacy .xls binary format (Excel 97 to 2003). That is BIFF, an
 * unrelated format, and pretending otherwise would fail confusingly. Re-save as
 * .xlsx or .csv.
 *
 * One convention throughout: every element regex tries the self-closing form
 * before the paired form. The other way round, a lazy `<c ...>…</c>` pattern that
 * starts at a self-closing `<c/>` runs on to the *next* `</c>` and merges two
 * cells into one, shifting every remaining value in the row one column left.
 */

import { unzipSync, strFromU8 } from "fflate";

/** Unix epoch as an Excel 1900-system serial number. */
const EPOCH_SERIAL_1900 = 25569;
/** Days between the 1900 and 1904 epochs. */
const SERIAL_1904_OFFSET = 1462;
const DAY_MS = 86_400_000;

/**
 * Built-in number format ids that mean a date or a time.
 *
 * From the ECMA-376 built-in format table: 14 to 22 are the date and time formats,
 * 45 to 47 are elapsed time, and 27 to 36 plus 50 to 58 are the East Asian date formats
 * that Excel assigns when the locale calls for them.
 */
const BUILTIN_DATE_FORMATS = new Set<number>([
  ...range(14, 22), ...range(27, 36), ...range(45, 47), ...range(50, 58),
]);

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/**
 * Convert an Excel serial number to epoch milliseconds.
 *
 * Serial 60 is Excel's non-existent 29 February 1900. Serials above it are one
 * day ahead of reality, which the standard offset already accounts for; serials
 * below it are not, so they need a day back.
 */
export function serialToMs(serial: number, date1904 = false): number {
  if (date1904) return Math.round((serial + SERIAL_1904_OFFSET - EPOCH_SERIAL_1900) * DAY_MS);
  const epoch = serial < 60 ? EPOCH_SERIAL_1900 - 1 : EPOCH_SERIAL_1900;
  return Math.round((serial - epoch) * DAY_MS);
}

/** A date-formatted cell becomes an ISO string so downstream parsing is uniform. */
function serialToIso(serial: number, date1904: boolean): string {
  const ms = serialToMs(serial, date1904);
  const iso = new Date(ms).toISOString();
  // Whole-day serials carry no meaningful time; keep them as bare dates so a
  // timezone shift cannot move them onto the previous day.
  return Number.isInteger(serial) ? iso.slice(0, 10) : iso;
}

/** Decode the XML entities that can appear in cell text. */
function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    // Ampersand last, or the others would be double-decoded.
    .replace(/&amp;/g, "&");
}

/**
 * Shared strings, in order.
 *
 * A single string may be split across several runs when parts of it are styled
 * differently, so every <t> inside one <si> is concatenated.
 */
function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const si of xml.match(/<si\b[^>]*\/>|<si\b[\s\S]*?<\/si>/g) ?? []) {
    const parts = [...si.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1]));
    out.push(parts.join(""));
  }
  return out;
}

/** numFmtId per cell-format index, so a cell's `s` attribute can be resolved. */
function parseStyles(xml: string): { dateXfs: Set<number> } {
  // Custom formats declare their own pattern; anything with a y, d, or a
  // month/minute token is a date or time.
  const customDateIds = new Set<number>();
  for (const m of xml.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) {
    const code = unescapeXml(m[2]);
    // Strip literals in quotes and colour/condition blocks before looking.
    const bare = code.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "");
    if (/[ymdhs]/i.test(bare)) customDateIds.add(Number(m[1]));
  }

  const dateXfs = new Set<number>();
  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? "";
  const xfs = cellXfs.match(/<xf\b[^>]*\/>|<xf\b[\s\S]*?<\/xf>/g) ?? [];

  xfs.forEach((xf, i) => {
    const id = Number(/numFmtId="(\d+)"/.exec(xf)?.[1] ?? "0");
    if (BUILTIN_DATE_FORMATS.has(id) || customDateIds.has(id)) dateXfs.add(i);
  });

  return { dateXfs };
}

/** Column letters to a zero-based index: A→0, Z→25, AA→26. */
export function columnToIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref.toUpperCase())?.[1];
  if (!letters) return -1;
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSheet(
  xml: string,
  shared: string[],
  dateXfs: Set<number>,
  date1904: boolean): string[][] {
  const rows: string[][] = [];

  for (const rowXml of xml.match(/<row\b[^>]*\/>|<row\b[\s\S]*?<\/row>/g) ?? []) {
    const cells: string[] = [];

    for (const cellXml of rowXml.match(/<c\b[^>]*\/>|<c\b[\s\S]*?<\/c>/g) ?? []) {
      const ref = /r="([A-Z]+\d+)"/.exec(cellXml)?.[1];
      const index = ref ? columnToIndex(ref) : cells.length;
      const type = /\st="([^"]+)"/.exec(cellXml)?.[1] ?? "n";
      const styleIndex = Number(/\ss="(\d+)"/.exec(cellXml)?.[1] ?? "-1");

      let value = "";

      if (type === "inlineStr") {
        const parts = [...cellXml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) =>
          unescapeXml(m[1]));
        value = parts.join("");
      } else {
        const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(cellXml)?.[1];
        if (raw != null) {
          const text = unescapeXml(raw);
          if (type === "s") {
            value = shared[Number(text)] ?? "";
          } else if (type === "b") {
            value = text === "1" ? "TRUE" : "FALSE";
          } else if (type === "n" && dateXfs.has(styleIndex) && text.trim() !== "") {
            const serial = Number(text);
            value = Number.isFinite(serial) ? serialToIso(serial, date1904) : text;
          } else {
            value = text;
          }
        }
      }

      // Pad out skipped columns; xlsx omits empty cells entirely.
      while (cells.length < index) cells.push("");
      cells[index] = value;
    }

    rows.push(cells);
  }

  // Pad every row to the widest, so the table has a rectangular shape.
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  for (const r of rows) while (r.length < width) r.push("");

  return rows;
}

export class XlsxError extends Error {}

/**
 * Read the first worksheet of an xlsx file into rows.
 *
 * @throws XlsxError when the bytes are not an xlsx, or contain no worksheet.
 */
export function readXlsx(bytes: Uint8Array): string[][] {
  // Every zip starts "PK". An .xls binary does not, and neither does a CSV that
  // has been renamed, so this catches the common mistake with a clear message.
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new XlsxError(
      "That is not an .xlsx file. The old .xls format and renamed CSVs are not readable, re-save it as .xlsx or .csv.");
  }

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new XlsxError("That spreadsheet could not be opened, the file may be damaged.");
  }

  const text = (name: string) => (files[name] ? strFromU8(files[name]) : "");

  const sheetNames = Object.keys(files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));

  if (!sheetNames.length) throw new XlsxError("That spreadsheet has no worksheets.");

  const workbook = text("xl/workbook.xml");
  const date1904 = /date1904="(1|true)"/i.test(workbook);

  const shared = parseSharedStrings(text("xl/sharedStrings.xml"));
  const { dateXfs } = parseStyles(text("xl/styles.xml"));

  return parseSheet(strFromU8(files[sheetNames[0]]), shared, dateXfs, date1904);
}
