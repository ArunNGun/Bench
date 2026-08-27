import { describe, expect, it } from "vitest";
import {
  daysOfSupply,
  daysOfSupplyForProtocol,
  groupSealedVials,
  supplyOutlook,
  drawFromVial,
  pickVialForDose,
  reconcileVials,
  returnToVial,
  stockFor,
  vialCapacityMcg,
  vialConcentration,
  vialExpired,
  vialFractionRemaining,
  vialRemainingMcg,
  vialRemainingMl,
  vialUsable,
} from "./inventory";
import { totalSpend } from "./cost";
import type { Protocol, ProtocolPhase, Vial } from "../types";

const NOW = Date.UTC(2026, 6, 29, 12, 0, 0);
const DAY = 86_400_000;

const vial = (over: Partial<Vial> & { id: string }): Vial => ({
  profileId: "me",
  peptideId: "klow",
  strengthMg: 80,
  state: "sealed", ...over,
});

describe("vial mass arithmetic", () => {
  it("reads capacity from the label strength", () => {
    expect(vialCapacityMcg({ strengthMg: 80 })).toBe(80_000);
    expect(vialCapacityMcg({ strengthMg: 2.5 })).toBe(2500);
  });

  it("treats an untouched vial as completely full", () => {
    const v = vial({ id: "a" });
    expect(vialRemainingMcg(v)).toBe(80_000);
    expect(vialFractionRemaining(v)).toBe(1);
  });

  it("subtracts what has been drawn", () => {
    const v = vial({ id: "a", drawnMcg: 20_000 });
    expect(vialRemainingMcg(v)).toBe(60_000);
    expect(vialFractionRemaining(v)).toBeCloseTo(0.75, 12);
  });

  it("never reports a negative remainder", () => {
    expect(vialRemainingMcg(vial({ id: "a", drawnMcg: 999_999 }))).toBe(0);
    expect(vialFractionRemaining(vial({ id: "a", drawnMcg: 999_999 }))).toBe(0);
  });

  it("derives volume only once reconstituted", () => {
    expect(vialRemainingMl(vial({ id: "a" }))).toBe(0);
    const open = vial({ id: "a", state: "reconstituted", diluentMl: 4, drawnMcg: 20_000 });
    expect(vialConcentration(open)).toBe(20_000);
    expect(vialRemainingMl(open)).toBeCloseTo(3, 12);
  });
});

describe("vialUsable", () => {
  it("accepts a sealed vial with nothing drawn", () => {
    expect(vialUsable(vial({ id: "a" }), NOW)).toBe(true);
  });

  it("rejects finished and discarded vials", () => {
    expect(vialUsable(vial({ id: "a", state: "finished" }), NOW)).toBe(false);
    expect(vialUsable(vial({ id: "a", state: "discarded" }), NOW)).toBe(false);
  });

  it("rejects an empty vial even if still marked open", () => {
    expect(vialUsable(vial({ id: "a", state: "reconstituted", drawnMcg: 80_000 }), NOW)).toBe(false);
  });

  it("rejects a vial past its beyond-use date", () => {
    const v = vial({ id: "a", state: "reconstituted", diluentMl: 4, budAt: NOW - DAY });
    expect(vialExpired(v, NOW)).toBe(true);
    expect(vialUsable(v, NOW)).toBe(false);
  });

  it("rejects a sealed vial past the manufacturer date", () => {
    expect(vialUsable(vial({ id: "a", expiresAt: NOW - DAY }), NOW)).toBe(false);
  });
});

