/**
 * The thing that makes syncing happen without being asked.
 *
 * Deliberately free of React, of fetch and of the store. Everything it touches
 * arrives through `SyncPorts`, which is what lets the awkward parts, debounce,
 * coalescing, backoff, conflict, be tested at whatever speed the test likes
 * rather than in real seconds against a real server.
 *
 * The shape of the problem:
 *
 * - A change should be sent soon, not instantly. Logging a dose writes to the
 *   store several times in a row, and each one is not worth a round trip.
 * - Only one run at a time. Two overlapping runs would both read the same
 *   version from the server and the second would be refused, or worse, both
 *   would think they had succeeded.
 * - A change made during a run must not be lost. The run that is already in
 *   flight is carrying an older snapshot, so anything that arrives while it is
 *   working has to leave the device dirty and schedule another.
 * - Failure is normal. A phone in a lift is offline for a minute, and that is
 *   not an error worth showing; it is a reason to wait longer and try again.
 * - A conflict is not failure and must not be retried. It stops the loop and
 *   waits for a person, because the alternative is destroying an edit.
 */

import { decideSync, describeSync, type SyncAction } from "./decide";
import { SyncConflict, SyncOffline, SyncError, type StoredBlob } from "./client";

export type SyncPhase =
  | "off"
  | "idle"
  | "syncing"
  | "offline"
  | "conflict"
  | "error";

export interface SyncStatus {
  phase: SyncPhase;
  /** Plain words for the status line. */
  message: string;
  /** When the last run finished agreeing with the server. */
  lastSyncedAt: number | null;
  /** Set only in the conflict phase: what the server holds. */
  conflict: StoredBlob | null;
}

/** Everything the engine is not allowed to do for itself. */
export interface SyncPorts {
  /** The sealed copy the server holds, or null when it holds nothing. */
  fetchRemote(): Promise<StoredBlob | null>;
  /** Encrypt the current store and write it, refusing if the server moved. */
  push(ifMatch: number | null): Promise<number>;
  /** Decrypt a fetched copy into the store. Returns its version. */
  applyRemote(blob: StoredBlob): Promise<number>;

  /** Whether this device has unsent changes. */
  isDirty(): boolean;
  /** Called once a run has sent everything it was carrying. */
  clearDirty(): void;
  /** Whether this device holds anything worth sending. */
  isEmpty(): boolean;

  /** The server version this device last agreed with. */
  getRemoteSeenAt(): number | null;
  setRemoteSeenAt(at: number | null): void;

  onStatus(status: SyncStatus): void;
  now(): number;
}

/** How long to wait after the last change before sending. */
export const QUIET_MS = 2500;
/** First wait after an unreachable server, doubling to the ceiling. */
export const RETRY_MIN_MS = 5_000;
export const RETRY_MAX_MS = 5 * 60_000;

export type ConflictChoice = "keep-mine" | "take-theirs";

