import { describe, expect, it } from "vitest";
import {
  backupDue,
  backupFileName,
  listBackups,
  parseBackupName,
  prunePlan,
} from "./plan";

const named = (...names: string[]) => names.map((name) => ({ name }));

describe("backupFileName and parseBackupName", () => {
  it("round-trips a moment to the second", () => {
    const at = new Date(2026, 6, 30, 2, 45, 12).getTime();
    const name = backupFileName(at);
    expect(name).toBe("bench-backup-2026-07-30-024512.json");
    expect(parseBackupName(name)).toBe(at);
  });

  it("pads every field so names sort chronologically as text", () => {
    const early = backupFileName(new Date(2026, 0, 5, 9, 8, 7).getTime());
    const later = backupFileName(new Date(2026, 10, 25, 21, 8, 7).getTime());
    expect(early).toBe("bench-backup-2026-01-05-090807.json");
    expect([later, early].sort()).toEqual([early, later]);
  });

  it("refuses anything that is not one of ours", () => {
    for (const name of [
      "notes.txt",
      "bench-backup.json",
      "bench-backup-2026-07-30.json",
      "bench-backup-2026-07-30-0245.json",
      "bench-export-2026-07-30-024512.json",
      "bench-backup-2026-07-30-024512.json.bak",
      "",
    ]) {
      expect(parseBackupName(name), name).toBeNull();
    }
  });

  it("rejects a name whose date does not exist", () => {
    // JavaScript would roll this into 3 March; a name that lies is not ours.
    expect(parseBackupName("bench-backup-2026-02-31-000000.json")).toBeNull();
    expect(parseBackupName("bench-backup-2026-13-01-000000.json")).toBeNull();
  });
});

describe("listBackups", () => {
  it("returns only our files, newest first", () => {
    const files = listBackups(
      named(
        "bench-backup-2026-07-28-100000.json",
        "shopping-list.json",
        "bench-backup-2026-07-30-100000.json",
        "bench-backup-2026-07-29-100000.json"));
    expect(files.map((f) => f.name)).toEqual([
      "bench-backup-2026-07-30-100000.json",
      "bench-backup-2026-07-29-100000.json",
      "bench-backup-2026-07-28-100000.json",
    ]);
  });

  it("copes with an empty folder", () => {
    expect(listBackups([])).toEqual([]);
  });

  it("carries the size through", () => {
    const files = listBackups([{ name: "bench-backup-2026-07-30-100000.json", size: 4096 }]);
    expect(files[0].size).toBe(4096);
  });
});

describe("prunePlan", () => {
  const three = named(
    "bench-backup-2026-07-28-100000.json",
    "bench-backup-2026-07-29-100000.json",
    "bench-backup-2026-07-30-100000.json");

  it("deletes nothing while under the limit", () => {
    expect(prunePlan(three, 5)).toEqual([]);
    expect(prunePlan(three, 3)).toEqual([]);
  });

  it("deletes the oldest surplus only", () => {
    expect(prunePlan(three, 2)).toEqual(["bench-backup-2026-07-28-100000.json"]);
    expect(prunePlan(three, 1)).toEqual([
      "bench-backup-2026-07-29-100000.json",
      "bench-backup-2026-07-28-100000.json",
    ]);
  });

  it("never proposes deleting a file it does not recognise", () => {
    const mixed = [
      ...three, ...named("my-notes.json", "bench-export-2026-01-01.json", "photo.jpg"),
    ];
    const doomed = prunePlan(mixed, 1);
    expect(doomed).not.toContain("my-notes.json");
    expect(doomed).not.toContain("bench-export-2026-01-01.json");
    expect(doomed).not.toContain("photo.jpg");
    expect(doomed).toHaveLength(2);
  });

  it("never empties the folder, whatever keep says", () => {
    for (const keep of [0, -1, -100, 0.4]) {
      expect(prunePlan(three, keep), `keep=${keep}`).toHaveLength(2);
    }
  });

  it("truncates a fractional keep rather than rounding up", () => {
    expect(prunePlan(three, 2.9)).toHaveLength(1);
  });

  it("is idempotent, pruning a pruned folder does nothing", () => {
    const doomed = new Set(prunePlan(three, 2));
    const after = three.filter((f) => !doomed.has(f.name));
    expect(prunePlan(after, 2)).toEqual([]);
  });
});

describe("backupDue", () => {
  const NOW = Date.UTC(2026, 6, 30, 8);
  const HOUR = 3_600_000;

  it("is due when nothing has ever been backed up", () => {
    expect(backupDue(undefined, NOW, 24)).toBe(true);
  });

  it("is not due before the interval has elapsed", () => {
    expect(backupDue(NOW - 23 * HOUR, NOW, 24)).toBe(false);
  });

  it("is due once the interval has elapsed", () => {
    expect(backupDue(NOW - 24 * HOUR, NOW, 24)).toBe(true);
    expect(backupDue(NOW - 100 * HOUR, NOW, 24)).toBe(true);
  });

  it("is due when the last backup claims to be in the future", () => {
    // A clock that jumped backwards must not silently stop backups forever.
    expect(backupDue(NOW + 500 * HOUR, NOW, 24)).toBe(true);
  });

  it("is never due when the interval is zero or negative", () => {
    expect(backupDue(undefined, NOW, 0)).toBe(false);
    expect(backupDue(NOW - 1000 * HOUR, NOW, -5)).toBe(false);
  });
});
