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
  type DiluentBottle,
  type Order,
  type Vial,
} from "./types";
import { vialCapacityMcg } from "./calc/inventory";
import { isOrphaned } from "./calc/profiles";
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

  /*
   * A row with no owner, or with an owner who no longer exists, is adopted.
   *
   * The second half was missing and it cost real data to find out. Deleting a
   * profile used to leave its orders and its bottles of water behind, pointing
   * at an id nothing answers to, and every screen filters by profile, so they
   * were still in the file and nowhere on screen. Whatever put a row in that
   * state, throwing it away is the one thing that cannot be undone, and a
   * bottle that outlived the profile it was bought under is still a bottle in
   * the fridge.
   */
  const live = new Set(profiles.map((p) => p.id));
  const own = <T extends { profileId?: string }>(rows: T[] | undefined): T[] =>
    (rows ?? []).map((r) => (isOrphaned(r, live) ? { ...r, profileId: ownerId } : r));

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
    // v7. Absent in every older payload, and an empty map behaves exactly as
    // the field not existing did, so nothing has to be backfilled.
    halfLifeOverrides: saneOverrides(data.halfLifeOverrides),
    // v7. Absent in every older payload, and a vial with no order behaves
    // exactly as it always did, so nothing has to be backfilled.
    orders: saneOrders(own(data.orders)),
    // v8. Bottles of water, counted apart from vials because they are not one.
    diluents: saneBottles(own(data.diluents)),
  };
}

/**
 * Keep only overrides that could produce a curve.
 *
 * An imported file is not under our control, and a zero, a negative or a string
 * that survived JSON would reach the model and draw a flat line or nothing at
 * all, with no clue why. Dropping them is quieter than the alternative and the
 * compound simply goes back to having no curve.
 */
function saneOverrides(raw: AppData["halfLifeOverrides"]): AppData["halfLifeOverrides"] {
  if (!raw || typeof raw !== "object") return {};
  const out: NonNullable<AppData["halfLifeOverrides"]> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object") continue;
    const hours = Number(value.hours);
    if (!Number.isFinite(hours) || hours <= 0) continue;
    out[id] = {
      hours,
      setAt: Number.isFinite(Number(value.setAt)) ? Number(value.setAt) : Date.now(),
      note: typeof value.note === "string" ? value.note : undefined,
    };
  }
  return out;
}

/**
 * Keep only bottles that could hold anything.
 *
 * A bottle with no volume would divide into a concentration of infinity and
 * show as permanently empty, which is worse than not being there: it would sit
 * on the shelf claiming to be stock while supplying nothing.
 */
function saneBottles(rows: DiluentBottle[]): DiluentBottle[] {
  return rows.filter((b) => b && b.id && Number.isFinite(Number(b.volumeMl)) && b.volumeMl > 0);
}

/**
 * Keep only orders that could carry a share.
 *
 * An imported file is not under our control, and a zero or a missing cost would
 * put a shipping line on the Stock page that adds nothing, or divide by
 * something that is not a number. A dropped order leaves its vials priced at
 * what they cost, which is what they were before shipping was recorded at all.
 */
function saneOrders(rows: Order[]): Order[] {
  return rows.filter((o) => o && o.id && Number.isFinite(Number(o.shippingCost)) && o.shippingCost > 0);
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
    halfLifeOverrides: {},
    orders: [],
    diluents: [],
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
