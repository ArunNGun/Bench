"use client";

/**
 * Save a copy, from wherever you happen to be.
 *
 * Export used to live in one place: leave what you were doing, open Settings,
 * scroll past defaults and profiles to the Your data card, and only then save.
 * Four steps to protect yourself against the one failure this app cannot
 * recover from, which is a browser whose data has been cleared.
 *
 * This is the same export, reachable in one tap. It calls exactly what the
 * Settings button calls, so a file saved from here and a file saved from there
 * are the same file, with the same name. A shortcut that produced something
 * subtly different from what Import expects would be worse than no shortcut.
 *
 * One tap, one file, no dialog. The JSON is the copy that restores everything;
 * the CSV in Settings is the dose history for a spreadsheet or a clinician, and
 * offering the choice here would put a decision in the way of the thing that
 * was already too slow.
 *
 * Called Backup rather than Save deliberately. The app saves continuously to
 * IndexedDB, and a Save button would imply that it does not, which is both
 * untrue and quietly alarming.
 */

import { useState } from "react";
import { Check, Download } from "lucide-react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";
import { downloadJson, exportFileName } from "@/lib/backup/download";
import { backupDirty } from "@/lib/calc/document";

export function BackupButton({ className }: { className?: string }) {
  const exportData = useStore((s) => s.exportData);
  const updateSettings = useStore((s) => s.updateSettings);
  const hydrated = useStore((s) => s.hydrated);
  const settings = useStore((s) => s.settings);

  /**
   * Whether anything has happened that no file holds yet.
   *
   * A rim rather than a filled button, and only a rim: this is a reminder, not
   * an error, and a header control that shouts every time a dose is logged
   * would be ignored within a week.
   */
  const dirty = backupDirty(settings.dataChangedAt, settings.lastBackupAt);

  /*
   * A download gives no feedback of its own on most platforms: no dialog, no
   * toast, and on a phone the file lands somewhere out of sight. Without a
   * visible acknowledgement the honest reading of a tap that appears to do
   * nothing is that it did nothing, and the second tap produces a second file.
   */
  const [saved, setSaved] = useState(false);

  function save() {
    downloadJson(exportData(), exportFileName());
    /*
     * Recording the save was missing entirely, so backing up from here left
     * Settings reading "Never" and the reminder still firing. The header button
     * and the Settings one now record the same thing, as they already produced
     * the same file.
     *
     * Stamped on the click, and that is a claim the app cannot fully stand
     * behind: on the web a download is a request, and the browser may cancel it
     * or put the file somewhere nobody looks. There is no event that says
     * otherwise, so the alternative is a rim that never clears.
     */
    updateSettings({ lastBackupAt: Date.now() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={save}
      // Before hydration the store is empty, and exporting emptiness over a
      // real backup is the one way this button could destroy something.
      disabled={!hydrated}
      aria-label={
        saved ? "Backup saved" : dirty ? "Save a backup, there are unsaved changes" : "Save a backup"
      }
      title={
        dirty
          ? "Something has changed since your last backup"
          : "Save a copy of everything to a file"
      }
      className={cn(
        "press flex h-10 items-center gap-2 rounded-[var(--r-pill)] px-3 text-[14px] font-medium transition-colors",
        saved
          ? "bg-[var(--leaf-soft)] text-[var(--leaf-ink)]"
          : "text-[var(--muted)] hover:bg-[var(--card)] hover:text-[var(--ink)]",
        // A ring rather than a border, so nothing shifts by a pixel when it
        // appears and disappears.
        dirty && !saved && "ring-1 ring-[var(--rose)]",
        !hydrated && "opacity-40",
        className)}
    >
      {saved ? <Check size={18} strokeWidth={2.4} /> : <Download size={18} strokeWidth={2.1} />}
      <span className="hidden lg:inline">{saved ? "Saved" : "Backup"}</span>
    </button>
  );
}
