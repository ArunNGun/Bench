import { describe, expect, it } from "vitest";
import { isBlank, parseBoolean, parseClock, parseDate, parseDoseMcg, parseNumber } from "./values";

describe("isBlank", () => {
  it("separates absent from zero", () => {
    expect(isBlank("")).toBe(true);
    expect(isBlank("   ")).toBe(true);
    expect(isBlank(undefined)).toBe(true);
    expect(isBlank("0")).toBe(false);
  });
});

describe("parseNumber", () => {
  it("reads plain and decimal numbers", () => {
    expect(parseNumber("42")).toBe(42);
    expect(parseNumber("94.2")).toBe(94.2);
    expect(parseNumber("-1.5")).toBe(-1.5);
    expect(parseNumber("0")).toBe(0);
  });

  it("tolerates a trailing unit and thousands separators", () => {
    expect(parseNumber("94.2 kg")).toBe(94.2);
    expect(parseNumber("1,234")).toBe(1234);
    expect(parseNumber("10 mg")).toBe(10);
  });

  it("refuses text with no digits", () => {
    expect(parseNumber("n/a")).toBeNull();
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("--")).toBeNull();
  });

  it("finds the number inside a product name containing an e", () => {
    // "e" is an exponent marker, so stripping non-numeric characters instead of
    // matching a literal turns this into a leading "e" and reads as nothing.
    expect(parseNumber("Wegovy 1.0 mg")).toBe(1);
    expect(parseNumber("Mounjaro® 10.0 mg")).toBe(10);
  });
});

describe("parseDate", () => {
  it("reads ISO dates", () => {
    expect(parseDate("2026-07-26")).toBe(new Date(2026, 6, 26).getTime());
  });

  it("reads slash and dot forms that lead with the year", () => {
    expect(parseDate("2026/07/26")).toBe(new Date(2026, 6, 26).getTime());
    expect(parseDate("2026.07.26")).toBe(new Date(2026, 6, 26).getTime());
  });

  it("applies a separate time column", () => {
    expect(parseDate("2026-07-26", "13:36")).toBe(new Date(2026, 6, 26, 13, 36).getTime());
  });

  it("prefers a time carried by the date itself", () => {
    expect(parseDate("2026-07-26T09:32:10", "23:00")).toBe(
      new Date(2026, 6, 26, 9, 32, 10).getTime());
  });

  it("refuses an ambiguous day-first or month-first date", () => {
    // 10/07/2026 is 10 July in most of the world and 7 October in the US. There
    // is no way to tell, and guessing would silently move a third of a year's
    // doses onto the wrong day.
    expect(parseDate("10/07/2026")).toBeNull();
    expect(parseDate("07/10/2026")).toBeNull();
    expect(parseDate("26-07-2026")).toBeNull();
  });

  it("refuses a date that does not exist", () => {
    expect(parseDate("2026-02-31")).toBeNull();
    expect(parseDate("2026-13-01")).toBeNull();
    expect(parseDate("2026-00-10")).toBeNull();
  });

  it("refuses nonsense", () => {
    expect(parseDate("")).toBeNull();
    expect(parseDate("last Tuesday")).toBeNull();
  });

  it("returns local midnight, not UTC", () => {
    // Doses are recorded in local time; treating a bare date as UTC would shift
    // it a day for anyone west of Greenwich.
    const d = new Date(parseDate("2026-07-26")!);
    expect(d.getHours()).toBe(0);
    expect(d.getDate()).toBe(26);
  });
});

describe("parseClock", () => {
  it("reads 24-hour times", () => {
    expect(parseClock("13:36")).toEqual({ h: 13, mi: 36, s: 0 });
    expect(parseClock("09:32:10")).toEqual({ h: 9, mi: 32, s: 10 });
    expect(parseClock("23:23")).toEqual({ h: 23, mi: 23, s: 0 });
  });

  it("reads 12-hour times", () => {
    expect(parseClock("1:36 pm")).toEqual({ h: 13, mi: 36, s: 0 });
    expect(parseClock("12:05 am")).toEqual({ h: 0, mi: 5, s: 0 });
    expect(parseClock("12:05 PM")).toEqual({ h: 12, mi: 5, s: 0 });
  });

  it("refuses impossible and unparseable times", () => {
    expect(parseClock("25:00")).toBeNull();
    expect(parseClock("10:75")).toBeNull();
    expect(parseClock("morning")).toBeNull();
    expect(parseClock("")).toBeNull();
  });
});

describe("parseDoseMcg", () => {
  it("assumes milligrams when no unit is given", () => {
    // Every injectable here is labelled in mg; a bare 10 meaning 10 mcg would be
    // a thousandth of any real dose.
    expect(parseDoseMcg("10")).toBe(10_000);
    expect(parseDoseMcg("2.5")).toBe(2500);
  });

  it("honours an explicit unit", () => {
    expect(parseDoseMcg("10 mg")).toBe(10_000);
    expect(parseDoseMcg("500 mcg")).toBe(500);
    expect(parseDoseMcg("500 µg")).toBe(500);
    expect(parseDoseMcg("250ug")).toBe(250);
    expect(parseDoseMcg("0.001 g")).toBe(1000);
  });

  it("refuses a syringe unit count", () => {
    // Units cannot become a mass without the vial's concentration.
    expect(parseDoseMcg("20 units")).toBeNull();
    expect(parseDoseMcg("20 iu")).toBeNull();
    expect(parseDoseMcg("20u")).toBeNull();
  });

  it("does not read micrograms as grams", () => {
    // The µ is not an ASCII word character, so a word-boundary search for "g"
    // matched the tail of "µg" and inflated the dose a million-fold.
    expect(parseDoseMcg("500 µg")).toBe(500);
    expect(parseDoseMcg("500µg")).toBe(500);
    expect(parseDoseMcg("500 μg")).toBe(500);
  });

  it("refuses a unit it does not understand", () => {
    expect(parseDoseMcg("0.5 mL")).toBeNull();
    expect(parseDoseMcg("2 clicks")).toBeNull();
  });

  it("refuses a negative or unreadable dose", () => {
    expect(parseDoseMcg("-5 mg")).toBeNull();
    expect(parseDoseMcg("a lot")).toBeNull();
    expect(parseDoseMcg("")).toBeNull();
  });

  it("accepts zero", () => {
    expect(parseDoseMcg("0")).toBe(0);
  });
});

describe("parseBoolean", () => {
  it("reads the usual spellings", () => {
    for (const t of ["1", "true", "TRUE", "yes", "Y", "on"]) expect(parseBoolean(t)).toBe(true);
    for (const f of ["0", "false", "no", "N", "off"]) expect(parseBoolean(f)).toBe(false);
  });

  it("returns null for blank or unrecognised text", () => {
    expect(parseBoolean("")).toBeNull();
    expect(parseBoolean("maybe")).toBeNull();
  });
});
