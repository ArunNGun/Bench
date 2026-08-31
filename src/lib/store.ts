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
  type CheckIn,
  type Protocol,
  type Profile,
  type Settings,
  type Vial,
  type DiluentBottle,
} from "./types";
import { DATA_VERSION, migrateAppData } from "./migrate";
import { documentChanged } from "./calc/document";
import { withoutProfile } from "./calc/profiles";
import { PEPTIDES } from "./data/peptides";
import { beyondUseDate, SYRINGES, syringeById } from "./calc/reconstitution";
import { drawFromBottle, openBottle } from "./calc/diluent";
import { startOfLocalDay } from "./calc/schedule";
import {
  diluentAfterTopUp,
  drawFromVial,
  marksFromVial,
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
 * Everything lives on this device. There is one user and no account: the data
 * is held in IndexedDB and can be exported to a file at any time.
 *
 * Nothing here transmits anything. That remains true with sync switched on:
 * this is still the store, and `src/lib/sync` reads from it and writes to it
 * from the outside like any other caller. The server is a copy, never the
 * source, which is why the app works identically with the network unplugged.
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

  /**
   * Record how a day went. Upserts on the local day, so re-rating an evening
   * after rating the morning corrects the entry rather than adding a second.
   */
  saveCheckIn: (at: number, ratings: CheckIn["ratings"], notes?: string) => string;
  removeCheckIn: (id: string) => void;

  /**
   * Store what the health store reported for a day: sleep, resting heart rate.
   *
   * Upserts on a deterministic id per day, so re-reading the same night after
   * every app open corrects the row instead of stacking up a duplicate for each
   * sync. Read-only data from the platform; nothing here is written back.
   */
  recordVitals: (
    dayMs: number,
    vitals: { sleepHours?: number; restingHrBpm?: number },
  ) => void;

  addVial: (v: Omit<Vial, "id" | "profileId">) => string;
  /**
   * Add several vials as one order, so their shipping can be shared.
   *
   * One call rather than several, because an order is exactly the set of vials
   * that arrived together, and that fact is only knowable at the moment they
   * are entered. No shipping means no order record, since an order that says
   * nothing is a row kept for its own sake.
   */
  addOrder: (
    vials: Omit<Vial, "id" | "profileId">[],
    shipping: { cost: number; currency?: string } | null) => void;
  updateVial: (id: string, patch: Partial<Vial>) => void;
  removeVial: (id: string) => void;
  /**
   * Add more solvent to a vial that is already open.
   *
   * Mass is untouched and the beyond-use date is left where it is: it runs from
   * the first puncture, not the last top up, and quietly extending it would be
   * the app encouraging something it has no business encouraging.
   *
   * A no-op when there is nothing sensible to compute, rather than writing a
   * concentration nobody can act on.
   */
  topUpVial: (id: string, addedMl: number, fromBottleId?: string) => void;
  /**
   * Make up a vial, and take the water out of a bottle if it came from one.
   *
   * `fromBottleId` is optional because it has to be: nobody tracked bottles
   * before this existed, and a required argument would have made the app
   * unusable on the day it shipped for everyone who does not want to count
   * millilitres.
   */
  reconstituteVial: (
    id: string,
    diluentMl: number,
    diluent: Vial["diluent"],
    atMs?: number,
    fromBottleId?: string) => void;

  addDiluent: (b: Omit<DiluentBottle, "id" | "profileId">) => string;
  updateDiluent: (id: string, patch: Partial<DiluentBottle>) => void;
  removeDiluent: (id: string) => void;
  /** Break the seal without drawing anything yet. */
  openDiluent: (id: string) => void;
  /**
   * Water used for something this app does not track.
   *
   * Every manual correction is also a way for a figure to drift away from
   * reality, so this is deliberately the only one: it takes water out, and
   * there is no way to put an arbitrary amount back in.
   */
  /*
   * Named "draw" rather than "use" because a store action beginning with `use`
   * reads as a React hook to both the linter and the next person.
   */
  drawDiluent: (id: string, ml: number) => void;

  updateSettings: (patch: Partial<Settings>) => void;

  addCustomPeptide: (p: Peptide) => void;
  removeCustomPeptide: (id: string) => void;
  /**
   * Change one of your own compounds in place.
   *
   * The id is kept whatever the name becomes, because protocols, logged
   * doses and vials all point at it. Renaming a compound must not orphan a
   * year of history, so the slug is fixed at creation and never rederived.
   */
  updateCustomPeptide: (id: string, next: Peptide) => void;
  /**
   * Your own half-life for a library compound that has none, or null to drop it
   * again. Stored per compound rather than per profile: it is a belief about
   * the compound, not a fact about a person.
   */
  setHalfLifeOverride: (peptideId: string, hours: number | null, note?: string) => void;

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
            /*
             * Deleting a profile takes its data with it, since orphaned doses
             * would quietly corrupt the other profile's totals.
             *
             * Through `withoutProfile` rather than by naming the collections
             * here, because this list was written when there were six of them
             * and orders and bottles of water arrived later without anyone
             * adding them. One list, in profiles.ts, held to the document by a
             * test.
             */
            ...withoutProfile(s, id),
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

          /*
           * What the syringe read, recorded at the time rather than worked out
           * later.
           *
           * A dose logged in one tap says only its mass, and the Log then had
           * nothing to show in marks for it. The figure cannot honestly be
           * derived afterwards either: it depends on the concentration, and
           * topping a vial up changes that, so a number calculated next month
           * would describe a syringe nobody drew.
           *
           * Only filled in when the caller left it out, so the log sheet, which
           * asks, always wins.
           */
          const scale = (syringeById(s.settings.defaultSyringeId ?? "") ?? SYRINGES[2]).scale;
          const drawn = marksFromVial(s.vials.find((v) => v.id === vialId), l.doseMcg, scale);

          const measured =
            l.units == null && drawn != null
              ? { units: Number(drawn.toFixed(2)), syringeScale: l.syringeScale ?? scale }
              : null;

          return {
            logs: logs.map((x) => (x.id === id ? { ...x, vialId, ...measured } : x)),
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

      saveCheckIn: (at, ratings, notes) => {
        const day = startOfLocalDay(at);
        const existing = get().checkIns.find(
          (c) => c.profileId === get().activeProfileId && c.at === day);
        const id = existing?.id ?? nanoid();
        set((s) => {
          const row: CheckIn = { id, profileId: s.activeProfileId, at: day, ratings, notes };
          const rest = s.checkIns.filter((c) => c.id !== id);
          return { checkIns: [...rest, row].sort((a, b) => b.at - a.at) };
        });
        return id;
      },
      removeCheckIn: (id) => set((s) => ({ checkIns: s.checkIns.filter((x) => x.id !== id) })),

      recordVitals: (dayMs, vitals) => {
        if (vitals.sleepHours == null && vitals.restingHrBpm == null) return;
        const day = startOfLocalDay(dayMs);
        const externalId = `hc-vitals:${day}`;

        set((s) => {
          const existing = s.measurements.find(
            (m) => m.profileId === s.activeProfileId && m.externalId === externalId);

          if (existing) {
            return {
              measurements: s.measurements.map((m) =>
                m.id === existing.id ? { ...m, ...vitals } : m),
            };
          }

          const row: Measurement = {
            id: nanoid(),
            profileId: s.activeProfileId,
            at: day,
            source: "health-connect",
            externalId,
            ...vitals,
          };
          return { measurements: [...s.measurements, row].sort((a, b) => b.at - a.at) };
        });
      },

      addVial: (v) => {
        const id = nanoid(10);
        set((s) => ({ vials: [...s.vials, { ...v, id, profileId: s.activeProfileId }] }));
        return id;
      },
      updateVial: (id, patch) =>
        set((s) => ({ vials: s.vials.map((v) => (v.id === id ? { ...v, ...patch } : v)) })),
      addOrder: (vials, shipping) =>
        set((s) => {
          const orderId = shipping && shipping.cost > 0 ? nanoid(10) : undefined;
          const added = vials.map((v) => ({
            ...v,
            id: nanoid(10),
            profileId: s.activeProfileId,
            orderId,
          }));

          return {
            vials: [...s.vials, ...added],
            orders:
              orderId && shipping
                ? [
                    ...s.orders,
                    {
                      id: orderId,
                      profileId: s.activeProfileId,
                      shippingCost: shipping.cost,
                      currency: shipping.currency,
                      placedAt: Date.now(),
                    },
                  ]
                : s.orders,
          };
        }),
      /*
       * Removing the last vial of an order removes the order with it. Left
       * behind it would keep a shipping figure on the Stock page for a delivery
       * with nothing in it, which is a number about nothing.
       */
      removeVial: (id) =>
        set((s) => {
          const gone = s.vials.find((v) => v.id === id);
          const vials = s.vials.filter((v) => v.id !== id);
          const orphaned =
            gone?.orderId && !vials.some((v) => v.orderId === gone.orderId) ? gone.orderId : null;

          return {
            vials,
            orders: orphaned ? s.orders.filter((o) => o.id !== orphaned) : s.orders,
          };
        }),
      addDiluent: (b) => {
        const id = nanoid(10);
        set((s) => ({ diluents: [...s.diluents, { ...b, id, profileId: s.activeProfileId }] }));
        return id;
      },
      updateDiluent: (id, patch) =>
        set((s) => ({
          diluents: s.diluents.map((b) => (b.id === id ? { ...b, ...patch } : b)),
        })),
      removeDiluent: (id) => set((s) => ({ diluents: s.diluents.filter((b) => b.id !== id) })),
      openDiluent: (id) => set((s) => ({ diluents: openBottle(s.diluents, id, Date.now()) })),
      drawDiluent: (id, ml) =>
        set((s) => ({ diluents: drawFromBottle(s.diluents, id, ml, Date.now()) })),

      reconstituteVial: (id, diluentMl, diluent, atMs, fromBottleId) =>
        set((s) => {
          const at = atMs ?? Date.now();
          return {
            vials: s.vials.map((v) =>
              v.id === id
                ? {
                    ...v,
                    state: "reconstituted" as const,
                    reconstitutedAt: at,
                    diluentMl,
                    diluent,
                    diluentBottleId: fromBottleId,
                    drawnMcg: v.drawnMcg ?? 0,
                    budAt: beyondUseDate(at),
                  }
                : v),
            // The water leaves the bottle at the same moment it enters the
            // vial, in one write, so the two can never disagree about how much
            // was used.
            diluents: fromBottleId
              ? drawFromBottle(s.diluents, fromBottleId, diluentMl, at)
              : s.diluents,
          };
        }),

      topUpVial: (id, addedMl, fromBottleId) =>
        set((s) => {
          const target = s.vials.find((v) => v.id === id);
          const diluentMl = target ? diluentAfterTopUp(target, addedMl) : null;
          // Nothing sensible to compute means nothing happens, and in
          // particular no water leaves a bottle for a top up that was refused.
          if (diluentMl == null) return {};

          return {
            vials: s.vials.map((v) => (v.id === id ? { ...v, diluentMl } : v)),
            /*
             * The same water, drawn the same way as at reconstitution. These
             * two actions were built on separate branches and only met here,
             * which is how the app came to count the water for one and not the
             * other while both were doing the identical thing.
             */
            diluents: fromBottleId
              ? drawFromBottle(s.diluents, fromBottleId, addedMl, Date.now())
              : s.diluents,
          };
        }),

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      addCustomPeptide: (p) =>
        set((s) => ({
          customPeptides: [...s.customPeptides.filter((x) => x.id !== p.id), p],
        })),
      setHalfLifeOverride: (peptideId, hours, note) =>
        set((st) => {
          const next = { ...(st.halfLifeOverrides ?? {}) };
          if (hours == null || !(hours > 0)) delete next[peptideId];
          else next[peptideId] = { hours, setAt: Date.now(), note };
          return { halfLifeOverrides: next };
        }),
      updateCustomPeptide: (id, next) =>
        set((st) => ({
          customPeptides: st.customPeptides.map((p) => (p.id === id ? { ...next, id } : p)),
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
        set((s) => ({
          version: migrated.version,
          profiles: migrated.profiles,
          activeProfileId: migrated.activeProfileId,
          measurements: migrated.measurements,
          labs: migrated.labs,
          protocols: migrated.protocols,
          logs: migrated.logs,
          vials: migrated.vials,
          // Whose server this device talks to is this device's business and
          // survives an import. Pulling from the server would otherwise be able
          // to switch off the very connection that did the pulling, and
          // restoring a backup would silently drop the setting.
          settings: { ...migrated.settings, sync: s.settings.sync },
          customPeptides: migrated.customPeptides,
          checkIns: migrated.checkIns,
          halfLifeOverrides: migrated.halfLifeOverrides ?? {},
          orders: migrated.orders,
          diluents: migrated.diluents,
        }));
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
      /**
       * The document that goes to a backup file and to the sync server.
       *
       * `settings.sync` is deliberately left out. It is not data about the
       * person, it is this device's note of where its server is and what it
       * last sent, and including it caused two distinct problems. It travelled
       * into a backup file, so restoring one on a second machine pointed that
       * machine at a server it had no key for. Worse, it made automatic sync
       * chase its own tail: a push writes `updatedAt` into settings, settings
       * are part of the payload, so the payload changes and asks to be pushed
       * again, forever.
       */
      exportData: () => {
        const s = get();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { sync, ...settings } = s.settings;
        return {
          version: s.version,
          profiles: s.profiles,
          activeProfileId: s.activeProfileId,
          measurements: s.measurements,
          labs: s.labs,
          protocols: s.protocols,
          logs: s.logs,
          vials: s.vials,
          settings,
          customPeptides: s.customPeptides,
          checkIns: s.checkIns,
          halfLifeOverrides: s.halfLifeOverrides ?? {},
          orders: s.orders,
          diluents: s.diluents,
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
        checkIns: s.checkIns,
        halfLifeOverrides: s.halfLifeOverrides,
        orders: s.orders,
        diluents: s.diluents,
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

/**
 * Stamp when the document last changed.
 *
 * Subscribed here rather than in a component on purpose. A screen can be
 * unmounted, and the one moment this must not miss is a change made on a screen
 * that nobody thought about. The store is always there.
 *
 * Guarded on `hydrated` because rehydration replaces every array in the state,
 * which is not a person changing anything and would otherwise mark a document
 * unsaved on every reload.
 *
 * `dataChangedAt` is itself part of settings, so it has to be excluded from
 * what counts as a change. `documentChanged` does that, and its test says so.
 */
useStore.subscribe((next, prev) => {
  if (!next.hydrated || !prev.hydrated) return;
  if (!documentChanged(next, prev)) return;
  useStore.setState((s) => ({ settings: { ...s.settings, dataChangedAt: Date.now() } }));
});

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
  const checkIns = useStore((s) => s.checkIns);
  const orders = useStore((s) => s.orders);
  const diluents = useStore((s) => s.diluents);
  const activeId = useStore((s) => s.activeProfileId);

  return useMemo(
    () => ({
      protocols: protocols.filter((x) => x.profileId === activeId),
      logs: logs.filter((x) => x.profileId === activeId),
      vials: vials.filter((x) => x.profileId === activeId),
      measurements: measurements.filter((x) => x.profileId === activeId),
      labs: labs.filter((x) => x.profileId === activeId),
      checkIns: checkIns.filter((x) => x.profileId === activeId),
      orders: orders.filter((x) => x.profileId === activeId),
      diluents: diluents.filter((x) => x.profileId === activeId),
    }),
    [protocols, logs, vials, measurements, labs, checkIns, orders, diluents, activeId]);
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
