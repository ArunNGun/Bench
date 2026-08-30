import { describe, expect, it } from "vitest";
import { assignColors, SERIES_COLORS } from "./palette";

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
