"use client";

import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import { get as idbGet, set as idbSet, del as idbDel } from "idb-keyval";
import { nanoid } from "nanoid";
import { useMemo } from "react";
import {
  DEFAULT_PROFILE,
  EMPTY_DATA,
  PROFILE_TONES,
  type AppData,
  type DoseLog,
  type Peptide,
  type Measurement,
  type LabResult,
  type Protocol,
  type Profile,
  type Settings,
  type Vial,
} from "./types";
import { DATA_VERSION, migrateAppData } from "./migrate";
import { PEPTIDES } from "./data/peptides";
import { beyondUseDate } from "./calc/reconstitution";
import {
  drawFromVial,
  pickVialForDose,
  reconcileVials,
  returnToVial,
  stockFor as computeStock,
  vialConcentration,
  vialExpired,
  vialFractionRemaining,
  vialRemainingMcg,
  vialRemainingMl,
} from "./calc/inventory";

/**
 * Everything lives on this device. There is one user, no account, and no
 * server: the data is held in IndexedDB and can be exported to a file at any
 * time. Nothing here is transmitted anywhere.
 */

/**
 * IndexedDB does not exist while Next prerenders on the server, and zustand's
 * persist middleware writes on the very first state change. Without this guard
 * the build throws a ReferenceError during static generation.
 */
const hasIndexedDB = () => typeof globalThis !== "undefined" && "indexedDB" in globalThis;

const idbStorage: StateStorage = {
  getItem: async (name) => (hasIndexedDB() ? ((await idbGet(name)) ?? null) : null),
  setItem: async (name, value) => {
    if (hasIndexedDB()) await idbSet(name, value);
  },
  removeItem: async (name) => {
    if (hasIndexedDB()) await idbDel(name);
  },
};

export const STORAGE_KEY = "peptide-log-v1";

// Re-exported so existing importers keep working; it is defined alongside the
// migration that has to agree with it.
export { DATA_VERSION } from "./migrate";

interface StoreState extends AppData {
  /** False until IndexedDB has been read, so the UI can avoid flashing empty. */
  hydrated: boolean;
  setHydrated: () => void;

  addProfile: (name: string) => string;
  updateProfile: (id: string, patch: Partial<Profile>) => void;
  removeProfile: (id: string) => void;
  switchProfile: (id: string) => void;

  addProtocol: (p: Omit<Protocol, "id" | "profileId">) => string;
  updateProtocol: (id: string, patch: Partial<Protocol>) => void;
  removeProtocol: (id: string) => void;

  addLog: (l: Omit<DoseLog, "id" | "profileId">) => string;
  updateLog: (id: string, patch: Partial<DoseLog>) => void;
  removeLog: (id: string) => void;

  addMeasurement: (m: Omit<Measurement, "id" | "profileId">) => string;
  updateMeasurement: (id: string, patch: Partial<Measurement>) => void;
  removeMeasurement: (id: string) => void;

  addLab: (l: Omit<LabResult, "id" | "profileId">) => string;
  updateLab: (id: string, patch: Partial<LabResult>) => void;
  removeLab: (id: string) => void;

  addVial: (v: Omit<Vial, "id" | "profileId">) => string;
  updateVial: (id: string, patch: Partial<Vial>) => void;
  removeVial: (id: string) => void;
  reconstituteVial: (id: string, diluentMl: number, diluent: Vial["diluent"], atMs?: number) => void;

  updateSettings: (patch: Partial<Settings>) => void;

  addCustomPeptide: (p: Peptide) => void;
  removeCustomPeptide: (id: string) => void;

  importData: (data: AppData) => void;
  /**
   * Merge history read out of another app's export.
   *
   * Separate from addLog because addLog attributes each dose to a vial and draws
   * the stock down. That is right when logging a dose now and wrong for a dose
   * from six months ago: importing a year of history would empty the vial
   * currently in the fridge. Imported doses carry no vial and leave stock alone.
   */
  importHistory: (input: {
    logs: Omit<DoseLog, "id" | "profileId">[];
    measurements: Omit<Measurement, "id" | "profileId">[];
  }) => { logs: number; measurements: number };
  exportData: () => AppData;
  resetAll: () => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      ...EMPTY_DATA,
      hydrated: false,
      setHydrated: () => set({ hydrated: true }),

