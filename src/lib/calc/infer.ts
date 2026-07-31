/**
 * Working out what protocol a run of logged doses represents.
 *
 * Importing a year of history leaves the app knowing everything about what was
 * taken and nothing about what is *planned*, so nothing shows as due and the Now
 * page has nothing to say. This reads the plan back out of the history.
 *
 * Everything here is a proposal, never applied on its own. The schedule is
 * inferred from the gaps between doses, which is reliable for a regular weekly
 * injection and unreliable for anything erratic, so the result carries what it
 * concluded and how confident it is, and the screen shows both before you accept.
 */

import type { DoseLog, InjectionSite, Peptide, Schedule } from "../types";

const DAY = 86_400_000;

/** Doses closer together than this are the same event logged twice. */
const MIN_GAP_MS = 6 * 60 * 60_000;

/** How much a gap may drift from a whole number of days and still count. */
const DAY_TOLERANCE = 0.35;

export interface InferredProtocol {
  peptideId: string;
  peptideName: string;
  /** The most recent dose, which is what a protocol should continue from. */
  doseMcg: number;
  schedule: Schedule;
  /** Sites the recent history rotates through. */
  sites: InjectionSite[];
  /** First dose of this compound, so the timeline starts where it really did. */
  startedAt: number;
  /** Most recent dose, for "last taken". */
  lastAt: number;
  doseCount: number;
  /** Plain-English account of what was concluded, for the confirm step. */
  summary: string;
  /**
   * How regular the history is. "clear" means the gaps agree; "rough" means they
   * vary enough that the schedule is a guess worth checking.
   */
  confidence: "clear" | "rough";
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** The most common value, ties broken by the earliest seen. */
function mode<T>(xs: T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  let best: T | undefined;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Turn the gaps between doses into a schedule.
 *
 * Weekly is expressed as a weekday rather than "every 7 days" so it survives a
 * dose being taken a day late, an interval schedule would then drift, while a
 * weekday schedule keeps its anchor.
 */
function scheduleFrom(times: number[]): { schedule: Schedule; confidence: "clear" | "rough" } {
  const sorted = [...times].sort((a, b) => a - b);
  const timeOfDay = modalTimeOfDay(sorted);

  if (sorted.length < 2) {
    // One dose says nothing about frequency. Weekly is the commonest pattern for
    // everything this app is used for, and it is visibly a starting point.
    return { schedule: { kind: "days-of-week", daysOfWeek: [new Date(sorted[0]).getDay()], timeOfDay }, confidence: "rough" };
  }

  const gapsDays: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i] - sorted[i - 1];
    if (gap >= MIN_GAP_MS) gapsDays.push(gap / DAY);
  }

  if (!gapsDays.length) {
    return { schedule: { kind: "daily", timeOfDay }, confidence: "rough" };
  }

  const typical = median(gapsDays);
  // Agreement measured against the median rather than the mean, so one long
  // break, a holiday, a supply gap, does not reclassify a regular schedule.
  const agreeing = gapsDays.filter((g) => Math.abs(g - typical) <= DAY_TOLERANCE).length;
  const confidence = agreeing / gapsDays.length >= 0.7 ? "clear" : "rough";

  if (Math.abs(typical - 1) <= DAY_TOLERANCE) {
    return { schedule: { kind: "daily", timeOfDay }, confidence };
  }

  if (Math.abs(typical - 7) <= DAY_TOLERANCE) {
    const weekday = mode(sorted.map((t) => new Date(t).getDay()));
    return {
      schedule: { kind: "days-of-week", daysOfWeek: [weekday ?? new Date(sorted[0]).getDay()], timeOfDay },
      confidence,
    };
  }

  const intervalDays = Math.max(1, Math.round(typical));
  return { schedule: { kind: "interval-days", intervalDays, timeOfDay }, confidence };
}

