/**
 * Language store and hook.
 *
 * Persisted to localStorage under "bench-lang". Defaults to "en".
 * The hook `useLang` returns the translation function `t` and the current lang.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { TRANSLATIONS, type Lang, type TranslationKey } from "./translations";
import { pluralCategory } from "./plural";

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const useLangStore = create<LangState>()(
  persist(
    (set) => ({
      lang: "en",
      setLang: (lang) => set({ lang }),
    }),
    {
      name: "bench-lang",
      storage: createJSONStorage(() =>
        typeof window !== "undefined"
          ? localStorage
          : ({ getItem: () => null, setItem: () => {}, removeItem: () => {} } as unknown as Storage)
      ),
    }
  )
);

/**
 * A key whose English side declares an `_other` form, so it is the base of a
 * plural family rather than a string in its own right. Written as a conditional
 * over the union of keys, which distributes, so only families that really exist
 * are accepted and a typo is still a type error.
 */
export type PluralBase<K extends string = TranslationKey> = K extends `${infer B}_other`
  ? B
  : never;

export type Vars = Record<string, string | number>;

/**
 * Look up a string, and substitute anything in braces.
 *
 * Outside the hook so it can be tested for what it decides rather than for
 * what a component renders. The hook below is then a two line wrapper, which
 * is all a hook should be when the interesting part is a decision.
 *
 * When `vars.n` is a number, the key is treated as the base of a plural family
 * and the form that number takes **in this language** is used: `_one`, `_two`,
 * `_few`, `_many` or `_other`, whichever the language actually selects.
 * English and German select two of those, Slovenian four, Polish three, and
 * the dictionary carries exactly the forms each language needs.
 *
 * Three fallbacks, in order, so no caller has to know which kind of key it is
 * holding: the selected form, then `_other`, which every language has, then
 * the key on its own for a family that has not been split yet.
 */
export function translate(lang: Lang, key: string, vars?: Vars): string {
  const strings: Record<string, string> = TRANSLATIONS[lang] ?? TRANSLATIONS.en;
  const english: Record<string, string> = TRANSLATIONS.en;

  let name = key;

  /*
   * Whether this key is a family is decided by the dictionary, not by the
   * caller: if an `_other` form exists then the bare key does not, and
   * returning it would put "plan_rotating_sites" on screen. So a family always
   * resolves to a form, and `_other` is the one to fall back to, both when the
   * count is missing or unreadable and when a dictionary lacks the form its own
   * grammar selected.
   */
  const other = `${key}_other`;
  if (strings[other] ?? english[other]) {
    const n = vars?.n;
    const countable = n != null && n !== "" && Number.isFinite(Number(n));
    const form = countable ? `${key}_${pluralCategory(lang, Number(n))}` : other;
    name = (strings[form] ?? english[form]) ? form : other;
  }

  let s = strings[name] ?? english[name] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(`{${k}}`, String(v));
    }
  }
  return s;
}

/** Returns a translate function scoped to the current language. */
export function useLang() {
  const { lang, setLang } = useLangStore();

  const t = (key: TranslationKey | PluralBase, vars?: Vars) => translate(lang, key, vars);

  return { t, lang, setLang };
}
