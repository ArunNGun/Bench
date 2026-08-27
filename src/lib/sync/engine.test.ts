import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSyncEngine, QUIET_MS, RETRY_MIN_MS, type SyncPorts, type SyncStatus } from "./engine";
import { SyncConflict, SyncOffline, type StoredBlob } from "./client";

/**
 * A server and a device, both fake, both inspectable.
 *
 * The engine's interesting behaviour is all timing and ordering, which is
 * unobservable against a real server and trivial against this one.
 */
function harness(options: { empty?: boolean } = {}) {
  const blob = (updatedAt: number): StoredBlob => ({
    envelope: { v: 1, iv: "", ct: "" } as unknown as StoredBlob["envelope"],
    updatedAt,
  });

  const state = {
    remote: null as StoredBlob | null,
    remoteSeenAt: null as number | null,
    dirty: false,
    empty: options.empty ?? false,
    clock: 1_000_000,
    pushes: [] as (number | null)[],
    pulls: [] as number[],
    statuses: [] as SyncStatus[],
    /** Set to make the next call fail with this. */
    failNext: null as Error | null,
  };

  const ports: SyncPorts = {
    async fetchRemote() {
      if (state.failNext) {
        const e = state.failNext;
        state.failNext = null;
        throw e;
      }
      return state.remote;
    },
    async push(ifMatch) {
      if (state.failNext) {
        const e = state.failNext;
        state.failNext = null;
        throw e;
      }
      const current = state.remote?.updatedAt ?? null;
      if (current !== ifMatch) throw new SyncConflict(state.remote);
      state.pushes.push(ifMatch);
      const at = ++state.clock;
      state.remote = blob(at);
      return at;
    },
    async applyRemote(b) {
      state.pulls.push(b.updatedAt);
      state.empty = false;
      return b.updatedAt;
    },
    isDirty: () => state.dirty,
    clearDirty: () => {
      state.dirty = false;
    },
    isEmpty: () => state.empty,
    getRemoteSeenAt: () => state.remoteSeenAt,
    setRemoteSeenAt: (at) => {
      state.remoteSeenAt = at;
    },
    onStatus: (s) => state.statuses.push(s),
    now: () => state.clock,
  };

  return { state, ports, blob, engine: createSyncEngine(ports) };
}

/** Let every already-resolved promise settle without advancing fake time. */
const drain = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

/** Advance fake timers and let the async work they released finish. */
async function tick(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
  await drain();
}

