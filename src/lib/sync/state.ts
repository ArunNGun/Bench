"use client";

/**
 * The bit of sync that both the runner and the settings card need to see.
 *
 * Small on purpose. The key is here rather than in a component because the
 * thing doing the syncing runs in the layout and the thing that asks for the
 * password is a card on a settings page, and passing a CryptoKey between them
 * through props would mean one of them owning the other.
 *
 * The key is never written to this store's persisted form, because this store
 * has none. It reaches disk only through `vault.ts`, deliberately and once.
 */

import { create } from "zustand";
import type { SessionInfo } from "./client";
import type { SyncEngine, SyncStatus } from "./engine";

interface SyncUiState {
  /** Present once the password has been turned into a key, or recalled. */
  key: CryptoKey | null;
  /**
   * Who the server says is asking, and whether they own it.
   *
   * Kept beside the key rather than worked out where it is needed, because two
   * components want it and because the answer belongs to the server. Nothing in
   * the app may decide `admin` for itself, and holding it in one place makes
   * that harder to get wrong by accident.
   */
  session: SessionInfo | null;
  status: SyncStatus;
  engine: SyncEngine | null;

  setKey: (key: CryptoKey | null) => void;
  setSession: (session: SessionInfo | null) => void;
  setStatus: (status: SyncStatus) => void;
  setEngine: (engine: SyncEngine | null) => void;
}

export const IDLE_STATUS: SyncStatus = {
  phase: "off",
  message: "Off",
  lastSyncedAt: null,
  conflict: null,
};

export const useSyncState = create<SyncUiState>()((set) => ({
  key: null,
  session: null,
  status: IDLE_STATUS,
  engine: null,
  setKey: (key) => set({ key }),
  setSession: (session) => set({ session }),
  setStatus: (status) => set({ status }),
  setEngine: (engine) => set({ engine }),
}));
