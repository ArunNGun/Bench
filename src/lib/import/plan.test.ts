import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDelimited, toTable } from "./delimited";
import { shotsyProfile } from "./profiles";
import type { CanonicalRecord } from "./profiles";
import { buildImportPlan, describePlan, planIsEmpty, planSpan } from "./plan";
import { PEPTIDES } from "../data/peptides";

const fixture = readFileSync(join(__dirname, "__fixtures__/shotsy.csv"), "utf8");

const NOW = new Date(2026, 6, 26, 9, 32).getTime();

function planOf(
  records: CanonicalRecord[],
  existing: {
    logs?: { at: number; peptideId: string }[];
    measurements?: { at: number; weightKg?: number }[];
  } = {}) {
  return buildImportPlan({
    records,
    problems: [],
    peptides: PEPTIDES,
    existingLogs: existing.logs ?? [],
    existingMeasurements: existing.measurements ?? [],
  });
}

const dose = (over: Partial<Extract<CanonicalRecord, { kind: "dose" }>> = {}): CanonicalRecord => ({
  kind: "dose",
  at: NOW,
  label: "Mounjaro",
  doseMcg: 10_000,
  sourceRow: 2, ...over,
});

const weight = (over: Partial<Extract<CanonicalRecord, { kind: "weight" }>> = {}): CanonicalRecord => ({
  kind: "weight",
  at: NOW,
  weightKg: 85.6,
  sourceRow: 2, ...over,
});

describe("buildImportPlan", () => {
  it("resolves a brand name to its compound", () => {
    const plan = planOf([dose()]);
    expect(plan.doses).toHaveLength(1);
    expect(plan.doses[0]).toMatchObject({ peptideId: "tirzepatide", peptideName: "Tirzepatide" });
  });

  it("collects names it cannot resolve, with their row numbers", () => {
    const plan = planOf([
      dose({ label: "Insulin glargine", sourceRow: 4 }),
      dose({ label: "Insulin glargine", sourceRow: 9 }),
    ]);
    expect(plan.doses).toEqual([]);
    expect(plan.unresolved).toEqual([{ label: "Insulin glargine", rows: [4, 9] }]);
  });

  it("reports a dose it could not read rather than importing a zero", () => {
    const plan = planOf([dose({ doseMcg: null, sourceRow: 5 })]);
    expect(plan.doses).toEqual([]);
    expect(plan.problems).toHaveLength(1);
    expect(plan.problems[0]).toMatchObject({ sourceRow: 5 });
    expect(plan.problems[0].reason).toMatch(/No readable dose for Tirzepatide/);
  });

  it("returns records oldest first", () => {
    const plan = planOf([
      dose({ at: NOW, sourceRow: 4 }),
      dose({ at: NOW - 7 * 86_400_000, sourceRow: 3 }),
      dose({ at: NOW - 14 * 86_400_000, sourceRow: 2 }),
    ]);
    expect(plan.doses.map((d) => d.sourceRow)).toEqual([2, 3, 4]);
  });
});