export function createSyncEngine(ports: SyncPorts) {
  let running = false;
  /** A change arrived and no run has carried it yet. */
  let pending = false;
  /** A change arrived while a run was in flight. */
  let dirtiedDuringRun = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let retryMs = RETRY_MIN_MS;
  let stopped = true;
  /*
   * Mirrors the conflict phase as a plain flag.
   *
   * Reading `status.phase` here instead would compile once and then stop: the
   * guard at the top of `run` narrows the type for the whole function body,
   * including the parts that run after `setStatus` has widened it again from
   * inside another closure. A flag says what is meant and cannot go stale in
   * the same way.
   */
  let conflicted = false;

  let status: SyncStatus = {
    phase: "off",
    message: "Off",
    lastSyncedAt: null,
    conflict: null,
  };

  function setStatus(patch: Partial<SyncStatus>) {
    status = { ...status, ...patch };
    conflicted = status.phase === "conflict";
    ports.onStatus(status);
  }

  function clearTimer() {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function schedule(delayMs: number) {
    if (stopped) return;
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, delayMs);
  }

  /**
   * Ask for a run.
   *
   * `change` restarts the quiet period, so a burst of edits produces one run
   * after the burst rather than one per edit. Everything else, opening the app,
   * coming back to the tab, pressing the button, wants to go now.
   */
  function request(kind: "change" | "now" = "now") {
    if (stopped) return;
    // A conflict is waiting for a person. Nothing may be sent past it, or the
    // decision they are about to make would be made for them.
    if (conflicted) return;

    pending = true;
    if (running) {
      dirtiedDuringRun = true;
      return;
    }
    schedule(kind === "change" ? QUIET_MS : 0);
  }

  async function run(): Promise<void> {
    if (stopped || running) return;
    if (conflicted) return;

    running = true;
    pending = false;
    dirtiedDuringRun = false;
    setStatus({ phase: "syncing", message: "Syncing..." });

    try {
      const remote = await ports.fetchRemote();
      const action: SyncAction = decideSync({
        remoteSeenAt: ports.getRemoteSeenAt(),
        remoteUpdatedAt: remote?.updatedAt ?? null,
        dirty: ports.isDirty(),
        localEmpty: ports.isEmpty(),
      });

      if (action.kind === "ask") {
        setStatus({
          phase: "conflict",
          message: describeSync(action),
          conflict: remote,
        });
        return;
      }

      if (action.kind === "pull" && remote) {
        const at = await ports.applyRemote(remote);
        ports.setRemoteSeenAt(at);
        /*
         * A pull writes the whole store, which looks exactly like the person
         * editing everything at once and would ask to be pushed straight back.
         * The device is clean by definition here: it is now holding precisely
         * what the server holds.
         */
        ports.clearDirty();
        dirtiedDuringRun = false;
        settle(at, describeSync(action));
        return;
      }

      if (action.kind === "push") {
        const at = await ports.push(remote?.updatedAt ?? null);
        ports.setRemoteSeenAt(at);
        // Only what this run was carrying is now sent. Anything that arrived
        // while it was in flight is still unsent and keeps the device dirty.
        if (!dirtiedDuringRun) ports.clearDirty();
        settle(at, describeSync(action));
        return;
      }

      settle(remote?.updatedAt ?? null, describeSync(action));
    } catch (err) {
      if (err instanceof SyncConflict) {
        setStatus({
          phase: "conflict",
          message: err.message,
          conflict: err.current,
        });
        return;
      }

      if (err instanceof SyncOffline) {
        // Not worth calling a failure. Wait longer each time, up to a ceiling,
        // and say something that describes the situation rather than blaming
        // the person for it.
        setStatus({ phase: "offline", message: "Waiting for the server." });
        schedule(retryMs);
        retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
        return;
      }

      setStatus({
        phase: "error",
        message: err instanceof SyncError ? err.message : "Sync failed. See the console.",
      });
      if (!(err instanceof SyncError)) console.error(err);
      schedule(RETRY_MAX_MS);
    } finally {
      running = false;
      // A change that landed mid-run, or a request refused while one was in
      // flight, gets its own run rather than waiting for the next edit.
      if ((dirtiedDuringRun || pending) && !conflicted) schedule(QUIET_MS);
    }
  }

  function settle(remoteAt: number | null, message: string) {
    retryMs = RETRY_MIN_MS;
    setStatus({
      phase: "idle",
      message,
      lastSyncedAt: remoteAt != null ? ports.now() : status.lastSyncedAt,
      conflict: null,
    });
  }

  /**
   * The way out of a conflict, and the only one.
   *
   * Keeping this device's copy adopts the server's version as the one being
   * replaced, so the very next push is accepted rather than refused again.
   * Taking the server's copy overwrites this device, which is why it is a
   * button somebody presses and never something decided in the background.
   */
  async function resolveConflict(choice: ConflictChoice): Promise<void> {
    const blob = status.conflict;
    setStatus({ phase: "syncing", message: "Syncing...", conflict: null });

    try {
      if (choice === "take-theirs") {
        if (!blob) throw new SyncError("There is no server copy to take.");
        const at = await ports.applyRemote(blob);
        ports.setRemoteSeenAt(at);
        ports.clearDirty();
        settle(at, "Took the copy from the server.");
        return;
      }

      ports.setRemoteSeenAt(blob?.updatedAt ?? null);
      const at = await ports.push(blob?.updatedAt ?? null);
      ports.setRemoteSeenAt(at);
      ports.clearDirty();
      settle(at, "Kept this device's copy.");
    } catch (err) {
      setStatus({
        phase: "error",
        message: err instanceof SyncError ? err.message : "Could not resolve. See the console.",
      });
      if (!(err instanceof SyncError)) console.error(err);
    }
  }

  return {
    start() {
      stopped = false;
      retryMs = RETRY_MIN_MS;
      setStatus({ phase: "idle", message: "Ready.", conflict: null });
      request("now");
    },
    stop() {
      stopped = true;
      clearTimer();
      setStatus({ phase: "off", message: "Off", conflict: null });
    },
    request,
    resolveConflict,
    /** For the tab going away: run now, without the quiet period. */
    flush: () => run(),
    getStatus: () => status,
  };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;
