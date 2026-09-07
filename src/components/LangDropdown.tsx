"use client";

/**
 * Choosing the language.
 *
 * Two shapes from one implementation, the same arrangement `ThemeToggle` uses.
 * `menu` draws one full width row per language inside the Settings menu, which
 * is where this lives, and the standalone dropdown is kept for anywhere that
 * has room for a control of its own.
 *
 * It is in the Settings menu rather than the header for a reason that has
 * already cost a day: that row is at its width ceiling on a phone. Adding a
 * pill to it pushes the header past the screen and gives the whole app a
 * sideways scroll, which is what happened when sign out went in. Settings is
 * the header item that means "everything about how this behaves", and a
 * language belongs under it at least as naturally as a theme does.
 *
 * A flat list of rows rather than a nested dropdown. With two or three
 * languages, a menu that opens a menu is more machinery than the choice needs,
 * and the current one is visible without opening anything.
 */

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Languages } from "lucide-react";
import { useLangStore } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n/translations";
import { cn } from "@/lib/cn";

/**
 * Each language is named in itself. Somebody who cannot read the current
 * language is exactly the person reaching for this list, so "Deutsch" belongs
 * here and "German" does not.
 */
const LANGS: { code: Lang; label: string; native: string }[] = [
  { code: "en", label: "EN", native: "English" },
  { code: "de", label: "DE", native: "Deutsch" },
  { code: "sl", label: "SL", native: "Slovenščina" },
];

export function LangDropdown({ menu = false }: { menu?: boolean }) {
  const { lang, setLang } = useLangStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Above the early return: a hook that only runs sometimes is a hook that
  // changes order between renders.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];

  if (menu) {
    return (
      <>
        {LANGS.map((l) => (
          <button
            key={l.code}
            type="button"
            role="menuitem"
            onClick={() => setLang(l.code)}
            className="press flex w-full items-center gap-2.5 rounded-[var(--r-inner)] px-2.5 py-2 text-left hover:bg-[var(--sunken)]"
          >
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[var(--r-pill)] bg-[var(--sunken)] text-[12px] font-semibold text-[var(--muted)]">
              {l.label}
            </span>
            <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-[var(--ink)]">
              {l.native}
            </span>
            {l.code === lang && <Check size={16} className="text-[var(--mint)]" />}
          </button>
        ))}
      </>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "press flex h-10 items-center gap-1 rounded-[var(--r-pill)] px-2.5 text-[13px] font-semibold transition-colors",
          open
            ? "bg-[var(--card)] text-[var(--ink)]"
            : "text-[var(--muted)] hover:bg-[var(--card)] hover:text-[var(--ink)]")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select language"
      >
        <Languages size={16} strokeWidth={2.1} className="sm:hidden" />
        <span className="hidden sm:inline">{current.label}</span>
        <ChevronDown
          size={13}
          strokeWidth={2.5}
          className={cn("transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Language"
          className="absolute right-0 top-full z-50 mt-1 min-w-[110px] overflow-hidden rounded-[var(--r-inner)] border border-[var(--line)] bg-[var(--card)] shadow-[var(--shadow-md)]"
        >
          {LANGS.filter((l) => l.code !== lang).map((l) => (
            <button
              key={l.code}
              role="option"
              aria-selected={false}
              type="button"
              onClick={() => {
                setLang(l.code);
                setOpen(false);
              }}
              className="press flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-[var(--muted)] hover:bg-[var(--sunken)] hover:text-[var(--ink)]"
            >
              <span className="font-semibold text-[var(--ink)]">{l.label}</span>
              <span>{l.native}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
