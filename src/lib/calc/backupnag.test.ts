import { describe, expect, it } from "vitest";
import {
  BACKUP_FRESH_DAYS,
  backupNag,
  MIN_HISTORY_DAYS,
  MIN_RECORDS,
  nagMessage,
  SNOOZE_DAYS,
  type NagInput,
} from "./backupnag";

const NOW = Date.UTC(2026, 6, 31, 12);
const DAY = 86_400_000;
const ago = (days: number) => NOW - days * DAY;

const input = (over: Partial<NagInput> = {}): NagInput => ({
  manualBackupOnly: true,
  recordCount: 30,
  oldestRecordAt: ago(60),
  lastBackupAt: null,
  dismissedAt: null,
  nowMs: NOW, ...over,
});

describe("when it stays quiet", () => {
  it("says nothing on Android, where backups happen on their own", () => {
    expect(backupNag(input({ manualBackupOnly: false })).show).toBe(false);
  });

  it("says nothing before there is much to lose", () => {
    expect(backupNag(input({ recordCount: MIN_RECORDS - 1 })).show).toBe(false);
    expect(backupNag(input({ recordCount: 0 })).show).toBe(false);
  });

  it("says nothing to someone who only started this week", () => {
    // Plenty of records, but all from one sitting, not yet a history worth
    // interrupting anyone about.
    expect(backupNag(input({ oldestRecordAt: ago(MIN_HISTORY_DAYS - 1) })).show).toBe(false);
  });

  it("says nothing with no records at all", () => {
    expect(backupNag(input({ recordCount: 0, oldestRecordAt: null })).show).toBe(false);
  });

  it("says nothing after a recent export", () => {
    expect(backupNag(input({ lastBackupAt: ago(1) })).show).toBe(false);
    expect(backupNag(input({ lastBackupAt: ago(BACKUP_FRESH_DAYS - 1) })).show).toBe(false);
  });

  it("stays quiet for three weeks after a dismissal", () => {
    expect(backupNag(input({ dismissedAt: ago(1) })).show).toBe(false);
    expect(backupNag(input({ dismissedAt: ago(SNOOZE_DAYS - 1) })).show).toBe(false);
  });
});

describe("when it speaks up", () => {
  it("fires for real history that has never been exported", () => {
    const v = backupNag(input());
    expect(v.show).toBe(true);
    expect(v.reason).toBe("never");
    expect(v.daysSinceBackup).toBeNull();
  });

  it("fires again once an old export has gone stale", () => {
    const v = backupNag(input({ lastBackupAt: ago(90) }));
    expect(v.show).toBe(true);
    expect(v.reason).toBe("stale");
    expect(v.daysSinceBackup).toBe(90);
  });

  it("comes back after the snooze runs out", () => {
    expect(backupNag(input({ dismissedAt: ago(SNOOZE_DAYS + 1) })).show).toBe(true);
  });

  it("fires exactly at the thresholds, not one day late", () => {
    expect(backupNag(input({ recordCount: MIN_RECORDS })).show).toBe(true);
    expect(backupNag(input({ oldestRecordAt: ago(MIN_HISTORY_DAYS) })).show).toBe(true);
    expect(backupNag(input({ lastBackupAt: ago(BACKUP_FRESH_DAYS) })).show).toBe(true);
  });
});

describe("clocks that have moved", () => {
  /**
   * Every one of these would, with naive subtraction, produce a negative gap that
   * compares as "recent" and silences the reminder permanently, on exactly the
   * data it exists to protect.
   */
  it("is not silenced by a dismissal timestamped in the future", () => {
    expect(backupNag(input({ dismissedAt: NOW + 400 * DAY })).show).toBe(true);
  });

  it("is not silenced by a backup timestamped in the future", () => {
    // An untrustworthy stamp is not evidence a backup happened, so it counts as
    // never, reporting it as "stale, -400 days ago" would be worse.
    const v = backupNag(input({ lastBackupAt: NOW + 400 * DAY }));
    expect(v.show).toBe(true);
    expect(v.reason).toBe("never");
  });

  it("does not treat records dated in the future as a long history", () => {
    expect(backupNag(input({ oldestRecordAt: NOW + 10 * DAY })).show).toBe(false);
  });
});

describe("nagMessage", () => {
  it("says there is no copy at all when there never was one", () => {
    const v = backupNag(input({ recordCount: 42 }));
    expect(nagMessage(v, 42)).toMatch(/42 records and no copy/);
    expect(nagMessage(v, 42)).toMatch(/clearing your browsing data/i);
  });

  it("names how long it has been when an export has gone stale", () => {
    const v = backupNag(input({ lastBackupAt: ago(90) }));
    expect(nagMessage(v, 42)).toMatch(/90 days ago/);
  });

  it("says nothing when there is nothing to say", () => {
    expect(nagMessage({ show: false, reason: null, daysSinceBackup: null }, 10)).toBe("");
  });
});
