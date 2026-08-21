/**
 * Inventory ledger.
 *
 * Consumption is tracked in MICROGRAMS, not millilitres. Volume only has
 * meaning once a vial is reconstituted, but a dose has a mass whatever state
 * the vial is in, so mass is the thing that depletes stock, and volume is
 * derived from it for display.
 */

import type { Protocol, Vial, VialState } from "../types";
import { protocolDoseTimesBetween, scheduledDoseMcg } from "./schedule";

export const MCG_PER_MG = 1000;

/** Nominal mass the vial was labelled with. */
export function vialCapacityMcg(v: Pick<Vial, "strengthMg">) {
  return v.strengthMg * MCG_PER_MG;
}

/** Mass still in the vial. */
export function vialRemainingMcg(v: Pick<Vial, "strengthMg" | "drawnMcg">) {
  return Math.max(0, vialCapacityMcg(v) - (v.drawnMcg ?? 0));
}

export function vialFractionRemaining(v: Pick<Vial, "strengthMg" | "drawnMcg">) {
  const cap = vialCapacityMcg(v);
  return cap > 0 ? vialRemainingMcg(v) / cap : 0;
}

/** Concentration of a reconstituted vial, mcg/mL. NaN before reconstitution. */
export function vialConcentration(v: Pick<Vial, "strengthMg" | "diluentMl">) {
  if (!v.diluentMl || v.diluentMl <= 0) return NaN;
  return vialCapacityMcg(v) / v.diluentMl;
}

/** Solution left, in millilitres. Zero for a vial that is still sealed. */
export function vialRemainingMl(v: Pick<Vial, "strengthMg" | "diluentMl" | "drawnMcg">) {
  const conc = vialConcentration(v);
  if (!Number.isFinite(conc)) return 0;
  return vialRemainingMcg(v) / conc;
}

const DEAD_STATES: VialState[] = ["finished", "discarded"];

/** Past its beyond-use date, or past the manufacturer's date while sealed. */
export function vialExpired(v: Vial, nowMs: number) {
  if (v.budAt != null && v.budAt < nowMs) return true;
  if (v.state === "sealed" && v.expiresAt != null && v.expiresAt < nowMs) return true;
  return false;
}

/** A vial that can still supply a dose. */
export function vialUsable(v: Vial, nowMs: number) {
  return !DEAD_STATES.includes(v.state) && !vialExpired(v, nowMs) && vialRemainingMcg(v) > 0;
}

/**
 * Which vial a dose should come out of.
 *
 * Prefers an already-open vial over breaking into a sealed one, and among
 * equals prefers whichever expires soonest, so stock gets used before it has
 * to be thrown away. Falls back to an open vial with a partial amount left
 * rather than opening a new one for the remainder.
 */
export function pickVialForDose(
  vials: Vial[],
  peptideId: string,
  doseMcg: number,
  nowMs: number): Vial | null {
  const candidates = vials.filter((v) => v.peptideId === peptideId && vialUsable(v, nowMs));
  if (!candidates.length) return null;

  const byDeadline = (a: Vial, b: Vial) =>
    (a.budAt ?? a.expiresAt ?? Infinity) - (b.budAt ?? b.expiresAt ?? Infinity);

  const open = candidates.filter((v) => v.state === "reconstituted");
  const fullEnough = open.filter((v) => vialRemainingMcg(v) >= doseMcg - 1e-6);
  if (fullEnough.length) return [...fullEnough].sort(byDeadline)[0];
  if (open.length) return [...open].sort(byDeadline)[0];

  const sealed = candidates.filter((v) => v.state === "sealed");
  if (sealed.length) return [...sealed].sort(byDeadline)[0];

  return [...candidates].sort(byDeadline)[0];
}

/**
 * Take mass out of a vial.
 *
 * Never goes below empty, and marks the vial finished once it is. Returns a
 * new array; the input is untouched.
 */
