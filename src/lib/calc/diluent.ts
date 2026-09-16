/**
 * Bottles of water, measured in millilitres.
 *
 * Kept apart from `Vial` rather than folded into it, and that is the whole
 * design decision. A vial is a mass: `strengthMg`, `drawnMcg`, a concentration
 * derived as mass over volume, doses remaining, cost per milligram, a date the
 * shelf runs dry. Bacteriostatic water has no milligrams, so a bottle wearing
 * the vial type would be a category error carried into every one of those
 * figures, and each of them would need to remember to exclude it.
 *
 * Ten places to remember is ten places to forget. A separate collection means
 * `stockFor`, `pickVialForDose`, `groupSealedVials`, `totalSpend` and the
 * compound picker never see a bottle at all, so they cannot get it wrong.
 *
 * The cost of that choice, stated plainly: two inventories to keep, and this
 * file repeats a little of `inventory.ts` in a different unit. That repetition
 * is deliberate and preferable to one model pretending to be two things.
 */

import type { DiluentBottle, DiluentKind } from "../types";
import { beyondUseDate } from "./reconstitution";

export const OPEN_STATES: DiluentBottle["state"][] = ["open"];
const DEAD_STATES: DiluentBottle["state"][] = ["finished", "discarded"];

/** Millilitres still in the bottle. */
export function bottleRemainingMl(b: Pick<DiluentBottle, "volumeMl" | "drawnMl">) {
  return Math.max(0, b.volumeMl - (b.drawnMl ?? 0));
}

export function bottleFractionRemaining(b: Pick<DiluentBottle, "volumeMl" | "drawnMl">) {
  return b.volumeMl > 0 ? bottleRemainingMl(b) / b.volumeMl : 0;
}

/** Past its beyond-use date, or past the printed date while still sealed. */
export function bottleExpired(b: DiluentBottle, nowMs: number) {
  if (b.budAt != null && b.budAt < nowMs) return true;
  if (b.state === "sealed" && b.expiresAt != null && b.expiresAt < nowMs) return true;
  return false;
}

/** A bottle you could still draw from today. */
export function bottleUsable(b: DiluentBottle, nowMs: number) {
  return !DEAD_STATES.includes(b.state) && !bottleExpired(b, nowMs) && bottleRemainingMl(b) > 0;
}

/**
 * Which bottle to suggest, given what is being made up.
 *
 * The same order of preference as picking a vial for a dose, for the same
 * reasons: finish what is open before breaking the seal on another, and among
 * equals reach for whatever expires soonest, so stock gets used rather than
 * thrown away. A bottle that cannot cover the whole amount is still offered
 * last, because drawing the rest from a second bottle is a real thing people
 * do and refusing to suggest anything would be less useful than suggesting
 * the one they will probably reach for.
 */
export function pickBottle(
  bottles: DiluentBottle[],
  kind: DiluentKind,
  ml: number,
  nowMs: number): DiluentBottle | null {
  const candidates = bottles.filter((b) => b.kind === kind && bottleUsable(b, nowMs));
  if (!candidates.length) return null;

  const byDeadline = (a: DiluentBottle, b: DiluentBottle) =>
    (a.budAt ?? a.expiresAt ?? Infinity) - (b.budAt ?? b.expiresAt ?? Infinity);

  const open = candidates.filter((b) => OPEN_STATES.includes(b.state));
  const enough = open.filter((b) => bottleRemainingMl(b) >= ml - 1e-9);
  if (enough.length) return [...enough].sort(byDeadline)[0];
  if (open.length) return [...open].sort(byDeadline)[0];

  return [...candidates].sort(byDeadline)[0];
}

/**
 * The shelf, in the order a person would reach along it.
 *
 * The list used to be in the order bottles were entered, which put an open
 * bottle, a sealed one and another open one in a row and made the shelf read
 * like a drawer rather than a shelf.
 *
 * Sorted by the same preference `pickBottle` already applies, deliberately, so
 * that the bottle at the top is the one the app will suggest next. Two orders
 * for one shelf would be worse than an arbitrary one: the eye would learn the
 * wrong first bottle.
 *
 * Open before sealed, because finishing what is already open is the point.
 * Within each, the soonest deadline first, so water gets used rather than
 * thrown away. Anything unusable, expired or emptied, sinks to the bottom,
 * where it reads as something to deal with rather than something to draw from.
 */
export function shelfOrder(bottles: DiluentBottle[], nowMs: number): DiluentBottle[] {
  const rank = (b: DiluentBottle) => {
    if (!bottleUsable(b, nowMs)) return 2;
    return OPEN_STATES.includes(b.state) ? 0 : 1;
  };
  const deadline = (b: DiluentBottle) => b.budAt ?? b.expiresAt ?? Infinity;

  return [...bottles].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      deadline(a) - deadline(b) ||
      // A stable last resort, so two bottles with neither date never swap
      // places between renders.
      a.id.localeCompare(b.id));
}

/**
 * One row of the shelf, which is one bottle or several of the same thing.
 *
 * `bottle` is what the buttons act on and `bottles` is what the figures are
 * about, which is the arrangement `groupSealedVials` already uses on the other
 * shelf. Reaching for one bottle out of four identical ones is a real action;
 * opening all four is not, so a button on a grouped row still opens one.
 */
