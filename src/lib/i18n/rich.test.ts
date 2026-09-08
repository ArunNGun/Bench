import { describe, expect, it } from "vitest";
import { splitEmphasis, splitSlots } from "./rich";

const plain = (s: string) => [{ text: s, strong: false }];

describe("splitEmphasis", () => {
  it("leaves a sentence with no markers alone", () => {
    expect(splitEmphasis("Nothing to emphasise")).toEqual(plain("Nothing to emphasise"));
  });

  it("pulls one emphasised run out of the middle", () => {
    expect(splitEmphasis("one mark is **0.025 mL** on U-40")).toEqual([
      { text: "one mark is ", strong: false },
      { text: "0.025 mL", strong: true },
      { text: " on U-40", strong: false },
    ]);
  });

  it("handles several, which is what the barrel warning has", () => {
    const parts = splitEmphasis("**a** and **b** and **c**");
    expect(parts.filter((p) => p.strong).map((p) => p.text)).toEqual(["a", "b", "c"]);
    expect(parts.map((p) => p.text).join("")).toBe("a and b and c");
  });

  it("emphasises from the very start and to the very end", () => {
    expect(splitEmphasis("**all of it**")).toEqual([{ text: "all of it", strong: true }]);
  });

  /*
   * The important one. A translator typing one asterisk too few should get a
   * sentence with a visible asterisk in it, which is obviously wrong and
   * trivially fixed, rather than a sentence missing half its words, which
   * looks deliberate.
   */
  it("leaves an unpaired marker as text rather than eating the rest", () => {
    expect(splitEmphasis("half **open and then nothing")).toEqual(
      plain("half **open and then nothing"));
  });

  it("keeps everything, whatever the input", () => {
    for (const s of ["", "a", "**", "***", "a**b", "**a**b**c**", "** **"]) {
      const back = splitEmphasis(s)
        .map((p) => (p.strong ? `**${p.text}**` : p.text))
        .join("");
      expect(back, JSON.stringify(s)).toBe(s);
    }
  });
});

describe("splitSlots", () => {
  it("returns the whole string when it has no slots", () => {
    expect(splitSlots("nothing here", ["log"])).toEqual([{ text: "nothing here" }]);
  });

  it("calls out a slot in the middle and keeps both sides", () => {
    expect(splitSlots("before {log} after", ["log"])).toEqual([
      { text: "before " },
      { slot: "log" },
      { text: " after" },
    ]);
  });

  it("handles a slot at either end without emitting empty text", () => {
    expect(splitSlots("{log} after", ["log"])).toEqual([{ slot: "log" }, { text: " after" }]);
    expect(splitSlots("before {log}", ["log"])).toEqual([{ text: "before " }, { slot: "log" }]);
  });

  it("keeps several slots in the order the translation puts them", () => {
    expect(splitSlots("{site} then {author}", ["author", "site"])).toEqual([
      { slot: "site" },
      { text: " then " },
      { slot: "author" },
    ]);
  });

  /*
   * A translator who writes {logg} has made a typo, not an instruction. The
   * sentence survives with a visible brace, which is findable, rather than
   * losing the word.
   */
  it("leaves an unknown placeholder as text", () => {
    expect(splitSlots("see the {logg} please", ["log"])).toEqual([
      { text: "see the {logg} please" },
    ]);
  });

  it("leaves a lone brace alone", () => {
    expect(splitSlots("100% of {", ["log"])).toEqual([{ text: "100% of {" }]);
  });

  it("returns nothing for an empty string", () => {
    expect(splitSlots("", ["log"])).toEqual([]);
  });
});