describe("sync engine", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sends nothing until the changes stop coming", async () => {
    const h = harness();
    h.engine.start();
    await tick(0);
    h.state.pushes.length = 0;

    // Three edits in quick succession, as logging a dose actually produces.
    h.state.dirty = true;
    h.engine.request("change");
    await tick(500);
    h.engine.request("change");
    await tick(500);
    h.engine.request("change");

    await tick(QUIET_MS - 1);
    expect(h.state.pushes).toHaveLength(0);

    await tick(2);
    expect(h.state.pushes).toHaveLength(1);
  });

  it("keeps a change that arrives mid-flight, and sends it after", async () => {
    const h = harness();
    let release: (() => void) | null = null;
    const original = h.ports.fetchRemote;
    // Blocks the first run only. Blocking every one would deadlock the run that
    // is the point of the test.
    h.ports.fetchRemote = async () => {
      h.ports.fetchRemote = original;
      await new Promise<void>((r) => (release = r));
      return original.call(h.ports);
    };

    h.state.dirty = true;
    h.engine.start();
    await tick(0);

    // The run is now blocked inside fetchRemote, carrying the old snapshot.
    h.state.dirty = true;
    h.engine.request("change");

    release!();
    await tick(0);

    // The device must still be dirty: the run in flight was not carrying it.
    expect(h.state.dirty).toBe(true);
    expect(h.state.pushes).toHaveLength(1);

    await tick(QUIET_MS);
    expect(h.state.pushes).toHaveLength(2);
    expect(h.state.dirty).toBe(false);
  });

  it("does not push back what it has just pulled", async () => {
    const h = harness();
    h.state.remote = h.blob(42);
    h.state.remoteSeenAt = 7; // the server moved while this device was away

    h.engine.start();
    await tick(0);

    expect(h.state.pulls).toEqual([42]);
    expect(h.state.pushes).toHaveLength(0);

    // A pull rewrites the whole store, which must not read as a local edit.
    await tick(QUIET_MS * 2);
    expect(h.state.pushes).toHaveLength(0);
  });

  it("waits and retries when the server cannot be reached", async () => {
    const h = harness();
    h.state.dirty = true;
    h.state.failNext = new SyncOffline("no route");

    h.engine.start();
    await tick(0);
    expect(h.engine.getStatus().phase).toBe("offline");
    expect(h.state.pushes).toHaveLength(0);

    await tick(RETRY_MIN_MS);
    expect(h.state.pushes).toHaveLength(1);
    expect(h.engine.getStatus().phase).toBe("idle");
  });

  it("backs off further on each failure and recovers on success", async () => {
    const h = harness();
    h.state.dirty = true;

    h.state.failNext = new SyncOffline("no route");
    h.engine.start();
    await tick(0);

    h.state.failNext = new SyncOffline("still no route");
    await tick(RETRY_MIN_MS);
    expect(h.state.pushes).toHaveLength(0);

    // The second wait is longer, so the first interval alone is not enough.
    await tick(RETRY_MIN_MS);
    expect(h.state.pushes).toHaveLength(0);
    await tick(RETRY_MIN_MS);
    expect(h.state.pushes).toHaveLength(1);
  });

  it("stops on a conflict and sends nothing more until it is resolved", async () => {
    const h = harness();
    h.state.remote = h.blob(500);
    h.state.remoteSeenAt = 100;
    h.state.dirty = true;

    h.engine.start();
    await tick(0);

    expect(h.engine.getStatus().phase).toBe("conflict");
    expect(h.state.pushes).toHaveLength(0);
    expect(h.state.pulls).toHaveLength(0);

    // Further edits must not sneak past the question being asked.
    h.engine.request("change");
    await tick(QUIET_MS * 4);
    expect(h.state.pushes).toHaveLength(0);
    expect(h.engine.getStatus().phase).toBe("conflict");
  });

  it("keeps this device's copy when told to", async () => {
    const h = harness();
    h.state.remote = h.blob(500);
    h.state.remoteSeenAt = 100;
    h.state.dirty = true;

    h.engine.start();
    await tick(0);
    await h.engine.resolveConflict("keep-mine");
    await drain();

    expect(h.state.pushes).toEqual([500]);
    expect(h.state.pulls).toHaveLength(0);
    expect(h.engine.getStatus().phase).toBe("idle");
    expect(h.state.dirty).toBe(false);
  });

  it("takes the server's copy when told to", async () => {
    const h = harness();
    h.state.remote = h.blob(500);
    h.state.remoteSeenAt = 100;
    h.state.dirty = true;

    h.engine.start();
    await tick(0);
    await h.engine.resolveConflict("take-theirs");
    await drain();

    expect(h.state.pulls).toEqual([500]);
    expect(h.state.pushes).toHaveLength(0);
    expect(h.state.dirty).toBe(false);
    expect(h.engine.getStatus().phase).toBe("idle");
  });

  it("surfaces a refusal from the server as a conflict, not as a failure", async () => {
    // The race the version check exists for: the server moves between the read
    // and the write, so the decision looked safe and the write was not.
    const h = harness();
    h.state.remoteSeenAt = 100;
    h.state.remote = h.blob(100);
    h.state.dirty = true;

    const original = h.ports.push;
    h.ports.push = async (ifMatch) => {
      h.state.remote = h.blob(999); // another device got there first
      return original.call(h.ports, ifMatch);
    };

    h.engine.start();
    await tick(0);

    expect(h.engine.getStatus().phase).toBe("conflict");
    expect(h.engine.getStatus().conflict?.updatedAt).toBe(999);
  });

  it("sends nothing at all once stopped", async () => {
    const h = harness();
    h.engine.start();
    await tick(0);
    h.state.pushes.length = 0;

    h.engine.stop();
    h.state.dirty = true;
    h.engine.request("change");
    await tick(QUIET_MS * 4);

    expect(h.state.pushes).toHaveLength(0);
    expect(h.engine.getStatus().phase).toBe("off");
  });

  it("does not publish an empty device to an empty server", async () => {
    const h = harness({ empty: true });
    h.state.dirty = true;

    h.engine.start();
    await tick(QUIET_MS * 2);

    expect(h.state.pushes).toHaveLength(0);
    expect(h.state.remote).toBeNull();
  });

  it("flushes immediately when the tab is going away", async () => {
    const h = harness();
    h.engine.start();
    await tick(0);
    h.state.pushes.length = 0;

    h.state.dirty = true;
    h.engine.request("change");
    // No time passes; the quiet period has not elapsed.
    await h.engine.flush();
    await drain();

    expect(h.state.pushes).toHaveLength(1);
  });
});