export interface ShelfRow {
  /** Stable across renders and unique within the list. */
  key: string;
  /** The one the buttons act on: whichever this shelf would reach for next. */
  bottle: DiluentBottle;
  /** Every bottle this row stands for, in the order the shelf would reach. */
  bottles: DiluentBottle[];
  count: number;
}

/**
 * The shelf as rows, collapsing interchangeable bottles when asked to.
 *
 * Only a sealed bottle that is still usable can be collapsed, and both halves
 * of that matter. An open bottle has its own beyond-use date running from the
 * day it was punctured, so a group would have to either hide that date or
 * invent one for bottles that do not share it. A bottle past its date has to
 * keep its own row for the same reason a vial past its date is counted
 * separately: a filter that can hide something has to say so where it hides it.
 *
 * The key is kind and size, because that is what makes two bottles the same
 * thing to reach for. 30 mL bacteriostatic and 10 mL saline stay two rows.
 *
 * Order is `shelfOrder`'s, untouched: a group sits where its first bottle sat,
 * so turning grouping on shortens the list without rearranging it.
 */
export function shelfRows(
  bottles: DiluentBottle[],
  nowMs: number,
  grouped: boolean): ShelfRow[] {
  const ordered = shelfOrder(bottles, nowMs);
  if (!grouped) {
    return ordered.map((b) => ({ key: b.id, bottle: b, bottles: [b], count: 1 }));
  }

  const rows: ShelfRow[] = [];
  const byKey = new Map<string, ShelfRow>();

  for (const b of ordered) {
    const groupable = b.state === "sealed" && bottleUsable(b, nowMs);
    if (!groupable) {
      rows.push({ key: b.id, bottle: b, bottles: [b], count: 1 });
      continue;
    }

    const key = `${b.kind}:${b.volumeMl}`;
    const seen = byKey.get(key);
    if (seen) {
      seen.bottles.push(b);
      seen.count++;
      continue;
    }

    const row: ShelfRow = { key, bottle: b, bottles: [b], count: 1 };
    byKey.set(key, row);
    rows.push(row);
  }

  return rows;
}

/**
 * Open a bottle without taking anything out of it yet.
 *
 * Opening used to be a side effect of drawing, which is true only for water
 * that goes through this app. Somebody who breaks the seal for something Bench
 * does not track had nothing to press, and the shelf then said sealed about a
 * bottle that was not.
 *
 * The date matters as much as the state: a bottle's own clock starts at first
 * puncture, and the beyond-use window is the same 28 days the app already uses
 * for a multi-dose vial, which is the convention that rule comes from rather
 * than a number invented here.
 */
export function openBottle(
  bottles: DiluentBottle[],
  id: string,
  nowMs: number): DiluentBottle[] {
  return bottles.map((b) =>
    b.id === id && b.state === "sealed"
      ? { ...b, state: "open" as const, openedAt: nowMs, budAt: beyondUseDate(nowMs) }
      : b);
}

/**
 * Take water out of a bottle.
 *
 * Opens a sealed one, because drawing from it is what opening means, and marks
 * it finished once it is empty. Never draws past empty: a bottle cannot owe
 * you water.
 */
export function drawFromBottle(
  bottles: DiluentBottle[],
  id: string,
  ml: number,
  nowMs: number): DiluentBottle[] {
  if (!(ml > 0)) return bottles;

  return bottles.map((b) => {
    if (b.id !== id) return b;

    const drawnMl = Math.min(b.volumeMl, (b.drawnMl ?? 0) + ml);
    const emptied = drawnMl >= b.volumeMl - 1e-9;
    const wasSealed = b.state === "sealed";

    return {
      ...b,
      drawnMl,
      // Drawing from a sealed bottle opens it, and opening it here has to mean
      // exactly what the button means, or the same bottle would carry a
      // different beyond-use date depending on how it was opened.
      openedAt: b.openedAt ?? (wasSealed ? nowMs : b.openedAt),
      budAt: b.budAt ?? (wasSealed ? beyondUseDate(nowMs) : b.budAt),
      state: emptied && b.state !== "discarded" ? "finished" : wasSealed ? "open" : b.state,
    };
  });
}

/** Put water back, for when a reconstitution is corrected or undone. */
export function returnToBottle(bottles: DiluentBottle[], id: string, ml: number): DiluentBottle[] {
  if (!(ml > 0)) return bottles;

  return bottles.map((b) => {
    if (b.id !== id) return b;
    const drawnMl = Math.max(0, (b.drawnMl ?? 0) - ml);
    return {
      ...b,
      drawnMl,
      state: b.state === "finished" && drawnMl < b.volumeMl - 1e-9 ? "open" : b.state,
    };
  });
}

export interface DiluentStock {
  remainingMl: number;
  bottles: number;
  /** Bottles already open, which is what a beyond-use date runs against. */
  openBottles: number;
}

/** What is on the shelf of one kind of water. */
export function diluentStock(
  bottles: DiluentBottle[],
  kind: DiluentKind,
  nowMs: number): DiluentStock {
  const usable = bottles.filter((b) => b.kind === kind && bottleUsable(b, nowMs));
  return {
    remainingMl: usable.reduce((sum, b) => sum + bottleRemainingMl(b), 0),
    bottles: usable.length,
    openBottles: usable.filter((b) => OPEN_STATES.includes(b.state)).length,
  };
}
