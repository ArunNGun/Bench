"use client";

/**
 * The one thing somebody joining a shared server has to be told.
 *
 * Shown over the app rather than beside it, and it does not go away by being
 * ignored. That is unusual for this project, which otherwise refuses to
 * interrupt, and it is deliberate: the fact being conveyed stops being
 * actionable the moment they start recording things. A note in Settings would
 * be read, at best, months after the point at which it mattered.
 *
 * The way out is the file, not a checkbox. A checkbox measures whether somebody
 * is willing to click a checkbox. Saving the file proves the browser will
 * download, shows them where it lands, and leaves them holding one, which is
 * the whole of what is being asked for.
 *
 * It closes because `lastBackupAt` gets set, not because this component decides
 * it has done enough. That field is part of the synced document, so their other
 * devices know as well, and it is the same field the header Backup button
 * writes, so someone who happens to press that instead is not asked twice.
 */

import { Download, KeyRound } from "lucide-react";
import { Button } from "./ui";
import { useStore } from "@/lib/store";
import { downloadJson, exportFileName } from "@/lib/backup/download";
import { needsFirstBackup } from "@/lib/calc/firstBackup";
import { accountRequired } from "@/lib/sync/hosted";
import { useSyncState } from "@/lib/sync/state";
import { useLang } from "@/lib/i18n";

export function FirstBackupGate() {
  const { t } = useLang();
  const exportData = useStore((s) => s.exportData);
  const updateSettings = useStore((s) => s.updateSettings);
  const hydrated = useStore((s) => s.hydrated);
  const lastBackupAt = useStore((s) => s.settings.lastBackupAt);

  const signedIn = useSyncState((s) => s.key != null);
  const phase = useSyncState((s) => s.status.phase);

  /*
   * Anything except the first run still being in flight. A conflict or a
   * failure counts as settled: both mean the server has answered, and neither
   * is a reason to hold somebody in front of a blank app instead of telling
   * them the thing they need to know.
   */
  const settled = phase !== "syncing" && phase !== "off";

  if (!needsFirstBackup({
    required: accountRequired(),
    signedIn,
    hydrated,
    settled,
    lastBackupAt,
  })) {
    return null;
  }

  function saveAndContinue() {
    downloadJson(exportData(), exportFileName());
    updateSettings({ lastBackupAt: Date.now() });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-backup-title"
      className="fixed inset-0 z-50 grid place-items-center bg-[var(--canvas)]/95 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md space-y-4 rounded-[var(--r-card)] bg-[var(--card)] p-5 shadow-xl">
        <div className="flex items-center gap-2.5">
          <KeyRound size={18} className="text-[var(--rose)]" />
          <h2 id="first-backup-title" className="text-[17px] font-semibold text-[var(--ink)]">
            {t("backup_gate_title")}
          </h2>
        </div>

        <div className="space-y-3 text-[13.5px] leading-relaxed text-[var(--muted)]">
          <p>{t("backup_gate_encrypted")}</p>
          <p className="text-[var(--ink)]">{t("backup_gate_no_reset")}</p>
          <p>{t("backup_gate_keep_copy")}</p>
        </div>

        <Button variant="primary" className="w-full justify-center" onClick={saveAndContinue}>
          <Download size={15} /> {t("backup_gate_save")}
        </Button>

        <p className="text-[12px] text-[var(--faint)]">
          {t("backup_gate_small")}
        </p>
      </div>
    </div>
  );
}
