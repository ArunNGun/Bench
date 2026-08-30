import { describe, expect, it } from "vitest";
import { decideSync, describeSync, type SyncInput } from "./decide";

/** A device in step with a server, which each test then disturbs. */
const inStep: SyncInput = {
  remoteSeenAt: 1000,
  remoteUpdatedAt: 1000,
  dirty: false,
  localEmpty: false,
};

describe("decideSync", () => {
  it("does nothing when neither side has moved", () => {
    expect(decideSync(inStep)).toEqual({ kind: "none", reason: "in-step" });
  });

  it("pushes when only this device has changed", () => {
    expect(decideSync({ ...inStep, dirty: true })).toEqual({
      kind: "push",
      reason: "local-changed",
    });
  });

  it("pulls when only the server has changed", () => {
    expect(decideSync({ ...inStep, remoteUpdatedAt: 2000 })).toEqual({
      kind: "pull",
      reason: "server-changed",
    });
  });

  it("asks when both sides have changed", () => {
    expect(decideSync({ ...inStep, remoteUpdatedAt: 2000, dirty: true })).toEqual({
      kind: "ask",
      reason: "both-changed",
    });
  });

  it("pushes to a server holding nothing", () => {
    expect(decideSync({ ...inStep, remoteSeenAt: null, remoteUpdatedAt: null })).toEqual({
      kind: "push",
      reason: "server-empty",
    });
  });

  it("refuses to publish an empty device to an empty server", () => {
    // The dangerous case: a fresh install would otherwise make emptiness the
    // authoritative copy, and the next device to connect would pull it.
    const s = decideSync({
      remoteSeenAt: null,
      remoteUpdatedAt: null,
      dirty: true,
      localEmpty: true,
    });
    expect(s).toEqual({ kind: "none", reason: "nothing-to-send" });
  });

  it("takes the server's copy onto a device holding nothing", () => {
    const s = decideSync({
      remoteSeenAt: null,
      remoteUpdatedAt: 2000,
      dirty: false,
      localEmpty: true,
    });
    expect(s).toEqual({ kind: "pull", reason: "local-empty" });
  });

  it("asks on first contact when both sides hold something", () => {
    const s = decideSync({ ...inStep, remoteSeenAt: null, remoteUpdatedAt: 2000 });
    expect(s).toEqual({ kind: "ask", reason: "first-contact" });
  });

  it("never decides on its own when the versions disagree and there is local work", () => {
    // The property that matters: with unsent changes and a server that moved,
    // there is no input that produces a silent write in either direction.
    for (const remoteUpdatedAt of [1, 999, 1001, 5000]) {
      const s = decideSync({ ...inStep, dirty: true, remoteUpdatedAt });
      if (remoteUpdatedAt === inStep.remoteSeenAt) continue;
      expect(s.kind).toBe("ask");
    }
  });

  it("treats an older server version as a disagreement, not as being behind", () => {
    // A server that went backwards, restored from a backup, say, is not
    // something to overwrite silently just because its number is smaller.
    expect(decideSync({ ...inStep, remoteUpdatedAt: 500, dirty: true }).kind).toBe("ask");
    expect(decideSync({ ...inStep, remoteUpdatedAt: 500 })).toEqual({
      kind: "pull",
      reason: "server-changed",
    });
  });

  it("has words for every action", () => {
    const inputs: SyncInput[] = [
      inStep,
      { ...inStep, dirty: true },
      { ...inStep, remoteUpdatedAt: 2000 },
      { ...inStep, remoteUpdatedAt: 2000, dirty: true },
      { ...inStep, remoteSeenAt: null, remoteUpdatedAt: null },
      { remoteSeenAt: null, remoteUpdatedAt: null, dirty: true, localEmpty: true },
      { remoteSeenAt: null, remoteUpdatedAt: 2000, dirty: false, localEmpty: true },
      { ...inStep, remoteSeenAt: null, remoteUpdatedAt: 2000 },
    ];
    for (const input of inputs) {
      expect(describeSync(decideSync(input))).toMatch(/\S/);
    }
  });
});
