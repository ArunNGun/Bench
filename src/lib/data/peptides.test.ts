import { describe, expect, it } from "vitest";
import { PEPTIDES, PEPTIDE_BY_ID } from "./peptides";
import { singleDoseLevel } from "../calc/pk";
import { titrationTotalWeeks } from "../calc/schedule";

describe("peptide library integrity", () => {
  it("gives every peptide a unique id", () => {
    const ids = PEPTIDES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("indexes every peptide by id", () => {
    expect(PEPTIDE_BY_ID.size).toBe(PEPTIDES.length);
  });

  it("gives every peptide a name, summary, mechanism and status", () => {
    for (const p of PEPTIDES) {
      expect(p.name.length, p.id).toBeGreaterThan(0);
      expect(p.summary.length, p.id).toBeGreaterThan(10);
      expect(p.mechanism.length, p.id).toBeGreaterThan(20);
      expect(p.status.length, p.id).toBeGreaterThan(10);
    }
  });

  it("cites at least one source for every peptide", () => {
    for (const p of PEPTIDES) {
      expect(p.citations.length, p.id).toBeGreaterThan(0);
      for (const c of p.citations) {
        expect(c.url, `${p.id}: ${c.label}`).toMatch(/^https:\/\//);
      }
    }
  });

  it("explains itself whenever a half-life is missing", () => {
    for (const p of PEPTIDES) {
      if (p.halfLifeHours === null) {
        expect(p.halfLifeNote, `${p.id} has no half-life and must say why`).toBeTruthy();
      }
    }
  });

  it("keeps half-lives physically plausible", () => {
    for (const p of PEPTIDES) {
      if (p.halfLifeHours !== null) {
        expect(p.halfLifeHours, p.id).toBeGreaterThan(0);
        // Wide enough for the longest real depot, testosterone undecanoate in
        // castor oil runs to about 34 days, but still tight enough to catch a
        // figure entered in days where hours were meant.
        expect(p.halfLifeHours, p.id).toBeLessThan(24 * 60);
      }
    }
  });

  it("keeps Tmax shorter than the half-life the model can represent", () => {
    for (const p of PEPTIDES) {
      if (p.tmaxHours != null && p.halfLifeHours != null) {
        expect(p.tmaxHours, p.id).toBeGreaterThan(0);
        // The one-compartment model caps Tmax at 1/ke, which is t½/ln2.
        expect(p.tmaxHours, `${p.id} Tmax exceeds what the PK model can fit`).toBeLessThan(
          p.halfLifeHours / Math.LN2);
      }
    }
  });

  it("produces a usable curve for every peptide that claims a half-life", () => {
    for (const p of PEPTIDES) {
      if (p.halfLifeHours === null) continue;
      const params = { halfLifeHours: p.halfLifeHours, tmaxHours: p.tmaxHours };
      const peak = p.tmaxHours ?? 0;
      expect(singleDoseLevel(peak, params), p.id).toBeCloseTo(1, 3);
      expect(singleDoseLevel(p.halfLifeHours * 20, params), p.id).toBeLessThan(0.01);
    }
  });

  it("gives every dose range a sane low, high and frequency", () => {
    for (const p of PEPTIDES) {
      expect(p.doseRanges.length, p.id).toBeGreaterThan(0);
      for (const d of p.doseRanges) {
        expect(d.lowMcg, p.id).toBeGreaterThan(0);
        expect(d.highMcg, p.id).toBeGreaterThanOrEqual(d.lowMcg);
        expect(d.perWeek, p.id).toBeGreaterThanOrEqual(0);
        expect(d.frequency.length, p.id).toBeGreaterThan(0);
      }
    }
  });

  it("numbers titration steps in order and gives each a positive dose", () => {
    for (const p of PEPTIDES) {
      for (const t of p.titrations ?? []) {
        expect(t.steps.length, `${p.id}/${t.id}`).toBeGreaterThan(0);
        t.steps.forEach((s, i) => {
          expect(s.step, `${p.id}/${t.id} step ${i}`).toBe(i + 1);
          expect(s.doseMcg, `${p.id}/${t.id} step ${i}`).toBeGreaterThan(0);
          expect(s.weeks, `${p.id}/${t.id} step ${i}`).toBeGreaterThan(0);
        });
        expect(titrationTotalWeeks(t.steps), `${p.id}/${t.id}`).toBeGreaterThan(0);
        expect(t.sourceUrl ?? "https://x", `${p.id}/${t.id}`).toMatch(/^https:\/\//);
      }
    }
  });

  it("escalates titration doses rather than stepping down", () => {
    for (const p of PEPTIDES) {
      for (const t of p.titrations ?? []) {
        for (let i = 1; i < t.steps.length; i++) {
          expect(
            t.steps[i].doseMcg,
            `${p.id}/${t.id}: step ${i + 1} should not be below step ${i}`).toBeGreaterThanOrEqual(t.steps[i - 1].doseMcg);
        }
      }
    }
  });

  it("gives titration plans unique ids across the whole library", () => {
    const ids = PEPTIDES.flatMap((p) => (p.titrations ?? []).map((t) => t.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("points blend components at peptides that exist", () => {
    for (const p of PEPTIDES) {
      for (const c of p.components ?? []) {
        if (c.peptideId) {
          expect(PEPTIDE_BY_ID.has(c.peptideId), `${p.id} references missing ${c.peptideId}`).toBe(true);
        }
      }
    }
  });

  it("adds blend component masses up to a listed vial size", () => {
    for (const p of PEPTIDES) {
      const comps = p.components ?? [];
      if (!comps.length || !comps.every((c) => c.mgPerVial != null)) continue;
      const total = comps.reduce((s, c) => s + (c.mgPerVial ?? 0), 0);
      // CagriSema is dosed per component rather than as a combined mass.
      if (p.id === "cagrisema") continue;
      expect(p.vialSizesMg, `${p.id} components total ${total} mg`).toContain(total);
    }
  });

  it("marks every route as one the app knows how to display", () => {
    const known = new Set([
      "subcutaneous",
      "intramuscular",
      "oral",
      "intranasal",
      "topical",
      "intravenous",
    ]);
    for (const p of PEPTIDES) {
      expect(p.routes.length, p.id).toBeGreaterThan(0);
      for (const r of p.routes) expect(known.has(r), `${p.id}: ${r}`).toBe(true);
    }
  });

  it("attaches a caution banner wherever the whole entry rests on weak evidence", () => {
    for (const p of PEPTIDES) {
      const strongest = p.doseRanges.map((d) => d.evidence);
      const onlyWeak = strongest.every((e) => e === "anecdotal" || e === "preclinical");
      if (onlyWeak) {
        expect(
          p.cautionBanner ?? p.halfLifeNote,
          `${p.id} has only anecdotal dosing and should carry a caution`).toBeTruthy();
      }
    }
  });

  it("keeps timeline windows ordered and non-empty", () => {
    for (const p of PEPTIDES) {
      for (const t of p.timeline ?? []) {
        expect(t.toHours, `${p.id}: ${t.label}`).toBeGreaterThan(t.fromHours);
        expect(t.label.length, p.id).toBeGreaterThan(5);
      }
    }
  });

  it("includes the compounds this app was built for", () => {
    for (const id of ["retatrutide", "klow", "bpc-157", "tirzepatide", "ghk-cu", "kpv", "tb-500"]) {
      expect(PEPTIDE_BY_ID.has(id), `missing ${id}`).toBe(true);
    }
  });

  it("records the KLOW blend at the verified 5:1:1:1 ratio", () => {
    const klow = PEPTIDE_BY_ID.get("klow")!;
    const by = Object.fromEntries((klow.components ?? []).map((c) => [c.peptideId, c.mgPerVial]));
    expect(by["ghk-cu"]).toBe(50);
    expect(by["bpc-157"]).toBe(10);
    expect(by["tb-500"]).toBe(10);
    expect(by["kpv"]).toBe(10);
    expect(klow.vialSizesMg).toContain(80);
  });
});
