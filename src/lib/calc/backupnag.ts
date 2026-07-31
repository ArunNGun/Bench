/**
 * Deciding when to remind someone to export.
 *
 * This exists because of one specific, entirely preventable way to lose a year of
 * records: the data lives only in this browser's IndexedDB, and "clear browsing
 * data" takes it with no copy anywhere. On Android the app writes its own rotating
 * backups to a folder, so the problem does not arise. On the web there is no
 * filesystem to write to, and a manual export is the only safety net there is.
 *
 * The hard part is not the reminder. It is not becoming noise. A prompt that
 * appears on day one, or comes back every session, gets dismissed reflexively and
 * then ignored when it finally matters. So: nothing until there is genuinely
 * something to lose, nothing if a copy was taken recently, and a long silence
 * after a dismissal.
 */

export interface NagInput {
  /** False on Android, where rotating backups happen without asking. */
  manualBackupOnly: boolean;
  /** Records worth losing: doses, weights and lab results together. */
  recordCount: number;
  /** When the earliest record was made, or null with no records. */
  oldestRecordAt: number | null;
  /** When a full export was last taken, from settings. */
  lastBackupAt: number | null;
  /** When the reminder was last dismissed. */
  dismissedAt: number | null;
  nowMs: number;
}

const DAY = 86_400_000;

/** Below this there is little to lose, and a reminder is just noise. */
export const MIN_RECORDS = 5;

/** And it has to represent real history, not one busy afternoon. */
export const MIN_HISTORY_DAYS = 7;

/** A copy this recent counts as safe. */
export const BACKUP_FRESH_DAYS = 45;

/** How long a dismissal buys. */
export const SNOOZE_DAYS = 21;

export type NagReason = "never" | "stale";

export interface NagVerdict {
  show: boolean;
  reason: NagReason | null;
  /** Days since the last export, when there has been one. */
  daysSinceBackup: number | null;
}

const QUIET: NagVerdict = { show: false, reason: null, daysSinceBackup: null };

/**
 * A stored timestamp can sit in the future: a clock that was wrong and later
 * corrected, or a backup restored from a device set ahead. What that should mean
 * depends entirely on which field it is, so there are two readings rather than
 * one clamp.
 *
 * Clamping everything to zero, the obvious first move, is wrong twice over. A
 * dismissal or a backup dated in the future would read as "no time has passed",
 * count as recent, and suppress the reminder permanently, on exactly the data
 * this module exists to protect.
 */

/** For evidence that something was done: a future date proves nothing, so ignore it. */
function elapsedIfTrustworthy(since: number | null, nowMs: number): number | null {
  if (since == null) return null;
  const gap = nowMs - since;
  return gap < 0 ? null : gap;
}

/** For measuring how long a history is, where a future date means no history yet. */
function elapsedClamped(since: number | null, nowMs: number): number | null {
  if (since == null) return null;
  return Math.max(0, nowMs - since);
}

export function backupNag(input: NagInput): NagVerdict {
  const { manualBackupOnly, recordCount, oldestRecordAt, lastBackupAt, dismissedAt, nowMs } = input;

  // Android writes its own backups; nothing to nag about.
  if (!manualBackupOnly) return QUIET;

  if (recordCount < MIN_RECORDS) return QUIET;

  const historyMs = elapsedClamped(oldestRecordAt, nowMs);
  if (historyMs == null || historyMs < MIN_HISTORY_DAYS * DAY) return QUIET;

  const sinceDismiss = elapsedIfTrustworthy(dismissedAt, nowMs);
  if (sinceDismiss != null && sinceDismiss < SNOOZE_DAYS * DAY) return QUIET;

  const sinceBackup = elapsedIfTrustworthy(lastBackupAt, nowMs);

  if (sinceBackup == null) {
    return { show: true, reason: "never", daysSinceBackup: null };
  }

  const days = Math.floor(sinceBackup / DAY);
  if (sinceBackup >= BACKUP_FRESH_DAYS * DAY) {
    return { show: true, reason: "stale", daysSinceBackup: days };
  }

  return { show: false, reason: null, daysSinceBackup: days };
}

/** What to say, given why it fired. */
export function nagMessage(verdict: NagVerdict, recordCount: number): string {
  if (verdict.reason === "never") {
    return `You have ${recordCount} records and no copy of them anywhere else. They live only in this browser, clearing your browsing data would take the lot, with nothing to restore from.`;
  }
  if (verdict.reason === "stale") {
    return `Your last export was ${verdict.daysSinceBackup} days ago. Everything since then exists only in this browser.`;
  }
  return "";
}