describe("pickVialForDose", () => {
  it("returns nothing when there is no stock", () => {
    expect(pickVialForDose([], "klow", 4000, NOW)).toBeNull();
  });

  it("ignores vials for a different peptide", () => {
    const v = [vial({ id: "a", peptideId: "bpc-157" })];
    expect(pickVialForDose(v, "klow", 4000, NOW)).toBeNull();
  });

  it("prefers an open vial over breaking into a sealed one", () => {
    const vials = [
      vial({ id: "sealed" }),
      vial({ id: "open", state: "reconstituted", diluentMl: 4, budAt: NOW + 20 * DAY }),
    ];
    expect(pickVialForDose(vials, "klow", 4000, NOW)?.id).toBe("open");
  });

  it("falls back to a sealed vial when nothing is open", () => {
    expect(pickVialForDose([vial({ id: "sealed" })], "klow", 4000, NOW)?.id).toBe("sealed");
  });

  it("uses the open vial that expires soonest", () => {
    const vials = [
      vial({ id: "later", state: "reconstituted", diluentMl: 4, budAt: NOW + 20 * DAY }),
      vial({ id: "sooner", state: "reconstituted", diluentMl: 4, budAt: NOW + 3 * DAY }),
    ];
    expect(pickVialForDose(vials, "klow", 4000, NOW)?.id).toBe("sooner");
  });

  it("prefers an open vial that can cover the whole dose", () => {
    const vials = [
      // Expires sooner but only has 1 mg left.
      vial({ id: "nearly-empty", state: "reconstituted", diluentMl: 4, drawnMcg: 79_000, budAt: NOW + 2 * DAY }),
      vial({ id: "full", state: "reconstituted", diluentMl: 4, budAt: NOW + 10 * DAY }),
    ];
    expect(pickVialForDose(vials, "klow", 4000, NOW)?.id).toBe("full");
  });

  it("uses up a partial vial rather than opening a new one when nothing else is open", () => {
    const vials = [
      vial({ id: "nearly-empty", state: "reconstituted", diluentMl: 4, drawnMcg: 79_000 }),
      vial({ id: "sealed" }),
    ];
    expect(pickVialForDose(vials, "klow", 4000, NOW)?.id).toBe("nearly-empty");
  });

  it("skips an expired open vial and reaches for the sealed one", () => {
    const vials = [
      vial({ id: "expired", state: "reconstituted", diluentMl: 4, budAt: NOW - DAY }),
      vial({ id: "sealed" }),
    ];
    expect(pickVialForDose(vials, "klow", 4000, NOW)?.id).toBe("sealed");
  });
});

describe("drawFromVial", () => {
  it("subtracts the dose mass", () => {
    const out = drawFromVial([vial({ id: "a" })], "a", 4000);
    expect(out[0].drawnMcg).toBe(4000);
    expect(vialRemainingMcg(out[0])).toBe(76_000);
  });

  it("accumulates across repeated draws", () => {
    let vials = [vial({ id: "a" })];
    for (let i = 0; i < 4; i++) vials = drawFromVial(vials, "a", 4000);
    expect(vials[0].drawnMcg).toBe(16_000);
    expect(vialRemainingMcg(vials[0])).toBe(64_000);
  });

  it("marks the vial finished once it is empty", () => {
    const out = drawFromVial([vial({ id: "a", strengthMg: 10, drawnMcg: 9500 })], "a", 500);
    expect(out[0].state).toBe("finished");
    expect(vialRemainingMcg(out[0])).toBe(0);
  });

  it("never draws past empty", () => {
    const out = drawFromVial([vial({ id: "a", strengthMg: 10 })], "a", 999_999);
    expect(out[0].drawnMcg).toBe(10_000);
    expect(vialRemainingMcg(out[0])).toBe(0);
  });

  it("leaves other vials alone and does not mutate the input", () => {
    const input = [vial({ id: "a" }), vial({ id: "b" })];
    const out = drawFromVial(input, "a", 4000);
    expect(out[1].drawnMcg).toBeUndefined();
    expect(input[0].drawnMcg).toBeUndefined();
  });

  it("ignores a zero or negative draw", () => {
    const input = [vial({ id: "a" })];
    expect(drawFromVial(input, "a", 0)).toBe(input);
  });
});

describe("returnToVial", () => {
  it("puts the mass back", () => {
    const out = returnToVial([vial({ id: "a", drawnMcg: 8000 })], "a", 4000);
    expect(out[0].drawnMcg).toBe(4000);
  });

  it("reopens a vial that had been auto-finished", () => {
    const out = returnToVial(
      [vial({ id: "a", strengthMg: 10, drawnMcg: 10_000, state: "finished", diluentMl: 2 })],
      "a",
      500);
    expect(out[0].state).toBe("reconstituted");
  });

  it("reopens an unreconstituted vial as sealed", () => {
    const out = returnToVial(
      [vial({ id: "a", strengthMg: 10, drawnMcg: 10_000, state: "finished" })],
      "a",
      500);
    expect(out[0].state).toBe("sealed");
  });

  it("never goes below zero drawn", () => {
    const out = returnToVial([vial({ id: "a", drawnMcg: 1000 })], "a", 9999);
    expect(out[0].drawnMcg).toBe(0);
  });

  it("round-trips a draw exactly", () => {
    const start = [vial({ id: "a", strengthMg: 10, state: "reconstituted", diluentMl: 2 })];
    const after = returnToVial(drawFromVial(start, "a", 2500), "a", 2500);
    expect(after[0].drawnMcg).toBe(0);
    expect(after[0].state).toBe("reconstituted");
  });
});

