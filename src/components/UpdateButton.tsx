"use client";

import { useState } from "react";
import { RefreshCw, CheckCircle2 } from "lucide-react";
import { Card, SectionLabel, Button } from "./ui";
import {
  applyUpdate,
  fetchServerBuildId,
  RUNNING_BUILD_ID,
  updateAvailable,
} from "@/lib/update";
import { useLang } from "@/lib/i18n";

type State = "idle" | "checking" | "up-to-date" | "available" | "applying";

/**
 * Manual "check for update" card for the Settings page.
 *
 * The passive UpdatePrompt auto-fires on load and visibility change. This is
 * for people who want to explicitly pull the latest version right now — useful
 * when the passive check hasn't fired yet or was dismissed.
 */
export function UpdateButton() {
  const { t } = useLang();
  const [state, setState] = useState<State>("idle");

  const isNative =
    typeof window !== "undefined"
      ? (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
          ?.isNativePlatform?.() === true
      : false;

  // In the APK the build id means nothing — updates come through the store.
  if (isNative) return null;

  async function check() {
    setState("checking");
    const serverBuildId = await fetchServerBuildId();
    if (updateAvailable({ serverBuildId, runningBuildId: RUNNING_BUILD_ID })) {
      setState("available");
    } else {
      setState("up-to-date");
    }
  }

  function apply() {
    setState("applying");
    applyUpdate();
  }

  const buildLabel =
    RUNNING_BUILD_ID === "dev" ? t("update_dev_build") : RUNNING_BUILD_ID.slice(0, 8);

  return (
    <Card className="space-y-3 p-4">
      <SectionLabel>{t("update_app_version")}</SectionLabel>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-[13px] text-[var(--ink)]">
            {t("update_build")}{" "}
            <span className="font-mono text-[12px] text-[var(--muted)]">{buildLabel}</span>
          </p>
          <p className="text-[12px] text-[var(--muted)]">
            {state === "up-to-date" && (
              <span className="flex items-center gap-1 text-[var(--leaf)]">
                <CheckCircle2 size={12} strokeWidth={2.5} />
                {t("update_latest")}
              </span>
            )}
            {state === "available" && t("update_available")}
            {state === "checking" && t("update_checking")}
            {state === "applying" && t("update_applying")}
            {state === "idle" && t("update_idle")}
          </p>
        </div>

        <div className="flex gap-2">
          {(state === "idle" || state === "up-to-date") && (
            <Button variant="ghost" className="gap-1.5 py-2 text-[13px]" onClick={check}>
              <RefreshCw size={13} strokeWidth={2.3} />
              {t("update_check")}
            </Button>
          )}

          {state === "checking" && (
            <Button variant="ghost" className="gap-1.5 py-2 text-[13px]" disabled>
              <RefreshCw size={13} strokeWidth={2.3} className="animate-spin" />
              {t("update_checking")}
            </Button>
          )}

          {state === "available" && (
            <>
              <Button variant="primary" className="py-2 text-[13px]" onClick={apply}>
                {t("update_now")}
              </Button>
              <Button
                variant="ghost"
                className="py-2 text-[13px]"
                onClick={() => setState("idle")}
              >
                {t("update_later")}
              </Button>
            </>
          )}

          {state === "applying" && (
            <Button variant="ghost" className="gap-1.5 py-2 text-[13px]" disabled>
              <RefreshCw size={13} strokeWidth={2.3} className="animate-spin" />
              {t("update_reloading")}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
