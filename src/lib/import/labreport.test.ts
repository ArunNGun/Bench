import { describe, expect, it } from "vitest";
import { parseLabReport } from "./labreport";

const find = (lines: string[], markerId: string) =>
  parseLabReport(lines).candidates.find((c) => c.markerId === markerId);

describe("reading a result off a line", () => {
  it("takes the analyte, the value and the unit", () => {
    const c = find(["HbA1c 5.4 %"], "hba1c")!;
    expect(c.value).toBe(5.4);
    expect(c.unit).toBe("%");
    expect(c.confidence).toBe("exact");
  });

  it("keeps the line it came from, so the user can check it", () => {
    expect(find(["Lipase 31 U/L"], "lipase")!.source).toBe("Lipase 31 U/L");
  });

  it("reads a reference interval written as a range", () => {
    const c = find(["ALT 22 U/L (Ref: 7 - 56)"], "alt")!;
    expect(c.value).toBe(22);
    expect(c.refLow).toBe(7);
    expect(c.refHigh).toBe(56);
  });

  it("does not mistake the bottom of the range for the result", () => {
    // The failure that would silently chart the wrong number for years.
    const c = find(["Ferritin-like TSH 1.80 mIU/L 0.40 - 4.50"], "tsh")!;
    expect(c.value).toBe(1.8);
  });

  it("reads a one-sided reference written with a less-than sign", () => {
    const c = find(["Triglycerides 88 mg/dL <150"], "triglycerides")!;
    expect(c.value).toBe(88);
    expect(c.refHigh).toBe(150);
    expect(c.refLow).toBeUndefined();
  });

  it("reads a one-sided reference written with a greater-than sign", () => {
    const c = find(["HDL cholesterol 61 mg/dL >40"], "hdl")!;
    expect(c.value).toBe(61);
    expect(c.refLow).toBe(40);
  });

  it("ignores numbers printed before the analyte name", () => {
    // Row numbers and specimen ids sit in the left column.
    const c = find(["14  0012345  Creatinine 0.98 mg/dL"], "creatinine")!;
    expect(c.value).toBe(0.98);
  });

  it("handles a comma decimal separator", () => {
    expect(find(["Creatinine 0,98 mg/dL"], "creatinine")!.value).toBe(0.98);
  });

  it("handles a thousands separator without turning it into a decimal", () => {
    // 1,200 is twelve hundred, not 1.2. Getting this backwards is a 1000x error.
    expect(find(["IGF-1 1,200 ng/mL"], "igf1")!.value).toBe(1200);
  });
});

describe("matching the right analyte", () => {
  it("prefers the longer name when two overlap", () => {
    // "HDL cholesterol" must not be read as "LDL cholesterol" or vice versa,
    // and neither should swallow the other's line.
    const { candidates } = parseLabReport(["HDL cholesterol 61 mg/dL", "LDL cholesterol 92 mg/dL"]);
    expect(candidates.find((c) => c.markerId === "hdl")!.value).toBe(61);
    expect(candidates.find((c) => c.markerId === "ldl")!.value).toBe(92);
  });

  it("matches the names labs actually print", () => {
    expect(find(["Hemoglobin A1c 5.6 %"], "hba1c")!.value).toBe(5.6);
    expect(find(["SGPT (ALT) 30 U/L"], "alt")!.value).toBe(30);
    expect(find(["Hematocrit 47.2 %"], "haematocrit")!.value).toBe(47.2);
  });

  it("marks an alias match as loose rather than exact", () => {
    expect(find(["Thyrotropin 1.9 mIU/L"], "tsh")!.confidence).toBe("loose");
  });

  it("takes the first occurrence when an analyte is repeated", () => {
    // The detail table comes before the summary in every layout seen.
    const { candidates } = parseLabReport(["ALT 22 U/L", "Summary: ALT 99 U/L"]);
    expect(candidates.filter((c) => c.markerId === "alt")).toHaveLength(1);
    expect(candidates[0].value).toBe(22);
  });

  it("skips a reference table header rather than reading it as a result", () => {
    expect(parseLabReport(["Reference ranges: ALT 7 - 56 U/L"]).candidates).toEqual([]);
  });

  it("finds nothing in a page of prose", () => {
    expect(parseLabReport(["Patient copy. Please discuss with your doctor."]).candidates).toEqual([]);
  });

  it("returns nothing at all for an empty document", () => {
    expect(parseLabReport([]).candidates).toEqual([]);
  });
});

