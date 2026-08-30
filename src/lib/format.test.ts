import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDosePerDay,
  formatDateTime,
  fromDateInput,
  toDateInput,
  toDateTimeLocal,
  fromDateTimeLocal,
} from "./format";

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

describe("formatDate", () => {
  const aug = new Date(2026, 7, 27, 12, 0).getTime();

  it("leaves the year off for a date in the current year", () => {
    // The economy that made dropping the year worth it in the first place.
    expect(formatDate(new Date(2026, 8, 13).getTime(), aug)).not.toContain("2026");
  });

  it("carries the year for a date in the next one", () => {
    // The reported bug: "Mar 13" read in August is a guess, not a date, and on
    // the Stock page a guess in either direction costs money.
    expect(formatDate(new Date(2027, 2, 13).getTime(), aug)).toContain("2027");
  });

  it("carries the year backwards too", () => {
    // Log and lab entries are read the same way and were equally ambiguous.
    expect(formatDate(new Date(2025, 2, 13).getTime(), aug)).toContain("2025");
  });

  it("switches on the calendar year, not on a distance in days", () => {
    // Two days apart, either side of new year. The nearer one carries a year
    // and the further one does not, which is correct: the question is whether
    // the reader can tell which year is meant.
    const dec = new Date(2026, 11, 31, 12, 0).getTime();
    expect(formatDate(new Date(2027, 0, 2).getTime(), dec)).toContain("2027");
    expect(formatDate(new Date(2026, 0, 2).getTime(), dec)).not.toContain("2027");
  });

  it("is the date half of formatDateTime, whichever form it takes", () => {
    // They used to decide this separately. A drift between them would show up
    // as the same instant printed two ways on two screens.
    for (const at of [new Date(2026, 8, 13, 9, 30).getTime(), new Date(2027, 2, 13, 9, 30).getTime()]) {
      expect(formatDateTime(at, aug).startsWith(`${formatDate(at, aug)}, `)).toBe(true);
    }
  });
});

describe("formatDosePerDay", () => {
  it("names one dose plainly", () => {
    expect(formatDosePerDay(250, 1)).toBe("250 mcg");
  });

  it("says how many a day holds when it holds more than one", () => {
    // The form takes the day's dose, so someone who typed 500 and split it
    // reads 250 here. The multiplier is what reconciles the two.
    expect(formatDosePerDay(250, 2)).toBe("250 mcg \u00d7 2");
    expect(formatDosePerDay(1500, 3)).toBe("1.5 mg \u00d7 3");
  });

  it("does not multiply by nothing", () => {
    expect(formatDosePerDay(250, 0)).toBe("250 mcg");
  });
});
