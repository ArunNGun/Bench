/**
 * What a protocol will do, before you run it.
 *
 * Everything else in this app models what happened. This models what is about
 * to, which is the question people are actually asking when they are deciding
 * between two doses or two frequencies. The maths is identical; the only
 * difference is that the dose events are generated from a schedule rather than
 * read out of a log.
 *
 * The useful answers it gives are not the curve itself. They are: how long
 * until levels stop climbing, how far the peaks and troughs sit apart, and how
 * much higher steady state is than the first dose. That last one is the one
 * people get wrong. A weekly compound with a long half-life can end up at three
 * times the level of the first injection without the dose ever changing, and
 * the difference between "this feels fine" in week one and week six is
 * accumulation, not tolerance.
 *
 * Nothing here recommends a dose. It reports what a schedule implies.
 */

import type { Protocol } from "../types";
import { accumulationRatio, levelSeries, timeToSteadyState, type SeriesPoint } from "./pk";
import { doseTimesBetween, scheduledDoseMcg, dosesPerWeek } from "./schedule";

const HOUR = 3_600_000;
const DAY = 86_400_000;

export interface ProjectionInput {
  protocol: Protocol;
  halfLifeHours: number;
  tmaxHours?: number;
  /** Where the projection starts. Defaults to the protocol's own start. */
  fromMs?: number;
  /** How far forward to model. */
  days?: number;
  /** Points on the curve. */
  steps?: number;
}

export interface Projection {
  series: SeriesPoint[];
  /** Dose instants inside the window, for marking the axis. */
  doseTimes: number[];
  /**
   * Level at steady state relative to the peak of a single first dose. 1 means
   * no accumulation at all. Null when the schedule has no fixed interval.
   */
  accumulation: number | null;
  /** Hours until levels are within 3% of steady state. */
  hoursToSteady: number;
  /** Highest and lowest level once accumulation has settled. */
  steadyPeak: number | null;
  steadyTrough: number | null;
  /**
   * Peak divided by trough at steady state. A large number means the curve
   * swings a long way between doses, which is the argument for splitting them.
   * Null when there is no repeating interval to measure across.
   */
  swing: number | null;
}

/**
 * Model a protocol forward from its start.
 *
 * The caller supplies the pharmacokinetics rather than a peptide, because a
 * blend has to be projected per component and only the caller knows which
 * component this call is for.
 */
export function project(input: ProjectionInput): Projection {
  const { protocol, halfLifeHours, tmaxHours } = input;
  const from = input.fromMs ?? protocol.startedAt;
  const days = input.days ?? defaultWindowDays(halfLifeHours, protocol);
  const steps = input.steps ?? 240;
  const to = from + days * DAY;

  const doseTimes = doseTimesBetween(protocol.schedule, protocol.startedAt, from, to, protocol.endedAt);

  const doses = doseTimes.map((at) => ({ at, amountMcg: scheduledDoseMcg(protocol, at) }));
  const reference = doses[0]?.amountMcg || protocol.doseMcg || 1;

  const series = levelSeries(from, to, steps, doses, { halfLifeHours, tmaxHours }, reference);

  const perWeek = dosesPerWeek(protocol.schedule);
  const intervalHours = perWeek > 0 ? (7 * 24) / perWeek : 0;
  const accumulation = intervalHours > 0 ? accumulationRatio(intervalHours, halfLifeHours) : null;
  const hoursToSteady = timeToSteadyState(halfLifeHours);

  // Measure the swing over the last whole interval in the window, by which
  // point accumulation has settled if the window is long enough to have got
  // there. Sampling earlier would report the climb rather than the plateau.
  let steadyPeak: number | null = null;
  let steadyTrough: number | null = null;
  let swing: number | null = null;

  if (intervalHours > 0 && series.length) {
    const windowStart = to - intervalHours * HOUR;
    const tail = series.filter((p) => p.t >= windowStart);
    if (tail.length > 1) {
      steadyPeak = Math.max(...tail.map((p) => p.level));
      steadyTrough = Math.min(...tail.map((p) => p.level));
      swing = steadyTrough > 0 ? steadyPeak / steadyTrough : null;
    }
  }

  return { series, doseTimes, accumulation, hoursToSteady, steadyPeak, steadyTrough, swing };
}

/**
 * A window long enough to show the plateau.
 *
 * Five half-lives is where accumulation is effectively complete, plus one more
 * dosing interval so the settled curve is visible rather than just reached.
 * Clamped because a 30-day-half-life compound would otherwise project half a
 * year and a 2-hour one would project nothing readable.
 */
export function defaultWindowDays(halfLifeHours: number, protocol: Protocol): number {
  const perWeek = dosesPerWeek(protocol.schedule);
  const intervalDays = perWeek > 0 ? 7 / perWeek : 7;
  const toSteadyDays = timeToSteadyState(halfLifeHours) / 24;
  return Math.min(180, Math.max(14, Math.ceil(toSteadyDays + intervalDays * 2)));
}

/**
 * Plain-language reading of an accumulation figure.
 *
 * Thresholds are presentational, not clinical. The point is to say out loud
 * that the sixth injection is not the same as the first, which is the thing
 * people are surprised by.
 */
export function describeAccumulation(accumulation: number | null): string | null {
  if (accumulation == null) return null;
  if (accumulation < 1.15) {
    return "Each dose has essentially cleared before the next, so levels do not build.";
  }
  if (accumulation < 1.75) {
    return "Levels build modestly over the first few doses before settling.";
  }
  if (accumulation < 3) {
    return "Levels roughly double or more between the first dose and steady state. The early doses are not representative of where this settles.";
  }
  return "Steady state sits several times higher than the first dose. Dosing this frequently relative to the half-life is what drives that, not the dose size.";
}
