import { describe, expect, it } from "vitest";
import { backupDirty, documentChanged, UNWATCHED_KEYS, WATCHED_KEYS } from "./document";
import { EMPTY_DATA, type AppData } from "../types";

const doc = (over: Partial<AppData> = {}): AppData => ({ ...EMPTY_DATA, ...over });

describe("every field of the document is accounted for", () => {
  /**
   * The guard, and the reason this list is allowed to be written by hand.
   *
   * A field added to the store and to the export but not to this list would
   * save locally and never mark anything unsaved: the Backup button would sit
   * quiet over work that no file holds. Walking the real document means the
   * next field cannot be forgotten quietly.
   */
  it("classifies every key as watched or deliberately not", () => {
    const classified = new Set<string>([...WATCHED_KEYS, ...Object.keys(UNWATCHED_KEYS)]);
    const missing = Object.keys(EMPTY_DATA).filter((k) => !classified.has(k));

    expect(
      missing,
      `add ${missing.join(", ")} to WATCHED_KEYS, or to UNWATCHED_KEYS with a reason`).toEqual([]);
  });

  it("does not claim to watch a field that no longer exists", () => {
    const real = new Set(Object.keys(EMPTY_DATA));
    const ghosts = [...WATCHED_KEYS, ...Object.keys(UNWATCHED_KEYS)].filter((k) => !real.has(k));
    expect(ghosts).toEqual([]);
  });
});

describe("documentChanged", () => {
  it("sees nothing in an unchanged document", () => {
    const a = doc();
    expect(documentChanged(a, a)).toBe(false);
  });

  it("notices records, plans and stock", () => {
    expect(documentChanged(doc({ logs: [] }), doc())).toBe(true);
    expect(documentChanged(doc({ protocols: [] }), doc())).toBe(true);
    expect(documentChanged(doc({ vials: [] }), doc())).toBe(true);
    expect(documentChanged(doc({ checkIns: [] }), doc())).toBe(true);
  });

  it("notices a compound you added and a profile switch", () => {
    expect(documentChanged(doc({ customPeptides: [] }), doc())).toBe(true);
    expect(documentChanged(doc({ activeProfileId: "other" }), doc())).toBe(true);
  });

  it("notices a setting a person chose", () => {
    const before = doc();
    expect(
      documentChanged(doc({ settings: { ...before.settings, currency: "EUR" } }), before)).toBe(true);
  });

  it("ignores its own stamp, which would otherwise write itself forever", () => {
    // The store writes dataChangedAt in response to a change. If that counted
    // as a change it would trigger another write, and another.
    const before = doc();
    const after = doc({ settings: { ...before.settings, dataChangedAt: 123 } });
    expect(documentChanged(after, before)).toBe(false);
  });

  it("does not treat saving a backup as an edit", () => {
    const before = doc();
    const after = doc({ settings: { ...before.settings, lastBackupAt: 456 } });
    expect(documentChanged(after, before)).toBe(false);
  });

  it("ignores the version stamp", () => {
    expect(documentChanged(doc({ version: 99 }), doc())).toBe(false);
  });
});

describe("backupDirty", () => {
  it("is quiet on a document nothing has happened to", () => {
    expect(backupDirty(null, null)).toBe(false);
    expect(backupDirty(undefined, undefined)).toBe(false);
  });

  it("is dirty when there is work and no backup at all", () => {
    // The person with the most to lose is the one who has never saved a copy.
    expect(backupDirty(1000, null)).toBe(true);
  });

  it("is dirty when the change came after the backup", () => {
    expect(backupDirty(2000, 1000)).toBe(true);
  });

  it("is clean when the backup came after the change", () => {
    expect(backupDirty(1000, 2000)).toBe(false);
  });

  it("treats the same instant as saved", () => {
    // Saving stamps after the change it is saving, and a strict comparison
    // would leave the rim on immediately after a successful backup.
    expect(backupDirty(1000, 1000)).toBe(false);
  });
});
