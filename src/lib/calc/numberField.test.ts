import { describe, expect, it } from "vitest";
import { shownValue } from "./numberField";

describe("what a number field shows", () => {
  it("shows the value when nothing has been typed", () => {
    expect(shownValue(null, 250)).toBe(250);
    expect(shownValue(null, undefined)).toBe("");
  });

  it("lets a field showing zero be emptied", () => {
    /*
     * The bug. Clearing the box made the caller store 0, the caller rendered
     * 0 again, and the only way to reach 250 was to type it after the nought.
     */
    expect(shownValue("", 0)).toBe("");
  });

  it("shows what was typed while it still means the same number", () => {
    expect(shownValue("250", 250)).toBe("250");
    expect(shownValue("0.5", 0.5)).toBe("0.5");
    // Halfway through typing a decimal, before the digits after the point.
    expect(shownValue("2.", 2)).toBe("2.");
  });

  it("gives way when something outside the field changes the value", () => {
    // Switching the unit from mcg to mg mid-edit. The typed text no longer
    // means what the caller holds, so the caller wins and the field updates.
    expect(shownValue("250", 0.25)).toBe(0.25);
  });

  it("gives way when the caller clamps what was typed", () => {
    expect(shownValue("-5", 0)).toBe(0);
  });

  it("does not treat an empty value as a number to compare against", () => {
    // A field that is legitimately blank, like presses with no bottle chosen.
    expect(shownValue("", "")).toBe("");
    expect(shownValue("7", "")).toBe("");
  });
});
