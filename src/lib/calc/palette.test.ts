import { describe, expect, it } from "vitest";
import {
  assignColors,
  colorSubjects,
  doseColor,
  SERIES_COLORS,
  SERIES_TONES,
  toneFor,
} from "./palette";
import { PEPTIDE_BY_ID } from "../data/peptides";
import type { Peptide, Protocol } from "../types";

describe("assignColors", () => {
  it("hands out the palette in order", () => {
    const { byKey } = assignColors([{ protocolId: "a" }, { protocolId: "b" }]);
    expect(byKey.get("a")).toBe(SERIES_COLORS[0]);
    expect(byKey.get("b")).toBe(SERIES_COLORS[1]);
  });

  it("gives a blend one colour per component", () => {
    const { byKey } = assignColors([
      { protocolId: "blend", componentKeys: ["cjc", "ipa"] },
      { protocolId: "after" },
    ]);
    expect(byKey.get("blend:cjc")).toBe(SERIES_COLORS[0]);
    expect(byKey.get("blend:ipa")).toBe(SERIES_COLORS[1]);
    // The protocol after a blend starts where the blend finished, which is the
    // whole reason counting separately on two screens went wrong.
    expect(byKey.get("after")).toBe(SERIES_COLORS[2]);
  });

  it("gives a blend the colour of its first component when listed as a whole", () => {
    const { byProtocol } = assignColors([{ protocolId: "blend", componentKeys: ["cjc", "ipa"] }]);
    expect(byProtocol.get("blend")).toBe(SERIES_COLORS[0]);
  });

  it("reserves a colour for a compound that cannot be drawn", () => {
    // It has no half-life, so the chart draws no line for it, and it still
    // appears in the plan. Skipping it here is what made the two disagree.
    const { byProtocol } = assignColors([
      { protocolId: "unplottable" },
      { protocolId: "next" },
    ]);
    expect(byProtocol.get("unplottable")).toBe(SERIES_COLORS[0]);
    expect(byProtocol.get("next")).toBe(SERIES_COLORS[1]);
  });

  it("treats an empty component list as an ordinary compound", () => {
    const { byKey, byProtocol } = assignColors([{ protocolId: "a", componentKeys: [] }]);
    expect(byKey.get("a")).toBe(SERIES_COLORS[0]);
    expect(byProtocol.get("a")).toBe(SERIES_COLORS[0]);
  });

  it("wraps around rather than running out", () => {
    const many = Array.from({ length: SERIES_COLORS.length + 2 }, (_, i) => ({
      protocolId: `p${i}`,
    }));
    const { byProtocol } = assignColors(many);
    expect(byProtocol.size).toBe(many.length);
    expect(byProtocol.get(`p${SERIES_COLORS.length}`)).toBe(SERIES_COLORS[0]);
    expect(byProtocol.get(`p${SERIES_COLORS.length + 1}`)).toBe(SERIES_COLORS[1]);
  });

  it("gives every distinct thing its own colour until the palette wraps", () => {
    const subjects = [
      { protocolId: "a", componentKeys: ["x", "y"] },
      { protocolId: "b" },
      { protocolId: "c" },
    ];
    const { byKey } = assignColors(subjects);
    expect(new Set(byKey.values()).size).toBe(byKey.size);
  });

  it("says nothing about a protocol it was not given", () => {
    const { byProtocol, byKey } = assignColors([{ protocolId: "a" }]);
    expect(byProtocol.get("missing")).toBeUndefined();
    expect(byKey.get("missing")).toBeUndefined();
  });

  it("answers the same way twice for the same input", () => {
    const subjects = [{ protocolId: "a", componentKeys: ["x"] }, { protocolId: "b" }];
    expect([...assignColors(subjects).byKey]).toEqual([...assignColors(subjects).byKey]);
  });
});

describe("tones", () => {
  it("names the same six things in the same order as the colours", () => {
    expect(SERIES_COLORS).toEqual(SERIES_TONES.map((t) => `var(--${t})`));
  });

  it("finds the tone for a colour it handed out", () => {
    const { byProtocol } = assignColors([{ protocolId: "a" }, { protocolId: "b" }]);
    expect(toneFor(byProtocol.get("a"))).toBe("mint");
    expect(toneFor(byProtocol.get("b"))).toBe("grape");
  });

  it("has no tone for a colour it never handed out", () => {
    expect(toneFor("var(--ink)")).toBeUndefined();
    expect(toneFor(undefined)).toBeUndefined();
  });
});