describe("stockFor", () => {
  it("is empty when nothing is held", () => {
    const s = stockFor([], "klow", 4000, NOW);
    expect(s.dosesRemaining).toBe(0);
    expect(s.needsReconstitution).toBe(false);
  });

  it("counts sealed vials at full strength", () => {
    // The reported case: two sealed 80 mg vials at a 4 mg dose.
    const vials = [vial({ id: "a" }), vial({ id: "b" })];
    const s = stockFor(vials, "klow", 4000, NOW);
    expect(s.availableMcg).toBe(160_000);
    expect(s.dosesRemaining).toBe(40);
    expect(s.sealedCount).toBe(2);
    expect(s.needsReconstitution).toBe(true);
  });

  it("drops by one dose for every dose drawn, the bug that was reported", () => {
    let vials: Vial[] = [vial({ id: "a" }), vial({ id: "b" })];
    expect(stockFor(vials, "klow", 4000, NOW).dosesRemaining).toBe(40);

    for (let i = 0; i < 4; i++) {
      const target = pickVialForDose(vials, "klow", 4000, NOW)!;
      vials = drawFromVial(vials, target.id, 4000);
    }

    expect(stockFor(vials, "klow", 4000, NOW).dosesRemaining).toBe(36);
  });

  it("empties one vial then moves on to the next", () => {
    let vials: Vial[] = [
      vial({ id: "a", strengthMg: 10, state: "reconstituted", diluentMl: 2 }),
      vial({ id: "b", strengthMg: 10 }),
    ];
    // Ten 1 mg doses exactly empties the open vial.
    for (let i = 0; i < 10; i++) {
      const target = pickVialForDose(vials, "klow", 1000, NOW)!;
      vials = drawFromVial(vials, target.id, 1000);
    }
    expect(vials.find((v) => v.id === "a")!.state).toBe("finished");
    expect(stockFor(vials, "klow", 1000, NOW).dosesRemaining).toBe(10);

    // The next dose has to come from the sealed one.
    expect(pickVialForDose(vials, "klow", 1000, NOW)!.id).toBe("b");
  });

  it("separates what is open from what is still sealed", () => {
    const vials = [
      vial({ id: "open", state: "reconstituted", diluentMl: 4, drawnMcg: 40_000 }),
      vial({ id: "sealed" }),
    ];
    const s = stockFor(vials, "klow", 4000, NOW);
    expect(s.dosesInOpenVials).toBe(10);
    expect(s.dosesRemaining).toBe(30);
    expect(s.needsReconstitution).toBe(false);
  });

  it("excludes expired and finished vials from the count", () => {
    const vials = [
      vial({ id: "good" }),
      vial({ id: "expired", state: "reconstituted", diluentMl: 4, budAt: NOW - DAY }),
      vial({ id: "done", state: "finished" }),
    ];
    expect(stockFor(vials, "klow", 4000, NOW).dosesRemaining).toBe(20);
  });

  it("rounds down to whole doses", () => {
    const vials = [vial({ id: "a", strengthMg: 10 })];
    expect(stockFor(vials, "klow", 3000, NOW).dosesRemaining).toBe(3);
  });

  it("returns zero doses rather than dividing by zero", () => {
    expect(stockFor([vial({ id: "a" })], "klow", 0, NOW).dosesRemaining).toBe(0);
  });
});

describe("daysOfSupply", () => {
  it("converts doses into days at the protocol's rate", () => {
    const s = stockFor([vial({ id: "a", strengthMg: 80 })], "klow", 4000, NOW);
    expect(s.dosesRemaining).toBe(20);
    expect(daysOfSupply(s, 7)).toBeCloseTo(20, 10);
    expect(daysOfSupply(s, 1)).toBeCloseTo(140, 10);
  });

  it("has no answer for an as-needed protocol", () => {
    expect(daysOfSupply(stockFor([], "klow", 4000, NOW), 0)).toBeNull();
  });
});

