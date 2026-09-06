"use client";
import { useLang } from "@/lib/i18n";

import { useEffect, useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { Button, TONE_BG, TONE_FG } from "./ui";
import {
  DISMISS_KEY,
  installRoute,
  readEnvironment,
  shouldOffer,
  type InstallRoute,
} from "@/lib/pwa";

/** The event Chromium fires, which is not in the DOM typings. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Offers to install the app to the home screen.
 *
 * Two entirely different mechanisms behind one banner. On Chromium the browser
 * hands us an event and we can trigger the real install dialog. On iOS there is
 * no such API and never has been, so the only honest thing is to show where the
 * button is, and only in Safari, because Chrome and Firefox on iOS cannot add to
 * the home screen at all.
 *
 * Deliberately not shown immediately. A banner that appears before the app has
 * rendered is an advert; one that appears after a few seconds of use is an offer.
 */
export function InstallPrompt() {
  const { t } = useLang();
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [route, setRoute] = useState<InstallRoute>("unsupported");
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      // Suppress Chrome's own mini-infobar so there are not two offers.
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setVisible(false);
      setRoute("installed");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    const decide = () => {
      const next = installRoute(readEnvironment(promptEvent !== null));
      setRoute(next);

      let dismissedAt: number | null = null;
      try {
        const raw = localStorage.getItem(DISMISS_KEY);
        dismissedAt = raw ? Number(raw) : null;
      } catch {
        // Private mode can refuse reads; treat as never dismissed.
      }

      setVisible(shouldOffer(next, Number.isFinite(dismissedAt) ? dismissedAt : null, Date.now()));
    };

    // Let the app paint first.
    const timer = setTimeout(decide, 3500);
    return () => clearTimeout(timer);
  }, [promptEvent]);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Nothing to do; it will simply offer again next time.
    }
  }

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    setPromptEvent(null);
    if (outcome === "dismissed") dismiss();
    else setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label={t("install_title")}
      className="fixed inset-x-3 z-40 rounded-[var(--r-card)] p-3.5 shadow-[var(--shadow-lg)] sm:left-auto sm:right-4 sm:w-96"
      style={{
        // Clear of the mobile tab bar and the gesture area beneath it.
        bottom: "calc(var(--safe-bottom) + 5.5rem)",
        background: "var(--card)",
        border: "1px solid var(--line)",
      }}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
          style={{ background: TONE_BG.mint, color: TONE_FG.mint }}
        >
          <Download size={17} strokeWidth={2.3} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-[var(--ink)]">{t("install_title")}</p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--muted)]">
            {route === "ios-other-browser"
              ? "Adding to the home screen only works from Safari on iPhone and iPad. Open this page in Safari and the option appears in the Share menu."
              : "Add it to your home screen and it opens full screen and works offline. Installing changes nothing about where your data is kept."}
          </p>

          {route === "prompt" && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Button variant="primary" onClick={install} className="py-2 text-[13px]">
                Install
              </Button>
              <Button variant="ghost" onClick={dismiss} className="py-2 text-[13px]">
                Not now
              </Button>
            </div>
          )}

          {route === "ios-safari" && (
            <>
              {expanded ? (
                <ol className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed text-[var(--ink)]">
                  <li>
                    <span className="font-bold">1.</span> Tap{" "}
                    <Share size={13} strokeWidth={2.2} className="inline align-[-2px]" /> Share, at
                    the bottom of Safari
                  </li>
                  <li>
                    <span className="font-bold">2.</span> Scroll down and tap{" "}
                    <SquarePlus size={13} strokeWidth={2.2} className="inline align-[-2px]" />{" "}
                    <span className="font-semibold">{t("install_add_to_home")}</span>
                  </li>
                  <li>
                    <span className="font-bold">3.</span> Tap <span className="font-semibold">Add</span>
                  </li>
                </ol>
              ) : null}

              <div className="mt-2.5 flex flex-wrap gap-2">
                {!expanded && (
                  <Button variant="primary" onClick={() => setExpanded(true)} className="py-2 text-[13px]">
                    Show me how
                  </Button>
                )}
                <Button variant="ghost" onClick={dismiss} className="py-2 text-[13px]">
                  {expanded ? "Got it" : "Not now"}
                </Button>
              </div>
            </>
          )}

          {route === "ios-other-browser" && (
            <div className="mt-2.5">
              <Button variant="ghost" onClick={dismiss} className="py-2 text-[13px]">
                Got it
              </Button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label={t("install_dismiss")}
          className="press -mr-1 -mt-1 shrink-0 p-1 text-[var(--faint)] hover:text-[var(--ink)]"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