      addProfile: (name) => {
        const id = nanoid(10);
        set((s) => ({
          profiles: [
            ...s.profiles,
            {
              id,
              name: name.trim() || `Profile ${s.profiles.length + 1}`,
              tone: PROFILE_TONES[s.profiles.length % PROFILE_TONES.length],
              createdAt: Date.now(),
            },
          ],
          activeProfileId: id,
        }));
        return id;
      },
      updateProfile: (id, patch) =>
        set((s) => ({ profiles: s.profiles.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
      removeProfile: (id) =>
        set((s) => {
          // Never leave the app with no profile to show.
          if (s.profiles.length <= 1) return s;
          const profiles = s.profiles.filter((x) => x.id !== id);
          return {
            profiles,
            // Deleting a profile takes its data with it, leaving orphaned
            // doses behind would quietly corrupt the other profile's totals.
            protocols: s.protocols.filter((x) => x.profileId !== id),
            logs: s.logs.filter((x) => x.profileId !== id),
            vials: s.vials.filter((x) => x.profileId !== id),
            measurements: s.measurements.filter((x) => x.profileId !== id),
            labs: s.labs.filter((x) => x.profileId !== id),
            activeProfileId: s.activeProfileId === id ? profiles[0].id : s.activeProfileId,
          };
        }),
      switchProfile: (id) =>
        set((s) => (s.profiles.some((x) => x.id === id) ? { activeProfileId: id } : s)),

      addProtocol: (p) => {
        const id = nanoid(10);
        set((s) => ({
          protocols: [...s.protocols, { ...p, id, profileId: s.activeProfileId }],
        }));
        return id;
      },
      updateProtocol: (id, patch) =>
        set((s) => ({
          protocols: s.protocols.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),
      removeProtocol: (id) =>
        set((s) => ({
          protocols: s.protocols.filter((p) => p.id !== id),
          // Keep the history; just detach it from the deleted protocol.
          logs: s.logs.map((l) => (l.protocolId === id ? { ...l, protocolId: undefined } : l)),
        })),

      addLog: (l) => {
        const id = nanoid(10);
        set((s) => {
          const entry = { ...l, id, profileId: s.activeProfileId };
          const logs = [...s.logs, entry].sort((a, b) => b.at - a.at);
          if (l.skipped || !(l.doseMcg > 0)) return { logs };

          // Attribute the dose to a vial so stock actually moves. The caller
          // may name one; otherwise pick the sensible vial automatically,
          // because requiring manual attribution just means stock never
          // changes.
          // Only ever draw from this profile's own stock.
          const mine = s.vials.filter((v) => v.profileId === s.activeProfileId);
          const vialId = l.vialId ?? pickVialForDose(mine, l.peptideId, l.doseMcg, l.at)?.id;
          if (!vialId) return { logs };

          return {
            logs: logs.map((x) => (x.id === id ? { ...x, vialId } : x)),
            vials: drawFromVial(s.vials, vialId, l.doseMcg),
          };
        });
        return id;
      },
      updateLog: (id, patch) =>
        set((s) => {
          const before = s.logs.find((l) => l.id === id);
          if (!before) return s;

          const after = { ...before, ...patch };

          // A vial belonging to a different peptide can no longer supply this
          // dose, so drop the attribution rather than draw from the wrong one.
          if (after.peptideId !== before.peptideId && after.vialId) {
            const v = s.vials.find((x) => x.id === after.vialId);
            if (!v || v.peptideId !== after.peptideId) after.vialId = undefined;
          }

          return {
            logs: s.logs.map((l) => (l.id === id ? after : l)).sort((a, b) => b.at - a.at),
            // Undo what this dose used to take out, then apply what it takes
            // out now, otherwise an edit quietly double-counts.
            vials: reconcileVials(
              s.vials,
              { vialId: before.vialId, doseMcg: before.doseMcg, skipped: before.skipped },
              { vialId: after.vialId, doseMcg: after.doseMcg, skipped: after.skipped }),
          };
        }),
      removeLog: (id) =>
        set((s) => {
          const removed = s.logs.find((l) => l.id === id);
          const logs = s.logs.filter((l) => l.id !== id);
          if (!removed || removed.skipped || !removed.vialId) return { logs };
          return { logs, vials: returnToVial(s.vials, removed.vialId, removed.doseMcg) };
        }),

      addMeasurement: (m) => {
        const id = nanoid(10);
        set((s) => ({
          measurements: [...s.measurements, { ...m, id, profileId: s.activeProfileId }].sort(
            (a, b) => b.at - a.at),
        }));
        return id;
      },
      updateMeasurement: (id, patch) =>
        set((s) => ({
          measurements: s.measurements
            .map((x) => (x.id === id ? { ...x, ...patch } : x))
            .sort((a, b) => b.at - a.at),
        })),
      removeMeasurement: (id) =>
        set((s) => ({ measurements: s.measurements.filter((x) => x.id !== id) })),

      addLab: (l) => {
        const id = nanoid(10);
        set((s) => ({
          labs: [...s.labs, { ...l, id, profileId: s.activeProfileId }].sort((a, b) => b.at - a.at),
        }));
        return id;
      },
      updateLab: (id, patch) =>
        set((s) => ({
          labs: s.labs.map((x) => (x.id === id ? { ...x, ...patch } : x)).sort((a, b) => b.at - a.at),
        })),
      removeLab: (id) => set((s) => ({ labs: s.labs.filter((x) => x.id !== id) })),

      addVial: (v) => {
        const id = nanoid(10);
        set((s) => ({ vials: [...s.vials, { ...v, id, profileId: s.activeProfileId }] }));
        return id;
      },
      updateVial: (id, patch) =>
        set((s) => ({ vials: s.vials.map((v) => (v.id === id ? { ...v, ...patch } : v)) })),
      removeVial: (id) => set((s) => ({ vials: s.vials.filter((v) => v.id !== id) })),
      reconstituteVial: (id, diluentMl, diluent, atMs) =>
        set((s) => ({
          vials: s.vials.map((v) =>
            v.id === id
              ? {
                  ...v,
                  state: "reconstituted" as const,
                  reconstitutedAt: atMs ?? Date.now(),
                  diluentMl,
                  diluent,
                  drawnMcg: v.drawnMcg ?? 0,
                  budAt: beyondUseDate(atMs ?? Date.now()),
                }
              : v),
        })),

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      addCustomPeptide: (p) =>
        set((s) => ({
          customPeptides: [...s.customPeptides.filter((x) => x.id !== p.id), p],
        })),
      removeCustomPeptide: (id) =>
        set((s) => ({ customPeptides: s.customPeptides.filter((p) => p.id !== id) })),

      importData: (data) => {
        // Everything arriving from outside goes through the same migration as
        // this device's own stored data. Without it, restoring an old backup
        // stamps it as current and leaves every row without a profileId, still
        // in the store, filtered out of every screen, indistinguishable from
        // having been lost.
        const migrated = migrateAppData(data);
        set({
          version: migrated.version,
          profiles: migrated.profiles,
          activeProfileId: migrated.activeProfileId,
          measurements: migrated.measurements,
          labs: migrated.labs,
          protocols: migrated.protocols,
          logs: migrated.logs,
          vials: migrated.vials,
          settings: migrated.settings,
          customPeptides: migrated.customPeptides,
        });
      },
      importHistory: ({ logs, measurements }) => {
        set((s) => ({
          logs: [
            ...s.logs, ...logs.map((l) => ({ ...l, id: nanoid(10), profileId: s.activeProfileId })),
          ].sort((a, b) => b.at - a.at),
          measurements: [
            ...s.measurements, ...measurements.map((m) => ({ ...m, id: nanoid(10), profileId: s.activeProfileId })),
          ].sort((a, b) => b.at - a.at),
        }));
        return { logs: logs.length, measurements: measurements.length };
      },
      exportData: () => {
        const s = get();
        return {
          version: s.version,
          profiles: s.profiles,
          activeProfileId: s.activeProfileId,
          measurements: s.measurements,
          labs: s.labs,
          protocols: s.protocols,
          logs: s.logs,
          vials: s.vials,
          settings: s.settings,
          customPeptides: s.customPeptides,
        };
      },
      resetAll: () => set({ ...EMPTY_DATA }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => idbStorage),
      version: DATA_VERSION,
      partialize: (s) => ({
        version: s.version,
        profiles: s.profiles,
        activeProfileId: s.activeProfileId,
        measurements: s.measurements,
        labs: s.labs,
        protocols: s.protocols,
        logs: s.logs,
        vials: s.vials,
        settings: s.settings,
        customPeptides: s.customPeptides,
      }),
      /**
       * Shared with importData, so a backup restored from a file and this
       * device's own stored data are brought forward by exactly the same code.
       * The version argument is ignored deliberately, migrateAppData inspects
       * the data instead, which also repairs a payload whose stamp is wrong.
       */
      migrate: (persisted) => migrateAppData(persisted as Parameters<typeof migrateAppData>[0]),
      // Fires with the rehydrated state, or with undefined if reading failed.
      // Either way the UI should stop waiting.
      onRehydrateStorage: () => () => {
        useStore.getState().setHydrated();
      },
    }));

// ---------------------------------------------------------------------------
// Selectors and derived data
// ---------------------------------------------------------------------------

/** The profile currently being shown. */
export function useActiveProfile() {
  const profiles = useStore((s) => s.profiles);
  const activeId = useStore((s) => s.activeProfileId);
  return profiles.find((p) => p.id === activeId) ?? profiles[0] ?? DEFAULT_PROFILE;
}

/**
 * Everything belonging to the active profile.
 *
 * Memoised so the filtered arrays keep a stable identity between renders.
 * Returning fresh arrays from a zustand selector would re-render forever.
 */
export function useProfileData() {
  const protocols = useStore((s) => s.protocols);
  const logs = useStore((s) => s.logs);
  const vials = useStore((s) => s.vials);
  const measurements = useStore((s) => s.measurements);
  const labs = useStore((s) => s.labs);
  const activeId = useStore((s) => s.activeProfileId);

  return useMemo(
    () => ({
      protocols: protocols.filter((x) => x.profileId === activeId),
      logs: logs.filter((x) => x.profileId === activeId),
      vials: vials.filter((x) => x.profileId === activeId),
      measurements: measurements.filter((x) => x.profileId === activeId),
      labs: labs.filter((x) => x.profileId === activeId),
    }),
    [protocols, logs, vials, measurements, labs, activeId]);
}

/** Built-in library plus anything the user added, user entries winning. */
export function allPeptides(custom: Peptide[]): Peptide[] {
  const customIds = new Set(custom.map((p) => p.id));
  return [...PEPTIDES.filter((p) => !customIds.has(p.id)), ...custom].sort((a, b) =>
    a.name.localeCompare(b.name));
}

export function findPeptide(custom: Peptide[], id: string): Peptide | undefined {
  return custom.find((p) => p.id === id) ?? PEPTIDES.find((p) => p.id === id);
}

export interface VialStatus {
  vial: Vial;
  concentrationMcgPerMl: number;
  remainingMl: number;
  remainingMcg: number;
  fractionRemaining: number;
  /** Days until the beyond-use date; negative when past it. */
  daysToBud: number | null;
  expired: boolean;
}

export function vialStatus(vial: Vial, nowMs = Date.now()): VialStatus {
  return {
    vial,
    concentrationMcgPerMl: vialConcentration(vial),
    remainingMl: vialRemainingMl(vial),
    remainingMcg: vialRemainingMcg(vial),
    fractionRemaining: vialFractionRemaining(vial),
    daysToBud: vial.budAt != null ? (vial.budAt - nowMs) / 86_400_000 : null,
    expired: vialExpired(vial, nowMs),
  };
}

/** Doses of a peptide still available across every usable vial. */
export function stockFor(vials: Vial[], peptideId: string, doseMcg: number, nowMs = Date.now()) {
  return computeStock(vials, peptideId, doseMcg, nowMs);
}

export { vialCapacityMcg, pickVialForDose } from "./calc/inventory";
