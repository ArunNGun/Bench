import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { ImportError, readImportFile } from "./pipeline";
import { PEPTIDES } from "../data/peptides";

const fixture = readFileSync(join(__dirname, "__fixtures__/shotsy.csv"), "utf8");

const options = { peptides: PEPTIDES, existingLogs: [], existingMeasurements: [] };

/** A File built from text or bytes, since jsdom is not in play here. */
function fileOf(name: string, body: string | Uint8Array): File {
  return new File([body as BlobPart], name);
}

describe("readImportFile, format detection", () => {
  it("reads the real Shotsy CSV and recognises the profile", async () => {
    const result = await readImportFile(fileOf("shotsy_export.csv", fixture), options);
    expect(result.kind).toBe("table");
    if (result.kind !== "table") return;
    expect(result.format).toBe("csv");
    expect(result.profile.id).toBe("shotsy");
    expect(result.plan.doses).toHaveLength(25);
    expect(result.plan.weights).toHaveLength(14);
  });

  it("reads a tab-separated file", async () => {
    const tsv = "Date\tMedication\tDose\n2026-07-26\tOzempic\t1 mg";
    const result = await readImportFile(fileOf("log.tsv", tsv), options);
    if (result.kind !== "table") throw new Error("expected a table");
    expect(result.plan.doses[0]).toMatchObject({ peptideId: "semaglutide", doseMcg: 1000 });
  });

  it("reads a semicolon-separated file saved as .txt", async () => {
    const result = await readImportFile(
      fileOf("log.txt", "Date;Medication;Dose\n2026-07-26;Ozempic;1 mg"),
      options);
    if (result.kind !== "table") throw new Error("expected a table");
    expect(result.plan.doses).toHaveLength(1);
  });

  it("recognises one of its own JSON exports and hands it back whole", async () => {
    const backup = { version: 5, logs: [], protocols: [], vials: [], profiles: [], settings: {} };
    const result = await readImportFile(fileOf("bench-export.json", JSON.stringify(backup)), options);
    expect(result.kind).toBe("bench-export");
    if (result.kind !== "bench-export") return;
    expect(result.data.version).toBe(5);
  });

  it("reads a JSON array of rows from another app", async () => {
    const json = JSON.stringify([
      { Date: "2026-07-26", Medication: "Ozempic", Dose: "1 mg" },
      { Date: "2026-08-02", Medication: "Ozempic", Dose: "1 mg" },
    ]);
    const result = await readImportFile(fileOf("export.json", json), options);
    if (result.kind !== "table") throw new Error("expected a table");
    expect(result.plan.doses).toHaveLength(2);
  });

  it("reads a JSON object wrapping a single array", async () => {
    const json = JSON.stringify({
      exportedAt: "2026-07-26",
      entries: [{ Date: "2026-07-26", Medication: "Ozempic", Dose: "1 mg" }],
    });
    const result = await readImportFile(fileOf("export.json", json), options);
    if (result.kind !== "table") throw new Error("expected a table");
    expect(result.plan.doses).toHaveLength(1);
  });

  it("unions keys across JSON rows so a sparse field is not lost", async () => {
    const json = JSON.stringify([
      { Date: "2026-07-26", Medication: "Ozempic", Dose: "1 mg" },
      { Date: "2026-08-02", Medication: "Ozempic", Dose: "1 mg", Weight: "85.4" },
    ]);
    const result = await readImportFile(fileOf("export.json", json), options);
    if (result.kind !== "table") throw new Error("expected a table");
    expect(result.table.headers).toContain("Weight");
    expect(result.plan.weights).toHaveLength(1);
  });

  it("reads an xlsx", async () => {
    const bytes = zipSync({
      "xl/workbook.xml": strToU8("<workbook/>"),
      "xl/sharedStrings.xml": strToU8(
        "<sst><si><t>Date</t></si><si><t>Medication</t></si><si><t>Dose</t></si>" +
          "<si><t>2026-07-26</t></si><si><t>Ozempic</t></si><si><t>1 mg</t></si></sst>"),
      "xl/worksheets/sheet1.xml": strToU8(
        "<worksheet><sheetData>" +
          '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>' +
          '<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="s"><v>4</v></c><c r="C2" t="s"><v>5</v></c></row>' +
          "</sheetData></worksheet>"),
    });
    const result = await readImportFile(fileOf("log.xlsx", bytes), options);
    if (result.kind !== "table") throw new Error("expected a table");
    expect(result.format).toBe("xlsx");
    expect(result.plan.doses[0]).toMatchObject({ peptideId: "semaglutide", doseMcg: 1000 });
  });
});

describe("readImportFile, refusals worth reading", () => {
  const expectError = async (file: File, pattern: RegExp) => {
    await expect(readImportFile(file, options)).rejects.toThrow(ImportError);
    await expect(readImportFile(file, options)).rejects.toThrow(pattern);
  };

  it("explains that legacy .xls is a different format", async () => {
    await expectError(fileOf("old.xls", "anything"), /save as \.xlsx or \.csv/i);
  });

  it("explains invalid JSON", async () => {
    await expectError(fileOf("broken.json", "{nope"), /not valid JSON/i);
  });

  it("explains JSON with no rows in it", async () => {
    await expectError(fileOf("empty.json", "{}"), /no list of records/i);
  });

  it("explains an empty file", async () => {
    await expectError(fileOf("empty.csv", ""), /appears to be empty/i);
  });

  it("names the columns it did not understand", async () => {
    await expectError(fileOf("wrong.csv", "colour,size\nred,large"), /colour, size/);
  });

  it("rejects a CSV renamed to .xlsx with an actionable message", async () => {
    await expectError(fileOf("fake.xlsx", "Date,Weight\n2026-07-26,85"), /not an \.xlsx file/i);
  });
});

describe("readImportFile, existing data is respected", () => {
  it("marks everything as duplicate when the data is already there", async () => {
    const first = await readImportFile(fileOf("shotsy.csv", fixture), options);
    if (first.kind !== "table") throw new Error("expected a table");

    const second = await readImportFile(fileOf("shotsy.csv", fixture), {
      peptides: PEPTIDES,
      existingLogs: first.plan.doses.map((d) => ({ at: d.at, peptideId: d.peptideId })),
      existingMeasurements: first.plan.weights.map((w) => ({ at: w.at, weightKg: w.weightKg })),
    });
    if (second.kind !== "table") throw new Error("expected a table");

    expect(second.plan.doses).toEqual([]);
    expect(second.plan.weights).toEqual([]);
    expect(second.plan.duplicateDoses).toBe(25);
  });
});
