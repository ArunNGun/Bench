import { describe, expect, it } from "vitest";
import {
  daysOfSupply,
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
import type { Vial } from "../types";

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
