import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { columnToIndex, readXlsx, serialToMs, XlsxError } from "./xlsx";

/**
 * Hand-built xlsx fixtures.
 *
 * Writing the XML directly rather than generating it with a library keeps the
 * test honest about what a real file contains, including the parts that trip
 * readers up: omitted empty cells, shared strings split across runs, and dates
 * that are only distinguishable from numbers via styles.xml.
 */
function buildXlsx(opts: {
  sheet: string;
  sharedStrings?: string;
  styles?: string;
  workbook?: string;
}): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8("<Types/>"),
    "xl/workbook.xml": strToU8(opts.workbook ?? "<workbook><sheets/></workbook>"),
    "xl/worksheets/sheet1.xml": strToU8(opts.sheet),
  };
  if (opts.sharedStrings) files["xl/sharedStrings.xml"] = strToU8(opts.sharedStrings);
  if (opts.styles) files["xl/styles.xml"] = strToU8(opts.styles);
  return zipSync(files);
}

const sheet = (rows: string) => `<worksheet><sheetData>${rows}</sheetData></worksheet>`;

describe("serialToMs", () => {
  it("converts a modern date", () => {
    // 26 July 2026 is serial 46229 in Excel's 1900 system.
    expect(serialToMs(46229)).toBe(Date.UTC(2026, 6, 26));
  });

  it("handles the Excel epoch itself", () => {
    // Serial 1 is 1 January 1900, and sits below the phantom leap day.
    expect(serialToMs(1)).toBe(Date.UTC(1900, 0, 1));
  });

  it("works either side of Excel's non-existent 29 February 1900", () => {
    // 28 Feb 1900 is serial 59; 1 March 1900 is serial 61. Serial 60 is the day
    // that never existed, and everything above it is shifted by one.
    expect(serialToMs(59)).toBe(Date.UTC(1900, 1, 28));
    expect(serialToMs(61)).toBe(Date.UTC(1900, 2, 1));
  });

  it("keeps a fractional day as a time", () => {
    // 0.5 of a day past midnight is noon.
    expect(serialToMs(46229.5)).toBe(Date.UTC(2026, 6, 26, 12));
  });

  it("applies the 1904 offset when the workbook uses it", () => {
    // The same calendar date has a serial 1462 lower in the 1904 system.
    expect(serialToMs(46229 - 1462, true)).toBe(Date.UTC(2026, 6, 26));
  });
});

describe("columnToIndex", () => {
  it("maps single and multi-letter columns", () => {
    expect(columnToIndex("A1")).toBe(0);
    expect(columnToIndex("B2")).toBe(1);
    expect(columnToIndex("Z9")).toBe(25);
    expect(columnToIndex("AA1")).toBe(26);
    expect(columnToIndex("AZ1")).toBe(51);
    expect(columnToIndex("BA1")).toBe(52);
  });

  it("rejects a reference with no letters", () => {
    expect(columnToIndex("12")).toBe(-1);
  });
});

