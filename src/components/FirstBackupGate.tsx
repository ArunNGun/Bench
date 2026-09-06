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

export function FirstBackupGate() {
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
            One thing before you start
          </h2>
        </div>

        <div className="space-y-3 text-[13.5px] leading-relaxed text-[var(--muted)]">
          <p>
            Your password is the key to your data. Everything is encrypted in this browser before it
            goes to the server, so the server holds something it cannot read. That includes whoever
            runs it: they can see that your account exists and how large it is, and nothing else.
          </p>
          <p className="text-[var(--ink)]">
            Nobody can reset your password. Not the person running the server, not anyone. If you
            lose it, the copy up there stays locked forever.
          </p>
          <p>
            So keep your own copy. This saves a file with everything in it, which you can bring back
            later from Settings. It is the same button that sits in the header, so you can do this
            again whenever you like, and it is worth doing.
          </p>
        </div>

        <Button variant="primary" className="w-full justify-center" onClick={saveAndContinue}>
          <Download size={15} /> Save a backup and continue
        </Button>

        <p className="text-[12px] text-[var(--faint)]">
          A new account has almost nothing in it yet, so the file will be small. That is expected.
          The point is that you have one, and know where it went.
        </p>
      </div>
    </div>
  );
}