describe("reconcileVials, editing a logged dose", () => {
  const open = (id: string, drawnMcg = 0) =>
    vial({ id, strengthMg: 10, state: "reconstituted", diluentMl: 2, drawnMcg });

  it("leaves stock alone when nothing about the consumption changed", () => {
    const v = [open("a", 2000)];
    const same = { vialId: "a", doseMcg: 500 };
    expect(reconcileVials(v, same, same)[0].drawnMcg).toBe(2000);
  });

  it("applies the difference when the dose is increased", () => {
    const v = [open("a", 2000)];
    const out = reconcileVials(v, { vialId: "a", doseMcg: 500 }, { vialId: "a", doseMcg: 750 });
    expect(out[0].drawnMcg).toBe(2250);
  });

  it("applies the difference when the dose is reduced", () => {
    const v = [open("a", 2000)];
    const out = reconcileVials(v, { vialId: "a", doseMcg: 500 }, { vialId: "a", doseMcg: 250 });
    expect(out[0].drawnMcg).toBe(1750);
  });

  it("moves the draw when the vial is changed", () => {
    const v = [open("a", 2000), open("b", 1000)];
    const out = reconcileVials(v, { vialId: "a", doseMcg: 500 }, { vialId: "b", doseMcg: 500 });
    expect(out.find((x) => x.id === "a")!.drawnMcg).toBe(1500);
    expect(out.find((x) => x.id === "b")!.drawnMcg).toBe(1500);
  });

  it("gives the mass back when a dose is marked skipped", () => {
    const v = [open("a", 2000)];
    const out = reconcileVials(
      v,
      { vialId: "a", doseMcg: 500 },
      { vialId: "a", doseMcg: 500, skipped: true });
    expect(out[0].drawnMcg).toBe(1500);
  });

  it("takes the mass back out when a skip is undone", () => {
    const v = [open("a", 1500)];
    const out = reconcileVials(
      v,
      { vialId: "a", doseMcg: 500, skipped: true },
      { vialId: "a", doseMcg: 500 });
    expect(out[0].drawnMcg).toBe(2000);
  });

  it("releases the vial when attribution is removed", () => {
    const v = [open("a", 2000)];
    const out = reconcileVials(v, { vialId: "a", doseMcg: 500 }, { doseMcg: 500 });
    expect(out[0].drawnMcg).toBe(1500);
  });

  it("claims a vial when attribution is added", () => {
    const v = [open("a", 2000)];
    const out = reconcileVials(v, { doseMcg: 500 }, { vialId: "a", doseMcg: 500 });
    expect(out[0].drawnMcg).toBe(2500);
  });

  it("handles creation and deletion as one-sided reconciliations", () => {
    const v = [open("a", 2000)];
    expect(reconcileVials(v, null, { vialId: "a", doseMcg: 500 })[0].drawnMcg).toBe(2500);
    expect(reconcileVials(v, { vialId: "a", doseMcg: 500 }, null)[0].drawnMcg).toBe(1500);
  });

  it("reopens a vial that an edit takes back below empty", () => {
    const v = [vial({ id: "a", strengthMg: 10, state: "finished", diluentMl: 2, drawnMcg: 10_000 })];
    const out = reconcileVials(v, { vialId: "a", doseMcg: 2000 }, { vialId: "a", doseMcg: 500 });
    expect(out[0].drawnMcg).toBe(8500);
    expect(out[0].state).toBe("reconstituted");
  });

  it("finishes a vial that an edit empties", () => {
    const v = [open("a", 9000)];
    const out = reconcileVials(v, { vialId: "a", doseMcg: 500 }, { vialId: "a", doseMcg: 1500 });
    expect(out[0].drawnMcg).toBe(10_000);
    expect(out[0].state).toBe("finished");
  });

  it("never lets an edit push a vial below zero", () => {
    const v = [open("a", 100)];
    const out = reconcileVials(v, { vialId: "a", doseMcg: 9999 }, null);
    expect(out[0].drawnMcg).toBe(0);
  });

  it("round-trips: an edit and its reverse restore the original", () => {
    const start = [open("a", 3000), open("b", 500)];
    const edited = reconcileVials(start, { vialId: "a", doseMcg: 500 }, { vialId: "b", doseMcg: 750 });
    const back = reconcileVials(edited, { vialId: "b", doseMcg: 750 }, { vialId: "a", doseMcg: 500 });
    expect(back.find((x) => x.id === "a")!.drawnMcg).toBe(3000);
    expect(back.find((x) => x.id === "b")!.drawnMcg).toBe(500);
  });

  it("keeps total stock conserved when a dose moves between vials", () => {
    const start = [open("a", 2000), open("b", 1000)];
    const total = (vs: typeof start) => vs.reduce((s, v) => s + vialRemainingMcg(v), 0);
    const before = total(start);
    const out = reconcileVials(start, { vialId: "a", doseMcg: 500 }, { vialId: "b", doseMcg: 500 });
    expect(total(out)).toBe(before);
  });
});

