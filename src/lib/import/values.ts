/**
 * Turning cell text into typed values.
 *
 * Every function here refuses rather than guesses. An import that silently reads
 * "10/07" as 10 July when the file meant 7 October puts a dose on the wrong day,
 * and the record then looks authoritative. So ambiguous input returns null and the
 * row is reported as unreadable instead.
 */

/** Blank means "not recorded", which is not the same as zero. */
export function isBlank(v: string | undefined | null): boolean {
  return v == null || v.trim() === "";
}

/**
 * A number, or null.
 *
 * Tolerates thousands separators and a trailing unit, because exporters write
 * "1,234" and "94.2 kg". Rejects anything with no digits at all.
 */
export function parseNumber(v: string | undefined): number | null {
  if (isBlank(v)) return null;
  // Matching the first numeric literal beats stripping non-numeric characters:
  // stripping keeps e and E as exponent markers, so a product name containing an
  // "e" ("Wegovy 1.0 mg") turns into a leading token of "e" and reads as garbage.
  const cleaned = v!.replace(/(\d),(?=\d{3}(\D|$))/g, "$1");
  const m = /[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?/.exec(cleaned);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/**
 * A date, in whichever unambiguous form the file used.
 *
 * Accepts ISO (`2026-07-26`), ISO with a time, and slash or dot forms where the
 * year comes first. A bare `dd/mm/yyyy` or `mm/dd/yyyy` is deliberately NOT
 * accepted: the two are indistinguishable for the first twelve days of any month,
 * and quietly picking one corrupts a third of the rows in a year's data.
 *
 * `time` is applied when the date carries none of its own.
 */
export function parseDate(v: string | undefined, time?: string): number | null {
  if (isBlank(v)) return null;
  const text = v!.trim();

  // yyyy-mm-dd, yyyy/mm/dd, yyyy.mm.dd, optionally followed by a time.
  const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(text);
  if (!m) return null;

  const [, y, mo, d, h, mi, s] = m;
  const fromDate = h != null;
  const clock = fromDate ? { h: Number(h), mi: Number(mi), s: Number(s ?? 0) } : parseClock(time);

  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const ms = new Date(year, month - 1, day, clock?.h ?? 0, clock?.mi ?? 0, clock?.s ?? 0).getTime();
  if (!Number.isFinite(ms)) return null;

  // Reject a date that rolled over, 31 February would otherwise become 3 March.
  const back = new Date(ms);
  if (back.getFullYear() !== year || back.getMonth() !== month - 1 || back.getDate() !== day) {
    return null;
  }
  return ms;
}

interface Clock {
  h: number;
  mi: number;
  s: number;
}

/** `HH:MM`, `H:MM:SS`, or a 12-hour form with am/pm. */
export function parseClock(v: string | undefined): Clock | null {
  if (isBlank(v)) return null;
  const text = v!.trim();

  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(text);
  if (!m) return null;

  let h = Number(m[1]);
  const mi = Number(m[2]);
  const s = Number(m[3] ?? 0);
  const suffix = m[4]?.toLowerCase();

  if (suffix === "pm" && h < 12) h += 12;
  if (suffix === "am" && h === 12) h = 0;

  if (h > 23 || mi > 59 || s > 59) return null;
  return { h, mi, s };
}

/**
 * A mass in micrograms, from text that may name its own unit.
 *
 * Defaults to milligrams when no unit is present, because every injectable in
 * this space is labelled in mg and a bare "10" meaning 10 micrograms would be a
 * thousandth of any real dose. `units`/`iu` return null: an insulin-syringe unit
 * count cannot be converted to a mass without knowing the vial's concentration.
 */
export function parseDoseMcg(v: string | undefined): number | null {
  if (isBlank(v)) return null;
  const text = v!.trim();
  const n = parseNumber(text);
  if (n == null || n < 0) return null;

  // Read the unit as the letters following the number rather than searching for
  // each unit with word boundaries. \b is defined over ASCII word characters, so
  // in "500 µg" there is no boundary before µ but there is one before g, which
  // made a microgram dose match the gram branch and come out a million times too
  // large.
  const raw = /[\d.]\s*([a-zµμ]+)/i.exec(text)?.[1] ?? "";
  const unit = raw.toLowerCase().replace(/[µμ]/g, "u");

  // No unit at all: milligrams, because every injectable in this space is
  // labelled in mg and a bare 10 meaning micrograms would be a thousandth of any
  // real dose.
  if (unit === "") return n * 1000;
  if (["mcg", "ug", "microgram", "micrograms"].includes(unit)) return n;
  if (["mg", "milligram", "milligrams"].includes(unit)) return n * 1000;
  if (["g", "gram", "grams"].includes(unit)) return n * 1_000_000;
  // A syringe unit count cannot become a mass without the vial's concentration,
  // and an unrecognised unit is not worth a guess either.
  return null;
}

/** Recognise the yes-ish spellings exporters use. */
export function parseBoolean(v: string | undefined): boolean | null {
  if (isBlank(v)) return null;
  const t = v!.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(t)) return true;
  if (["0", "false", "no", "n", "off"].includes(t)) return false;
  return null;
}
