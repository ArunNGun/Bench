"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "dark" | "light";

/** Canvas colour per theme, kept in step with globals.css. */
const CHROME: Record<Theme, string> = { light: "#f4f6fa", dark: "#0d1420" };

/**
 * Reads the theme the inline head script already applied, so the button never
 * disagrees with what is on screen.
 *
 * That script always writes the attribute and defaults a first-time visitor to
 * light, so the branch below is only reached if it failed to run at all.
 */
function currentTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

/**
 * Keeps the browser chrome the same colour as the page.
 *
 * Without this, choosing dark leaves a pale address bar on Android Chrome and a
 * pale status bar in an installed PWA, which reads as a rendering fault rather
 * than a theme.
 */
function syncChrome(theme: Theme) {
  // A media-scoped tag would keep answering to the system preference and win
  // over the plain one, so drop any that exist and manage a single unscoped tag.
  document.querySelectorAll('meta[name="theme-color"][media]').forEach((m) => m.remove());

  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = CHROME[theme];
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = currentTheme();
    setTheme(t);
    syncChrome(t);
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    syncChrome(next);
    try {
      localStorage.setItem("bench-theme", next);
    } catch {
      // Private browsing can refuse writes; the theme still applies this session.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className={
        className ??
        "flex h-9 w-9 items-center justify-center rounded text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
      }
    >
      {/*
        The server cannot know the theme, so hold the space until mounted rather
        than committing to an icon. Rendering a guess flashes the wrong one on
        every load, which is more noticeable than a blank for a single frame.
      */}
      {!mounted ? (
        <span className="block h-[17px] w-[17px]" />
      ) : theme === "light" ? (
        <Sun size={17} strokeWidth={1.75} />
      ) : (
        <Moon size={17} strokeWidth={1.75} />
      )}
    </button>
  );
}
