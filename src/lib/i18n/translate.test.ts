import { describe, expect, it } from "vitest";
import { translate } from "./index";

/**
 * What `t()` decides, tested without rendering anything. The interesting part
 * of a translation is which string comes back, and that is a decision rather
 * than a component.
 */
describe("translate", () => {
  it("returns the string for the language asked for", () => {
    expect(translate("en", "nav_now")).toBe("Now");
    expect(translate("sl", "nav_now")).toBe("Zdaj");
    expect(translate("pl", "nav_now")).toBe("Teraz");
  });

  it("substitutes what is in braces", () => {
    expect(translate("en", "profile_switch", { name: "Ana" })).toBe("Switch to Ana");
  });

  it("falls back to English rather than to the key", () => {
    // Every language has this one, so the fallback is exercised by asking for
    // a language that does not exist at all.
    expect(translate("xx" as never, "nav_now")).toBe("Now");
  });

  it("returns the key itself when nothing has it, which is a visible failure", () => {
    expect(translate("en", "no_such_key_anywhere")).toBe("no_such_key_anywhere");
  });

  describe("plural families", () => {
    it("picks singular and plural in English", () => {
      expect(translate("en", "plan_rotating_sites", { n: 1 })).toBe("rotating 1 site");
      expect(translate("en", "plan_rotating_sites", { n: 3 })).toBe("rotating 3 sites");
    });

    it("picks all four Slovenian forms", () => {
      const at = (n: number) => translate("sl", "plan_own_plan_bands", { n });
      expect(at(1)).toContain("tedenski pas.");
      expect(at(2)).toContain("tedenska pasova.");
      expect(at(3)).toContain("tedenski pasovi.");
      expect(at(5)).toContain("tedenskih pasov.");
    });

    it("picks the Polish forms, including the teens exception", () => {
      const at = (n: number) => translate("pl", "library_subtitle", { n });
      expect(at(1)).toMatch(/^1 substancja,/);
      expect(at(3)).toMatch(/^3 substancje,/);
      expect(at(5)).toMatch(/^5 substancji,/);
      // 22 behaves like 2, 12 does not.
      expect(at(22)).toMatch(/^22 substancje,/);
      expect(at(12)).toMatch(/^12 substancji,/);
    });

    it("reads the last two digits in Slovenian", () => {
      expect(translate("sl", "plan_rotating_sites", { n: 101 })).toBe("kroženje po 101 mestu");
    });

    it("accepts a count that arrived as a string, because call sites do that", () => {
      expect(translate("en", "plan_rotating_sites", { n: "1" })).toBe("rotating 1 site");
    });

    it("leaves a plain key alone when n happens to be one of its variables", () => {
      // `stock_grouped` is not a family, so the count is substituted and no
      // form is selected. A caller should not have to know the difference.
      expect(translate("en", "stock_grouped", { n: 3 })).toBe("3 identical vials");
    });

    /*
     * This one found a real hole. A family base is not a key any more, so a
     * count that cannot be read used to fall through to the base and print
     * `plan_rotating_sites` on the screen. A family now always resolves to a
     * form, and `_other` is the one that reads least badly when the count is
     * missing.
     */
    it("falls back to the plural form rather than showing the key", () => {
      expect(translate("en", "plan_rotating_sites", { n: "many" })).toBe("rotating many sites");
      expect(translate("en", "plan_rotating_sites")).toBe("rotating {n} sites");
      expect(translate("sl", "plan_rotating_sites", { n: NaN })).toBe("kroženje po NaN mestih");
    });
  });
});