describe("daysOfSupplyForProtocol", () => {
  /** A Monday, so weekly dosing lands on the same weekday throughout. */
  const start = new Date(2026, 0, 5, 9, 0, 0, 0).getTime();

  const protocol = (over: Partial<Protocol> = {}): Protocol => ({
    id: "p1",
    profileId: "me",
    peptideId: "klow",
    name: "Test",
    active: true,
    startedAt: start,
    doseMcg: 1000,
    route: "subcutaneous",
    schedule: { kind: "interval-days", intervalDays: 7, timeOfDay: "09:00" },
    titrationAutoAdvance: false, ...over,
  });

  /** Stock is the only field the calculation reads. */
  const stockOf = (availableMcg: number) => ({
    availableMcg,
    sealedCount: 1,
    openCount: 0,
    dosesRemaining: 0,
    dosesInOpenVials: 0,
    needsReconstitution: false,
  });

  it("agrees with the flat calculation when the dose never changes", () => {
    // 10 weekly doses of 1000 mcg, so the eleventh is the one that cannot be
    // paid for, 70 days out.
    //
    // Rounded, because the answer is a count of elapsed hours and a window that
    // crosses a daylight-saving change contains one fewer of them. In
    // America/New_York this lands on 69.96 rather than 70. Doses hold their
    // wall-clock time, which is the behaviour wanted, and a "days left" figure
    // shown as "about 70 d" has no use for the hour either way.
    const days = daysOfSupplyForProtocol(stockOf(10_000), protocol(), start);
    expect(Math.round(days!)).toBe(70);
  });

  it("spends the stock faster once the plan steps up", () => {
    const ladder: ProtocolPhase[] = [
      { step: 1, doseMcg: 1000, weeks: 4 },
      { step: 2, doseMcg: 2000, weeks: 4 },
    ];
    // 4 doses at 1 mg is 4000, leaving 6000 for 2 mg doses, which is 3 of them.
    // The seventh dose falls at day 49 and cannot be paid for.
    const days = daysOfSupplyForProtocol(stockOf(10_000), protocol({ phases: ladder }), start);
    expect(Math.round(days!)).toBe(49);
  });

  it("is shorter than the flat figure for a rising plan, which is the point", () => {
    const ladder: ProtocolPhase[] = [
      { step: 1, doseMcg: 1000, weeks: 4 },
      { step: 2, doseMcg: 2000, weeks: 4 },
    ];
    const flat = daysOfSupplyForProtocol(stockOf(10_000), protocol(), start)!;
    const stepped = daysOfSupplyForProtocol(stockOf(10_000), protocol({ phases: ladder }), start)!;
    expect(stepped).toBeLessThan(flat);
  });

  it("has no answer for an as-needed protocol", () => {
    const p = protocol({ schedule: { kind: "as-needed" } });
    expect(daysOfSupplyForProtocol(stockOf(10_000), p, start)).toBeNull();
  });

  it("runs out immediately when nothing is left", () => {
    expect(daysOfSupplyForProtocol(stockOf(0), protocol(), start)).toBeCloseTo(0, 5);
  });

  it("caps rather than walking to the end of time on a deep stock", () => {
    expect(daysOfSupplyForProtocol(stockOf(10_000_000), protocol(), start, 365)).toBe(365);
  });
});

