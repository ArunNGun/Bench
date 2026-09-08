/**
 * Which grammatical form a number takes.
 *
 * English has two, one and everything else, and a ternary covers it. Slovenian
 * has four: ena vialka, dve vialki, tri vialke, pet vialk, and the rule is on
 * the last two digits, so 101 takes the same form as 1 and 102 the same as 2.
 * Polish has three, on a rule about the last digit except in the teens, so 22
 * is treated like 2 and 12 is not.
 *
 * None of that is invented here. `Intl.PluralRules` **is** the CLDR data, built
 * into the runtime, so this file is a thin wrapper over it rather than a table
 * of rules somebody would have to maintain and could get wrong. The tests below
 * it are there to prove the runtime actually carries the data for the languages
 * this app ships, because an engine built without full ICU quietly answers as
 * though everything were English.
 *
 * The fallback, for an engine with no plural data at all, is the English rule.
 * It is wrong for Slavic languages and it is the only safe guess available:
 * returning "other" for everything would put "5 vialk" under the number 1.
 */

export type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";

const cache = new Map<string, Intl.PluralRules | null>();

function rulesFor(lang: string): Intl.PluralRules | null {
  if (!cache.has(lang)) {
    try {
      cache.set(lang, new Intl.PluralRules(lang));
    } catch {
      cache.set(lang, null);
    }
  }
  return cache.get(lang) ?? null;
}

/** The form `n` takes in this language. */
export function pluralCategory(lang: string, n: number): PluralCategory {
  if (!Number.isFinite(n)) return "other";
  const rules = rulesFor(lang);
  if (!rules) return n === 1 ? "one" : "other";
  return rules.select(n) as PluralCategory;
}

/**
 * Every form this language uses, so a test can insist a dictionary supplies
 * exactly those and no others. A language that lists a form it never selects
 * would collect a translation nobody ever reads, and one that is missing a form
 * it does select falls back to English mid-sentence.
 */
export function pluralCategories(lang: string): PluralCategory[] {
  const rules = rulesFor(lang);
  const listed = rules
    ? (rules.resolvedOptions().pluralCategories as PluralCategory[])
    : (["one", "other"] as PluralCategory[]);

  // Sorted so two dictionaries can be compared without minding ICU's order.
  const order: PluralCategory[] = ["zero", "one", "two", "few", "many", "other"];
  return [...listed].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}
