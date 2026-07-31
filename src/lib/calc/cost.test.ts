import { describe, expect, it } from "vitest";
import { costPerDose, costPerMg, formatMoney, remainingValue, spendFor, totalSpend } from "./cost";
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
    const t = totalSpend([
      vial({ id: "a", cost: 160 }),
      vial({ id: "b", peptideId: "reta", cost: 300 }),
      vial({ id: "c" }),
    ]);
    expect(t.total).toBe(460);
    expect(t.pricedVials).toBe(2);
    expect(t.unpricedVials).toBe(1);
  });

  it("is zero for an empty inventory", () => {
    expect(totalSpend([])).toEqual({ total: 0, pricedVials: 0, unpricedVials: 0 });
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
