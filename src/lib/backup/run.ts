/**
 * Taking one backup: write, then prune.
 *
 * In that order deliberately. Pruning first would, on a device that is out of
 * space or has revoked the folder, delete an old backup and then fail to write
 * the new one, leaving fewer copies than before the attempt. Writing first means
 * a failure costs nothing.
 */

import type { AppData } from "../types";
import { backupFileName, prunePlan } from "./plan";
import { deleteBackups, readBackupList, writeBackup } from "./store";

export interface BackupOutcome {
  ok: boolean;
  /** Filename written, when it succeeded. */
  name?: string;
  /** How many older backups were removed afterwards. */
  pruned: number;
  /** Why it failed, for the UI. */
  reason?: string;
}

export async function runBackup(
  data: AppData,
  nowMs: number,
  keep: number): Promise<BackupOutcome> {
  const name = backupFileName(nowMs);

  const written = await writeBackup(name, JSON.stringify(data, null, 2));
  if (!written) {
    return {
      ok: false,
      pruned: 0,
      reason: "Could not write to the Documents folder.",
    };
  }

  // Re-read rather than trusting a cached list, so a file removed by hand does
  // not lead to deleting one that is still wanted.
  const existing = await readBackupList();
  const pruned = await deleteBackups(prunePlan(existing, keep));

  return { ok: true, name: written, pruned };
}
