import { describe, expect, it } from "vitest";
import { DEFAULT_PROFILE, DEFAULT_PROFILE_ID, EMPTY_DATA, PROFILE_TONES } from "../types";
import { migrateAppData } from "../migrate";
import { isOrphaned, PROFILE_OWNED_KEYS, SHARED_KEYS, withoutProfile } from "./profiles";
import type { AppData, DoseLog, Protocol, Vial } from "../types";
import { pickVialForDose, stockFor } from "./inventory";

/**
 * The v2 → v3 migration, mirrored here so the adoption rule can be tested
 * without booting the persisted store. It must match store.ts.
 */
function migrateToProfiles(data: Partial<AppData> & { vials?: Vial[] }): AppData {
  const profiles = data.profiles?.length ? data.profiles : [DEFAULT_PROFILE];
  const ownerId = data.activeProfileId ?? profiles[0].id;
  const own = <T extends { profileId?: string }>(rows: T[] | undefined) =>
    (rows ?? []).map((r) => (r.profileId ? r : { ...r, profileId: ownerId }));

  return {
    ...(data as AppData),
    profiles,
    activeProfileId: ownerId,
    protocols: own(data.protocols) as Protocol[],
    logs: own(data.logs) as DoseLog[],
    vials: own(data.vials) as Vial[],
    version: 3,
  };
}

const protocol = (over: Partial<Protocol> = {}) =>
  ({
    id: "p1",
    peptideId: "klow",
    name: "Daily",
    active: true,
    startedAt: 0,
    doseMcg: 1000,
    route: "subcutaneous",
    schedule: { kind: "daily" },
    titrationAutoAdvance: false, ...over,
  }) as Protocol;

const vial = (over: Partial<Vial> & { id: string }) =>
  ({ peptideId: "klow", strengthMg: 80, state: "sealed", ...over }) as Vial;

describe("v2 to v3 migration", () => {
  it("adopts pre-profile data into a default profile", () => {
    const before = {
      version: 2,
      protocols: [protocol()],
      logs: [{ id: "l1", peptideId: "klow", at: 0, doseMcg: 1000, route: "subcutaneous" }],
      vials: [vial({ id: "v1" })],
    } as unknown as AppData;

    const after = migrateToProfiles(before);

    expect(after.profiles).toHaveLength(1);
    expect(after.profiles[0].id).toBe(DEFAULT_PROFILE_ID);
    expect(after.activeProfileId).toBe(DEFAULT_PROFILE_ID);
    expect(after.protocols[0].profileId).toBe(DEFAULT_PROFILE_ID);
    expect(after.logs[0].profileId).toBe(DEFAULT_PROFILE_ID);
    expect(after.vials[0].profileId).toBe(DEFAULT_PROFILE_ID);
  });

  it("loses nothing in the process", () => {
    const before = {
      version: 2,
      protocols: [protocol({ id: "a" }), protocol({ id: "b" })],
      logs: Array.from({ length: 12 }, (_, i) => ({ id: `l${i}`, at: i })),
      vials: [vial({ id: "v1" }), vial({ id: "v2" })],
    } as unknown as AppData;

    const after = migrateToProfiles(before);
    expect(after.protocols).toHaveLength(2);
    expect(after.logs).toHaveLength(12);
    expect(after.vials).toHaveLength(2);
  });

  it("leaves rows that already carry a profile alone", () => {
    const before = {
      version: 2,
      profiles: [{ ...DEFAULT_PROFILE, id: "other" }],
      protocols: [protocol({ profileId: "someone-else" })],
      logs: [],
      vials: [],
    } as unknown as AppData;

    expect(migrateToProfiles(before).protocols[0].profileId).toBe("someone-else");
  });

  it("copes with entirely empty data", () => {
    const after = migrateToProfiles({ version: 2 } as AppData);
    expect(after.profiles).toHaveLength(1);
    expect(after.protocols).toEqual([]);
    expect(after.logs).toEqual([]);
    expect(after.vials).toEqual([]);
  });

  it("is idempotent, running it twice changes nothing", () => {
    const once = migrateToProfiles({
      version: 2,
      protocols: [protocol()],
      logs: [],
      vials: [vial({ id: "v1" })],
    } as unknown as AppData);
    expect(migrateToProfiles(once)).toEqual(once);
  });
});

describe("profile isolation", () => {
  const mine = vial({ id: "mine", profileId: "me" });
  const theirs = vial({ id: "theirs", profileId: "you" });
  const all = [mine, theirs];

  const forProfile = (id: string) => all.filter((v) => v.profileId === id);

  it("keeps one profile's stock out of another's count", () => {
    expect(stockFor(forProfile("me"), "klow", 4000, 0).dosesRemaining).toBe(20);
    expect(stockFor(forProfile("you"), "klow", 4000, 0).dosesRemaining).toBe(20);
    // Unfiltered, the two would be added together, which is the bug the
    // scoping exists to prevent.
    expect(stockFor(all, "klow", 4000, 0).dosesRemaining).toBe(40);
  });

  it("never draws a dose from another profile's vial", () => {
    expect(pickVialForDose(forProfile("me"), "klow", 4000, 0)?.id).toBe("mine");
    expect(pickVialForDose(forProfile("you"), "klow", 4000, 0)?.id).toBe("theirs");
  });

  it("reports no stock for a profile that owns none", () => {
    expect(stockFor(forProfile("nobody"), "klow", 4000, 0).dosesRemaining).toBe(0);
    expect(pickVialForDose(forProfile("nobody"), "klow", 4000, 0)).toBeNull();
  });
});

