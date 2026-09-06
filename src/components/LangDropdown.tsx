"use client";

/**
 * Language selector shown in the app header, top-right.
 *
 * Appearance: "EN ^" (current language code + chevron).
 * Clicking opens a small dropdown with the other language.
 * Closes on outside click or Escape.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useLangStore } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n/translations";
import { cn } from "@/lib/cn";

const LANGS: { code: Lang; label: string; native: string }[] = [
  { code: "en", label: "EN", native: "English" },
  { code: "de", label: "DE", native: "Deutsch" },
];

export function LangDropdown() {
  const { lang, setLang } = useLangStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];
  const others = LANGS.filter((l) => l.code !== lang);

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "press flex h-10 items-center gap-1 rounded-[var(--r-pill)] px-2.5 text-[13px] font-semibold transition-colors",
          open
            ? "bg-[var(--card)] text-[var(--ink)]"
            : "text-[var(--muted)] hover:bg-[var(--card)] hover:text-[var(--ink)]"
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select language"
      >
        {current.label}
        <ChevronDown
          size={13}
          strokeWidth={2.5}
          className={cn("transition-transform", open && "rotate-180")}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="listbox"
          aria-label="Language"
          className="absolute right-0 top-full z-50 mt-1 min-w-[110px] overflow-hidden rounded-[var(--r-inner)] border border-[var(--line)] bg-[var(--card)] shadow-[var(--shadow-md)]"
        >
          {others.map((l) => (
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