describe("units", () => {
  it("accepts a unit that differs only in casing or spacing", () => {
    expect(find(["Lipase 31 u/l"], "lipase")!.confidence).toBe("exact");
  });

  it("treats the micro sign and the letter u as the same", () => {
    // Fasting insulin is charted in µIU/mL and printed a dozen ways.
    expect(find(["Fasting insulin 6.1 µIU/mL"], "insulin-fasting")!.confidence).toBe("exact");
    expect(find(["Fasting insulin 6.1 uIU/mL"], "insulin-fasting")!.confidence).toBe("exact");
  });

  it("flags a unit that does not match rather than converting on a guess", () => {
    // Charting mmol/L as mg/dL would produce a trend that is not just wrong but
    // inverted in scale. Kept and flagged, never silently converted.
    const c = find(["Triglycerides 1.0 mmol/L"], "triglycerides")!;
    expect(c.confidence).toBe("unit-mismatch");
    expect(c.unit).toBe("mmol/L");
    expect(c.expectedUnit).toBe("mg/dL");
  });

  it("accepts a line with no unit at all", () => {
    // Common in summary tables. Nothing contradicts the expected unit, so this
    // is not a mismatch.
    const c = find(["Haematocrit 47.2"], "haematocrit")!;
    expect(c.unit).toBeUndefined();
    expect(c.confidence).toBe("exact");
  });

  it("does not mistake a following word for a unit", () => {
    const c = find(["HbA1c 5.4 previously recorded as elevated"], "hba1c")!;
    expect(c.unit).toBeUndefined();
  });
});

describe("report header", () => {
  it("finds a labelled collection date", () => {
    const report = parseLabReport(["Acme Pathology", "Collected: 2026-06-14", "ALT 22 U/L"]);
    expect(report.collectedAt).toBe(new Date(2026, 5, 14).setHours(0, 0, 0, 0));
  });

  it("falls back to any date near the top", () => {
    expect(parseLabReport(["2026-06-14", "ALT 22 U/L"]).collectedAt).not.toBeNull();
  });

  it("reports null rather than guessing today", () => {
    // Defaulting to today would silently date a year-old report as current.
    expect(parseLabReport(["ALT 22 U/L"]).collectedAt).toBeNull();
  });

  it("picks up a recognisable lab name", () => {
    expect(parseLabReport(["LabCorp Patient Report", "ALT 22 U/L"]).lab).toMatch(/labcorp/i);
  });
});

describe("a whole report", () => {
  const REPORT = [
    "Quest Diagnostics",
    "Patient: A Kumar    Collected: 2026-06-14",
    "Test                    Result      Units        Reference",
    "Hemoglobin A1c          5.4         %            4.0 - 5.6",
    "Glucose, fasting        92          mg/dL        70 - 99",
    "Triglycerides           88          mg/dL        <150",
    "HDL cholesterol         61          mg/dL        >40",
    "LDL cholesterol         92          mg/dL        0 - 99",
    "ALT (SGPT)              22          U/L          7 - 56",
    "AST (SGOT)              19          U/L          10 - 40",
    "Hematocrit              47.2        %            38.5 - 50.0",
    "TSH                     1.80        mIU/L        0.40 - 4.50",
    "IGF-1                   210         ng/mL        83 - 233",
    "End of report",
  ];

  it("reads every analyte it carries", () => {
    const { candidates } = parseLabReport(REPORT);
    expect(candidates.map((c) => c.markerId).sort()).toEqual([
      "alt",
      "ast",
      "glucose-fasting",
      "haematocrit",
      "hba1c",
      "hdl",
      "igf1",
      "ldl",
      "triglycerides",
      "tsh",
    ]);
  });

  it("gets every value right", () => {
    const by = Object.fromEntries(
      parseLabReport(REPORT).candidates.map((c) => [c.markerId, c.value]));
    expect(by).toMatchObject({
      hba1c: 5.4,
      "glucose-fasting": 92,
      triglycerides: 88,
      hdl: 61,
      ldl: 92,
      alt: 22,
      ast: 19,
      haematocrit: 47.2,
      tsh: 1.8,
      igf1: 210,
    });
  });

  it("carries the reference intervals through", () => {
    const alt = parseLabReport(REPORT).candidates.find((c) => c.markerId === "alt")!;
    expect(alt.refLow).toBe(7);
    expect(alt.refHigh).toBe(56);
  });

  it("picks up the header", () => {
    const report = parseLabReport(REPORT);
    expect(report.lab).toMatch(/quest/i);
    expect(report.collectedAt).toBe(new Date(2026, 5, 14).setHours(0, 0, 0, 0));
  });
});

describe("range punctuation", () => {
  it("reads a range printed with a hyphen, the word to, or an en dash", () => {
    // The third is a literal en dash on purpose: it is the input being tested,
    // not prose, so the project's no-dash rule does not reach it. A bulk sweep
    // over this file would quietly delete the only case that covers it.
    for (const sep of ["-", "to", "–"]) {
      const c = parseLabReport([`ALT 22 U/L 7 ${sep} 56`]).candidates[0];
      expect(c.value, sep).toBe(22);
      expect(c.refLow, sep).toBe(7);
      expect(c.refHigh, sep).toBe(56);
    }
  });
});