describe("not importing the same thing twice", () => {
  it("skips a dose already logged at the same moment", () => {
    const plan = planOf([dose()], { logs: [{ at: NOW, peptideId: "tirzepatide" }] });
    expect(plan.doses).toEqual([]);
    expect(plan.duplicateDoses).toBe(1);
  });

  it("tolerates a small clock difference", () => {
    // A file with only a date lands at midnight; one with seconds will not match a
    // stored time to the minute.
    const plan = planOf([dose()], { logs: [{ at: NOW + 30_000, peptideId: "tirzepatide" }] });
    expect(plan.duplicateDoses).toBe(1);
  });

  it("does not treat a different compound at the same moment as a duplicate", () => {
    const plan = planOf([dose()], { logs: [{ at: NOW, peptideId: "semaglutide" }] });
    expect(plan.doses).toHaveLength(1);
    expect(plan.duplicateDoses).toBe(0);
  });

  it("does not treat the next week's dose as a duplicate", () => {
    const plan = planOf([dose()], { logs: [{ at: NOW - 7 * 86_400_000, peptideId: "tirzepatide" }] });
    expect(plan.doses).toHaveLength(1);
  });

  it("collapses a dose listed twice within one file", () => {
    const plan = planOf([dose({ sourceRow: 2 }), dose({ sourceRow: 3 })]);
    expect(plan.doses).toHaveLength(1);
    expect(plan.duplicateDoses).toBe(1);
  });

  it("skips a weight already recorded that day at the same value", () => {
    const plan = planOf([weight()], { measurements: [{ at: NOW - 3600_000, weightKg: 85.6 }] });
    expect(plan.weights).toEqual([]);
    expect(plan.duplicateWeights).toBe(1);
  });

  it("keeps a weight that differs meaningfully on the same day", () => {
    const plan = planOf([weight({ weightKg: 85.6 })], {
      measurements: [{ at: NOW, weightKg: 87.2 }],
    });
    expect(plan.weights).toHaveLength(1);
  });

  it("ignores a measurement that carries no weight", () => {
    const plan = planOf([weight()], { measurements: [{ at: NOW }] });
    expect(plan.weights).toHaveLength(1);
  });

  it("is idempotent, applying a plan then re-importing finds nothing new", () => {
    const t = toTable(parseDelimited(fixture));
    const { records, problems } = shotsyProfile.read(t.records, t.headers);

    const first = buildImportPlan({
      records,
      problems,
      peptides: PEPTIDES,
      existingLogs: [],
      existingMeasurements: [],
    });
    expect(first.doses.length).toBeGreaterThan(0);

    // Pretend the plan was applied, then run the identical file again.
    const second = buildImportPlan({
      records,
      problems,
      peptides: PEPTIDES,
      existingLogs: first.doses.map((d) => ({ at: d.at, peptideId: d.peptideId })),
      existingMeasurements: first.weights.map((w) => ({ at: w.at, weightKg: w.weightKg })),
    });

    expect(second.doses).toEqual([]);
    expect(second.weights).toEqual([]);
    expect(second.duplicateDoses).toBe(first.doses.length);
    expect(second.duplicateWeights).toBe(first.weights.length);
  });
});

describe("the real Shotsy export, end to end", () => {
  const t = toTable(parseDelimited(fixture));
  const { records, problems } = shotsyProfile.read(t.records, t.headers);
  const plan = buildImportPlan({
    records,
    problems,
    peptides: PEPTIDES,
    existingLogs: [],
    existingMeasurements: [],
  });

  it("plans every injection and every weight", () => {
    expect(plan.doses).toHaveLength(25);
    expect(plan.weights).toHaveLength(14);
  });

  it("has nothing it could not read or resolve", () => {
    expect(plan.problems).toEqual([]);
    expect(plan.unresolved).toEqual([]);
  });

  it("attributes the whole history to tirzepatide", () => {
    expect(new Set(plan.doses.map((d) => d.peptideId))).toEqual(new Set(["tirzepatide"]));
  });

  it("spans November 2025 to July 2026", () => {
    const span = planSpan(plan)!;
    expect(new Date(span.from).getFullYear()).toBe(2025);
    expect(new Date(span.from).getMonth()).toBe(10);
    expect(new Date(span.to).getMonth()).toBe(6);
    expect(new Date(span.to).getFullYear()).toBe(2026);
  });

  it("keeps the weight range intact", () => {
    const kgs = plan.weights.map((w) => w.weightKg);
    expect(Math.min(...kgs)).toBe(85);
    expect(Math.max(...kgs)).toBe(94.5);
  });

  it("describes itself for the confirm button", () => {
    expect(describePlan(plan)).toBe("25 doses and 14 weights");
    expect(planIsEmpty(plan)).toBe(false);
  });
});

describe("describePlan and planIsEmpty", () => {
  it("says when there is nothing to do", () => {
    const plan = planOf([]);
    expect(planIsEmpty(plan)).toBe(true);
    expect(describePlan(plan)).toBe("Nothing new to import.");
    expect(planSpan(plan)).toBeNull();
  });

  it("uses the singular for one of each", () => {
    expect(describePlan(planOf([dose(), weight()]))).toBe("1 dose and 1 weight");
  });

  it("mentions only what is present", () => {
    expect(describePlan(planOf([weight()]))).toBe("1 weight");
    expect(describePlan(planOf([dose()]))).toBe("1 dose");
  });
});
