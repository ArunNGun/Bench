import { describe, expect, it } from "vitest";
import { useLangStore, type Lang } from "./i18n";
import { TRANSLATIONS } from "./i18n/translations";
import { INJECTION_SITES } from "./types";
import {
  formatDate,
  formatDosePerDay,
  formatHalfLife,
  relativeTime,
  formatDateTime,
  fromDateInput,
  siteLabel,
  toDateInput,
  toDateTimeLocal,
  fromDateTimeLocal,
} from "./format";

const LANGS = Object.keys(TRANSLATIONS) as Lang[];

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

/**
 * Dates, times and durations in the reader's language.
 *
 * These used to take the runtime's locale, which is the browser's, and the
 * relative formatter was pinned to "en" outright. In Slovenian the app said
 * "Načrtovana in 26 minutes": half the sentence translated, half not.
 */
describe("the language the formatters use", () => {
  const after = () => useLangStore.setState({ lang: "en" });
  const noon = new Date(2026, 8, 27, 12, 0).getTime();

  it("names the month in the chosen language", () => {
    useLangStore.setState({ lang: "en" });
    const english = formatDate(noon, noon);
    useLangStore.setState({ lang: "sl" });
    const slovenian = formatDate(noon, noon);
    expect(english).not.toBe(slovenian);
    expect(slovenian).toContain("sep");
    after();
  });

  it("phrases a relative time in the chosen language", () => {
    useLangStore.setState({ lang: "en" });
    expect(relativeTime(noon + 26 * 60_000, noon)).toBe("in 26 minutes");
    useLangStore.setState({ lang: "sl" });
    expect(relativeTime(noon + 26 * 60_000, noon)).not.toContain("in 26 minutes");
    after();
  });

  /* Intl has no phrase for this one, so it is a key like any other. */
  it("translates just now, which Intl does not provide", () => {
    useLangStore.setState({ lang: "sl" });
    expect(relativeTime(noon, noon)).toBe("pravkar");
    after();
  });

  it("translates a half-life, including the case with no figure at all", () => {
    useLangStore.setState({ lang: "sl" });
    expect(formatHalfLife(null)).toBe("Ni ugotovljeno");
    expect(formatHalfLife(30)).toContain("ur");
    after();
  });

  /*
   * Slovenian has a dual, so two hours is not the same word as three. The
   * family is selected by Intl.PluralRules, which is the whole reason
   * formatHalfLife goes through translate rather than appending an s.
   */
  it("uses the dual where the language has one", () => {
    useLangStore.setState({ lang: "sl" });
    expect(formatHalfLife(2)).toBe("2 uri");
    expect(formatHalfLife(3)).toBe("3 ure");
    after();
  });
});

/*
 * A body part is a description and translates; a compound is a name and does
 * not. These hold the first half of that, and they hold it for every site
 * rather than for the one somebody happened to look at.
 */
describe("siteLabel", () => {
  const after = () => useLangStore.setState({ lang: "en" });

  it("names every site in every language", () => {
    for (const lang of LANGS) {
      useLangStore.setState({ lang });
      for (const s of INJECTION_SITES) {
        const label = siteLabel(s.id);
        expect(label).toBeTruthy();
        // The id leaking through is the failure this catches: a missing key
        // falls back to "thigh-l", which reads as a bug rather than a name.
        expect(label).not.toBe(s.id);
      }
    }
    after();
  });

  it("answers differently in a language that is not English", () => {
    useLangStore.setState({ lang: "en" });
    const english = siteLabel("thigh-l");
    useLangStore.setState({ lang: "sl" });
    expect(siteLabel("thigh-l")).not.toBe(english);
    after();
  });

  /* An import naming a site this version does not know still has to render. */
  it("falls back to whatever it was given", () => {
    expect(siteLabel("elbow-l" as never)).toBe("elbow-l");
    after();
  });

  /*
   * The CSV keeps the English label on purpose, so a file with an English
   * header does not carry Slovenian values. This is the line that says the two
   * are allowed to differ, and that the English one still exists.
   */
  it("leaves the CSV label alone", () => {
    useLangStore.setState({ lang: "sl" });
    const csv = INJECTION_SITES.find((s) => s.id === "thigh-l")!.label;
    expect(csv).toBe("Left thigh");
    expect(siteLabel("thigh-l")).not.toBe(csv);
    after();
  });
});
