import { ROUTE_LABEL, type HalfLifeEstimate } from "./types";

/** Display helpers. Everything here is presentation only, no arithmetic that matters. */

/** Trim trailing zeros so 0.10 reads as 0.1 and 2.00 as 2. */
export function trim(n: number, maxDp = 4) {
  if (!Number.isFinite(n)) return "n/a";
  return Number(n.toFixed(maxDp)).toString();
}

/**
 * A dose in whichever unit reads best: micrograms below 1 mg, milligrams above.
 * Doses in this space span 25 mcg to 15 mg, so a single unit would force
 * either 0.025 mg or 15000 mcg on the reader.
 */
export function formatDose(mcg: number, force?: "mcg" | "mg") {
  if (!Number.isFinite(mcg)) return "n/a";
  const unit = force ?? (Math.abs(mcg) >= 1000 ? "mg" : "mcg");
  return unit === "mg" ? `${trim(mcg / 1000, 3)} mg` : `${trim(mcg, 2)} mcg`;
}

export function formatDoseParts(mcg: number, force?: "mcg" | "mg") {
  if (!Number.isFinite(mcg)) return { value: "n/a", unit: "" };
  const unit = force ?? (Math.abs(mcg) >= 1000 ? "mg" : "mcg");
  return unit === "mg"
    ? { value: trim(mcg / 1000, 3), unit: "mg" }
    : { value: trim(mcg, 2), unit: "mcg" };
}

export function formatMl(ml: number, dp = 3) {
  if (!Number.isFinite(ml)) return "n/a";
  return `${trim(ml, dp)} mL`;
}

export function formatUnits(units: number) {
  if (!Number.isFinite(units)) return "n/a";
  return trim(units, 2);
}

export function formatConcentration(mcgPerMl: number) {
  if (!Number.isFinite(mcgPerMl)) return "n/a";
  const mgPerMl = mcgPerMl / 1000;
  return mgPerMl >= 0.1 ? `${trim(mgPerMl, 3)} mg/mL` : `${trim(mcgPerMl, 1)} mcg/mL`;
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "in 3 hours", "2 days ago". Picks the largest sensible unit. */
export function relativeTime(targetMs: number, nowMs = Date.now()) {
  const diffMin = Math.round((targetMs - nowMs) / 60000);
  const abs = Math.abs(diffMin);
  if (abs < 1) return "just now";
  if (abs < 60) return rtf.format(diffMin, "minute");
  const hours = Math.round(diffMin / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  const days = Math.round(diffMin / 1440);
  if (Math.abs(days) < 30) return rtf.format(days, "day");
  return rtf.format(Math.round(days / 30), "month");
}

/** A duration in hours, phrased for a human: "36 h", "4.5 d", "12 min". */
export function formatDuration(hours: number) {
  if (!Number.isFinite(hours)) return "n/a";
  const abs = Math.abs(hours);
  if (abs < 1) return `${Math.round(hours * 60)} min`;
  if (abs < 48) return `${trim(hours, 1)} h`;
  return `${trim(hours / 24, 1)} d`;
}

/** Half-lives read better in their natural unit than always in hours. */
export function formatHalfLife(hours: number | null) {
  if (hours == null) return "Not established";
  if (hours < 1) return `${Math.round(hours * 60)} minutes`;
  if (hours < 48) return `${trim(hours, 1)} hours`;
  return `${trim(hours / 24, 1)} days`;
}

const dateFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const dateYearFmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short" });

/**
 * A date, carrying the year only when it is not the current one.
 *
 * "Mar 13" read in August is not a date, it is a guess. The reader has to
 * decide whether it means seven months ahead or five behind, and on the Stock
 * page, where the question is when to reorder, guessing wrong in either
 * direction is expensive.
 *
 * Not a new idea in this file: `formatDateTime` has always worked this way, and
 * now shares the implementation. The dropped year was only ever an economy for
 * dates near today, and it stops being one the moment a date crosses a new
 * year.
 *
 * `nowMs` is a parameter so the choice can be tested without waiting for
 * December.
 */
export function formatDate(ms: number, nowMs = Date.now()) {
  const sameYear = new Date(ms).getFullYear() === new Date(nowMs).getFullYear();
  return (sameYear ? dateFmt : dateYearFmt).format(ms);
}

export const formatTime = (ms: number) => timeFmt.format(ms);
export const formatWeekday = (ms: number) => weekdayFmt.format(ms);

export function formatDateTime(ms: number, nowMs = Date.now()) {
  return `${formatDate(ms, nowMs)}, ${timeFmt.format(ms)}`;
}

/** Value for a datetime-local input, in local time rather than UTC. */
export function toDateTimeLocal(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes())}`;
}

export function fromDateTimeLocal(value: string) {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : Date.now();
}

export function toDateInput(ms: number) {
  return toDateTimeLocal(ms).slice(0, 10);
}

/**
 * Read a date input's value as local midnight.
 *
 * `new Date("2026-07-05")` is not the same thing as `new Date("2026-07-05T00:00")`.
 * The language parses a date-only string as UTC and a date-time string without
 * an offset as local, so the bare form lands on the evening before anywhere
 * west of Greenwich. In US Central that turned a picked 5 July into a stored
 * 4 July, which is exactly what a date picker never means.
 *
 * Built from parts rather than parsed, which sidesteps the question entirely
 * and matches how `src/lib/import/values.ts` already reads a date. On a day
 * where local midnight does not exist, because the clocks jump forward at
 * midnight, the Date constructor lands on the first instant that does.
 */
export function fromDateInput(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return Date.now();

  const ms = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  return Number.isFinite(ms) ? ms : Date.now();
}

export const percent = (fraction: number, dp = 0) =>
  Number.isFinite(fraction) ? `${(fraction * 100).toFixed(dp)}%` : "n/a";

// ---------------------------------------------------------------------------
// Half-lives the app draws but does not assert
// ---------------------------------------------------------------------------

/**
 * How loudly to say it. The three levels are three different claims and they
 * do not deserve the same tone: an animal measurement is a fact about animals,
 * and a vendor's number is a fact about the vendor.
 */
export const ESTIMATE_LABEL: Record<HalfLifeEstimate["evidence"], string> = {
  preclinical: "Animal data",
  preliminary: "Early human data",
  anecdotal: "Claimed, not measured",
};

/**
 * One sentence on where the figure came from, shared by the chart and the
 * library so the two can never describe the same number differently.
 *
 * The anecdotal wording is deliberately blunt. "Unconfirmed" and "estimated"
 * both suggest a measurement that has not been checked yet, which is a
 * flattering description of a number nobody measured at all.
 */
export function describeHalfLifeEstimate(e: HalfLifeEstimate) {
  if (e.evidence === "anecdotal") {
    return `${formatHalfLife(e.hours)}, claimed by ${e.source}. No study has measured it.`;
  }
  const where = e.species ?? "an unstated species";
  const how = e.route ? ` given it ${ROUTE_LABEL[e.route].toLowerCase()}` : "";
  const early = e.evidence === "preliminary" ? ", in early work that has not settled" : "";
  return `${formatHalfLife(e.hours)}, measured in ${where}${how}${early}, reported by ${e.source}.`;
}
