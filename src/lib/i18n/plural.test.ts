import { describe, expect, it } from "vitest";
import { pluralCategories, pluralCategory } from "./plural";

/**
 * These read like tests of `Intl`, and they are not. They are tests that the
 * runtime this app is built and shipped on actually carries plural data for the
 * languages it offers. An engine compiled without full ICU answers every locale
 * as though it were English, silently, and the failure looks like a translation
 * mistake rather than a build one.
 */
describe("plural categories are available for every language shipped", () => {
  it("English and German take two forms", () => {
    expect(pluralCategories("en")).toEqual(["one", "other"]);
    expect(pluralCategories("de")).toEqual(["one", "other"]);
  });

  it("Slovenian takes four", () => {
    expect(pluralCategories("sl")).toEqual(["one", "two", "few", "other"]);
  });

  it("Polish takes three, plus the fractional case", () => {
    expect(pluralCategories("pl")).toEqual(["one", "few", "many", "other"]);
  });
});

describe("pluralCategory", () => {
  it("splits English at one", () => {
    expect(pluralCategory("en", 0)).toBe("other");
    expect(pluralCategory("en", 1)).toBe("one");
    expect(pluralCategory("en", 2)).toBe("other");
  });

  it("counts Slovenian vials the way a Slovenian counts them", () => {
    // ena vialka, dve vialki, tri vialke, pet vialk
    expect(pluralCategory("sl", 1)).toBe("one");
    expect(pluralCategory("sl", 2)).toBe("two");
    expect(pluralCategory("sl", 3)).toBe("few");
    expect(pluralCategory("sl", 4)).toBe("few");
    expect(pluralCategory("sl", 5)).toBe("other");
  });

  it("reads the last two digits in Slovenian, not the first", () => {
    // This is the part a hand-written rule gets wrong: 101 behaves like 1.
    expect(pluralCategory("sl", 101)).toBe("one");
    expect(pluralCategory("sl", 102)).toBe("two");
    expect(pluralCategory("sl", 103)).toBe("few");
  });

  it("counts Polish doses the way a Pole counts them", () => {
    // jedna dawka, dwie dawki, pięć dawek
    expect(pluralCategory("pl", 1)).toBe("one");
    expect(pluralCategory("pl", 2)).toBe("few");
    expect(pluralCategory("pl", 4)).toBe("few");
    expect(pluralCategory("pl", 5)).toBe("many");
    expect(pluralCategory("pl", 0)).toBe("many");
  });

  it("exempts the Polish teens, which is the rule nobody remembers", () => {
    expect(pluralCategory("pl", 12)).toBe("many");
    expect(pluralCategory("pl", 13)).toBe("many");
    expect(pluralCategory("pl", 22)).toBe("few");
    expect(pluralCategory("pl", 23)).toBe("few");
  });

  it("answers something usable for a number that is not one", () => {
    expect(pluralCategory("en", NaN)).toBe("other");
    expect(pluralCategory("sl", Infinity)).toBe("other");
  });
});
