import { describe, expect, it } from "vitest";
import { doseCsv, DOSE_CSV_HEADER, escapeCsv } from "./dosecsv";
import type { DoseLog } from "../types";

const at = Date.UTC(2026, 4, 12, 9, 30);

const log = (over: Partial<DoseLog> = {}): DoseLog => ({
  id: "l1",
  profileId: "me",
  peptideId: "bpc-157",
  at,
  doseMcg: 500,
  route: "subcutaneous",
  ...over,
});

const name = (id: string) => (id === "bpc-157" ? "BPC-157" : id);
const cells = (row: string) => row.split(",");

describe("escapeCsv", () => {
  it("leaves an ordinary value alone", () => {
    expect(escapeCsv("nausea")).toBe("nausea");
    expect(escapeCsv(500)).toBe("500");
  });

  it("quotes anything that would break the row", () => {
    expect(escapeCsv("felt rough, then fine")).toBe('"felt rough, then fine"');
    expect(escapeCsv('he said "fine"')).toBe('"he said ""fine"""');
    expect(escapeCsv("two\nlines")).toBe('"two\nlines"');
  });

  it("writes nothing for nothing, rather than the word undefined", () => {
    expect(escapeCsv(undefined)).toBe("");
    expect(escapeCsv(null)).toBe("");
  });
});

describe("doseCsv", () => {
  it("carries the tapped side effects, which used to be dropped", () => {
    // The bug this file exists for. They were stored on the log and appeared
    // in no export, so a history handed to a clinician was missing the part
    // they would most want.
    const { text } = doseCsv([log({ sideEffects: ["nausea", "headache"] })], name);
    expect(text).toContain("nausea; headache");
  });

  it("separates several effects with semicolons, so no quoting is needed", () => {
    const { rows } = doseCsv([log({ sideEffects: ["a", "b", "c"] })], name);
    // Semicolons keep the cell count honest: one column, three values.
    expect(cells(rows[0])).toHaveLength(DOSE_CSV_HEADER.length);
    expect(rows[0]).toContain("a; b; c");
  });

  it("writes the feeling as the word a person chose, not the number", () => {
    const { text } = doseCsv([log({ feeling: 2 })], name);
    expect(text).toContain("Off");
    expect(text).not.toContain(",2,");
  });

  it("leaves both blank when neither was recorded", () => {
    const { rows } = doseCsv([log()], name);
    const row = cells(rows[0]);
    const feeling = DOSE_CSV_HEADER.indexOf("feeling");
    expect(row[feeling]).toBe("");
    expect(row[feeling + 1]).toBe("");
  });

  it("keeps a comma inside a note from splitting the row", () => {
    const { rows } = doseCsv([log({ notes: "sore, but fine" })], name);
    expect(rows[0]).toContain('"sore, but fine"');
  });

  it("marks a skipped dose, and still reports what was felt", () => {
    const { rows } = doseCsv([log({ skipped: true, feeling: 1 })], name);
    expect(rows[0]).toContain(",yes,Rough,");
  });

  it("reads forwards, oldest first", () => {
    const { rows } = doseCsv(
      [log({ id: "b", at: at + 86_400_000 }), log({ id: "a", at })],
      name);
    expect(rows[0] < rows[1]).toBe(true);
  });

  it("names every column exactly once", () => {
    expect(new Set(DOSE_CSV_HEADER).size).toBe(DOSE_CSV_HEADER.length);
    const { text } = doseCsv([], name);
    expect(text).toBe(DOSE_CSV_HEADER.join(","));
  });

  it("does not mutate the history it was given", () => {
    const logs = [log({ id: "b", at: at + 1 }), log({ id: "a", at })];
    doseCsv(logs, name);
    expect(logs.map((l) => l.id)).toEqual(["b", "a"]);
  });
});
