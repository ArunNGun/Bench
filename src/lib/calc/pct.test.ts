import { describe, expect, it } from "vitest";
import { CLEARED_FRACTION, hoursToClear, pctPlan, PCT_TEMPLATES, remainingFraction, retestAfter } from "./pct";
import { fractionRemaining } from "./pk";
import { PEPTIDE_BY_ID } from "../data/peptides";
import type { DoseLog } from "../types";

const HOUR = 3_600_000;
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 6, 30, 12);

const resolve = (id: string) => PEPTIDE_BY_ID.get(id);

const log = (peptideId: string, daysAgo: number, over: Partial<DoseLog> = {}) =>
  ({ peptideId, at: NOW - daysAgo * DAY, skipped: false, ...over }) as DoseLog;

describe("hoursToClear", () => {
  it("is a little over five half-lives", () => {
    // log2(1/0.03) is about 5.06.
    expect(hoursToClear(24) / 24).toBeCloseTo(Math.log2(1 / CLEARED_FRACTION), 10);
  });

  it("leaves exactly the cleared fraction behind, by construction", () => {
    expect(fractionRemaining(hoursToClear(108), 108)).toBeCloseTo(CLEARED_FRACTION, 10);
  });

  it("returns zero for a nonsense half-life rather than infinity", () => {
    expect(hoursToClear(0)).toBe(0);
    expect(hoursToClear(-5)).toBe(0);
  });
});

describe("pctPlan", () => {
  it("says nothing when nothing suppressive was ever taken", () => {
    const plan = pctPlan([log("bpc-157", 2), log("semaglutide", 5)], resolve, NOW);
    expect(plan.compounds).toEqual([]);
    expect(plan.earliestStart).toBeNull();
    expect(plan.clear).toBe(false);
  });

  it("dates clearance from the last dose of each suppressive compound", () => {
    const plan = pctPlan([log("testosterone-enanthate", 3), log("testosterone-enanthate", 10)], resolve, NOW);
    expect(plan.compounds).toHaveLength(1);
    const te = plan.compounds[0];
    expect(te.lastDoseAt).toBe(NOW - 3 * DAY);
    // 108 hour half-life, so about 22.8 days to clear.
    expect(te.clearedAt).toBe(te.lastDoseAt + hoursToClear(108) * HOUR);
  });

  it("takes the latest clearance across several compounds", () => {
    const plan = pctPlan(
      [log("testosterone-propionate", 1), log("testosterone-enanthate", 1)],
      resolve,
      NOW);
    const enanthate = plan.compounds.find((c) => c.peptideId === "testosterone-enanthate")!;
    expect(plan.earliestStart).toBe(enanthate.clearedAt);
  });

  it("refuses to give a date when a half-life is unknown", () => {
    // Trenbolone has no established human half-life. Every competing tool
    // prints a number here anyway; a confident wrong date is acted on.
    const plan = pctPlan([log("trenbolone-acetate", 2)], resolve, NOW);
    expect(plan.earliestStart).toBeNull();
    expect(plan.blockedBy).toEqual(["Trenbolone acetate"]);
    expect(plan.compounds[0].clearedAt).toBeNull();
    expect(plan.compounds[0].unknownReason).toBeTruthy();
  });

  it("blocks the whole plan when one of several compounds is unknown", () => {
    // The true answer is "at least the testosterone date, possibly later", so
    // reporting the testosterone date alone would understate it.
    const plan = pctPlan(
      [log("testosterone-enanthate", 1), log("trenbolone-enanthate", 1)],
      resolve,
      NOW);
    expect(plan.earliestStart).toBeNull();
    expect(plan.blockedBy).toContain("Trenbolone enanthate");
  });

  it("ignores skipped doses, since nothing entered the body", () => {
    const plan = pctPlan(
      [log("testosterone-enanthate", 1, { skipped: true }), log("testosterone-enanthate", 20)],
      resolve,
      NOW);
    expect(plan.compounds[0].lastDoseAt).toBe(NOW - 20 * DAY);
  });

  it("ignores compounds that do not suppress", () => {
    const plan = pctPlan([log("testosterone-enanthate", 1), log("bpc-157", 0)], resolve, NOW);
    expect(plan.compounds.map((c) => c.peptideId)).toEqual(["testosterone-enanthate"]);
  });

  it("reports clear once everything has decayed", () => {
    const plan = pctPlan([log("testosterone-propionate", 30)], resolve, NOW);
    expect(plan.clear).toBe(true);
  });

  it("is not clear while a compound is still releasing", () => {
    expect(pctPlan([log("testosterone-enanthate", 1)], resolve, NOW).clear).toBe(false);
  });

  it("is never clear while a half-life is unknown", () => {
    expect(pctPlan([log("trenbolone-acetate", 400)], resolve, NOW).clear).toBe(false);
  });

  it("orders compounds by most recent dose first", () => {
    const plan = pctPlan(
      [log("testosterone-enanthate", 20), log("oxandrolone", 1)],
      resolve,
      NOW);
    expect(plan.compounds[0].peptideId).toBe("oxandrolone");
  });

  it("skips a compound the library does not know", () => {
    expect(pctPlan([log("not-a-real-compound", 1)], resolve, NOW).compounds).toEqual([]);
  });
});

describe("remainingFraction", () => {
  it("is one at the moment of the dose", () => {
    const plan = pctPlan([log("testosterone-enanthate", 0)], resolve, NOW);
    expect(remainingFraction(plan.compounds[0], NOW)).toBeCloseTo(1, 6);
  });

  it("halves over one half-life", () => {
    const plan = pctPlan([log("testosterone-enanthate", 4.5)], resolve, NOW);
    expect(remainingFraction(plan.compounds[0], NOW)).toBeCloseTo(0.5, 6);
  });

  it("treats a dose logged in the future as just taken", () => {
    // A device clock that jumped would otherwise report more than a full dose
    // still to come, which is not a thing.
    const plan = pctPlan([log("testosterone-enanthate", -10)], resolve, NOW);
    expect(remainingFraction(plan.compounds[0], NOW)).toBe(1);
  });

  it("is null where the half-life is unknown", () => {
    const plan = pctPlan([log("trenbolone-acetate", 2)], resolve, NOW);
    expect(remainingFraction(plan.compounds[0], NOW)).toBeNull();
  });
});

describe("templates", () => {
  it("only reference compounds the library actually carries", () => {
    for (const t of PCT_TEMPLATES) {
      for (const id of t.compoundIds) {
        expect(PEPTIDE_BY_ID.get(id), `${t.id} references ${id}`).toBeTruthy();
      }
    }
  });

  it("all carry a source and a citation", () => {
    for (const t of PCT_TEMPLATES) {
      expect(t.source.length, t.id).toBeGreaterThan(20);
      expect(t.citationUrl, t.id).toMatch(/^https:\/\//);
    }
  });

  it("number their weeks consecutively from one", () => {
    for (const t of PCT_TEMPLATES) {
      expect(t.weeks.map((w) => w.week), t.id).toEqual(t.weeks.map((_, i) => i + 1));
    }
  });
});

describe("retestAfter", () => {
  it("waits four weeks past the end by default", () => {
    // A SERM raises testosterone while it is present, so testing during it
    // measures the drug rather than the recovery.
    expect(retestAfter(NOW)).toBe(NOW + 28 * DAY);
  });
});
