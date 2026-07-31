"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { backupDue } from "@/lib/backup/plan";
import { backupsAvailable } from "@/lib/backup/store";
import { runBackup } from "@/lib/backup/run";

/**
 * Takes a backup when one is due.
 *
 * Mounted in the app frame rather than on the settings screen, because a safety
 * net that only works while you are looking at it is not a safety net. Runs once
 * per app start: the data changes in bursts, and a backup an hour after the last
 * change is worth no more than one taken at the next launch.
 *
 * Silent by design. The result is reported in Settings, where it can be acted on;
 * interrupting the Now screen to announce a successful file write would be noise.
 */
export function AutoBackup() {
  const hydrated = useStore((s) => s.hydrated);
  const settings = useStore((s) => s.settings);
  const exportData = useStore((s) => s.exportData);
  const updateSettings = useStore((s) => s.updateSettings);

  // Without this a state change mid-run would start a second backup.
  const ranRef = useRef(false);

  useEffect(() => {
    // Waiting for hydration matters: before it completes the store still holds
    // EMPTY_DATA, and backing that up would overwrite the newest copy with nothing.
    if (!hydrated || ranRef.current) return;
    if (!settings.backupEnabled || !backupsAvailable()) return;
    if (!backupDue(settings.lastBackupAt, Date.now(), settings.backupIntervalHours)) return;

    ranRef.current = true;

    (async () => {
      const outcome = await runBackup(exportData(), Date.now(), settings.backupKeep);
      if (outcome.ok) updateSettings({ lastBackupAt: Date.now() });
    })();
  }, [hydrated, settings, exportData, updateSettings]);

  return null;
}
