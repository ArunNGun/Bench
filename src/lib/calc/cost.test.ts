import { describe, expect, it } from "vitest";
import {
  costPerDose,
  costPerMg,
  costPerVialInKit,
  formatMoney,
  formatTotals,
  remainingValue,
  spendFor,
  sumByCurrency,
  totalSpend,
} from "./cost";
import type { Vial } from "../types";

const vial = (over: Partial<Vial> & { id: string }): Vial =>
  ({ profileId: "me", peptideId: "klow", strengthMg: 80, state: "sealed", ...over }) as Vial;

describe("costPerMg", () => {
  it("divides price by label strength", () => {
    expect(costPerMg({ cost: 160, strengthMg: 80 })).toBe(2);
    expect(costPerMg({ cost: 45, strengthMg: 10 })).toBe(4.5);
  });

  it("is null without a usable price or strength", () => {
    expect(costPerMg({ strengthMg: 80 })).toBeNull();
    expect(costPerMg({ cost: 0, strengthMg: 80 })).toBeNull();
    expect(costPerMg({ cost: 160, strengthMg: 0 })).toBeNull();
  });
});

describe("costPerDose", () => {
  it("prices a dose from the vial rate", () => {
    // 160 for 80 mg is 2 per mg, so a 4 mg dose costs 8.
    expect(costPerDose({ cost: 160, strengthMg: 80 }, 4000)).toBeCloseTo(8, 9);
    // A 250 mcg dose off a 45 for 10 mg vial is about 1.13.
    expect(costPerDose({ cost: 45, strengthMg: 10 }, 250)).toBeCloseTo(1.125, 9);
  });

  it("is null without a price or a dose", () => {
    expect(costPerDose({ strengthMg: 80 }, 4000)).toBeNull();
    expect(costPerDose({ cost: 160, strengthMg: 80 }, 0)).toBeNull();
  });
});

describe("spendFor", () => {
  const vials = [
    vial({ id: "a", cost: 160 }),
    vial({ id: "b", cost: 160 }),
    vial({ id: "c" }), // no price recorded
    vial({ id: "other", peptideId: "reta", cost: 300, strengthMg: 30 }),
  ];

  it("totals only the vials of that peptide", () => {
    const s = spendFor(vials, "klow", 4000, 7);
    expect(s.totalSpend).toBe(320);
    expect(s.pricedVials).toBe(2);
  });

  it("counts unpriced vials rather than treating them as free", () => {
    expect(spendFor(vials, "klow", 4000, 7).unpricedVials).toBe(1);
  });

  it("blends the rate across priced vials", () => {
    // 320 across 160 mg is 2 per mg.
    expect(spendFor(vials, "klow", 4000, 7).costPerMg).toBeCloseTo(2, 9);
  });

  it("is not skewed by one expensive batch more than its share", () => {
    const mixed = [vial({ id: "cheap", cost: 80 }), vial({ id: "dear", cost: 240 })];
    // 320 across 160 mg is still 2 per mg, the blended rate.
    expect(spendFor(mixed, "klow", 4000, 7).costPerMg).toBeCloseTo(2, 9);
  });

  it("derives the running cost from the schedule", () => {
    const s = spendFor(vials, "klow", 4000, 7);
    expect(s.costPerDose).toBeCloseTo(8, 9);
    expect(s.costPerWeek).toBeCloseTo(56, 9);
    // A month is 365/12 weeks, not four.
    expect(s.costPerMonth).toBeCloseTo((56 * 365) / 12 / 7, 6);
    expect(s.costPerMonth).toBeGreaterThan(56 * 4);
  });

  it("scales the weekly rate with a less frequent schedule", () => {
    expect(spendFor(vials, "klow", 4000, 1).costPerWeek).toBeCloseTo(8, 9);
  });

  it("returns nulls rather than zeros when nothing is priced", () => {
    const s = spendFor([vial({ id: "a" })], "klow", 4000, 7);
    expect(s.totalSpend).toBe(0);
    expect(s.costPerMg).toBeNull();
    expect(s.costPerDose).toBeNull();
    expect(s.costPerWeek).toBeNull();
    expect(s.costPerMonth).toBeNull();
  });

  it("has no running cost for an as-needed protocol", () => {
    expect(spendFor(vials, "klow", 4000, 0).costPerWeek).toBeNull();
  });
});

