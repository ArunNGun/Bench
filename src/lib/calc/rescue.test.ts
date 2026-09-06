import { describe, expect, it } from "vitest";
import {
  RECORD_KEYS,
  alarmingLosses,
  countRecords,
  describeLoss,
  isAlarming,
  losses,
  recoverable,
  restoreLost,
  type Rescue,
} from "./rescue";
import { EMPTY_DATA, type AppData } from "../types";

const row = (id: string) => ({ id, profileId: "me" });

const doc = (over: Partial<AppData> = {}): AppData => ({ ...EMPTY_DATA, ...over }) as AppData;

describe("countRecords", () => {
  it("counts every collection, including the empty ones", () => {
    const counts = countRecords(doc({ logs: [row("a"), row("b")] as never }));
    expect(counts.logs).toBe(2);
    expect(counts.diluents).toBe(0);
    expect(Object.keys(counts).sort()).toEqual([...RECORD_KEYS].sort());
  });

  it("treats a missing or malformed collection as none rather than throwing", () => {
    // A document read off disk is not under our control, and this runs on every
    // write. Throwing here would take the write with it.
    expect(countRecords(null).logs).toBe(0);
    expect(countRecords({ logs: "nonsense" } as never).logs).toBe(0);
  });
});

describe("what counts as an accident", () => {
  it("catches a collection emptying itself, which is what happened twice", () => {
    // Three bottles of water to none, the exact shape of both real incidents.
    expect(isAlarming({ key: "diluents", from: 3, to: 0 })).toBe(true);
  });

  it("stays quiet for deleting one row", () => {
    expect(isAlarming({ key: "vials", from: 16, to: 15 })).toBe(false);
    expect(isAlarming({ key: "logs", from: 103, to: 102 })).toBe(false);
  });

  it("stays quiet for a handful of deletions out of many", () => {
    expect(isAlarming({ key: "logs", from: 103, to: 98 })).toBe(false);
  });

  it("catches most of a collection going at once", () => {
    expect(isAlarming({ key: "logs", from: 103, to: 40 })).toBe(true);
  });

  it("exempts a short list, where one deletion is a large fraction", () => {
    // Two protocols becoming one is half of them, and is also just a delete.
    expect(isAlarming({ key: "protocols", from: 2, to: 1 })).toBe(false);
    expect(isAlarming({ key: "protocols", from: 3, to: 2 })).toBe(false);
  });

  it("says nothing about growth, or about standing still", () => {
    expect(losses(countRecords(doc()), countRecords(doc({ logs: [row("a")] as never })))).toEqual([]);
    expect(losses({ ...countRecords(doc()) }, { ...countRecords(doc()) })).toEqual([]);
  });

  it("never alarms about a collection that was empty to begin with", () => {
    // A fresh install writes for the first time with nothing anywhere.
    expect(isAlarming({ key: "diluents", from: 0, to: 0 })).toBe(false);
    expect(alarmingLosses(countRecords(doc()), countRecords(doc()))).toEqual([]);
  });
});

describe("the incident this was written for", () => {
  const before = doc({
    logs: Array.from({ length: 91 }, (_, i) => row(`l${i}`)) as never,
    vials: Array.from({ length: 16 }, (_, i) => row(`v${i}`)) as never,
    diluents: [row("rQ_E1DyD43"), row("xtc0_viz9N"), row("YxDoMT6Fnd")] as never,
  });

  // Everything carried on normally, and only the bottles went.
  const after = doc({
    logs: Array.from({ length: 103 }, (_, i) => row(`l${i}`)) as never,
    vials: Array.from({ length: 16 }, (_, i) => row(`v${i}`)) as never,
    diluents: [],
  });

  it("is caught", () => {
    const found = alarmingLosses(countRecords(before), countRecords(after));
    expect(found).toEqual([{ key: "diluents", from: 3, to: 0 }]);
  });

  it("is described in words a person can act on", () => {
    expect(describeLoss({ key: "diluents", from: 3, to: 0 })).toBe("3 bottles of water");
    expect(describeLoss({ key: "diluents", from: 1, to: 0 })).toBe("1 bottle of water");
    expect(describeLoss({ key: "logs", from: 103, to: 40 })).toBe("63 logged doses");
  });

  it("puts the bottles back without undoing the twelve doses since", () => {
    const rescue: Rescue = {
      at: 1,
      losses: [{ key: "diluents", from: 3, to: 0 }],
      document: before,
    };
    const fixed = restoreLost(after, rescue);

    expect(fixed.diluents).toHaveLength(3);
    // The whole point of a union: the doses logged after the loss survive it.
    expect(fixed.logs).toHaveLength(103);
    expect(fixed.vials).toHaveLength(16);
  });

  it("reports what it would bring back before it does it", () => {
    const rescue: Rescue = {
      at: 1,
      losses: [{ key: "diluents", from: 3, to: 0 }],
      document: before,
    };
    expect(recoverable(after, rescue)).toEqual([{ key: "diluents", from: 0, to: 3 }]);
  });
});

