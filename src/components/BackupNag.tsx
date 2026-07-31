"use client";

import { useMemo, useState } from "react";
import { Download, ShieldAlert, X } from "lucide-react";
import { Button, TONE_BG, TONE_FG } from "./ui";
import { useProfileData, useStore } from "@/lib/store";
import { backupNag, nagMessage } from "@/lib/calc/backupnag";
import { backupsAvailable } from "@/lib/backup/store";
import { exportFileName, downloadJson } from "@/lib/backup/download";

/**
 * Reminds web users to export, because nothing else will.
 *
 * On Android the app writes rotating backups to a folder by itself and this never
 * appears. In a browser there is no folder to write to, so a manual export is the
 * only copy that will ever exist, and "clear browsing data" is a single tap away
 * from destroying a year of records with nothing to restore from.
 *
 * Exporting from here records the fact, so the reminder goes quiet for a month
 * and a half rather than reappearing next session.
 */
export function BackupNag() {
  const { logs, measurements, labs } = useProfileData();
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const exportData = useStore((s) => s.exportData);
  const hydrated = useStore((s) => s.hydrated);

  const [dismissedNow, setDismissedNow] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const { verdict, recordCount } = useMemo(() => {
    const records = [...logs, ...measurements, ...labs];
    const oldest = records.reduce<number | null>(
      (min, r) => (min == null || r.at < min ? r.at : min),
      null);

    return {
      recordCount: records.length,
      verdict: backupNag({
        // The Filesystem plugin only exists in the native build; its absence is
        // exactly the condition where a manual export is the only safety net.
        manualBackupOnly: !backupsAvailable(),
        recordCount: records.length,
        oldestRecordAt: oldest,
        lastBackupAt: settings.lastBackupAt ?? null,
        dismissedAt: settings.backupNagDismissedAt ?? null,
        nowMs: Date.now(),
      }),
    };
  }, [logs, measurements, labs, settings.lastBackupAt, settings.backupNagDismissedAt]);

  // Waiting for hydration matters: before it lands the store holds no records,
  // and the nag would decide on an empty history.
  if (!hydrated || dismissedNow || !verdict.show) return null;

  function save() {
    downloadJson(exportData(), exportFileName());
    updateSettings({ lastBackupAt: Date.now() });
    setJustSaved(true);
  }

  if (justSaved) {
    return (
      <div
        className="flex items-start gap-2.5 rounded-[var(--r-inner)] px-3.5 py-3 text-[13px] leading-relaxed"
        style={{ background: TONE_BG.leaf, color: TONE_FG.leaf }}
      >
        <Download size={16} strokeWidth={2.4} className="mt-0.5 shrink-0" />
        <span>
          Saved. Keep that file somewhere that is not this device, another phone, a drive, an email
          to yourself. Settings → Import brings it back.
        </span>
      </div>
    );
  }

  return (
    <div
      className="rounded-[var(--r-inner)] px-3.5 py-3"
      style={{ background: TONE_BG.tangerine, color: TONE_FG.tangerine }}
    >
      <div className="flex items-start gap-2.5">
        <ShieldAlert size={16} strokeWidth={2.4} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-bold">Nothing is backed up</p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed opacity-90">
            {nagMessage(verdict, recordCount)}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button variant="primary" onClick={save} className="py-2 text-[13px]">
              <Download size={14} /> Export a copy
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setDismissedNow(true);
                updateSettings({ backupNagDismissedAt: Date.now() });
              }}
              className="py-2 text-[13px]"
            >
              Later
            </Button>
          </div>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => {
            setDismissedNow(true);
            updateSettings({ backupNagDismissedAt: Date.now() });
          }}
          className="press -mr-1 -mt-1 shrink-0 p-1 opacity-70 hover:opacity-100"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
