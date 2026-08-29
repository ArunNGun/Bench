import { describe, expect, it } from "vitest";
import { DATA_VERSION, looksLikeAppData, migrateAppData, type StoredData } from "./migrate";
import { DEFAULT_SETTINGS, EMPTY_DATA } from "./types";

const NOW = Date.UTC(2026, 6, 31, 12);

/**
 * Payloads as each historical version actually wrote them.
 *
 * Written out in full rather than derived from the current types, because the
 * point is to test against what old builds really produced, a fixture generated
 * from today's types would quietly acquire tomorrow's fields and test nothing.
 */

/** v1: no profiles, no measurements, vial consumption as a volume. */
const V1: StoredData = {
  version: 1,
  protocols: [
    {
      id: "p1",
      peptideId: "bpc-157",
      name: "BPC daily",
      active: true,
      startedAt: NOW - 60 * 86_400_000,
      doseMcg: 500,
      route: "subcutaneous",
      schedule: { kind: "daily" },
      titrationAutoAdvance: false,
    },
  ] as StoredData["protocols"],
  logs: [
    { id: "l1", peptideId: "bpc-157", at: NOW - 86_400_000, doseMcg: 500, route: "subcutaneous", vialId: "v1" },
    { id: "l2", peptideId: "bpc-157", at: NOW - 2 * 86_400_000, doseMcg: 500, route: "subcutaneous", vialId: "v1" },
  ] as StoredData["logs"],
  vials: [
    // 5 mg in 2 mL = 2500 mcg/mL. 0.4 mL drawn = 1000 mcg.
    { id: "v1", peptideId: "bpc-157", strengthMg: 5, state: "reconstituted", diluentMl: 2, drawnMl: 0.4 },
  ] as StoredData["vials"],
  settings: { doseUnit: "mcg", budWarningDays: 5 } as StoredData["settings"],
};

/** v2: mass-based vials arrived, profiles had not. */
const V2: StoredData = {
  version: 2,
  protocols: V1.protocols,
  logs: V1.logs,
  vials: [
    { id: "v1", peptideId: "bpc-157", strengthMg: 5, state: "reconstituted", diluentMl: 2, drawnMcg: 1000 },
  ] as StoredData["vials"],
  settings: V1.settings,
};

/** v3: profiles exist and everything is owned. */
const V3: StoredData = {
  version: 3,
  profiles: [{ id: "arun", name: "Arun", tone: "grape", createdAt: NOW - 90 * 86_400_000 }],
  activeProfileId: "arun",
  protocols: (V1.protocols ?? []).map((p) => ({ ...p, profileId: "arun" })),
  logs: (V1.logs ?? []).map((l) => ({ ...l, profileId: "arun" })),
  vials: (V2.vials ?? []).map((v) => ({ ...v, profileId: "arun" })),
  settings: V1.settings,
};

/** v4: measurements arrived; labs had not. */
const V4: StoredData = {
  ...V3,
  version: 4,
  measurements: [{ id: "m1", profileId: "arun", at: NOW - 5 * 86_400_000, weightKg: 88.2 }],
};

describe("nothing is ever lost", () => {
  const cases: [string, StoredData][] = [
    ["v1", V1],
    ["v2", V2],
    ["v3", V3],
    ["v4", V4],
  ];

  for (const [label, payload] of cases) {
    it(`keeps every protocol, dose and vial from ${label}`, () => {
      const out = migrateAppData(payload);
      expect(out.protocols).toHaveLength(payload.protocols!.length);
      expect(out.logs).toHaveLength(payload.logs!.length);
      expect(out.vials).toHaveLength(payload.vials!.length);
      expect(out.version).toBe(DATA_VERSION);
    });

    it(`leaves nothing from ${label} invisible, every row has an owner`, () => {
      // The real failure mode: a row with no profileId is filtered out of every
      // screen, so it survives the migration and still cannot be seen.
      const out = migrateAppData(payload);
      const owner = out.activeProfileId;
      expect(out.profiles.some((p) => p.id === owner)).toBe(true);

      for (const row of [...out.protocols, ...out.logs, ...out.vials, ...out.measurements, ...out.labs]) {
        expect(row.profileId, JSON.stringify(row)).toBeTruthy();
        expect(out.profiles.some((p) => p.id === row.profileId)).toBe(true);
      }
    });
  }
});