export function drawFromVial(vials: Vial[], vialId: string, mcg: number): Vial[] {
  if (!(mcg > 0)) return vials;
  return vials.map((v) => {
    if (v.id !== vialId) return v;
    const capacity = vialCapacityMcg(v);
    const drawnMcg = Math.min(capacity, (v.drawnMcg ?? 0) + mcg);
    const emptied = drawnMcg >= capacity - 1e-6;
    return {
      ...v,
      drawnMcg,
      state: emptied && v.state !== "discarded" ? ("finished" as VialState) : v.state,
    };
  });
}

/**
 * Put mass back, for when a logged dose is deleted.
 * Reopens a vial that had been auto-marked finished.
 */
export function returnToVial(vials: Vial[], vialId: string, mcg: number): Vial[] {
  if (!(mcg > 0)) return vials;
  return vials.map((v) => {
    if (v.id !== vialId) return v;
    const drawnMcg = Math.max(0, (v.drawnMcg ?? 0) - mcg);
    const state: VialState =
      v.state === "finished" && drawnMcg < vialCapacityMcg(v) - 1e-6
        ? v.diluentMl
          ? "reconstituted"
          : "sealed"
        : v.state;
    return { ...v, drawnMcg, state };
  });
}

/**
 * What a logged dose takes out of stock. A skipped dose, one with no vial
 * attributed, or a zero dose consumes nothing.
 */
export interface Consumption {
  vialId?: string;
  doseMcg: number;
  skipped?: boolean;
}

const consumes = (c: Consumption | null | undefined): c is Consumption =>
  !!c && !c.skipped && !!c.vialId && c.doseMcg > 0;

/**
 * Move stock from what a dose used to consume to what it consumes now.
 *
 * Editing a logged dose is the one place inventory can silently drift: change
 * the amount, the vial, or the skipped flag and the old draw has to be undone
 * before the new one is applied. Doing it in that order means an edit on the
 * same vial nets out correctly rather than double-counting.
 */
export function reconcileVials(
  vials: Vial[],
  before: Consumption | null,
  after: Consumption | null): Vial[] {
  let out = vials;
  if (consumes(before)) out = returnToVial(out, before.vialId!, before.doseMcg);
  if (consumes(after)) out = drawFromVial(out, after.vialId!, after.doseMcg);
  return out;
}

// ---------------------------------------------------------------------------
// Grouping identical vials
// ---------------------------------------------------------------------------

/** Sealed vials of one compound and strength, treated as a single line. */
export interface VialGroup {
  /** Stable across renders, and unique within a list. */
  key: string;
  peptideId: string;
  strengthMg: number;
  /**
   * Oldest first, so anything acting on "one of these" takes the vial that has
   * been waiting longest. That is the order a person reaches into a fridge in.
   */
  vials: Vial[];
  count: number;
  /** Mass left across the group. Sealed vials are whole, but drawnMcg is honoured. */
  remainingMcg: number;
  /** The soonest manufacturer expiry in the group, which is the one that bites. */
  expiresAt: number | null;
  /**
   * Summed cost of the vials that carry one, or null when they were bought in
   * more than one currency. Adding 40 dollars to 3000 rupees would be a number
   * with no meaning, and this app would rather say nothing than say that.
   */
  cost: number | null;
  currency: string | null;
  /** Vials in the group with no price recorded, so a total can be read honestly. */
  unpricedCount: number;
}

/**
 * Collapse interchangeable vials into one line each.
 *
 * Only sealed vials are interchangeable. Two reconstituted vials of the same
 * compound differ in the things that decide what you do next, their
 * concentration and their beyond-use date, so folding them together would hide
 * exactly the figures the page exists to show.
 *
 * Groups come back in the order their first vial appeared, so turning the
 * setting on rearranges the list as little as possible.
 */
