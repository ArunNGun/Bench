import { describe, expect, it } from "vitest";
import {
  normaliseHeader,
  parseDelimited,
  sniffDelimiter,
  stripBom,
  toTable,
} from "./delimited";

describe("sniffDelimiter", () => {
  it("finds comma, tab, semicolon and pipe", () => {
    expect(sniffDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(sniffDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
    expect(sniffDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(sniffDelimiter("a|b|c\n1|2|3")).toBe("|");
  });

  it("ignores separators inside quotes", () => {
    // Semicolons only appear inside a quoted field, so this is still a CSV.
    expect(sniffDelimiter('name,note\n"Smith; John","a; b; c; d"')).toBe(",");
  });

  it("defaults to comma with a single column", () => {
    expect(sniffDelimiter("weight\n94.2")).toBe(",");
  });

  it("looks past a quoted newline in the header", () => {
    expect(sniffDelimiter('"a\nb",c,d\n1,2,3')).toBe(",");
  });

  it("copes with a byte order mark", () => {
    expect(sniffDelimiter("﻿a,b,c")).toBe(",");
  });
});

describe("stripBom", () => {
  it("removes a leading BOM and nothing else", () => {
    expect(stripBom("﻿Date,Jab")).toBe("Date,Jab");
    expect(stripBom("Date,Jab")).toBe("Date,Jab");
    expect(stripBom("Date﻿Jab")).toBe("Date﻿Jab");
  });
});

describe("parseDelimited", () => {
  it("parses a plain grid", () => {
    expect(parseDelimited("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps a comma inside a quoted field", () => {
    expect(parseDelimited('note,dose\n"felt sick, badly",10')).toEqual([
      ["note", "dose"],
      ["felt sick, badly", "10"],
    ]);
  });

  it("keeps a newline inside a quoted field", () => {
    const rows = parseDelimited('note,dose\n"line one\nline two",10');
    expect(rows).toHaveLength(2);
    expect(rows[1][0]).toBe("line one\nline two");
  });

  it("unescapes a doubled quote", () => {
    expect(parseDelimited('note\n"he said ""ouch"""')).toEqual([["note"], ['he said "ouch"']]);
  });

  it("handles CRLF line endings", () => {
    expect(parseDelimited("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles a lone CR", () => {
    expect(parseDelimited("a,b\r1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("does not invent a row from a trailing newline", () => {
    expect(parseDelimited("a,b\n1,2\n")).toHaveLength(2);
  });

  it("keeps an empty final field", () => {
    expect(parseDelimited("a,b,c\n1,,")).toEqual([
      ["a", "b", "c"],
      ["1", "", ""],
    ]);
  });

  it("keeps a quoted empty string as a present cell", () => {
    expect(parseDelimited('a\n""')).toEqual([["a"], [""]]);
  });

  it("treats a stray mid-cell quote as data", () => {
    // Sloppy exporters emit this; losing the character would be worse.
    expect(parseDelimited('a\n5" long')).toEqual([["a"], ['5" long']]);
  });

  it("does not trim whitespace", () => {
    expect(parseDelimited("a,b\n 1 , 2 ")).toEqual([
      ["a", "b"],
      [" 1 ", " 2 "],
    ]);
  });

  it("preserves a distinction between blank and zero", () => {
    // The Shotsy symptom columns depend on this: empty means not recorded,
    // 0 means recorded as none.
    expect(parseDelimited("nausea,pain\n,0")).toEqual([
      ["nausea", "pain"],
      ["", "0"],
    ]);
  });

  it("accepts an explicit delimiter over the guess", () => {
    expect(parseDelimited("a;b\n1;2", ";")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("returns nothing for empty input", () => {
    expect(parseDelimited("")).toEqual([]);
    expect(parseDelimited("\n")).toEqual([[""]]);
  });
});

describe("toTable", () => {
  it("keys rows by header", () => {
    const t = toTable(parseDelimited("Date,Weight\n2026-01-01,94.2"));
    expect(t.headers).toEqual(["Date", "Weight"]);
    expect(t.records).toEqual([{ Date: "2026-01-01", Weight: "94.2" }]);
  });

  it("skips leading blank rows to find the header", () => {
    const t = toTable([[], ["", ""], ["Date", "Weight"], ["2026-01-01", "94.2"]]);
    expect(t.headers).toEqual(["Date", "Weight"]);
    expect(t.records).toHaveLength(1);
  });

  it("drops entirely blank body rows", () => {
    const t = toTable(parseDelimited("a,b\n1,2\n,\n3,4"));
    expect(t.records).toHaveLength(2);
  });

  it("disambiguates duplicate headers rather than losing a column", () => {
    const t = toTable(parseDelimited("dose,dose\n1,2"));
    expect(t.headers).toEqual(["dose", "dose 2"]);
    expect(t.records[0]).toEqual({ dose: "1", "dose 2": "2" });
  });

  it("names an unnamed column by position", () => {
    const t = toTable(parseDelimited("a,,c\n1,2,3"));
    expect(t.headers).toEqual(["a", "column 2", "c"]);
  });

  it("fills missing trailing cells with empty strings and counts the row as ragged", () => {
    const t = toTable([
      ["a", "b", "c"],
      ["1"],
    ]);
    expect(t.records[0]).toEqual({ a: "1", b: "", c: "" });
    expect(t.raggedRows).toBe(1);
  });

  it("keeps extra cells beyond the header rather than dropping them", () => {
    const t = toTable([
      ["a", "b"],
      ["1", "2", "3"],
    ]);
    expect(t.records[0]["column 3"]).toBe("3");
    expect(t.raggedRows).toBe(1);
  });

  it("returns an empty table for no input", () => {
    expect(toTable([])).toEqual({ headers: [], records: [], raggedRows: 0 });
  });
});

describe("normaliseHeader", () => {
  it("flattens case, punctuation and units for matching", () => {
    expect(normaliseHeader("Recorded Weight (kg)")).toBe("recorded weight");
    expect(normaliseHeader("Pain Level")).toBe("pain level");
    expect(normaliseHeader("dose_mcg")).toBe("dose mcg");
    expect(normaliseHeader("  Date  ")).toBe("date");
    expect(normaliseHeader("Jab Notes")).toBe("jab notes");
  });

  it("collapses anything unmatchable to an empty string", () => {
    expect(normaliseHeader("---")).toBe("");
    expect(normaliseHeader("")).toBe("");
  });
});