describe("v1 to v2: volume becomes mass", () => {
  it("converts drawn volume using the vial's own concentration", () => {
    // 5 mg in 2 mL is 2500 mcg/mL; 0.4 mL drawn is 1000 mcg.
    const out = migrateAppData(V1);
    expect(out.vials[0].drawnMcg).toBe(1000);
  });

  it("never lets a conversion exceed what the vial held", () => {
    const overdrawn = {
      ...V1,
      vials: [{ id: "v1", peptideId: "bpc-157", strengthMg: 5, state: "reconstituted", diluentMl: 2, drawnMl: 99 }],
    } as StoredData;
    expect(migrateAppData(overdrawn).vials[0].drawnMcg).toBe(5000);
  });

  it("rebuilds consumption from the dose history when no volume was recorded", () => {
    // A sealed vial never had a volume, which is exactly why v1 under-counted.
    const sealed = {
      ...V1,
      vials: [{ id: "v1", peptideId: "bpc-157", strengthMg: 5, state: "sealed" }],
    } as StoredData;
    // Two 500 mcg doses were logged against it.
    expect(migrateAppData(sealed).vials[0].drawnMcg).toBe(1000);
  });

  it("leaves an already-converted vial alone", () => {
    expect(migrateAppData(V2).vials[0].drawnMcg).toBe(1000);
  });

  it("ignores skipped doses when rebuilding consumption", () => {
    const withSkip = {
      ...V1,
      logs: [...(V1.logs ?? []), { id: "l3", peptideId: "bpc-157", at: NOW, doseMcg: 500, route: "subcutaneous", vialId: "v1", skipped: true }],
      vials: [{ id: "v1", peptideId: "bpc-157", strengthMg: 5, state: "sealed" }],
    } as StoredData;
    expect(migrateAppData(withSkip).vials[0].drawnMcg).toBe(1000);
  });
});

describe("v2 to v3: an owner for everything", () => {
  it("adopts ownerless data into a default profile", () => {
    const out = migrateAppData(V2);
    expect(out.profiles).toHaveLength(1);
    expect(out.logs.every((l) => l.profileId === out.activeProfileId)).toBe(true);
  });

  it("keeps an existing profile rather than replacing it", () => {
    const out = migrateAppData(V3);
    expect(out.activeProfileId).toBe("arun");
    expect(out.profiles[0].name).toBe("Arun");
  });

  it("repairs an activeProfileId pointing at a profile that is gone", () => {
    // Otherwise every screen filters against an id nothing matches, and the app
    // looks empty despite the data being right there.
    const orphaned = { ...V3, activeProfileId: "deleted-profile" } as StoredData;
    const out = migrateAppData(orphaned);
    expect(out.activeProfileId).toBe("arun");
    expect(out.logs.every((l) => out.profiles.some((p) => p.id === l.profileId))).toBe(true);
  });
});

describe("v4 and v5: fields that did not exist yet", () => {
  it("gives older data empty collections rather than undefined", () => {
    const out = migrateAppData(V1);
    expect(out.measurements).toEqual([]);
    expect(out.labs).toEqual([]);
    expect(out.customPeptides).toEqual([]);
  });

  it("keeps measurements that already existed", () => {
    expect(migrateAppData(V4).measurements).toHaveLength(1);
    expect(migrateAppData(V4).measurements[0].weightKg).toBe(88.2);
  });

  it("fills settings added since, without discarding what was set", () => {
    const out = migrateAppData(V1);
    expect(out.settings.budWarningDays).toBe(5);
    expect(out.settings.currency).toBe(DEFAULT_SETTINGS.currency);
    expect(out.settings.backupKeep).toBe(DEFAULT_SETTINGS.backupKeep);
  });
});

