import { describe, expect, it } from "vitest";
import { stackIssues } from "./stack";
import { PEPTIDE_BY_ID } from "../data/peptides";
import type { Protocol } from "../types";

const NOW = Date.UTC(2026, 6, 30, 8);

const resolve = (id: string) => PEPTIDE_BY_ID.get(id);

const protocol = (over: Partial<Protocol> & { id: string; peptideId: string }): Protocol => ({
  profileId: "me",
  name: over.name ?? over.peptideId,
  active: true,
  startedAt: NOW - 30 * 86_400_000,
  doseMcg: 1000,
  route: "subcutaneous",
  schedule: { kind: "days-of-week", daysOfWeek: [1] },
  titrationAutoAdvance: false, ...over,
});

const run = (protocols: Protocol[]) => stackIssues({ protocols, resolve, nowMs: NOW });

describe("nothing to report", () => {
  it("stays silent for a single protocol", () => {
    expect(run([protocol({ id: "a", peptideId: "semaglutide" })])).toEqual([]);
  });

  it("stays silent for nothing at all", () => {
    expect(run([])).toEqual([]);
  });

  it("stays silent for two compounds that do not overlap", () => {
    expect(
      run([
        protocol({ id: "a", peptideId: "semaglutide" }),
        protocol({ id: "b", peptideId: "bpc-157" }),
      ])).toEqual([]);
  });

  it("ignores inactive protocols entirely", () => {
    const issues = run([
      protocol({ id: "a", peptideId: "semaglutide" }),
      protocol({ id: "b", peptideId: "tirzepatide", active: false }),
    ]);
    expect(issues).toEqual([]);
  });

  it("does not flag CJC-1295 with ipamorelin", () => {
    // A GHRH analogue plus a ghrelin agonist: different receptors, deliberately
    // complementary, and the most common pairing in this category. Flagging it
    // would teach the user to ignore every warning the app gives.
    const issues = run([
      protocol({ id: "a", peptideId: "cjc-1295-no-dac" }),
      protocol({ id: "b", peptideId: "ipamorelin" }),
    ]);
    expect(issues).toEqual([]);
  });
});