describe("remainingValue", () => {
  it("prices what is left in a part-used vial", () => {
    // 160 for 80 mg, 36 mg drawn, so 44 mg left at 2 per mg.
    expect(remainingValue(vial({ id: "a", cost: 160, drawnMcg: 36_000 }))).toBeCloseTo(88, 9);
  });

  it("is zero for an empty vial", () => {
    expect(remainingValue(vial({ id: "a", cost: 160, drawnMcg: 80_000 }))).toBeCloseTo(0, 9);
  });

  it("never goes negative on an over-drawn vial", () => {
    expect(remainingValue(vial({ id: "a", cost: 160, drawnMcg: 999_999 }))).toBe(0);
  });

  it("is null without a price", () => {
    expect(remainingValue(vial({ id: "a" }))).toBeNull();
  });
});

describe("totalSpend", () => {
  it("adds up every priced vial regardless of peptide", () => {
    const t = totalSpend(
      [
        vial({ id: "a", cost: 160 }),
        vial({ id: "b", peptideId: "reta", cost: 300 }),
        vial({ id: "c" }),
      ],
      "USD");
    expect(t.byCurrency).toEqual([{ currency: "USD", total: 460, vials: 2 }]);
    expect(t.pricedVials).toBe(2);
    expect(t.unpricedVials).toBe(1);
    expect(t.mixed).toBe(false);
  });

  it("keeps currencies apart instead of adding them", () => {
    // The bug: 40 dollars and 3000 rupees used to become 3040 of whatever the
    // settings happened to name.
    const t = totalSpend(
      [
        vial({ id: "a", cost: 40, currency: "USD" }),
        vial({ id: "b", cost: 3000, currency: "INR" }),
        vial({ id: "c", cost: 10, currency: "USD" }),
      ],
      "USD");
    expect(t.mixed).toBe(true);
    expect(t.byCurrency).toEqual([
      { currency: "INR", total: 3000, vials: 1 },
      { currency: "USD", total: 50, vials: 2 },
    ]);
  });

  it("treats a vial with no currency as the app's own", () => {
    const t = totalSpend([vial({ id: "a", cost: 10 }), vial({ id: "b", cost: 5, currency: "EUR" })], "EUR");
    expect(t.mixed).toBe(false);
    expect(t.byCurrency).toEqual([{ currency: "EUR", total: 15, vials: 2 }]);
  });

  it("is empty for an empty inventory", () => {
    expect(totalSpend([], "USD")).toEqual({
      byCurrency: [],
      pricedVials: 0,
      unpricedVials: 0,
      mixed: false,
    });
  });
});

describe("sumByCurrency", () => {
  it("sorts the largest first, so one line shows the one that matters", () => {
    const rows = sumByCurrency(
      [
        vial({ id: "a", cost: 10, currency: "USD" }),
        vial({ id: "b", cost: 900, currency: "INR" }),
      ],
      (v) => v.cost ?? null,
      "USD");
    expect(rows.map((r) => r.currency)).toEqual(["INR", "USD"]);
  });

  it("skips anything with no amount to add", () => {
    const rows = sumByCurrency([vial({ id: "a" })], (v) => v.cost ?? null, "USD");
    expect(rows).toEqual([]);
  });
});

describe("formatTotals", () => {
  it("reads as one figure when there is one currency", () => {
    expect(formatTotals([{ currency: "USD", total: 160, vials: 1 }])).toContain("160");
  });

  it("joins rather than adds when there are two", () => {
    const out = formatTotals([
      { currency: "INR", total: 3000, vials: 1 },
      { currency: "USD", total: 40, vials: 1 },
    ]);
    expect(out).toContain("3,000");
    expect(out).toContain("40");
    expect(out).toContain("+");
  });

  it("names the ones it has no room for rather than dropping them", () => {
    const out = formatTotals(
      [
        { currency: "INR", total: 3000, vials: 1 },
        { currency: "USD", total: 40, vials: 1 },
        { currency: "EUR", total: 20, vials: 1 },
      ],
      2);
    expect(out).toContain("1 more");
  });
});

