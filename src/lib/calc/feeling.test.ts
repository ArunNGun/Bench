import { describe, expect, it } from "vitest";
import { FEELING_TONE, lowestRatedTone, ratingTone } from "./feeling";
import { SYMPTOMS, SYMPTOM_SCALE_MAX } from "../types";

describe("ratingTone", () => {
  it("uses the same colours a logged feeling already uses", () => {
    // The point of the shared mapping: two ratings on one page, one scale.
    for (const rating of [1, 2, 3, 4, 5]) {
      expect(ratingTone(rating, true)).toBe(FEELING_TONE[rating]);
    }
  });

  it("says nothing about a rating with no direction", () => {
    // Physical hunger. Five is not good and one is not bad, so neither is
    // coloured. Absent, not false: those are now different answers.
    expect(ratingTone(1)).toBe("neutral");
    expect(ratingTone(5)).toBe("neutral");
    expect(ratingTone(3, undefined)).toBe("neutral");
  });

  it("turns an axis whose good end is the bottom", () => {
    // Food noise. A quiet head is a one, and a one has to read as the good day
    // it is. Before this, false and absent were the same answer and neither
    // was coloured at all.
    expect(ratingTone(1, false)).toBe("leaf");
    expect(ratingTone(2, false)).toBe("mint");
    expect(ratingTone(3, false)).toBe("sky");
    expect(ratingTone(4, false)).toBe("tangerine");
    expect(ratingTone(5, false)).toBe("rose");
  });

  it("gives the two directions mirror colours", () => {
    for (const rating of [1, 2, 3, 4, 5]) {
      expect(ratingTone(rating, false)).toBe(ratingTone(SYMPTOM_SCALE_MAX + 1 - rating, true));
    }
  });

  it("stays neutral for a rating off the scale", () => {
    expect(ratingTone(0, true)).toBe("neutral");
    expect(ratingTone(9, true)).toBe("neutral");
  });

  it("agrees with the library about which symptoms have a direction", () => {
    // If a symptom gains or loses `higherIsBetter`, its colour follows without
    // anyone having to remember this file exists.
    const hunger = SYMPTOMS.find((s) => s.id === "appetite")!;
    const sleep = SYMPTOMS.find((s) => s.id === "sleep")!;
    const noise = SYMPTOMS.find((s) => s.id === "foodNoise")!;
    expect(ratingTone(2, hunger.higherIsBetter)).toBe("neutral");
    expect(ratingTone(2, sleep.higherIsBetter)).toBe("tangerine");
    // Two on food noise is a mostly quiet head, so it reads as a good day.
    expect(ratingTone(2, noise.higherIsBetter)).toBe("mint");
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
    // A ravenous day is not a bad day, so physical hunger must not colour the
    // row.
    expect(
      lowestRatedTone([
        { rating: 4, higherIsBetter: true },
        { rating: 1 },
      ])).toBe("mint");
  });

  it("marks nothing when only physical hunger was rated", () => {
    expect(lowestRatedTone([{ rating: 1 }])).toBeNull();
  });

  it("does not read a day full of food noise as the best thing about it", () => {
    // The bug this rewrite exists to prevent. Taking the lowest number would
    // pick the 1 and paint the day green, when the 1 is a five once turned.
    expect(
      lowestRatedTone([
        { rating: 5, higherIsBetter: true },
        { rating: 5, higherIsBetter: false },
      ])).toBe("rose");
  });

  it("lets a quiet head be the best part of an otherwise flat day", () => {
    expect(
      lowestRatedTone([
        { rating: 3, higherIsBetter: true },
        { rating: 1, higherIsBetter: false },
      ])).toBe("sky");
  });

  it("marks a good day green on both directions at once", () => {
    expect(
      lowestRatedTone([
        { rating: 5, higherIsBetter: true },
        { rating: 1, higherIsBetter: false },
      ])).toBe("leaf");
  });

  it("marks nothing when the day was not rated at all", () => {
    expect(lowestRatedTone([])).toBeNull();
  });

  it("keeps a good day green rather than finding fault", () => {
    expect(lowestRatedTone([{ rating: 5, higherIsBetter: true }])).toBe("leaf");
  });
});