describe("robustness", () => {
  it("is idempotent, migrating twice changes nothing", () => {
    const once = migrateAppData(V1);
    const twice = migrateAppData(once);
    expect(twice).toEqual(once);
  });

  it("leaves current data untouched", () => {
    const current = migrateAppData(V4);
    expect(migrateAppData(current)).toEqual(current);
  });

  it("survives a payload with nothing in it", () => {
    for (const junk of [null, undefined, {}, "nonsense" as unknown as StoredData]) {
      const out = migrateAppData(junk as StoredData);
      expect(out.version).toBe(DATA_VERSION);
      expect(out.profiles.length).toBeGreaterThan(0);
      expect(out.logs).toEqual([]);
    }
  });

  it("does not trust a version stamp that lies", () => {
    // A hand-edited export claiming to be current, but still shaped like v1.
    const lying = { ...V1, version: DATA_VERSION } as StoredData;
    const out = migrateAppData(lying);
    expect(out.vials[0].drawnMcg).toBe(1000);
    expect(out.logs.every((l) => l.profileId)).toBe(true);
  });

  it("sorts history newest first, as the app expects", () => {
    const out = migrateAppData(V1);
    expect(out.logs[0].at).toBeGreaterThan(out.logs[1].at);
  });
});

describe("looksLikeAppData", () => {
  it("accepts every historical export, including the oldest", () => {
    for (const p of [V1, V2, V3, V4]) expect(looksLikeAppData(p)).toBe(true);
  });

  it("rejects anything else", () => {
    for (const junk of [null, undefined, {}, [], "x", 5, { logs: [] }]) {
      expect(looksLikeAppData(junk)).toBe(false);
    }
  });
});

describe("the version stamp never lies", () => {
  /**
   * Two real backups were found on a device stamped "version 1" while holding
   * version 5 data. EMPTY_DATA hard-coded 1, resetAll restored it, and
   * exportData wrote whatever the store said. A future migration that trusted
   * that number would have run v1 conversions over v5 data.
   */
  it("starts an empty store at the current version", () => {
    expect(EMPTY_DATA.version).toBe(DATA_VERSION);
  });

  it("produces a payload that migrates to itself", () => {
    // The definition of an honest stamp: nothing left to do.
    expect(migrateAppData(EMPTY_DATA)).toEqual(migrateAppData(migrateAppData(EMPTY_DATA)));
    expect(migrateAppData(EMPTY_DATA).version).toBe(DATA_VERSION);
  });

  it("recovers data that was mis-stamped as v1", () => {
    // The bad backups are still out there, so restoring one has to work.
    const misstamped = {
      ...migrateAppData(V4),
      version: 1,
    } as StoredData;
    const out = migrateAppData(misstamped);
    expect(out.version).toBe(DATA_VERSION);
    expect(out.logs).toHaveLength(V4.logs!.length);
    expect(out.measurements).toHaveLength(1);
    expect(out.logs.every((l) => l.profileId)).toBe(true);
  });
});

describe("v6: daily check-ins", () => {
  it("gives a v5 payload an empty check-in list rather than undefined", () => {
    // Every screen maps over this. Undefined would throw on the first render
    // for anyone restoring a backup taken before check-ins existed.
    const out = migrateAppData({ version: 5, logs: [], protocols: [] } as StoredData);
    expect(out.checkIns).toEqual([]);
    expect(out.version).toBe(DATA_VERSION);
  });

  it("adopts ownerless check-ins into the active profile", () => {
    // Present but invisible is the failure mode this whole module exists for.
    const out = migrateAppData({
      logs: [],
      protocols: [],
      checkIns: [{ id: "c1", at: Date.UTC(2026, 5, 1), ratings: { energy: 4 } }],
    } as unknown as StoredData);
    expect(out.checkIns[0].profileId).toBe(out.activeProfileId);
  });

  it("collapses two entries for one day, keeping the newer", () => {
    const day = new Date(2026, 5, 1, 0, 0).getTime();
    const out = migrateAppData({
      logs: [],
      protocols: [],
      checkIns: [
        { id: "morning", profileId: "me", at: day + 3_600_000, ratings: { energy: 2 } },
        { id: "evening", profileId: "me", at: day + 20 * 3_600_000, ratings: { energy: 5 } },
      ],
    } as unknown as StoredData);
    expect(out.checkIns).toHaveLength(1);
    expect(out.checkIns[0].ratings.energy).toBe(5);
  });

  it("normalises the timestamp to the start of the local day", () => {
    const out = migrateAppData({
      logs: [],
      protocols: [],
      checkIns: [
        { id: "c", profileId: "me", at: new Date(2026, 5, 1, 22, 45).getTime(), ratings: {} },
      ],
    } as unknown as StoredData);
    expect(out.checkIns[0].at).toBe(new Date(2026, 5, 1).setHours(0, 0, 0, 0));
  });

  it("keeps two profiles' entries for the same day apart", () => {
    const day = new Date(2026, 5, 1, 9).getTime();
    const out = migrateAppData({
      logs: [],
      protocols: [],
      profiles: [
        { id: "a", name: "A", createdAt: 0 },
        { id: "b", name: "B", createdAt: 0 },
      ],
      activeProfileId: "a",
      checkIns: [
        { id: "1", profileId: "a", at: day, ratings: { energy: 1 } },
        { id: "2", profileId: "b", at: day, ratings: { energy: 5 } },
      ],
    } as unknown as StoredData);
    expect(out.checkIns).toHaveLength(2);
  });

  it("is idempotent over check-ins", () => {
    const once = migrateAppData({
      logs: [],
      protocols: [],
      checkIns: [{ id: "c", profileId: "me", at: Date.now(), ratings: { mood: 3 } }],
    } as unknown as StoredData);
    expect(migrateAppData(once)).toEqual(once);
  });
});

