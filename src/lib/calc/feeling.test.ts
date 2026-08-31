import { describe, expect, it } from "vitest";
import { FEELING_TONE, lowestRatedTone, ratingTone } from "./feeling";
import { SYMPTOMS } from "../types";

describe("ratingTone", () => {
  it("uses the same colours a logged feeling already uses", () => {
    // The point of the shared mapping: two ratings on one page, one scale.
    for (const rating of [1, 2, 3, 4, 5]) {
      expect(ratingTone(rating, true)).toBe(FEELING_TONE[rating]);
    }
  });

  it("says nothing about a rating with no direction", () => {
    // Appetite. Five is not good and one is not bad, so neither is coloured.
    expect(ratingTone(1)).toBe("neutral");
    expect(ratingTone(5)).toBe("neutral");
    expect(ratingTone(5, false)).toBe("neutral");
  });

  it("stays neutral for a rating off the scale", () => {
    expect(ratingTone(0, true)).toBe("neutral");
    expect(ratingTone(9, true)).toBe("neutral");
  });

  it("agrees with the library about which symptoms have a direction", () => {
    // If a symptom gains or loses `higherIsBetter`, its colour follows without
    // anyone having to remember this file exists.
    const appetite = SYMPTOMS.find((s) => s.id === "appetite")!;
    const sleep = SYMPTOMS.find((s) => s.id === "sleep")!;
    expect(ratingTone(2, appetite.higherIsBetter)).toBe("neutral");
    expect(ratingTone(2, sleep.higherIsBetter)).toBe("tangerine");
  });
});

describe("lowestRatedTone", () => {
  it("marks a day by its worst rating", () => {
    expect(
      lowestRatedTone([
        { rating: 5, higherIsBetter: true },
        { rating: 1, higherIsBetter: true },
        { rating: 4, higherIsBetter: true },
      ])).toBe("rose");
  });

  it("ignores a rating that has no direction", () => {
    // A ravenous day is not a bad day, so appetite must not colour the row.
    expect(
      lowestRatedTone([
        { rating: 4, higherIsBetter: true },
        { rating: 1 },
      ])).toBe("mint");
  });

  it("marks nothing when only appetite was rated", () => {
    expect(lowestRatedTone([{ rating: 1 }])).toBeNull();
  });

  it("marks nothing when the day was not rated at all", () => {
    expect(lowestRatedTone([])).toBeNull();
  });

  it("keeps a good day green rather than finding fault", () => {
    expect(lowestRatedTone([{ rating: 5, higherIsBetter: true }])).toBe("leaf");
  });
});
