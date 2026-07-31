"use client";

import { useEffect } from "react";

type Theme = "dark" | "light";

/**
 * The head script always writes the attribute, and defaults to light, so the
 * fallback below only matters if it failed to run at all.
 */
function resolveTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

/**
 * Keeps the Android status and gesture bars readable against the app's theme.
 *
 * Drawing edge to edge means the system's clock and icons are painted straight
 * onto the app's own background, so their colour has to follow the theme the app
 * is showing rather than the device's setting. The two can disagree, the in-app
 * toggle overrides the system one, and when they do you get a pale grey clock
 * on a white header, which is unreadable.
 *
 * Watching the data-theme attribute instead of taking a prop keeps this correct
 * whoever changed the theme: the toggle, the inline script that runs before
 * first paint, or the system preference changing underneath us.
 */
export function SystemBarsSync() {
  useEffect(() => {
    const native = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor;
    if (!native?.isNativePlatform?.()) return;

    let cancelled = false;

    async function apply() {
      const theme = resolveTheme();
      try {
        const { SystemBars, SystemBarsStyle } = await import("@capacitor/core");
        if (cancelled) return;
        // The names describe the background, not the icons: Light means dark
        // icons for a light background.
        await SystemBars.setStyle({
          style: theme === "light" ? SystemBarsStyle.Light : SystemBarsStyle.Dark,
        });
      } catch {
        // Older shell or no plugin, leave the bars as the system drew them.
      }
    }

    apply();

    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    const media = window.matchMedia("(prefers-color-scheme: light)");
    media.addEventListener("change", apply);

    return () => {
      cancelled = true;
      observer.disconnect();
      media.removeEventListener("change", apply);
    };
  }, []);

  return null;
}
