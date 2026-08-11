import { describe, expect, it } from "vitest";
import { fromDateInput, toDateInput, toDateTimeLocal, fromDateTimeLocal } from "./format";

describe("fromDateInput", () => {
  it("reads a picked date as that date, not the evening before", () => {
    const d = new Date(fromDateInput("2026-07-05"));
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(5);
  });

  it("lands on midnight local time", () => {
    const d = new Date(fromDateInput("2026-07-05"));
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  /**
   * The regression itself. The old handler called `new Date(value)` on a
   * date-only string, which the language parses as UTC, so every timezone west
   * of Greenwich stored the previous evening and read the date back a day
   * early. This holds in every timezone, which is the point.
   */
  it("round trips through toDateInput", () => {
    for (const day of [
      "2026-01-01",
      "2026-03-08", // US spring forward
      "2026-07-05", // the date in the report
      "2026-10-25", // European autumn back
      "2026-11-01", // US autumn back
      "2026-12-31",
      "2028-02-29", // leap day
    ]) {
      expect(toDateInput(fromDateInput(day))).toBe(day);
    }
  });

  it("agrees with the datetime-local reader at midnight", () => {
    expect(fromDateInput("2026-07-05")).toBe(fromDateTimeLocal("2026-07-05T00:00"));
  });

  it("falls back to now rather than to an invalid date", () => {
    const before = Date.now();
    for (const junk of ["", "not a date", "2026-7-5", "05/07/2026"]) {
      const ms = fromDateInput(junk);
      expect(Number.isFinite(ms)).toBe(true);
      expect(ms).toBeGreaterThanOrEqual(before);
    }
  });

  it("tolerates surrounding whitespace", () => {
    expect(toDateInput(fromDateInput("  2026-07-05  "))).toBe("2026-07-05");
  });
});

describe("toDateInput", () => {
  it("reports the local date, not the UTC one", () => {
    // Late evening local on the 5th is already the 6th in UTC east of nothing,
    // and still the 5th here, because the formatter uses local accessors.
    const evening = new Date(2026, 6, 5, 23, 30).getTime();
    expect(toDateInput(evening)).toBe("2026-07-05");
  });

  it("is the date half of the datetime-local value", () => {
    const ms = new Date(2026, 6, 5, 14, 30).getTime();
    expect(toDateInput(ms)).toBe(toDateTimeLocal(ms).slice(0, 10));
  });
});
