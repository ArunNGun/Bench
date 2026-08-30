"use client";

/**
 * Mounts the sync engine for the life of the app, on the web only.
 *
 * Lives in the layout rather than on the settings page, because a sync that
 * only ran while you were looking at the settings page would be a worse promise
 * than the button it replaced. Renders nothing.
 *
 * Everything effectful about syncing is assembled here: the store on one side,
 * the transport on the other, and the engine, which knows about neither, in
 * between. That separation is what lets the engine's timing be tested without a
 * browser and the decision be tested without either.
 */

import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { createSyncEngine, type SyncPorts } from "@/lib/sync/engine";
import { fetchBlob, isNative, pushData, cryptoAvailable } from "@/lib/sync/client";
import { open } from "@/lib/sync/crypto";
import { useSyncState } from "@/lib/sync/state";
import { recallKey } from "@/lib/sync/vault";
import type { AppData, Settings } from "@/lib/types";

/**
 * Whether anything a person would miss has changed.
 *
 * Compared key by key rather than by object identity so that `settings.sync`,
 * which the engine itself writes on every successful run, cannot be mistaken
 * for the person editing something. Without this the engine would push, notice
 * the settings change its own push had caused, and push again, forever.
 *
 * Shallow is enough and errs the safe way: a nested edit that keeps the same
 * object identity would be missed, which cannot happen here because every
 * setter in the store replaces the object it touches. A false positive costs
 * one wasted round trip, a false negative would cost data.
 */
function meaningfulSettingsChange(a: Settings, b: Settings) {
  if (a === b) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Settings>;
  for (const key of keys) {
    if (key === "sync") continue;
    if (a[key] !== b[key]) return true;
  }
  return false;
}

/** Nothing on this device worth sending anywhere. */
function isEmptyData(s: AppData) {
  return (
    s.protocols.length === 0 &&
    s.logs.length === 0 &&
    s.vials.length === 0 &&
    s.measurements.length === 0 &&
    s.labs.length === 0 &&
    s.checkIns.length === 0
  );
}

export function SyncRunner() {
  const url = useStore((s) => s.settings.sync?.url);
  const key = useSyncState((s) => s.key);
  const setKey = useSyncState((s) => s.setKey);

  /*
   * Bring back the key a previous visit stored, once, at startup. Without this
   * every reload would leave the engine keyless and silently idle, which is the
   * failure the vault exists to prevent.
   */
  useEffect(() => {
    if (isNative() || !cryptoAvailable() || key) return;
    let cancelled = false;
    void recallKey().then((found) => {
      if (!cancelled && found) setKey(found);
    });
    return () => {
      cancelled = true;
    };
  }, [key, setKey]);

  useEffect(() => {
    if (isNative() || !url || !key) return;

    // Held here rather than in the store: it describes this session's progress,
    // not the person's data, and it must not be something a pull can overwrite.
    let dirty = false;

    const ports: SyncPorts = {
      fetchRemote: () => fetchBlob(url),

      async push(ifMatch) {
        const at = Date.now();
        await pushData(url, useStore.getState().exportData(), key, at, ifMatch);
        return at;
      },

      async applyRemote(blob) {
        const data = await open<AppData>(blob.envelope, key);
        useStore.getState().importData(data);
        return blob.updatedAt;
      },

      isDirty: () => dirty,
      clearDirty: () => {
        dirty = false;
      },
      isEmpty: () => isEmptyData(useStore.getState()),

      getRemoteSeenAt: () => useStore.getState().settings.sync?.remoteSeenAt ?? null,
      setRemoteSeenAt: (at) => {
        const sync = useStore.getState().settings.sync;
        if (!sync) return;
        useStore.getState().updateSettings({
          sync: { ...sync, remoteSeenAt: at ?? undefined },
        });
      },

      onStatus: (status) => useSyncState.getState().setStatus(status),
      now: () => Date.now(),
    };

    const engine = createSyncEngine(ports);
    useSyncState.getState().setEngine(engine);
    engine.start();

    const unsubscribe = useStore.subscribe((s, prev) => {
      if (!s.hydrated) return;
      const changed =
        s.protocols !== prev.protocols ||
        s.logs !== prev.logs ||
        s.vials !== prev.vials ||
        s.measurements !== prev.measurements ||
        s.labs !== prev.labs ||
        s.checkIns !== prev.checkIns ||
        s.profiles !== prev.profiles ||
        s.customPeptides !== prev.customPeptides ||
        s.activeProfileId !== prev.activeProfileId ||
        meaningfulSettingsChange(s.settings, prev.settings);

      if (!changed) return;
      dirty = true;
      engine.request("change");
    });

    /*
     * Coming back to the tab is the moment another device's changes are most
     * likely to be waiting, and the moment a phone that was asleep can reach
     * the network again. Going away is the last chance to send what is pending
     * before the tab is frozen or discarded.
     */
    const onVisibility = () => {
      if (document.visibilityState === "visible") engine.request("now");
      else void engine.flush();
    };
    const onOnline = () => engine.request("now");

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("pagehide", () => void engine.flush());

    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      engine.stop();
      useSyncState.getState().setEngine(null);
    };
  }, [url, key]);

  return null;
}