describe("profile colours", () => {
  it("offers a distinct hue per profile before repeating", () => {
    expect(new Set(PROFILE_TONES).size).toBe(PROFILE_TONES.length);
    expect(PROFILE_TONES.length).toBeGreaterThanOrEqual(6);
  });

  it("cycles rather than running out", () => {
    for (let n = 0; n < 20; n++) {
      expect(PROFILE_TONES[n % PROFILE_TONES.length]).toBeTruthy();
    }
  });
});

describe("every part of the document is owned or shared, and says which", () => {
  it("accounts for every key", () => {
    const unclassified = Object.keys(EMPTY_DATA).filter(
      (k) => !(PROFILE_OWNED_KEYS as readonly string[]).includes(k) && !(k in SHARED_KEYS));

    expect(
      unclassified,
      "add it to PROFILE_OWNED_KEYS, or to SHARED_KEYS with a reason").toEqual([]);
  });

  it("claims nothing that is not in the document", () => {
    for (const key of PROFILE_OWNED_KEYS) expect(EMPTY_DATA).toHaveProperty(key);
    for (const key of Object.keys(SHARED_KEYS)) expect(EMPTY_DATA).toHaveProperty(key);
  });
});

describe("withoutProfile", () => {
  /** One row in every owned collection, for two profiles. */
  const doc = () => {
    const out = { ...EMPTY_DATA } as Record<string, unknown>;
    for (const key of PROFILE_OWNED_KEYS) {
      out[key] = [
        { id: `${key}-mine`, profileId: "me" },
        { id: `${key}-theirs`, profileId: "you" },
      ];
    }
    return out as unknown as AppData;
  };

  it("takes every one of that profile's collections with it", () => {
    // Walked by key rather than named, which is the point: the inline version
    // of this in the store was written for six collections and never grew.
    const left = withoutProfile(doc(), "you");
    for (const key of PROFILE_OWNED_KEYS) {
      const rows = left[key] as { id: string }[];
      expect(rows.map((r) => r.id), key).toEqual([`${key}-mine`]);
    }
  });

  it("leaves the other profile untouched", () => {
    const left = withoutProfile(doc(), "nobody");
    for (const key of PROFILE_OWNED_KEYS) {
      expect((left[key] as unknown[]).length, key).toBe(2);
    }
  });
});

describe("isOrphaned", () => {
  it("is true for a row with no owner", () => {
    expect(isOrphaned({}, ["me"])).toBe(true);
  });

  it("is true for a row whose owner has been deleted", () => {
    expect(isOrphaned({ profileId: "gone" }, ["me"])).toBe(true);
  });

  it("is false for a row a live profile owns", () => {
    expect(isOrphaned({ profileId: "me" }, ["me", "you"])).toBe(false);
  });
});

describe("the migration adopts what a deleted profile left behind", () => {
  /*
   * Reported from use: bottles of water entered under a second profile stayed
   * in the file after that profile was deleted, owned by an id nothing answers
   * to, and every screen filters by profile, so they were nowhere on screen.
   */
  const stranded = {
    version: 8,
    profiles: [{ ...DEFAULT_PROFILE, id: "me" }],
    activeProfileId: "me",
    logs: [],
    diluents: [{ id: "b1", profileId: "deleted", kind: "bacteriostatic", volumeMl: 30, state: "open" }],
    orders: [{ id: "o1", profileId: "deleted", shippingCost: 12, placedAt: 0 }],
    vials: [{ id: "v1", profileId: "deleted", peptideId: "klow", strengthMg: 10, state: "sealed" }],
  } as unknown as Parameters<typeof migrateAppData>[0];

  it("gives them to the profile that exists rather than dropping them", () => {
    const out = migrateAppData(stranded);
    expect(out.diluents.map((b) => b.profileId)).toEqual(["me"]);
    expect(out.orders.map((o) => o.profileId)).toEqual(["me"]);
    expect(out.vials.map((v) => v.profileId)).toEqual(["me"]);
  });

  it("still leaves a row alone when its owner is real", () => {
    const two = {
      ...(stranded as object),
      profiles: [{ ...DEFAULT_PROFILE, id: "me" }, { ...DEFAULT_PROFILE, id: "you" }],
      diluents: [{ id: "b1", profileId: "you", kind: "bacteriostatic", volumeMl: 30, state: "open" }],
    } as unknown as Parameters<typeof migrateAppData>[0];
    expect(migrateAppData(two).diluents[0].profileId).toBe("you");
  });
});