export function groupSealedVials(vials: Vial[]): VialGroup[] {
  const order: string[] = [];
  const bucket = new Map<string, Vial[]>();

  for (const v of vials) {
    if (v.state !== "sealed") continue;
    const key = `${v.peptideId}:${v.strengthMg}`;
    if (!bucket.has(key)) {
      bucket.set(key, []);
      order.push(key);
    }
    bucket.get(key)!.push(v);
  }

  return order.map((key) => {
    const group = [...bucket.get(key)!].sort(
      (a, b) => (a.acquiredAt ?? 0) - (b.acquiredAt ?? 0) || a.id.localeCompare(b.id));

    const priced = group.filter((v) => v.cost != null);
    const currencies = new Set(priced.map((v) => v.currency ?? ""));
    const oneCurrency = currencies.size <= 1;

    const expiries = group.map((v) => v.expiresAt).filter((e): e is number => e != null);

    return {
      key,
      peptideId: group[0].peptideId,
      strengthMg: group[0].strengthMg,
      vials: group,
      count: group.length,
      remainingMcg: group.reduce((sum, v) => sum + vialRemainingMcg(v), 0),
      expiresAt: expiries.length ? Math.min(...expiries) : null,
      cost: priced.length && oneCurrency ? priced.reduce((sum, v) => sum + v.cost!, 0) : null,
      currency: priced.length && oneCurrency ? (priced[0].currency ?? null) : null,
      unpricedCount: group.length - priced.length,
    };
  });
}

export interface Stock {
  /** Mass available across every usable vial. */
  availableMcg: number;
  sealedCount: number;
  openCount: number;
  /** Whole doses left at the given dose size. */
  dosesRemaining: number;
  /** Doses left in already-open vials only. */
  dosesInOpenVials: number;
  /**
   * True when stock exists but no vial has a recorded reconstitution. Doses
   * still deplete correctly; what is missing is the concentration, without
   * which the app cannot tell you how far to draw the plunger.
   */
  needsReconstitution: boolean;
}

export function stockFor(
  vials: Vial[],
  peptideId: string,
  doseMcg: number,
  nowMs: number): Stock {
  const usable = vials.filter((v) => v.peptideId === peptideId && vialUsable(v, nowMs));

  let availableMcg = 0;
  let openMcg = 0;
  let sealedCount = 0;
  let openCount = 0;

  for (const v of usable) {
    const remaining = vialRemainingMcg(v);
    availableMcg += remaining;
    if (v.state === "reconstituted") {
      openMcg += remaining;
      openCount++;
    } else if (v.state === "sealed") {
      sealedCount++;
    }
  }

  const per = (mcg: number) => (doseMcg > 0 ? Math.floor(mcg / doseMcg) : 0);

  return {
    availableMcg,
    sealedCount,
    openCount,
    dosesRemaining: per(availableMcg),
    dosesInOpenVials: per(openMcg),
    needsReconstitution: openCount === 0 && sealedCount > 0,
  };
}

/** Days of supply left, given how often the protocol doses. */
export function daysOfSupply(stock: Stock, dosesPerWeek: number) {
  if (dosesPerWeek <= 0) return null;
  return (stock.dosesRemaining / dosesPerWeek) * 7;
}

/**
 * Days of supply left, by spending the stock against the actual plan.
 *
 * `daysOfSupply` multiplies today's dose and today's frequency out to the
 * horizon, which is right for a protocol that never changes and wrong for one
 * that does. On a plan that steps from 1 mg to 2 mg, holding today's figures
 * constant overstates the runway by the better part of a factor of two, and
 * "126 days left" on a stock that covers seventy is the kind of wrong that gets
 * noticed at the wrong moment.
 *
 * So this walks the scheduled doses forward, subtracting each one at the dose
 * that will actually be drawn, and reports when the stock runs out.
 *
 * Returns null when nothing is scheduled, matching `daysOfSupply` for an
 * as-needed protocol, and caps at `horizonDays` rather than looping to the end
 * of time on a stock that outlives the question.
 */
export function daysOfSupplyForProtocol(
  stock: Stock,
  protocol: Protocol,
  nowMs: number,
  horizonDays = 730): number | null {
  const horizonMs = nowMs + horizonDays * 86_400_000;
  const times = protocolDoseTimesBetween(protocol, nowMs, horizonMs);
  if (!times.length) return null;

  let left = stock.availableMcg;
  for (const at of times) {
    const dose = scheduledDoseMcg(protocol, at);
    if (dose <= 0) continue;
    if (left < dose) return (at - nowMs) / 86_400_000;
    left -= dose;
  }

  return horizonDays;
}