describe("supplyOutlook", () => {
  /** A Monday, so weekly dosing lands on the same weekday throughout. */
  const start = new Date(2026, 0, 5, 9, 0, 0, 0).getTime();

  const protocol = (over: Partial<Protocol> = {}): Protocol => ({
    id: "p1",
    profileId: "me",
    peptideId: "klow",
    name: "Test",
    active: true,
    startedAt: start,
    doseMcg: 1000,
    route: "subcutaneous",
    schedule: { kind: "interval-days", intervalDays: 7, timeOfDay: "09:00" },
    titrationAutoAdvance: false, ...over,
  });

  const stockOf = (availableMcg: number) => ({
    availableMcg,
    sealedCount: 1,
    openCount: 0,
    dosesRemaining: 0,
    dosesInOpenVials: 0,
    needsReconstitution: false,
  });

  it("gives the date the stock is spent", () => {
    // The same ten weekly doses as above, so the answer is the same instant the
    // day count describes, seventy days out.
    const out = supplyOutlook(stockOf(10_000), protocol(), start);
    expect(out.kind).toBe("runs-out");
    if (out.kind !== "runs-out") return;
    expect(Math.round((out.at - start) / 86_400_000)).toBe(70);
  });

  it("agrees exactly with the day count it is derived from", () => {
    // A date that disagreed with the figure on the Today screen would be worse
    // than no date at all.
    const days = daysOfSupplyForProtocol(stockOf(10_000), protocol(), start, 365)!;
    const out = supplyOutlook(stockOf(10_000), protocol(), start);
    if (out.kind !== "runs-out") throw new Error("expected a date");
    expect(out.at).toBeCloseTo(start + days * 86_400_000, 3);
  });

  it("says beyond the horizon rather than inventing a distant date", () => {
    // The dangerous case: the walk returns the horizon itself, which reads as a
    // real answer and is not one.
    expect(supplyOutlook(stockOf(10_000_000), protocol(), start).kind).toBe("beyond-horizon");
  });

  it("knows nothing when there is no schedule to spend against", () => {
    const p = protocol({ schedule: { kind: "as-needed" } });
    expect(supplyOutlook(stockOf(10_000), p, start).kind).toBe("unknown");
  });

  it("knows nothing when there is no stock", () => {
    // Distinct from running out today. There is nothing to make a claim about,
    // and "runs out now" on an empty shelf is noise on every empty compound.
    expect(supplyOutlook(stockOf(0), protocol(), start).kind).toBe("unknown");
  });

  it("brings the date forward when the plan steps up", () => {
    const ladder: ProtocolPhase[] = [
      { step: 1, doseMcg: 1000, weeks: 4 },
      { step: 2, doseMcg: 2000, weeks: 4 },
    ];
    const flat = supplyOutlook(stockOf(10_000), protocol(), start);
    const stepped = supplyOutlook(stockOf(10_000), protocol({ phases: ladder }), start);
    if (flat.kind !== "runs-out" || stepped.kind !== "runs-out") throw new Error("expected dates");
    expect(stepped.at).toBeLessThan(flat.at);
  });
});

describe("vials on order", () => {
  /*
   * The rule this whole state exists for: paid for, not here, and therefore
   * counted in what you have spent and in nothing else. An app that says three
   * weeks of stock remain when half of it is with a courier is worse than one
   * that says nothing.
   */
  const ordered = vial({ id: "post", state: "on-order", strengthMg: 10, cost: 40 });
  const here = vial({ id: "fridge", state: "sealed", strengthMg: 10, cost: 40 });

  it("cannot supply a dose", () => {
    expect(vialUsable(ordered, NOW)).toBe(false);
    expect(vialUsable(here, NOW)).toBe(true);
  });

  it("is never reached for by pickVialForDose", () => {
    expect(pickVialForDose([ordered], "klow", 1000, NOW)).toBeNull();
    expect(pickVialForDose([ordered, here], "klow", 1000, NOW)?.id).toBe("fridge");
  });

  it("adds nothing to available mass or dose count", () => {
    const withoutIt = stockFor([here], "klow", 1000, NOW);
    const withIt = stockFor([here, ordered], "klow", 1000, NOW);
    expect(withIt.availableMcg).toBe(withoutIt.availableMcg);
    expect(withIt.dosesRemaining).toBe(withoutIt.dosesRemaining);
    expect(withIt.sealedCount).toBe(withoutIt.sealedCount);
  });

  it("does not make an empty shelf look stocked", () => {
    const stock = stockFor([ordered], "klow", 1000, NOW);
    expect(stock.availableMcg).toBe(0);
    expect(stock.dosesRemaining).toBe(0);
    // Nothing to reconstitute either, so the prompt to do so must stay away.
    expect(stock.needsReconstitution).toBe(false);
  });

  it("still counts towards what has been spent", () => {
    // The money has gone, whatever the courier is doing.
    expect(totalSpend([here, ordered]).total).toBe(80);
    expect(totalSpend([here, ordered]).pricedVials).toBe(2);
  });

  it("is not grouped with the sealed vials on the shelf", () => {
    // Same compound and strength, different question. One you can open today.
    const groups = groupSealedVials([here, ordered]);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(1);
    expect(groups[0].vials[0].id).toBe("fridge");
  });

  it("becomes ordinary stock the moment it is marked arrived", () => {
    const arrived = { ...ordered, state: "sealed" as const };
    expect(vialUsable(arrived, NOW)).toBe(true);
    expect(stockFor([arrived], "klow", 1000, NOW).availableMcg).toBe(10_000);
  });
});
