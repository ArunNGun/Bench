"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { Button, TONE_BG, TONE_FG } from "./ui";
import {
  applyUpdate,
  fetchServerBuildId,
  RUNNING_BUILD_ID,
  shouldRecheck,
  updateAvailable,
} from "@/lib/update";

/**
 * Offers the new version when one has been deployed.
 *
 * The app serves itself from cache, so a deploy does not reach anyone on its
 * own. That is what makes it reliably offline, and why this has to exist. One
 * request for /version.json on start, compared against the build id compiled
 * into this bundle.
 *
 * Not shown in the Android build: that ships its code inside the APK and updates
 * through the Play Store or a new install, so a web build id means nothing there.
 */
export function UpdatePrompt() {
  const [available, setAvailable] = useState(false);
  const [applying, setApplying] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const lastCheckedAt = useRef<number | null>(null);

  const check = useCallback(async (signal?: AbortSignal) => {
    lastCheckedAt.current = Date.now();
    const serverBuildId = await fetchServerBuildId(signal);
    if (signal?.aborted) return;
    if (updateAvailable({ serverBuildId, runningBuildId: RUNNING_BUILD_ID })) setAvailable(true);
  }, []);

  useEffect(() => {
    const isNative =
      (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
        ?.isNativePlatform?.() === true;
    if (isNative) return;

    const controller = new AbortController();
    check(controller.signal);

    // An installed PWA is rarely started fresh. It is left open for weeks, so a
    // check on mount alone would never fire again. Coming back to it is the
    // nearest thing to a start.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!shouldRecheck(lastCheckedAt.current, Date.now())) return;
      check(controller.signal);
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => {
      controller.abort();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check]);

  if (!available || dismissed) return null;

  return (
    /*
      Centred rather than tucked along the bottom edge.
      
      It sat above the mobile tab bar, which meant a fixed offset guessed at the
      height of whatever else was down there. On a short screen, or with the
      install banner also showing, it ended up too low to read comfortably and
      sometimes partly under the bar it was trying to clear.

      The middle of the screen has no such arithmetic in it. This is one of the
      few things in the app allowed to interrupt, since ignoring it means
      running an old build, so being unmissable is the point rather than a cost.
      The backdrop is deliberately not opaque: the app stays visible behind it,
      because this is a suggestion and not a wall.
    */
    <div
      role="status"
      className="fixed inset-0 z-40 grid place-items-center bg-[var(--canvas)]/70 p-4 backdrop-blur-[2px]"
    >
    <div
      className="w-full max-w-sm rounded-[var(--r-card)] p-3.5 shadow-[var(--shadow-lg)]"
      style={{
        background: TONE_BG.sky,
        color: TONE_FG.sky,
        border: "1px solid var(--sky)",
      }}
    >
      <div className="flex items-start gap-3">
        <RefreshCw
          size={17}
          strokeWidth={2.3}
          className={`mt-0.5 shrink-0 ${applying ? "animate-spin" : ""}`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold">A new version is ready</p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed opacity-90">
            {applying
              ? "Fetching it now…"
              : "Your data is untouched by this. It stays on your device either way."}
          </p>

          {!applying && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Button
                variant="primary"
                className="py-2 text-[13px]"
                onClick={() => {
                  setApplying(true);
                  applyUpdate();
                }}
              >
                Update now
              </Button>
              <Button variant="ghost" className="py-2 text-[13px]" onClick={() => setDismissed(true)}>
                Later
              </Button>
            </div>
          )}
        </div>

        {!applying && (
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setDismissed(true)}
            className="press -mr-1 -mt-1 shrink-0 p-1 opacity-70 hover:opacity-100"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
    </div>
  );
}