describe("v6 to v7: half-lives you supplied yourself", () => {
  it("gives older data an empty map rather than nothing", () => {
    const out = migrateAppData({ version: 6, logs: [] });
    expect(out.halfLifeOverrides).toEqual({});
  });

  it("carries your own figures through untouched", () => {
    const mine = { hours: 2, setAt: 1_700_000_000_000, note: "vendor sheet" };
    const out = migrateAppData({ version: 7, halfLifeOverrides: { kpv: mine } });
    expect(out.halfLifeOverrides).toEqual({ kpv: mine });
  });

  it("drops a figure that could not draw a curve", () => {
    // An imported file is not under our control. A zero or a negative would
    // reach the model and produce a flat line with no explanation.
    const out = migrateAppData({
      version: 7,
      halfLifeOverrides: {
        good: { hours: 4, setAt: 1 },
        zero: { hours: 0, setAt: 1 },
        negative: { hours: -2, setAt: 1 },
        // @ts-expect-error deliberately malformed, as an edited export would be
        text: { hours: "soon", setAt: 1 },
      },
    });
    expect(Object.keys(out.halfLifeOverrides ?? {})).toEqual(["good"]);
  });

  it("repairs a missing timestamp rather than dropping the figure", () => {
    // @ts-expect-error setAt absent, as in a hand-written file
    const out = migrateAppData({ version: 7, halfLifeOverrides: { kpv: { hours: 2 } } });
    expect(out.halfLifeOverrides?.kpv.hours).toBe(2);
    expect(out.halfLifeOverrides?.kpv.setAt).toBeGreaterThan(0);
  });

  it("stays the same when run twice", () => {
    const once = migrateAppData({ version: 6, halfLifeOverrides: { kpv: { hours: 2, setAt: 5 } } });
  });
});

describe("v6 to v7: orders, for shipping", () => {
  it("gives older data an empty list rather than nothing", () => {
    expect(migrateAppData({ version: 6, logs: [] }).orders).toEqual([]);
  });

  it("adopts an order that arrived without an owner", () => {
    // Same rule as every other record: a row with no profileId is invisible
    // once the UI filters by it, which is indistinguishable from lost.
    const out = migrateAppData({
      version: 7,
      // @ts-expect-error deliberately missing profileId, as a v6 hand edit would be
      orders: [{ id: "o1", shippingCost: 60, placedAt: 1 }],
    });
    expect(out.orders[0].profileId).toBe(out.activeProfileId);
  });

  it("drops an order that could not carry a share", () => {
    const out = migrateAppData({
      version: 7,
      orders: [
        { id: "good", profileId: "me", shippingCost: 60, placedAt: 1 },
        { id: "zero", profileId: "me", shippingCost: 0, placedAt: 1 },
        // @ts-expect-error deliberately malformed, as an edited export would be
        { id: "text", profileId: "me", shippingCost: "sixty", placedAt: 1 },
      ],
    });
    expect(out.orders.map((o) => o.id)).toEqual(["good"]);
  });

  it("stays the same when run twice", () => {
    const once = migrateAppData({
      version: 7,
      orders: [{ id: "o1", profileId: "me", shippingCost: 60, placedAt: 1 }],
    });
    expect(migrateAppData(once)).toEqual(once);
  });
});
