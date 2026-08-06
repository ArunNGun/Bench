/**
 * Bringing older saved data up to the current shape.
 *
 * The guarantee this file exists to keep: updating the app never costs anyone a
 * record. Someone who installed a year ago, or who restores a backup taken then,
 * gets everything back, and gets it visible, which is a stricter requirement
 * than merely getting it back.
 *
 * That distinction is the whole reason this is a shared function rather than
 * living inside the persist middleware. Records are filtered by `profileId`
 * throughout the UI, so a v2 row that arrives without one is still in the store,
 * still in the export, and completely invisible. Data that is present but cannot
 * be seen is indistinguishable from data that was lost.
 *
 * Two callers, and both matter:
 *   - the persist middleware, when reading this device's own IndexedDB
 *   - importData, when restoring a backup or an export file
 *
 * The second was missing for a while, which meant restoring a v1 backup stamped
 * it as current without converting anything.
 */

import {
  DATA_VERSION,
  DEFAULT_PROFILE,
  DEFAULT_SETTINGS,
  type AppData,
  type CheckIn,
  type Vial,
} from "./types";
import { vialCapacityMcg } from "./calc/inventory";
import { startOfLocalDay } from "./calc/schedule";

// Defined in types.ts so EMPTY_DATA can use it too; re-exported here because
// this is where callers expect to find it.
export { DATA_VERSION };

/**
 * A saved payload from any version, including ones predating fields we now rely
 * on. Everything is optional because older data genuinely lacks it.
 */
export type StoredData = Partial<AppData> & {
  version?: number;
  vials?: (Vial & { drawnMl?: number })[];
};

/**
 * Migrate a payload to the current shape.
 *
 * `fromVersion` is what the payload claims to be. It is only a hint: every step
 * below is written to be idempotent and to check the data rather than trust the
 * number, because an export can be hand-edited and a version stamp can be wrong.
 * Running this twice produces the same result as running it once.
 */
export function migrateAppData(data: StoredData | null | undefined): AppData {
  if (!data || typeof data !== "object") return emptyLike();

  const logs = data.logs ?? [];

  // --- v3: profiles ------------------------------------------------------
  // Everything that existed before belonged to one person, so it is adopted by a
  // single profile rather than left ownerless and unrenderable.
  const profiles = data.profiles?.length ? data.profiles : [DEFAULT_PROFILE];
  const ownerId =
    data.activeProfileId && profiles.some((p) => p.id === data.activeProfileId)
      ? data.activeProfileId
      : profiles[0].id;

  const own = <T extends { profileId?: string }>(rows: T[] | undefined): T[] =>
    (rows ?? []).map((r) => (r.profileId ? r : { ...r, profileId: ownerId }));

  // --- v2: vial consumption measured as mass, not volume -----------------
  // v1 tracked a volume, which only exists once a vial has been reconstituted,
  // so doses drawn from sealed vials never depleted anything.
  const vials = (data.vials ?? []).map((raw) => {
    // The v1 field is gone from the current type, so it has to be read off a
    // widened view rather than the Vial the rest of the app sees.
    const v = raw as Vial & { drawnMl?: number };
    if (v.drawnMcg != null) return v as Vial;

    if (v.drawnMl != null && v.diluentMl) {
      const conc = vialCapacityMcg(v) / v.diluentMl;
      return { ...v, drawnMcg: Math.min(vialCapacityMcg(v), v.drawnMl * conc) } as Vial;
    }

    // No volume recorded: rebuild consumption from the dose history instead.
    const logged = logs
      .filter((l) => l.vialId === v.id && !l.skipped)
      .reduce((sum, l) => sum + l.doseMcg, 0);
    return { ...v, drawnMcg: Math.min(vialCapacityMcg(v), logged) } as Vial;
  });

  return {
    version: DATA_VERSION,
    profiles,
    activeProfileId: ownerId,
    protocols: own(data.protocols),
    logs: own(logs).sort((a, b) => b.at - a.at),
    vials: own(vials),
    // v4 added outcome tracking, v5 bloodwork and v6 check-ins; older data
    // simply has none of them.
    measurements: own(data.measurements).sort((a, b) => b.at - a.at),
    labs: own(data.labs).sort((a, b) => b.at - a.at),
    checkIns: dedupeByDay(own(data.checkIns)),
    // Settings gain fields over time. Filling from defaults rather than leaving
    // them undefined keeps the UI from having to guess at every read site.
    settings: { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) },
    customPeptides: data.customPeptides ?? [],
  };
}

/** A valid empty store, for when there is nothing readable to migrate. */
function emptyLike(): AppData {
  return {
    version: DATA_VERSION,
    profiles: [DEFAULT_PROFILE],
    activeProfileId: DEFAULT_PROFILE.id,
    protocols: [],
    logs: [],
    vials: [],
    measurements: [],
    labs: [],
    settings: { ...DEFAULT_SETTINGS },
    customPeptides: [],
    checkIns: [],
  };
}

/**
 * At most one check-in per profile per day, newest kept.
 *
 * The store upserts on the day key, so duplicates should not arise, but an
 * imported file is not under our control and two rows for one day would render
 * as two points on a chart that is meant to have one per day.
 */
function dedupeByDay(rows: CheckIn[]): CheckIn[] {
  const byDay = new Map<string, CheckIn>();
  for (const row of rows) {
    const key = `${row.profileId}:${startOfLocalDay(row.at)}`;
    const seen = byDay.get(key);
    if (!seen || row.at >= seen.at) byDay.set(key, { ...row, at: startOfLocalDay(row.at) });
  }
  return [...byDay.values()].sort((a, b) => b.at - a.at);
}

/**
 * Whether a payload looks like one of this app's exports at all.
 *
 * Deliberately loose: a v1 export has no `labs`, no `profiles` and no
 * `measurements`, so demanding any of those would reject exactly the old files
 * this module exists to accept.
 */
export function looksLikeAppData(value: unknown): value is StoredData {
  if (!value || typeof value !== "object") return false;
  const v = value as StoredData;
  return Array.isArray(v.logs) && Array.isArray(v.protocols);
}
