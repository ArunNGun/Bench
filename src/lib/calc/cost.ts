/**
 * What this costs.
 *
 * Cost is recorded per vial, so everything downstream is derived: the price of
 * a single dose falls out of the vial price and how many doses it yields, and
 * a weekly rate falls out of that plus the schedule.
 */

import type { Vial } from "../types";
import { vialCapacityMcg } from "./inventory";

/** Cost of a milligram, from a vial's price and label strength. */
export function costPerMg(vial: Pick<Vial, "cost" | "strengthMg">): number | null {
  if (vial.cost == null || !(vial.cost > 0) || !(vial.strengthMg > 0)) return null;
  return vial.cost / vial.strengthMg;
}

/** Cost of one dose drawn from a vial at that price. */
export function costPerDose(
  vial: Pick<Vial, "cost" | "strengthMg">,
  doseMcg: number): number | null {
  const perMg = costPerMg(vial);
  if (perMg == null || !(doseMcg > 0)) return null;
  return perMg * (doseMcg / 1000);
}

export interface SpendSummary {
  /** Total spent on vials of this peptide that carry a price. */
  totalSpend: number;
  /** The currency every figure here is in, or null when they disagree. */
  currency: string | null;
  /**
   * Prices for this peptide were recorded in more than one currency, so no
   * blended rate exists. Every money figure below is null rather than a sum of
   * unlike things.
   */
  mixedCurrencies: boolean;
  /** How many vials that covers. */
  pricedVials: number;
  /** Vials with no price recorded, so the total understates reality. */
  unpricedVials: number;
  /** Blended cost per milligram across the priced vials. */
  costPerMg: number | null;
  costPerDose: number | null;
  costPerWeek: number | null;
  costPerMonth: number | null;
}

/**
 * Spend for one peptide.
 *
 * Blends the price across every priced vial rather than using the newest, so
 * a one-off expensive batch does not distort the rate. Vials with no price are
 * counted separately instead of being treated as free.
 */
export function spendFor(
  vials: Vial[],
  peptideId: string,
  doseMcg: number,
  dosesPerWeek: number,
  fallbackCurrency = "INR"): SpendSummary {
  const mine = vials.filter((v) => v.peptideId === peptideId);
  const priced = mine.filter((v) => v.cost != null && v.cost > 0 && v.strengthMg > 0);

  /*
   * Blending across currencies would produce a rate per milligram that is not
   * a price in anything. Where they disagree the honest answer is no answer,
   * which the callers already handle: every figure below is nullable.
   */
  const currencies = new Set(priced.map((v) => v.currency ?? fallbackCurrency));
  const mixedCurrencies = currencies.size > 1;

  const totalSpend = priced.reduce((s, v) => s + v.cost!, 0);
  const totalMg = priced.reduce((s, v) => s + v.strengthMg, 0);
  const perMg = mixedCurrencies || totalMg <= 0 ? null : totalSpend / totalMg;
  const perDose = perMg != null && doseMcg > 0 ? perMg * (doseMcg / 1000) : null;
  const perWeek = perDose != null && dosesPerWeek > 0 ? perDose * dosesPerWeek : null;

  return {
    totalSpend: mixedCurrencies ? 0 : totalSpend,
    currency: mixedCurrencies ? null : ([...currencies][0] ?? null),
    mixedCurrencies,
    pricedVials: priced.length,
    unpricedVials: mine.length - priced.length,
    costPerMg: perMg,
    costPerDose: perDose,
    costPerWeek: perWeek,
    // A month is 365/12 weeks, not four, four undercounts by about 8%.
    costPerMonth: perWeek != null ? (perWeek * 365) / 12 / 7 : null,
  };
}

/** Value still sitting unused in a vial, at what it cost. */
export function remainingValue(vial: Vial): number | null {
  const perMg = costPerMg(vial);
  if (perMg == null) return null;
  const remainingMg = Math.max(0, vialCapacityMcg(vial) - (vial.drawnMcg ?? 0)) / 1000;
  return perMg * remainingMg;
}

export interface CurrencyTotal {
  currency: string;
  total: number;
  /** How many vials that figure covers. */
  vials: number;
}

