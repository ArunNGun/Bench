import { describe, expect, it } from "vitest";
import {
  labSeries,
  labTrend,
  latestResult,
  missingMarkerIds,
  suggestedMarkerIds,
  trackedMarkerIds,
  verdictFor,
} from "./labs";
import { findMarker, LAB_MARKERS } from "../data/labs";
import type { LabResult } from "../types";

const NOW = Date.UTC(2026, 6, 30, 8);
const DAY = 86_400_000;

const res = (over: Partial<LabResult> & { id: string; markerId: string; value: number }): LabResult => ({
  profileId: "me",
  at: NOW, ...over,
});

describe("the marker catalogue", () => {
  it("has unique ids", () => {
    const ids = LAB_MARKERS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("explains every marker that ships without a guideline", () => {
    // Otherwise a marker would show "no range" with no reason given.
    for (const m of LAB_MARKERS) {
      if (!m.guideline) expect(m.rangeNote, `${m.id} needs a rangeNote`).toBeTruthy();
    }
  });

  it("names the body behind every guideline it does ship", () => {
    for (const m of LAB_MARKERS) {
      if (m.guideline) expect(m.guideline.source, `${m.id}`).toBeTruthy();
    }
  });

  it("leaves no gap or overlap in a guideline scale", () => {
    for (const m of LAB_MARKERS) {
      if (!m.guideline) continue;
      // Every value from 0 to 400 must land in exactly one band.
      for (let v = 0; v <= 400; v += 0.1) {
        const hits = m.guideline.bands.filter(
          (b) => (b.from == null || v >= b.from) && (b.under == null || v < b.under));
        expect(hits.length, `${m.id} at ${v.toFixed(1)}`).toBe(1);
      }
    }
  });
});

describe("verdictFor, your lab's own interval wins", () => {
  it("calls a value inside the interval in range", () => {
    const v = verdictFor(findMarker("igf1"), res({ id: "a", markerId: "igf1", value: 180, refLow: 80, refHigh: 250 }));
    expect(v.status).toBe("in-range");
    expect(v.basis).toBe("your lab's range");
  });

  it("flags above and below", () => {
    const marker = findMarker("igf1");
    expect(verdictFor(marker, res({ id: "a", markerId: "igf1", value: 300, refLow: 80, refHigh: 250 })).status).toBe("above");
    expect(verdictFor(marker, res({ id: "b", markerId: "igf1", value: 40, refLow: 80, refHigh: 250 })).status).toBe("below");
  });

  it("copes with a one-sided interval", () => {
    const marker = findMarker("triglycerides");
    expect(verdictFor(marker, res({ id: "a", markerId: "triglycerides", value: 90, refHigh: 150 })).status).toBe("in-range");
    expect(verdictFor(marker, res({ id: "b", markerId: "triglycerides", value: 200, refHigh: 150 })).status).toBe("above");
  });

  it("treats a low HDL as the serious direction and a high one as not", () => {
    const hdl = findMarker("hdl");
    expect(hdl?.higherIsBetter).toBe(true);
    expect(verdictFor(hdl, res({ id: "a", markerId: "hdl", value: 30, refLow: 40 })).tone).toBe("rose");
    expect(verdictFor(hdl, res({ id: "b", markerId: "hdl", value: 95, refHigh: 90 })).tone).toBe("tangerine");
  });

  it("prefers your interval over a guideline when both could apply", () => {
    // 6.0% is "prediabetes" by ADA, but this lab's own interval says in range.
    const v = verdictFor(findMarker("hba1c"), res({ id: "a", markerId: "hba1c", value: 6.0, refLow: 4, refHigh: 6.2 }));
    expect(v.status).toBe("in-range");
    expect(v.basis).toBe("your lab's range");
  });
});

describe("verdictFor, guideline bands", () => {
  it("places HbA1c in the ADA bands", () => {
    const m = findMarker("hba1c");
    const at = (value: number) => verdictFor(m, res({ id: "x", markerId: "hba1c", value }));
    expect(at(5.2).label).toBe("Normal");
    expect(at(5.7).label).toBe("Prediabetes range");
    expect(at(6.4).label).toBe("Prediabetes range");
    expect(at(6.5).label).toBe("Diabetes range");
    expect(at(5.2).basis).toBe("ADA diagnostic criteria");
  });

  it("places fasting glucose in the ADA bands", () => {
    const m = findMarker("glucose-fasting");
    const at = (value: number) => verdictFor(m, res({ id: "x", markerId: "glucose-fasting", value })).label;
    expect(at(88)).toBe("Normal");
    expect(at(100)).toBe("Prediabetes range");
    expect(at(126)).toBe("Diabetes range");
  });

  it("places blood pressure in the AHA categories", () => {
    const sys = findMarker("bp-systolic");
    const at = (value: number) => verdictFor(sys, res({ id: "x", markerId: "bp-systolic", value })).label;
    expect(at(115)).toBe("Normal");
    expect(at(124)).toBe("Elevated");
    expect(at(135)).toBe("Stage 1 hypertension");
    expect(at(150)).toBe("Stage 2 hypertension");
  });

  it("says it does not know for a marker with neither range nor guideline", () => {
    const v = verdictFor(findMarker("igf1"), res({ id: "a", markerId: "igf1", value: 180 }));
    expect(v.status).toBe("unknown");
    expect(v.basis).toBeNull();
  });

  it("says it does not know for an unrecognised marker", () => {
    expect(verdictFor(undefined, res({ id: "a", markerId: "nope", value: 1 })).status).toBe("unknown");
  });

  it("does not judge a non-finite value", () => {
    expect(verdictFor(findMarker("hba1c"), res({ id: "a", markerId: "hba1c", value: NaN })).status).toBe("unknown");
  });
});

describe("labSeries and labTrend", () => {
  const labs = [
    res({ id: "c", markerId: "hba1c", value: 5.4, at: NOW }),
    res({ id: "a", markerId: "hba1c", value: 6.8, at: NOW - 180 * DAY }),
    res({ id: "b", markerId: "hba1c", value: 6.0, at: NOW - 90 * DAY }),
    res({ id: "d", markerId: "ldl", value: 120, at: NOW }),
  ];

  it("returns one marker's results oldest first", () => {
    expect(labSeries(labs, "hba1c").map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("ignores other markers", () => {
    expect(labSeries(labs, "ldl")).toHaveLength(1);
  });

  it("measures the change across the whole record", () => {
    const t = labTrend(labs, "hba1c")!;
    expect(t.first.value).toBe(6.8);
    expect(t.latest.value).toBe(5.4);
    expect(t.delta).toBeCloseTo(-1.4, 10);
    expect(t.percent).toBeCloseTo((-1.4 / 6.8) * 100, 8);
    expect(t.days).toBeCloseTo(180, 6);
  });

  it("refuses to call a single result a trend", () => {
    expect(labTrend(labs, "ldl")).toBeNull();
    expect(labTrend([], "hba1c")).toBeNull();
  });

  it("does not divide by a zero baseline", () => {
    const zeroed = [
      res({ id: "a", markerId: "hba1c", value: 0, at: NOW - DAY }),
      res({ id: "b", markerId: "hba1c", value: 5, at: NOW }),
    ];
    expect(labTrend(zeroed, "hba1c")!.percent).toBeNull();
  });

  it("finds the newest result regardless of array order", () => {
    expect(latestResult(labs, "hba1c")?.id).toBe("c");
    expect(latestResult(labs, "tsh")).toBeNull();
  });

  it("lists tracked markers most recently measured first", () => {
    expect(trackedMarkerIds(labs)).toEqual(["hba1c", "ldl"]);
  });
});

describe("suggestedMarkerIds, what to watch for what you are running", () => {
  it("suggests pancreatic and heart-rate markers for a GLP-1", () => {
    const ids = suggestedMarkerIds([{ category: "metabolic", mechanismClass: ["glp1-agonist"] }]);
    expect(ids).toContain("lipase");
    expect(ids).toContain("resting-hr");
    expect(ids).toContain("hba1c");
  });

  it("suggests IGF-1 and glucose for a growth hormone secretagogue", () => {
    const ids = suggestedMarkerIds([{ category: "growth-hormone" }]);
    expect(ids).toContain("igf1");
    // GH worsens glucose handling, so this is not incidental.
    expect(ids).toContain("glucose-fasting");
    expect(ids).not.toContain("lipase");
  });

  it("suggests the androgen panel for an anabolic", () => {
    const ids = suggestedMarkerIds([{ category: "anabolic" }]);
    // Red cell mass is the usual reason to cut an androgen dose back.
    expect(ids).toContain("haematocrit");
    expect(ids).toContain("hdl");
    expect(ids).toContain("bp-systolic");
    // Liver enzymes only matter for the alkylated orals.
    expect(ids).not.toContain("alt");
  });

  it("adds liver enzymes only for a 17-alpha-alkylated oral", () => {
    const ids = suggestedMarkerIds([{ category: "anabolic", c17AlphaAlkylated: true }]);
    expect(ids).toContain("alt");
    expect(ids).toContain("ast");
  });

  it("suggests nothing for a compound with no metabolic or GH involvement", () => {
    expect(suggestedMarkerIds([{ category: "repair" }])).toEqual([]);
  });

  it("does not repeat a marker when two compounds both call for it", () => {
    const ids = suggestedMarkerIds([
      { category: "metabolic", mechanismClass: ["glp1-agonist"] },
      { category: "metabolic", mechanismClass: ["glp1-agonist", "gip-agonist"] },
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only names markers that exist in the catalogue", () => {
    const ids = suggestedMarkerIds([
      { category: "metabolic", mechanismClass: ["glp1-agonist", "gip-agonist"] },
      { category: "growth-hormone", mechanismClass: ["ghrh-analogue"] },
    ]);
    for (const id of ids) expect(findMarker(id), id).toBeDefined();
  });

  it("leaves out markers already recorded", () => {
    const labs = [res({ id: "a", markerId: "hba1c", value: 5.4 })];
    const compounds = [{ category: "metabolic", mechanismClass: ["glp1-agonist"] }];
    expect(missingMarkerIds(labs, compounds)).not.toContain("hba1c");
    expect(missingMarkerIds(labs, compounds)).toContain("lipase");
  });
});
