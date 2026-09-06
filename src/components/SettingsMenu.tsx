"use client";

/**
 * Settings, as a menu rather than a link.
 *
 * The header was wider than a phone screen, and the theme toggle was the least
 * urgent thing in it. Rather than delete a control, the Settings link becomes
 * the place the small ones live: it is already the header item that means
 * "everything about how this behaves", so a theme belongs under it more
 * naturally than beside it.
 *
 * The page itself is still one tap away and is the first thing in the menu, so
 * nothing that used to be reachable in one tap now takes three.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings as SettingsIcon, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";
import { ThemeToggle } from "./ThemeToggle";

export function SettingsMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const active = pathname.startsWith("/settings");

  // The same dismissal the profile menu uses. Two menus that close differently
  // would be two menus that feel like different apps.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Settings"
        className={cn(
          "press flex h-10 items-center gap-2 rounded-[var(--r-pill)] px-3 text-[14px] font-medium transition-colors",
          active
            ? "bg-[var(--mint-soft)] text-[var(--mint-ink)]"
            : "text-[var(--muted)] hover:bg-[var(--card)] hover:text-[var(--ink)]")}
      >
        <SettingsIcon size={18} strokeWidth={2.1} />
        <span className="hidden lg:inline">Settings</span>
      </button>

      {/*
        Full width under the header on a phone, anchored to the button above
        that. Copied deliberately from the profile menu rather than invented:
        the same constraint applies, which is that a fixed panel anchored to a
        button this far right hangs off the left of a narrow screen.
      */}
      {open && (
        <div
          role="menu"
          className="animate-pop fixed inset-x-3 top-[calc(var(--safe-top)+var(--header-h)+0.5rem)] z-50 overflow-hidden rounded-[var(--r-card)] bg-[var(--card)] p-1.5 shadow-[var(--shadow-lg)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-56"
        >
          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="press flex w-full items-center gap-2.5 rounded-[var(--r-inner)] px-2.5 py-2 text-left hover:bg-[var(--sunken)]"
          >
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[var(--r-pill)] bg-[var(--sunken)] text-[var(--muted)]">
              <SlidersHorizontal size={16} />
            </span>
            <span className="text-[14px] font-medium text-[var(--ink)]">All settings</span>
          </Link>

          <div className="my-1.5 h-px bg-[var(--line)]" />

          <ThemeToggle menu />
        </div>
      )}
    </div>
  );
}