describe("shared mechanism", () => {
  it("flags two GLP-1 agonists as high severity", () => {
    const issues = run([
      protocol({ id: "a", peptideId: "semaglutide", name: "Sema" }),
      protocol({ id: "b", peptideId: "tirzepatide", name: "Tirz" }),
    ]);
    const glp1 = issues.find((i) => i.kind === "shared-mechanism" && i.title.includes("GLP-1"));
    expect(glp1?.severity).toBe("high");
    expect(glp1?.protocolIds.sort()).toEqual(["a", "b"]);
    expect(glp1?.compounds).toContain("Semaglutide");
  });

  it("flags two ghrelin agonists but only at medium severity", () => {
    const issues = run([
      protocol({ id: "a", peptideId: "ghrp-6" }),
      protocol({ id: "b", peptideId: "ipamorelin" }),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("shared-mechanism");
    expect(issues[0].severity).toBe("medium");
  });

  it("reports each shared class separately", () => {
    // Retatrutide is GLP-1 + GIP + glucagon; tirzepatide is GLP-1 + GIP. Two
    // classes are shared, and both are worth naming.
    const issues = run([
      protocol({ id: "a", peptideId: "retatrutide" }),
      protocol({ id: "b", peptideId: "tirzepatide" }),
    ]);
    const shared = issues.filter((i) => i.kind === "shared-mechanism");
    expect(shared).toHaveLength(2);
    expect(shared.some((i) => i.title.includes("GLP-1"))).toBe(true);
    expect(shared.some((i) => i.title.includes("GIP"))).toBe(true);
  });

  it("sees through a blend to what its components act on", () => {
    // CagriSema carries semaglutide, so pairing it with a standalone GLP-1 is
    // still two GLP-1 agonists even though the blend is a separate entry.
    const issues = run([
      protocol({ id: "a", peptideId: "cagrisema" }),
      protocol({ id: "b", peptideId: "semaglutide" }),
    ]);
    expect(issues.some((i) => i.kind === "shared-mechanism" && i.title.includes("GLP-1"))).toBe(true);
  });

  it("flags amylin doubling when a blend meets a standalone amylin analogue", () => {
    const issues = run([
      protocol({ id: "a", peptideId: "cagrisema" }),
      protocol({ id: "b", peptideId: "cagrilintide" }),
    ]);
    expect(issues.some((i) => i.title.includes("amylin"))).toBe(true);
  });
});

describe("the same compound twice", () => {
  it("flags one compound running in two protocols", () => {
    const issues = run([
      protocol({ id: "a", peptideId: "semaglutide", name: "Morning" }),
      protocol({ id: "b", peptideId: "semaglutide", name: "Evening" }),
    ]);
    const dup = issues.find((i) => i.kind === "duplicate-compound");
    expect(dup).toBeDefined();
    expect(dup?.severity).toBe("high");
    expect(dup?.detail).toContain("Morning");
    expect(dup?.detail).toContain("Evening");
  });

  it("does not also report it as a shared mechanism with itself", () => {
    const issues = run([
      protocol({ id: "a", peptideId: "semaglutide" }),
      protocol({ id: "b", peptideId: "semaglutide" }),
    ]);
    expect(issues.filter((i) => i.kind === "shared-mechanism")).toHaveLength(0);
  });
});

describe("overlapping blend components", () => {
  it("sums a compound arriving from two protocols", () => {
    const issues = run([
      protocol({ id: "a", peptideId: "klow", name: "KLOW", doseMcg: 2000 }),
      protocol({ id: "b", peptideId: "bpc-157", name: "BPC solo", doseMcg: 500 }),
    ]);
    const overlap = issues.find((i) => i.kind === "component-overlap");
    expect(overlap).toBeDefined();
    expect(overlap?.compounds).toEqual(["BPC-157"]);
    expect(overlap?.protocolIds.sort()).toEqual(["a", "b"]);
  });

  it("does not report a component that only one protocol delivers", () => {
    const issues = run([protocol({ id: "a", peptideId: "klow", doseMcg: 2000 })]);
    expect(issues.filter((i) => i.kind === "component-overlap")).toHaveLength(0);
  });

  it("raises severity when the combined weekly total clears the usual ceiling", () => {
    // Each on its own is unremarkable; together they are not.
    const issues = run([
      protocol({
        id: "a",
        peptideId: "bpc-157",
        name: "Daily",
        doseMcg: 500,
        schedule: { kind: "daily" },
      }),
      protocol({
        id: "b",
        peptideId: "klow",
        name: "KLOW daily",
        doseMcg: 8000,
        schedule: { kind: "daily" },
      }),
    ]);
    const overlap = issues.find((i) => i.kind === "component-overlap");
    expect(overlap?.severity).toBe("high");
    expect(overlap?.title).toMatch(/above its usual range/);
  });
});

describe("stacked oral anabolics", () => {
  it("flags two 17-alpha-alkylated orals", () => {
    const issues = run([
      protocol({ id: "a", peptideId: "oxandrolone", doseMcg: 20_000, schedule: { kind: "daily" } }),
      protocol({ id: "b", peptideId: "stanozolol", doseMcg: 30_000, schedule: { kind: "daily" } }),
    ]);
    const liver = issues.find((i) => /17-alpha-alkylated/.test(i.title));
    expect(liver?.severity).toBe("high");
    expect(liver?.protocolIds.sort()).toEqual(["a", "b"]);
  });

  it("says nothing about one oral on its own", () => {
    const issues = run([
      protocol({ id: "a", peptideId: "oxandrolone", doseMcg: 20_000, schedule: { kind: "daily" } }),
      protocol({ id: "b", peptideId: "testosterone-enanthate", doseMcg: 100_000 }),
    ]);
    expect(issues.filter((i) => /17-alpha-alkylated/.test(i.title))).toHaveLength(0);
  });

  it("does not flag two injectable androgens, which is ordinary practice", () => {
    // Testosterone alongside nandrolone is the commonest pairing there is. It
    // shares no receptor class rule and neither is an oral, so nothing fires.
    const issues = run([
      protocol({ id: "a", peptideId: "testosterone-enanthate", doseMcg: 200_000 }),
      protocol({ id: "b", peptideId: "nandrolone-decanoate", doseMcg: 200_000 }),
    ]);
    expect(issues).toEqual([]);
  });
});

describe("ordering", () => {
  it("puts the most serious first", () => {
    const issues = run([
      protocol({ id: "a", peptideId: "ghrp-6" }),
      protocol({ id: "b", peptideId: "ipamorelin" }),
      protocol({ id: "c", peptideId: "semaglutide" }),
      protocol({ id: "d", peptideId: "tirzepatide" }),
    ]);
    expect(issues.length).toBeGreaterThan(1);
    expect(issues[0].severity).toBe("high");
    const severities = issues.map((i) => i.severity);
    expect(severities.indexOf("medium")).toBeGreaterThan(severities.lastIndexOf("high"));
  });
});

describe("ancillaries", () => {
  it("flags two aromatase inhibitors at once", () => {
    const issues = run([
      protocol({ id: "a", peptideId: "anastrozole" }),
      protocol({ id: "b", peptideId: "exemestane" }),
    ]);
    expect(issues.some((i) => /aromatase inhibitor/i.test(i.title))).toBe(true);
  });

  it("flags two oestrogen receptor modulators at once", () => {
    const issues = run([
      protocol({ id: "a", peptideId: "tamoxifen" }),
      protocol({ id: "b", peptideId: "clomiphene" }),
    ]);
    expect(issues.some((i) => /modulator/i.test(i.title))).toBe(true);
  });

  it("flags an aromatase inhibitor running with nothing that aromatises", () => {
    const issues = run([
      protocol({ id: "a", peptideId: "anastrozole" }),
      protocol({ id: "b", peptideId: "trenbolone-acetate" }),
    ]);
    const issue = issues.find((i) => /nothing that aromatises/i.test(i.title));
    expect(issue?.severity).toBe("high");
    expect(issue?.detail).toMatch(/Trenbolone/i);
  });

  it("stays silent when an aromatising androgen is present", () => {
    // The whole point of an AI. Firing here would be the warning people learn
    // to dismiss, which then hides the one that matters.
    const issues = run([
      protocol({ id: "a", peptideId: "anastrozole" }),
      protocol({ id: "b", peptideId: "testosterone-enanthate" }),
    ]);
    expect(issues.some((i) => /nothing that aromatises/i.test(i.title))).toBe(false);
  });

  it("stays silent when one of several androgens aromatises", () => {
    const issues = run([
      protocol({ id: "a", peptideId: "anastrozole" }),
      protocol({ id: "b", peptideId: "trenbolone-acetate" }),
      protocol({ id: "c", peptideId: "testosterone-propionate" }),
    ]);
    expect(issues.some((i) => /nothing that aromatises/i.test(i.title))).toBe(false);
  });

  it("does not ask the question of a peptide-only stack", () => {
    // Nothing here is an androgen, so `aromatises` is absent rather than false
    // and the rule has no basis to fire.
    const issues = run([
      protocol({ id: "a", peptideId: "anastrozole" }),
      protocol({ id: "b", peptideId: "bpc-157" }),
    ]);
    expect(issues.some((i) => /nothing that aromatises/i.test(i.title))).toBe(false);
  });

  it("does not flag hCG alongside testosterone, which is the usual reason to run it", () => {
    const issues = run([
      protocol({ id: "a", peptideId: "hcg" }),
      protocol({ id: "b", peptideId: "testosterone-cypionate" }),
    ]);
    expect(issues).toEqual([]);
  });
});