describe("formatMoney", () => {
  it("formats a value in the given currency", () => {
    expect(formatMoney(160, "USD")).toContain("160");
    expect(formatMoney(8.5, "USD")).toContain("8.5");
  });

  it("shows a dash rather than a number for nothing", () => {
    expect(formatMoney(null)).toBe("n/a");
    expect(formatMoney(NaN)).toBe("n/a");
  });

  it("falls back instead of throwing on an unknown currency", () => {
    expect(formatMoney(10, "NOTACURRENCY")).toContain("10");
  });
});

describe("formatMoney in rupees", () => {
  it("defaults to INR", () => {
    expect(formatMoney(185)).toContain("₹");
  });

  it("shows paise on small amounts", () => {
    expect(formatMoney(231.25, "INR")).toMatch(/231\.25/);
    expect(formatMoney(9.5, "INR")).toMatch(/9\.5/);
  });

  it("adds no decimals to a round figure", () => {
    expect(formatMoney(15000, "INR")).not.toMatch(/\.\d/);
    expect(formatMoney(750, "INR")).not.toMatch(/\.\d/);
  });

  it("groups thousands the way the locale expects", () => {
    // Grouping varies by locale (15,000 or 15,000); the digits must survive.
    expect(formatMoney(15000, "INR").replace(/[^\d]/g, "")).toBe("15000");
  });

  it("handles a vial priced in rupees end to end", () => {
    // ₹15,000 for an 80 mg vial is ₹187.50 per mg.
    const vial = { cost: 15000, strengthMg: 80 };
    expect(costPerMg(vial)).toBeCloseTo(187.5, 9);
    // A 4 mg dose is ₹750.
    expect(costPerDose(vial, 4000)).toBeCloseTo(750, 9);
    expect(formatMoney(costPerDose(vial, 4000), "INR")).toMatch(/750/);
    expect(formatMoney(costPerDose(vial, 4000), "INR")).not.toMatch(/\.\d/);
  });

  it("still honours an explicitly different currency", () => {
    expect(formatMoney(185, "USD")).not.toContain("₹");
  });
});

describe("costPerVialInKit", () => {
  it("splits a kit price across its vials", () => {
    expect(costPerVialInKit(200, 10)).toBe(20);
    expect(costPerVialInKit(129.99, 3)).toBeCloseTo(43.33, 10);
  });

  it("keeps the exact quotient rather than a rounded price", () => {
    // The whole point. Rounding each vial to 66.67 would make the Spent figure
    // read 200.01, which is not what anybody paid.
    const each = costPerVialInKit(200, 3)!;
    expect(each * 3).toBeCloseTo(200, 10);
    expect(each).not.toBe(66.67);
  });

  it("adds back up to the kit price for awkward divisions", () => {
    // Seven vials at seventy five drifts three cents the other way if rounded.
    for (const [total, count] of [[75, 7], [129.99, 4], [49.95, 6], [1000, 3]] as const) {
      expect(costPerVialInKit(total, count)! * count).toBeCloseTo(total, 8);
    }
  });

  it("treats a single vial kit as its own price", () => {
    expect(costPerVialInKit(45, 1)).toBe(45);
  });

  it("keeps free and unknown apart", () => {
    // Zero is a real price and belongs in a total. Null means the input could
    // not be divided at all, and a vial with no price is counted separately
    // rather than as free.
    expect(costPerVialInKit(0, 4)).toBe(0);
    expect(costPerVialInKit(-10, 4)).toBeNull();
    expect(costPerVialInKit(Number.NaN, 4)).toBeNull();
  });

  it("refuses a count that is not a whole number of vials", () => {
    expect(costPerVialInKit(200, 0)).toBeNull();
    expect(costPerVialInKit(200, -3)).toBeNull();
    expect(costPerVialInKit(200, 2.5)).toBeNull();
  });
});
