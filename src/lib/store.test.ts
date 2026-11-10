import { describe, expect, it } from "vitest";
import { useStore } from "./store";
import { decideSync } from "./sync/decide";
import { DEFAULT_SETTINGS } from "./types";

describe("resetAll", () => {
  /*
   * Reported as "they always come back": erase, confirm, and the next backup
   * held everything again. Resetting `sync` along with the other settings made
   * a synced device look like a fresh install, and a fresh install takes the
   * server's copy.
   */
  const synced = () => {
    useStore.getState().updateSettings({
      currency: "GBP",
      sync: { url: "https://bench.example", username: "tofs", remoteSeenAt: 1_700_000_000_000 },
    });
    useStore.getState().addLog({ peptideId: "bpc-157", at: 1_700_000_000_000, doseMcg: 250, route: "subcutaneous" });
  };

  it("empties the data", () => {
    synced();
    expect(useStore.getState().logs.length).toBeGreaterThan(0);
    useStore.getState().resetAll();
    expect(useStore.getState().logs).toEqual([]);
    expect(useStore.getState().protocols).toEqual([]);
  });

  it("keeps the device's place on the sync server and resets every other setting", () => {
    synced();
    useStore.getState().resetAll();
    const { settings } = useStore.getState();
    expect(settings.sync?.remoteSeenAt).toBe(1_700_000_000_000);
    expect(settings.currency).toBe(DEFAULT_SETTINGS.currency);
  });

  it("leaves a synced device sending the erase rather than taking the server's copy back", () => {
    synced();
    useStore.getState().resetAll();
    const seen = useStore.getState().settings.sync?.remoteSeenAt ?? null;
    const action = decideSync({
      remoteSeenAt: seen,
      remoteUpdatedAt: 1_700_000_000_000,
      dirty: true,
      localEmpty: true,
    });
    expect(action.kind).toBe("push");
  });

  it("adds no sync record to a device that never had one", () => {
    useStore.getState().updateSettings({ sync: undefined });
    useStore.getState().resetAll();
    expect(useStore.getState().settings.sync).toBeUndefined();
  });
});
