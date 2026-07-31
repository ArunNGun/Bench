import { describe, expect, it } from "vitest";
import { DEFAULT_PROFILE, DEFAULT_PROFILE_ID, PROFILE_TONES } from "../types";
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
