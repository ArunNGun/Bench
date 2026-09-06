/**
 * Language store and hook.
 *
 * Persisted to localStorage under "bench-lang". Defaults to "en".
 * The hook `useLang` returns the translation function `t` and the current lang.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { TRANSLATIONS, type Lang, type TranslationKey } from "./translations";

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

/** Returns a translate function scoped to the current language. */
export function useLang() {
  const { lang, setLang } = useLangStore();
  const strings = TRANSLATIONS[lang];

  function t(key: TranslationKey, vars?: Record<string, string | number>): string {
    let s = strings[key] ?? TRANSLATIONS.en[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        s = s.replace(`{${k}}`, String(v));
      }
    }
    return s;
  }

  return { t, lang, setLang };
}
