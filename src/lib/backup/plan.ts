/**
 * Naming and retention for automatic backups.
 *
 * Kept pure and separate from the filesystem because the risky half of a backup
 * feature is the deleting, not the writing. Every decision about which file to
 * remove is made here, where it can be tested exhaustively.
 *
 * The one rule that matters: a file this module cannot parse as one of its own
 * backups is never proposed for deletion. The backup folder is a real folder in
 * the user's Documents that they can put things in, and pruning must not touch
 * anything it did not create.
 */

export const BACKUP_DIR = "Bench";

const PREFIX = "bench-backup-";
const SUFFIX = ".json";

/**
 * Local time, seconds included, so the folder sorts chronologically in a file
 * manager and two backups in the same minute cannot collide.
 */
const NAME_RE = /^bench-backup-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})\.json$/;

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

export function backupFileName(atMs: number): string {
  const d = new Date(atMs);
  return (
    PREFIX +
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}` +
    SUFFIX
  );
}

/** The moment a backup name encodes, or null if this is not one of ours. */
export function parseBackupName(name: string): number | null {
  const m = NAME_RE.exec(name);
  if (!m) return null;

  const [, y, mo, d, h, mi, s] = m.map(Number) as unknown as number[];
  const ms = new Date(y, mo - 1, d, h, mi, s).getTime();
  if (!Number.isFinite(ms)) return null;

  // Reject anything that does not round-trip, "2026-02-31" parses in JavaScript
  // by rolling into March, and a name that lies about its date is not ours.
  return backupFileName(ms) === name ? ms : null;
}

export interface BackupFile {
  name: string;
  at: number;
  size?: number;
}

/** Our own backups from a directory listing, newest first. */
export function listBackups(names: { name: string; size?: number }[]): BackupFile[] {
  const out: BackupFile[] = [];
  for (const { name, size } of names) {
    const at = parseBackupName(name);
    if (at == null) continue;
    out.push({ name, at, size });
  }
  return out.sort((a, b) => b.at - a.at);
}

/**
 * Which files to delete to hold the folder at `keep` backups.
 *
 * Returns the oldest surplus, never more than that, and never a file that is not
 * a recognised backup. `keep` below 1 is treated as 1, a retention setting
 * should not be able to empty the folder.
 */
export function prunePlan(
  names: { name: string; size?: number }[],
  keep: number): string[] {
  const backups = listBackups(names);
  const limit = Math.max(1, Math.floor(keep));
  if (backups.length <= limit) return [];
  return backups.slice(limit).map((f) => f.name);
}

/**
 * Whether enough time has passed for another automatic backup.
 *
 * A missing or future `lastAtMs` counts as due: a clock that has moved backwards
 * should not be able to suppress backups indefinitely.
 */
export function backupDue(
  lastAtMs: number | undefined,
  nowMs: number,
  intervalHours: number): boolean {
  if (!(intervalHours > 0)) return false;
  if (lastAtMs == null) return true;
  if (lastAtMs > nowMs) return true;
  return nowMs - lastAtMs >= intervalHours * 3_600_000;
}
