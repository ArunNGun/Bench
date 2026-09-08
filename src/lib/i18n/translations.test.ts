import { describe, expect, it } from "vitest";
import { TRANSLATIONS, type Lang } from "./translations";
import { pluralCategories } from "./plural";

/**
 * The dictionary is typed `satisfies Record<Lang, Record<string, string>>`,
 * which says every language is an object of strings and says nothing about
 * which keys are in it. A language missing half its keys type checks, and
 * `t()` falls back to English silently, so the gap shows up as an English
 * sentence in the middle of a German paragraph rather than as an error.
 *
 * That is what these tests are for. English is the reference because
 * `TranslationKey` is derived from it.
 */

const LANGS = Object.keys(TRANSLATIONS) as Lang[];
const OTHERS = LANGS.filter((l) => l !== "en");

const keysOf = (lang: Lang) => Object.keys(TRANSLATIONS[lang]).sort();

/**
 * Bases of plural families, taken from English, which declares one `_other`
 * form per family.
 */
const FAMILIES = Object.keys(TRANSLATIONS.en)
  .filter((k) => k.endsWith("_other"))
  .map((k) => k.slice(0, -"_other".length))
  .sort();

const isFamilyForm = (key: string) =>
  FAMILIES.some((base) => key.startsWith(`${base}_`));

/** Everything that is one string rather than one form of a string. */
const plainKeysOf = (lang: Lang) => keysOf(lang).filter((k) => !isFamilyForm(k));

/** Every `{placeholder}` in a string, so a template cannot lose its data. */
function placeholders(text: string) {
  return (text.match(/\{[a-z]+\}/g) ?? []).sort();
}

describe("translations", () => {
  it("declares at least one plural family, so the machinery has a user", () => {
    expect(FAMILIES.length).toBeGreaterThan(0);
  });

  it("ships more than one language", () => {
    expect(LANGS).toContain("en");
    expect(OTHERS.length).toBeGreaterThan(0);
  });

  for (const lang of OTHERS) {
    it(`${lang} has every key English has, and no key English does not`, () => {
      expect(plainKeysOf(lang)).toEqual(plainKeysOf("en"));
    });

    /*
     * Plural families are the one place where the languages are allowed to
     * differ, and they have to differ in exactly one way: each carries the
     * forms its own grammar selects, no more and no fewer. A missing form
     * falls back to English mid-sentence, and a form the language never
     * selects is a translation nobody will ever read.
     */
    it(`${lang} carries exactly the plural forms its grammar uses`, () => {
      const want = pluralCategories(lang);
      for (const base of FAMILIES) {
        const have = Object.keys(TRANSLATIONS[lang])
          .filter((k) => k.startsWith(`${base}_`))
          .map((k) => k.slice(base.length + 1))
          .sort();
        expect(have, `${lang}.${base}`).toEqual([...want].sort());
      }
    });

    it(`${lang} leaves nothing empty`, () => {
      const blank = Object.entries(TRANSLATIONS[lang])
        .filter(([, v]) => v.trim() === "")
        .map(([k]) => k);
      expect(blank).toEqual([]);
    });

    it(`${lang} keeps every placeholder the English string has`, () => {
      const wrong: string[] = [];
      for (const [key, english] of Object.entries(TRANSLATIONS.en)) {
        const mine = (TRANSLATIONS[lang] as Record<string, string>)[key];
        if (mine && placeholders(mine).join() !== placeholders(english).join()) {
          wrong.push(key);
        }
      }
      expect(wrong).toEqual([]);
    });

    /*
     * A translation that is character for character the English one is
     * usually a key somebody forgot, not a word that happens to be the same
     * in both languages. Words that genuinely are the same, "kg", "Libido",
     * "Health Connect", are common enough that this counts them rather than
     * forbidding them: it catches a language that was never translated at
     * all, and stays quiet about the handful that legitimately match.
     */
    it(`${lang} is not simply a copy of English`, () => {
      const same = Object.entries(TRANSLATIONS.en).filter(
        ([key, english]) => (TRANSLATIONS[lang] as Record<string, string>)[key] === english);
      expect(same.length).toBeLessThan(Object.keys(TRANSLATIONS.en).length / 4);
    });
  }

  /*
   * Escapes rather than the characters themselves, so that a grep for a dash
   * across the repository does not land on the test that forbids them.
   */
  it("uses no em or en dashes in any language", () => {
    const dash = /[\u2013\u2014]/;
    const offenders: string[] = [];
    for (const lang of LANGS) {
      for (const [key, value] of Object.entries(TRANSLATIONS[lang])) {
        if (dash.test(value)) offenders.push(`${lang}.${key}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