describe("readXlsx", () => {
  it("reads inline numbers and shared strings", () => {
    const bytes = buildXlsx({
      sharedStrings: "<sst><si><t>Date</t></si><si><t>Weight</t></si></sst>",
      sheet: sheet(
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
          '<row r="2"><c r="A2"><v>1</v></c><c r="B2"><v>94.2</v></c></row>'),
    });
    expect(readXlsx(bytes)).toEqual([
      ["Date", "Weight"],
      ["1", "94.2"],
    ]);
  });

  it("pads over cells the file omits entirely", () => {
    // xlsx leaves empty cells out, so B is absent and C must still land in C.
    const bytes = buildXlsx({
      sheet: sheet('<row r="1"><c r="A1"><v>1</v></c><c r="C1"><v>3</v></c></row>'),
    });
    expect(readXlsx(bytes)).toEqual([["1", "", "3"]]);
  });

  it("joins a shared string split across styled runs", () => {
    const bytes = buildXlsx({
      sharedStrings: "<sst><si><r><t>Mounjaro</t></r><r><t>® 10 mg</t></r></si></sst>",
      sheet: sheet('<row r="1"><c r="A1" t="s"><v>0</v></c></row>'),
    });
    expect(readXlsx(bytes)).toEqual([["Mounjaro® 10 mg"]]);
  });

  it("decodes XML entities without double-decoding the ampersand", () => {
    const bytes = buildXlsx({
      sharedStrings: "<sst><si><t>a &amp;lt; b &amp; c</t></si></sst>",
      sheet: sheet('<row r="1"><c r="A1" t="s"><v>0</v></c></row>'),
    });
    expect(readXlsx(bytes)).toEqual([["a &lt; b & c"]]);
  });

  it("reads an inline string cell", () => {
    const bytes = buildXlsx({
      sheet: sheet('<row r="1"><c r="A1" t="inlineStr"><is><t>hello</t></is></c></row>'),
    });
    expect(readXlsx(bytes)).toEqual([["hello"]]);
  });

  it("converts a date-formatted number to an ISO date", () => {
    // numFmtId 14 is the built-in short date, so style index 0 is a date.
    const bytes = buildXlsx({
      styles: '<styleSheet><cellXfs count="1"><xf numFmtId="14"/></cellXfs></styleSheet>',
      sheet: sheet('<row r="1"><c r="A1" s="0"><v>46229</v></c></row>'),
    });
    expect(readXlsx(bytes)).toEqual([["2026-07-26"]]);
  });

  it("leaves a plain number alone even at the same value", () => {
    // Style 1 has a general format, so the identical serial stays a number.
    // This is the distinction a naive reader gets wrong in both directions.
    const bytes = buildXlsx({
      styles:
        '<styleSheet><cellXfs count="2"><xf numFmtId="14"/><xf numFmtId="0"/></cellXfs></styleSheet>',
      sheet: sheet('<row r="1"><c r="A1" s="0"><v>46229</v></c><c r="B1" s="1"><v>46229</v></c></row>'),
    });
    expect(readXlsx(bytes)).toEqual([["2026-07-26", "46229"]]);
  });

  it("recognises a custom date format by its pattern", () => {
    const bytes = buildXlsx({
      styles:
        '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>' +
        '<cellXfs count="1"><xf numFmtId="164"/></cellXfs></styleSheet>',
      sheet: sheet('<row r="1"><c r="A1" s="0"><v>46229</v></c></row>'),
    });
    expect(readXlsx(bytes)).toEqual([["2026-07-26"]]);
  });

  it("does not mistake a currency format for a date", () => {
    // The literal text in quotes contains a d, which must not count.
    const bytes = buildXlsx({
      styles:
        '<styleSheet><numFmts><numFmt numFmtId="165" formatCode="&quot;usd&quot;#,##0.00"/></numFmts>' +
        '<cellXfs count="1"><xf numFmtId="165"/></cellXfs></styleSheet>',
      sheet: sheet('<row r="1"><c r="A1" s="0"><v>1500</v></c></row>'),
    });
    expect(readXlsx(bytes)).toEqual([["1500"]]);
  });

  it("keeps the time when a date cell has a fractional serial", () => {
    const bytes = buildXlsx({
      styles: '<styleSheet><cellXfs count="1"><xf numFmtId="22"/></cellXfs></styleSheet>',
      sheet: sheet('<row r="1"><c r="A1" s="0"><v>46229.5</v></c></row>'),
    });
    expect(readXlsx(bytes)[0][0]).toBe(new Date(Date.UTC(2026, 6, 26, 12)).toISOString());
  });

  it("honours a 1904-based workbook", () => {
    const bytes = buildXlsx({
      workbook: '<workbook><workbookPr date1904="1"/></workbook>',
      styles: '<styleSheet><cellXfs count="1"><xf numFmtId="14"/></cellXfs></styleSheet>',
      sheet: sheet(`<row r="1"><c r="A1" s="0"><v>${46229 - 1462}</v></c></row>`),
    });
    expect(readXlsx(bytes)).toEqual([["2026-07-26"]]);
  });

  it("renders a boolean readably", () => {
    const bytes = buildXlsx({
      sheet: sheet('<row r="1"><c r="A1" t="b"><v>1</v></c><c r="B1" t="b"><v>0</v></c></row>'),
    });
    expect(readXlsx(bytes)).toEqual([["TRUE", "FALSE"]]);
  });

  it("treats an empty cell element as empty rather than missing", () => {
    const bytes = buildXlsx({
      sheet: sheet('<row r="1"><c r="A1"/><c r="B1"><v>2</v></c></row>'),
    });
    expect(readXlsx(bytes)).toEqual([["", "2"]]);
  });

  it("squares off rows of differing width", () => {
    const bytes = buildXlsx({
      sheet: sheet(
        '<row r="1"><c r="A1"><v>1</v></c><c r="B1"><v>2</v></c><c r="C1"><v>3</v></c></row>' +
          '<row r="2"><c r="A2"><v>4</v></c></row>'),
    });
    expect(readXlsx(bytes)).toEqual([
      ["1", "2", "3"],
      ["4", "", ""],
    ]);
  });

  it("reads the first sheet when several exist", () => {
    const files: Record<string, Uint8Array> = {
      "xl/workbook.xml": strToU8("<workbook/>"),
      "xl/worksheets/sheet2.xml": strToU8(sheet('<row r="1"><c r="A1" t="inlineStr"><is><t>second</t></is></c></row>')),
      "xl/worksheets/sheet1.xml": strToU8(sheet('<row r="1"><c r="A1" t="inlineStr"><is><t>first</t></is></c></row>')),
    };
    expect(readXlsx(zipSync(files))).toEqual([["first"]]);
  });

  it("orders sheets numerically, not as text", () => {
    const files: Record<string, Uint8Array> = {
      "xl/workbook.xml": strToU8("<workbook/>"),
      "xl/worksheets/sheet10.xml": strToU8(sheet('<row><c t="inlineStr"><is><t>ten</t></is></c></row>')),
      "xl/worksheets/sheet2.xml": strToU8(sheet('<row><c t="inlineStr"><is><t>two</t></is></c></row>')),
    };
    expect(readXlsx(zipSync(files))).toEqual([["two"]]);
  });

  it("rejects a file that is not a zip with an actionable message", () => {
    const csv = strToU8("Date,Weight\n2026-01-01,94.2");
    expect(() => readXlsx(csv)).toThrow(XlsxError);
    expect(() => readXlsx(csv)).toThrow(/not an \.xlsx file/i);
  });

  it("rejects a zip with no worksheet", () => {
    expect(() => readXlsx(zipSync({ "a.txt": strToU8("hi") }))).toThrow(/no worksheets/i);
  });
});