/**
 * Add money up, and only ever within one currency.
 *
 * A vial carries its own currency, so a shelf can hold one bought in euros and
 * one bought in dollars. Adding those produces a number with no meaning, which
 * `groupSealedVials` already refuses to do a few files away, and which every
 * total on the Stock page was doing anyway.
 *
 * Sorted largest first, so a screen that has room for one line shows the one
 * that matters and names the rest.
 */
export function sumByCurrency(
  vials: Vial[],
  amountOf: (v: Vial) => number | null,
  fallbackCurrency: string): CurrencyTotal[] {
  const byCurrency = new Map<string, CurrencyTotal>();

  for (const vial of vials) {
    const amount = amountOf(vial);
    if (amount == null || !(amount > 0)) continue;

    const currency = vial.currency ?? fallbackCurrency;
    const row = byCurrency.get(currency) ?? { currency, total: 0, vials: 0 };
    row.total += amount;
    row.vials += 1;
    byCurrency.set(currency, row);
  }

  return [...byCurrency.values()].sort((a, b) => b.total - a.total);
}

export interface SpendTotals {
  byCurrency: CurrencyTotal[];
  pricedVials: number;
  unpricedVials: number;
  /** More than one currency is present, so no single figure can be shown. */
  mixed: boolean;
}

/** Total spend across every priced vial, whatever the peptide. */
export function totalSpend(vials: Vial[], fallbackCurrency: string): SpendTotals {
  const byCurrency = sumByCurrency(vials, (v) => v.cost ?? null, fallbackCurrency);
  const pricedVials = byCurrency.reduce((n, c) => n + c.vials, 0);

  return {
    byCurrency,
    pricedVials,
    unpricedVials: vials.length - pricedVials,
    mixed: byCurrency.length > 1,
  };
}

export function formatMoney(amount: number | null, currency = "INR") {
  if (amount == null || !Number.isFinite(amount)) return "n/a";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      // Show a fraction only when there is one. ₹231.25 keeps its paise;
      // ₹750 and ₹15,000 do not gain a pointless ".00".
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      minimumFractionDigits: 0,
    }).format(amount);
  } catch {
    // An unrecognised currency code should not take the page down.
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/**
 * What one vial of a kit cost, from the price of the whole kit.
 *
 * Kits are priced as a box: ten vials for two hundred, not twenty each. Doing
 * that division by hand before typing it in is the sort of small friction that
 * ends with the price left blank, and a vial with no price is treated as free
 * everywhere downstream.
 *
 * Deliberately not rounded. Two hundred across three vials is 66.666..., and
 * storing 66.67 would make the Spent figure read 200.01, which is not what
 * anybody paid. Seven vials at seventy five would be out by three cents in the
 * other direction. The exact quotient is kept and `formatMoney` rounds only for
 * display, so each vial reads as a sensible price and the total still comes to
 * the number on the receipt.
 *
 * Null rather than zero for input that cannot be divided, because zero is a
 * real price meaning "this was free" and the difference matters to a total.
 */
export function costPerVialInKit(kitTotal: number, vialCount: number): number | null {
  if (!Number.isFinite(kitTotal) || kitTotal < 0) return null;
  if (!Number.isInteger(vialCount) || vialCount < 1) return null;
  return kitTotal / vialCount;
}

/**
 * Money for a screen with room for one line.
 *
 * One currency reads as it always did. Several are joined rather than added,
 * because "120 EUR + 60 USD" is true and a single number would not be. The
 * caller decides how many to show; the rest are named in a hint rather than
 * dropped, since a total that quietly omits a currency is the bug this exists
 * to fix.
 */
export function formatTotals(totals: CurrencyTotal[], limit = 2): string {
  if (!totals.length) return formatMoney(0, "USD").replace(/[\d.,]+/, "0");
  const shown = totals.slice(0, limit).map((t) => formatMoney(t.total, t.currency));
  const rest = totals.length - shown.length;
  return rest > 0 ? `${shown.join(" + ")} + ${rest} more` : shown.join(" + ");
}
