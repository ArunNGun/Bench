/**
 * Whether the document has changed, and whether it has changed since it was
 * last written to a file.
 *
 * Pure, and separate from any screen, because two different features ask the
 * same question and asking it twice in two places is how the answers drift.
 * The Backup button asks it to know whether there is anything to save; the
 * sync engine asks it to know whether there is anything to send.
 *
 * The list of parts is by hand rather than a deep comparison, because object
 * identity is what the store already gives us and comparing whole documents on
 * every keystroke is not free. What makes that safe is the test alongside this:
 * every key of `AppData` has to appear in one of the two lists below, so adding
 * a field and forgetting it fails loudly instead of silently doing nothing.
 */

import type { AppData, Settings } from "../types";

/**
 * Parts a person would notice the loss of. Compared by identity, which is
 * sound because every setter in the store replaces the array or object it
 * touches rather than mutating it in place.
 */
export const WATCHED_KEYS = [
  "profiles",
  "activeProfileId",
  "protocols",
  "logs",
  "vials",
  "measurements",
  "labs",
  "checkIns",
  "customPeptides",
  "halfLifeOverrides",
  "orders",
] as const satisfies readonly (keyof AppData)[];

/** Deliberately not watched, with the reason written down rather than implied. */
export const UNWATCHED_KEYS = {
  version: "stamped by the migration, never edited by a person",
  settings: "watched through meaningfulSettingsChange, which skips bookkeeping",
} as const satisfies Partial<Record<keyof AppData, string>>;

/**
 * Settings the app writes about itself, which must never read as a person
 * making a change.
 *
 * `dataChangedAt` is the dangerous one: it is written in response to a change,
 * so counting it as a change would have it write itself forever. `lastBackupAt`
 * is excluded for a plainer reason, that saving a copy is not an edit, and
 * counting it would leave the button dirty the instant it was cleaned.
 */
const BOOKKEEPING = new Set(["sync", "dataChangedAt", "lastBackupAt", "backupNagDismissedAt"]);

export function meaningfulSettingsChange(a: Settings, b: Settings) {
  if (a === b) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (BOOKKEEPING.has(key)) continue;
    if (a[key as keyof Settings] !== b[key as keyof Settings]) return true;
  }
  return false;
}

/** Whether this store transition changed anything that ends up in the file. */
export function documentChanged(next: AppData, prev: AppData) {
  for (const key of WATCHED_KEYS) {
    if (next[key] !== prev[key]) return true;
  }
  return meaningfulSettingsChange(next.settings, prev.settings);
}

/**
 * Whether there is work that no file holds yet.
 *
 * Never backed up but something has changed counts as unsaved, which is the
 * case that matters most: the person with the most to lose is the one who has
 * never saved a copy at all. A fresh install that has changed nothing is quiet,
 * because nagging about an empty document teaches people to ignore the signal.
 */
export function backupDirty(dataChangedAt?: number | null, lastBackupAt?: number | null) {
  if (dataChangedAt == null) return false;
  return lastBackupAt == null || dataChangedAt > lastBackupAt;
}