describe("restoring", () => {
  const saved = doc({ diluents: [row("a"), row("b")] as never });

  it("keeps the live version of a row that exists on both sides", () => {
    // A bottle drawn down since the loss is more current in the live document
    // than in the copy taken before it.
    const live = doc({ diluents: [{ ...row("a"), drawnMl: 9 }] as never });
    const out = restoreLost(live, { at: 1, losses: [{ key: "diluents", from: 2, to: 1 }], document: saved });

    expect(out.diluents).toHaveLength(2);
    expect(out.diluents.find((b) => b.id === "a")).toMatchObject({ drawnMl: 9 });
  });

  it("touches only the collections that were lost", () => {
    const live = doc({ diluents: [], logs: [row("kept")] as never });
    const out = restoreLost(live, { at: 1, losses: [{ key: "diluents", from: 2, to: 0 }], document: doc({
      diluents: [row("a")] as never,
      logs: [row("kept"), row("gone-on-purpose")] as never,
    }) });

    expect(out.diluents).toHaveLength(1);
    // logs was not among the losses, so a row deleted deliberately stays deleted.
    expect(out.logs).toHaveLength(1);
  });

  it("does nothing when there is nothing missing", () => {
    const live = doc({ diluents: [row("a"), row("b")] as never });
    const out = restoreLost(live, { at: 1, losses: [{ key: "diluents", from: 2, to: 2 }], document: saved });
    expect(out.diluents).toHaveLength(2);
    expect(recoverable(live, { at: 1, losses: [{ key: "diluents", from: 2, to: 2 }], document: saved })).toEqual([]);
  });

  it("survives a rescue copy whose collection is not an array", () => {
    const live = doc({ diluents: [] });
    const broken = { at: 1, losses: [{ key: "diluents" as const, from: 1, to: 0 }], document: { diluents: null } as never };
    expect(() => restoreLost(live, broken)).not.toThrow();
  });

  it("ignores a saved row with no id, which cannot be matched", () => {
    const live = doc({ diluents: [] });
    const out = restoreLost(live, {
      at: 1,
      losses: [{ key: "diluents", from: 1, to: 0 }],
      document: doc({ diluents: [{ volumeMl: 3 }] as never }),
    });
    expect(out.diluents).toHaveLength(0);
  });
});

describe("the list of collections", () => {
  it("holds only things that are lists of rows", () => {
    // settings and halfLifeOverrides are neither counted nor unioned, and
    // including them would mean counting the keys of an object as records.
    expect(RECORD_KEYS).not.toContain("settings");
    expect(RECORD_KEYS).not.toContain("halfLifeOverrides");
    expect(RECORD_KEYS).not.toContain("version");
  });

  it("covers every array in the document, so a new collection cannot be forgotten", () => {
    const arrays = (Object.keys(EMPTY_DATA) as (keyof AppData)[]).filter((k) =>
      Array.isArray(EMPTY_DATA[k]));
    expect([...RECORD_KEYS].sort()).toEqual(arrays.sort());
  });
});
