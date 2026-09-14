"use client";

/**
 * The one-tap log button, with a way out of it.
 *
 * The button itself has not changed: it writes the dose at the site the
 * rotation suggests, in one tap, which is right nearly every time. What was
 * missing was the other times. A person who injected the left thigh this
 * morning because the right one was sore had no way to say so here, and the
 * choice was between the full form and a wrong site quietly recorded. A wrong
 * site is worse than no site: rotation is tracked to keep tissue from building
 * up, and a rotation history that disagrees with the body is worse than an
 * empty one, because it will go on suggesting from the wrong picture.
 *
 * So the button is split. The wide half logs at the suggestion. The narrow
 * half opens the sites this protocol uses, best rested first, and tapping one
 * logs there immediately. One tap to agree, two to disagree. The panel is not
 * a form and has no save: a list where tapping selects and a separate button
 * confirms would make the common case worse to make the rare case tidier.
 *
 * The dots follow the map on the Sites screen, deliberately: dashed mint is
 * the suggestion, filled tangerine is recently used, hollow is rested. Two
 * screens showing the same facts in two vocabularies is how a person learns to
 * distrust both.
 */

import { useEffect, useRef, type CSSProperties } from "react";
import { Check, ChevronDown } from "lucide-react";
import { buttonClasses } from "./ui";
import { relativeTime, siteLabel } from "@/lib/format";
import { useLang } from "@/lib/i18n";
import type { SiteUsage } from "@/lib/calc/sites";
import type { InjectionSite } from "@/lib/types";

/** Matches the legend on the Sites map. */
function dotStyle(usage: SiteUsage, suggested: boolean): CSSProperties {
  if (suggested) return { border: "1.5px dashed var(--mint)" };

  const used = 1 - usage.rested;
  return used > 0.05
    ? { background: "var(--tangerine)", opacity: Math.max(0.35, used) }
    : { border: "1.5px solid var(--line)" };
}

export function LogDoseButton({
  label,
  title,
  dose,
  choices,
  nowMs,
  open,
  onOpenChange,
  onLog,
  onAllSites,
}: {
  /** The word on the button. The caller owns it, because it is not always the same word. */
  label: string;
  title: string;
  /** The dose, already formatted, for the row labels a screen reader reads out. */
  dose: string;
  /**
   * The sites worth offering, best first. Empty for a route that has no site,
   * a nasal spray being the one that matters, and the button is then a plain
   * button with nothing to open.
   */
  choices: SiteUsage[];
  nowMs: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLog: (site: InjectionSite | undefined) => void;
  /** Hands the whole map over to the full form, for the sites not listed here. */
  onAllSites: () => void;
}) {
  const { t } = useLang();
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    // pointerdown rather than click, so the panel is gone before whatever was
    // tapped underneath it reacts.
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) onOpenChange(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };

    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open, onOpenChange]);

  const suggested = choices[0]?.site;

  // One site is not a choice, and neither is none.
  if (choices.length < 2) {
    return (
      <button className={buttonClasses("primary")} title={title} onClick={() => onLog(suggested)}>
        <Check size={15} /> {label}
      </button>
    );
  }

  return (
    <div ref={wrap} className="relative">
      <div className="inline-flex">
        <button
          className={buttonClasses("primary", "rounded-r-none pr-3")}
          title={title}
          onClick={() => onLog(suggested)}
        >
          <Check size={15} /> {label}
        </button>
        {/* Thin, so the two halves stay one button to the eye. */}
        <span aria-hidden className="w-px bg-[var(--on-accent)] opacity-25" />
        <button
          className={buttonClasses("primary", "min-w-[44px] rounded-l-none px-3")}
          title={t("now_choose_site")}
          aria-label={t("now_choose_site")}
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => onOpenChange(!open)}
        >
          <ChevronDown
            size={15}
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1.5 w-60 overflow-hidden rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--card)] shadow-[var(--shadow-pop)]"
        >
          {/* Said once, at the top, because tapping a row writes the dose. */}
          <p className="px-3 pb-1.5 pt-2.5 text-[11.5px] text-[var(--faint)]">
            {t("now_site_hint")}
          </p>
          {choices.map((c) => {
            const isSuggested = c.site === suggested;
            const name = siteLabel(c.site);
            return (
              <button
                key={c.site}
                role="menuitem"
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-[var(--sunken)]"
                title={t("now_log_at_site", { dose, site: name })}
                onClick={() => {
                  onOpenChange(false);
                  onLog(c.site);
                }}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={dotStyle(c, isSuggested)}
                />
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-[var(--ink)]">
                  {name}
                </span>
                {/*
                  The suggestion is the longest-rested site by construction, so
                  on that one row the two readings would say the same thing and
                  the word is the more useful of them.
                */}
                <span
                  className={`shrink-0 text-[11.5px] ${
                    isSuggested ? "text-[var(--mint-ink)]" : "text-[var(--faint)]"
                  }`}
                >
                  {isSuggested
                    ? t("now_site_suggested")
                    : c.lastUsedAt == null
                      ? t("site_never_used")
                      : relativeTime(c.lastUsedAt, nowMs)}
                </span>
              </button>
            );
          })}
          <button
            role="menuitem"
            className="w-full border-t border-[var(--line)] px-3 py-2.5 text-left text-[13px] text-[var(--muted)] hover:bg-[var(--sunken)]"
            onClick={() => {
              onOpenChange(false);
              onAllSites();
            }}
          >
            {t("now_site_all")}
          </button>
        </div>
      )}
    </div>
  );
}
