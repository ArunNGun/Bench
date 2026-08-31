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

/** Held in the store, not part of the document, and never written down. */
const TRANSIENT_KEYS = new Set(["hydrated"]);

/**
 * The document as the store holds it: everything that is data, and nothing else.
 *
 * Written as an exclusion, and that is the whole point of it. Saving used to
 * name the fields it wanted, which works perfectly until the app that reads the
 * file is older than the app that wrote it. Then the older build does not know
 * the newer field, drops it on the way in, names only what it knows on the way
 * out, and the data is gone from the file. Silently, and on the first write.
 *
 * That is not a hypothetical. Someone tracking bottles of water opened a build
 * from before bottles existed, once, and the bottles were deleted from their
 * device. The rule this project publishes is that data survives every update.
 * Nothing said which direction, and the direction that was never handled is the
 * one that loses records.
 *
 * So a build now writes back every field it read, including the ones it cannot
 * interpret. Carrying a field it does not understand costs a few bytes. Not
 * carrying it costs someone their inventory.
 */
export function documentFrom<T extends object>(state: T): AppData {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(state)) {
    if (typeof value === "function") continue;
    if (TRANSIENT_KEYS.has(key)) continue;
    out[key] = value;
  }

  return out as unknown as AppData;
}

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
  "diluents",
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