/**
 * The usual time of day, to the nearest half hour, as "HH:MM".
 *
 * Midnight is taken to mean "the file only carried a date", not a real 00:00
 * injection, and yields no time at all. The test for that has to be the *modal*
 * value rather than a filter applied first: a weekly date-only history that
 * crosses a daylight-saving change lands a couple of its doses on 01:00, and
 * discarding the midnights up front would leave those two stragglers as the only
 * candidates and invent an 01:00 schedule from them.
 */
function modalTimeOfDay(times: number[]): string | undefined {
  if (!times.length) return undefined;

  const slots = times.map((t) => {
    const d = new Date(t);
    return d.getHours() * 2 + (d.getMinutes() >= 30 ? 1 : 0);
  });

  const slot = mode(slots)!;
  if (slot === 0) return undefined;

  const h = Math.floor(slot / 2);
  const m = slot % 2 ? 30 : 0;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function describeSchedule(schedule: Schedule): string {
  if (schedule.kind === "daily") return "every day";
  if (schedule.kind === "days-of-week") {
    const day = schedule.daysOfWeek?.[0];
    return day == null ? "weekly" : `every ${WEEKDAYS[day]}`;
  }
  if (schedule.kind === "interval-days") {
    return schedule.intervalDays === 1 ? "every day" : `every ${schedule.intervalDays} days`;
  }
  return "as needed";
}

export interface InferOptions {
  /** How many recent doses to read the site rotation from. */
  siteWindow?: number;
}

/**
 * Propose a protocol from the logged history of one compound.
 *
 * Picks the compound with the most recent dose, since that is what is currently
 * being run. Returns null when there is nothing to go on.
 */
export function inferProtocol(
  logs: Pick<DoseLog, "at" | "peptideId" | "doseMcg" | "site" | "skipped">[],
  resolve: (peptideId: string) => Peptide | undefined,
  options: InferOptions = {}): InferredProtocol | null {
  const usable = logs.filter((l) => !l.skipped && l.doseMcg > 0);
  if (!usable.length) return null;

  // Whatever was taken most recently is what is being run now.
  const newest = usable.reduce((best, l) => (l.at > best.at ? l : best), usable[0]);
  const peptide = resolve(newest.peptideId);
  if (!peptide) return null;

  const mine = usable
    .filter((l) => l.peptideId === newest.peptideId)
    .sort((a, b) => a.at - b.at);

  const times = mine.map((l) => l.at);
  const { schedule, confidence } = scheduleFrom(times);

  const recent = mine.slice(-(options.siteWindow ?? 10));
  const sites = [...new Set(recent.map((l) => l.site).filter((s): s is InjectionSite => !!s))];

  const doseMcg = mine[mine.length - 1].doseMcg;
  const doseMg = Number((doseMcg / 1000).toFixed(3));

  return {
    peptideId: peptide.id,
    peptideName: peptide.name,
    doseMcg,
    schedule,
    sites,
    startedAt: times[0],
    lastAt: times[times.length - 1],
    doseCount: mine.length,
    confidence,
    summary: `${doseMg} mg of ${peptide.name} ${describeSchedule(schedule)}, from ${mine.length} logged dose${mine.length === 1 ? "" : "s"}${sites.length ? ` rotating through ${sites.length} site${sites.length === 1 ? "" : "s"}` : ""}.`,
  };
}

/** Every compound in the history that could become its own protocol. */
export function inferAllProtocols(
  logs: Pick<DoseLog, "at" | "peptideId" | "doseMcg" | "site" | "skipped">[],
  resolve: (peptideId: string) => Peptide | undefined,
  options: InferOptions = {}): InferredProtocol[] {
  const ids = [...new Set(logs.filter((l) => !l.skipped && l.doseMcg > 0).map((l) => l.peptideId))];

  return ids
    .map((id) => inferProtocol(logs.filter((l) => l.peptideId === id), resolve, options))
    .filter((p): p is InferredProtocol => p !== null)
    .sort((a, b) => b.lastAt - a.lastAt);
}