describe("assignColors, by compound", () => {
  it("gives a compound the colour of the protocol running it", () => {
    const { byPeptide, byProtocol } = assignColors([
      { protocolId: "a", peptideId: "bpc-157" },
      { protocolId: "b", peptideId: "tb-500" },
    ]);
    expect(byPeptide.get("bpc-157")).toBe(byProtocol.get("a"));
    expect(byPeptide.get("tb-500")).toBe(byProtocol.get("b"));
  });

  it("uses the blend's own first colour, the one its row already wears", () => {
    const { byPeptide } = assignColors([{ protocolId: "k", peptideId: "klow", componentKeys: ["x", "y"] }]);
    expect(byPeptide.get("klow")).toBe(SERIES_COLORS[0]);
  });

  it("refuses to guess when two protocols run the same compound", () => {
    // They are two colours by design, and an untagged dose could be either.
    const { byPeptide, byProtocol } = assignColors([
      { protocolId: "morning", peptideId: "bpc-157" },
      { protocolId: "evening", peptideId: "bpc-157" },
    ]);
    expect(byPeptide.get("bpc-157")).toBeUndefined();
    expect(byProtocol.get("morning")).toBe(SERIES_COLORS[0]);
    expect(byProtocol.get("evening")).toBe(SERIES_COLORS[1]);
  });

  it("stays empty when nothing carries a compound", () => {
    expect(assignColors([{ protocolId: "a" }]).byPeptide.size).toBe(0);
  });
});

describe("doseColor", () => {
  const palette = assignColors([
    { protocolId: "a", peptideId: "bpc-157" },
    { protocolId: "b", peptideId: "tb-500" },
  ]);

  it("follows the protocol the dose was logged against", () => {
    expect(doseColor(palette, { protocolId: "b", peptideId: "tb-500" })).toBe(SERIES_COLORS[1]);
  });

  it("falls back to the compound for a dose taken outside any plan", () => {
    expect(doseColor(palette, { peptideId: "bpc-157" })).toBe(SERIES_COLORS[0]);
  });

  it("falls back to the compound when the protocol has since gone", () => {
    expect(doseColor(palette, { protocolId: "deleted", peptideId: "bpc-157" })).toBe(SERIES_COLORS[0]);
  });

  it("leaves history uncoloured when nothing running matches it", () => {
    expect(doseColor(palette, { peptideId: "retatrutide" })).toBeUndefined();
  });

  it("prefers the protocol even where the compound would be ambiguous", () => {
    const two = assignColors([
      { protocolId: "morning", peptideId: "bpc-157" },
      { protocolId: "evening", peptideId: "bpc-157" },
    ]);
    expect(doseColor(two, { protocolId: "evening", peptideId: "bpc-157" })).toBe(SERIES_COLORS[1]);
    expect(doseColor(two, { peptideId: "bpc-157" })).toBeUndefined();
  });
});

describe("colorSubjects", () => {
  const resolve = (id: string): Peptide | undefined => PEPTIDE_BY_ID.get(id);
  const now = Date.UTC(2026, 6, 29, 12, 0, 0);

  const protocol = (id: string, peptideId: string): Protocol => ({
    id,
    profileId: "me",
    peptideId,
    name: id,
    active: true,
    startedAt: now - 30 * 86_400_000,
    doseMcg: 4000,
    route: "subcutaneous",
    schedule: { kind: "interval-days", intervalDays: 7 },
    titrationAutoAdvance: false,
  });

  it("carries the compound through, so a dose can find its colour", () => {
    const [s] = colorSubjects([protocol("p", "bpc-157")], resolve, now);
    expect(s.protocolId).toBe("p");
    expect(s.peptideId).toBe("bpc-157");
    expect(s.componentKeys).toEqual([]);
  });

  it("expands a blend into the components the chart will draw", () => {
    const [s] = colorSubjects([protocol("p", "cagrisema")], resolve, now);
    expect(s.componentKeys).toEqual(["cagrilintide", "semaglutide"]);
  });

  it("names only the components a line can be drawn for", () => {
    // KLOW is four peptides and only BPC-157 has a measured half-life, so the
    // chart draws one line and the protocol takes one colour. Counting four
    // here would push every colour after it along by three.
    const [s] = colorSubjects([protocol("p", "klow")], resolve, now);
    expect(s.componentKeys).toEqual(["bpc-157"]);
  });

  it("names the same components whatever the dose happens to be", () => {
    // The expansion decides how many colours a protocol consumes, so if it
    // moved with the scheduled dose every colour after it would move too.
    const small = colorSubjects([{ ...protocol("p", "cagrisema"), doseMcg: 100 }], resolve, now);
    const large = colorSubjects([{ ...protocol("p", "cagrisema"), doseMcg: 8000 }], resolve, now);
    expect(small[0].componentKeys).toEqual(large[0].componentKeys);
  });

  it("still reserves a colour for a compound it cannot resolve", () => {
    const [s] = colorSubjects([protocol("p", "not-a-compound")], resolve, now);
    expect(s.protocolId).toBe("p");
    expect(s.componentKeys).toEqual([]);
  });
});
