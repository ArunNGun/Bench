/**
 * Saving a copy through the browser.
 *
 * Shared between the Settings export button and the backup reminder, so both
 * produce an identically named, identically shaped file, a reminder that saved
 * something subtly different from the thing Import expects would be worse than no
 * reminder.
 */

import type { AppData } from "../types";

export function exportFileName(atMs: number = Date.now()): string {
  return `bench-export-${new Date(atMs).toISOString().slice(0, 10)}.json`;
}

/** Trigger a download of the app's own export format. */
export function downloadJson(data: AppData, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  // Revoking immediately can cancel the download in some browsers, so give the
  // click a moment to be picked up first.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
