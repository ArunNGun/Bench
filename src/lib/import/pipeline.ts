/**
 * From a chosen file to something the screen can show.
 *
 * The one place that knows about file types. Everything below it works on rows or
 * records, so adding a format means adding a decoder here and nothing else.
 *
 * A Bench export is handled separately and short-circuits: it is a complete
 * snapshot including settings, profiles and stock, so it replaces everything
 * rather than being merged row by row. Anything else is a table from some other
 * app, and gets merged.
 */

import type { AppData, DoseLog, Measurement, Peptide } from "../types";
import { parseDelimited, toTable, type Table } from "./delimited";
import { readXlsx, XlsxError } from "./xlsx";
import { detectProfile, type ImportProfile } from "./profiles";
import { buildImportPlan, type ImportPlan } from "./plan";

export type SourceFormat = "csv" | "json" | "xlsx";

/** What was found in the file, before anything is applied. */
export type ReadResult =
  | {
      kind: "bench-export";
      format: "json";
      data: AppData;
    }
  | {
      kind: "table";
      format: SourceFormat;
      profile: ImportProfile;
      table: Table;
      plan: ImportPlan;
    };

export class ImportError extends Error {}

/** Extensions the file picker should offer. */
export const ACCEPTED_EXTENSIONS = ".csv.tsv.txt.json.xlsx.xlsm";

function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

/** True for a parsed JSON object that is one of this app's own exports. */
function isBenchExport(value: unknown): value is AppData {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<AppData>;
  // Its own export always carries these three together; no other tracker does.
  return Array.isArray(v.logs) && Array.isArray(v.protocols) && typeof v.version === "number";
}

/**
 * Turn arbitrary JSON into rows.
 *
 * Handles a bare array of objects, and an object with a single array property
 * such as `{ "entries": [...] }`, which is how a lot of app exports are shaped.
 */
function jsonToRows(value: unknown): string[][] {
  let list: unknown[] | null = Array.isArray(value) ? value : null;

  if (!list && value && typeof value === "object") {
    const arrays = Object.values(value).filter(Array.isArray) as unknown[][];
    // Only unambiguous when there is exactly one array to choose.
    if (arrays.length === 1) list = arrays[0];
  }

  if (!list || !list.length) return [];

  const objects = list.filter((r): r is Record<string, unknown> => !!r && typeof r === "object");
  if (!objects.length) return [];

  // Union of keys across all rows, since exporters omit empty fields.
  const headers: string[] = [];
  for (const o of objects) {
    for (const k of Object.keys(o)) if (!headers.includes(k)) headers.push(k);
  }

  const cell = (v: unknown) => {
    if (v == null) return "";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };

  return [headers, ...objects.map((o) => headers.map((h) => cell(o[h])))];
}

export interface ReadOptions {
  peptides: Peptide[];
  existingLogs: Pick<DoseLog, "at" | "peptideId">[];
  existingMeasurements: Pick<Measurement, "at" | "weightKg">[];
}

/**
 * Decode a file and work out what importing it would do.
 *
 * @throws ImportError with a message worth showing when the file cannot be used.
 */
export async function readImportFile(file: File, options: ReadOptions): Promise<ReadResult> {
  const ext = extensionOf(file.name);

  if (ext === "xls") {
    throw new ImportError(
      "The old .xls format cannot be read. Open it and save as .xlsx or .csv, then try again.");
  }

  let rows: string[][];
  let format: SourceFormat;

  if (ext === "xlsx" || ext === "xlsm") {
    format = "xlsx";
    try {
      rows = readXlsx(new Uint8Array(await file.arrayBuffer()));
    } catch (e) {
      throw new ImportError(e instanceof XlsxError ? e.message : "That spreadsheet could not be read.");
    }
  } else if (ext === "json") {
    format = "json";
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ImportError("That file is not valid JSON.");
    }

    if (isBenchExport(parsed)) return { kind: "bench-export", format: "json", data: parsed };

    rows = jsonToRows(parsed);
    if (!rows.length) {
      throw new ImportError(
        "That JSON has no list of records in it. A Bench export, or an array of rows, can be read.");
    }
  } else {
    // csv, tsv, txt, or anything unrecognised that is probably delimited text.
    format = "csv";
    rows = parseDelimited(await file.text());
  }

  const table = toTable(rows);
  if (!table.headers.length) throw new ImportError("That file appears to be empty.");

  const profile = detectProfile(table.headers);
  if (!profile) {
    throw new ImportError(
      `Could not tell what these columns mean: ${table.headers.slice(0, 8).join(", ")}. A date column plus a column naming what was taken, or a weight, is the minimum needed.`);
  }

  const { records, problems } = profile.read(table.records, table.headers);
  const plan = buildImportPlan({
    records,
    problems,
    peptides: options.peptides,
    existingLogs: options.existingLogs,
    existingMeasurements: options.existingMeasurements,
  });

  return { kind: "table", format, profile, table, plan };
}
