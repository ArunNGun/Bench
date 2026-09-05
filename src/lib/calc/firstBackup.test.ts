import { describe, expect, it } from "vitest";
import { needsFirstBackup, type FirstBackupInputs } from "./firstBackup";

const joining = (over: Partial<FirstBackupInputs> = {}): FirstBackupInputs => ({
  required: true,
  signedIn: true,
  hydrated: true,
  settled: true,
  lastBackupAt: undefined,
  ...over,
});

describe("stopping somebody once, at the start", () => {
  it("asks a new account for a file", () => {
    expect(needsFirstBackup(joining())).toBe(true);
  });

  it("never asks in an ordinary build", () => {
    // The whole thing exists for a server run for several people. On a copy
    // with no server there is nobody to warn about and no password to lose.
    expect(needsFirstBackup(joining({ required: false }))).toBe(false);
  });

  it("does not ask somebody who has saved a file before", () => {
    // They have the habit and they have the file. A second field to ask them
    // again would be a worse answer than reading the one that already says so.
    expect(needsFirstBackup(joining({ lastBackupAt: 1 }))).toBe(false);
    expect(needsFirstBackup(joining({ lastBackupAt: 0 }))).toBe(false);
  });

  it("waits for the store, so an empty one is not mistaken for a new account", () => {
    expect(needsFirstBackup(joining({ hydrated: false }))).toBe(false);
  });

  it("waits for the first sync, so it does not flash on a second device", () => {
    // Between signing in and the server's copy arriving, a device that has
    // years of history looks exactly like one that has none.
    expect(needsFirstBackup(joining({ settled: false }))).toBe(false);
  });

  it("says nothing to somebody who is not signed in", () => {
    expect(needsFirstBackup(joining({ signedIn: false }))).toBe(false);
  });
});
