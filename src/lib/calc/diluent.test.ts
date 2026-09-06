import { describe, expect, it } from "vitest";
import {
  bottleExpired,
  openBottle,
  bottleFractionRemaining,
  bottleRemainingMl,
  bottleUsable,
  diluentStock,
  drawFromBottle,
  pickBottle,
  returnToBottle,
  shelfOrder,
} from "./diluent";
import type { DiluentBottle } from "../types";

const NOW = Date.UTC(2026, 6, 29, 12, 0, 0);
const DAY = 86_400_000;

const bottle = (over: Partial<DiluentBottle> & { id: string }): DiluentBottle => ({
  profileId: "me",
  kind: "bacteriostatic",
  volumeMl: 30,
  state: "sealed",
  ...over,
});

describe("volume arithmetic", () => {
  it("treats an untouched bottle as full", () => {
    expect(bottleRemainingMl(bottle({ id: "a" }))).toBe(30);
    expect(bottleFractionRemaining(bottle({ id: "a" }))).toBe(1);
  });

  it("subtracts what has been drawn", () => {
    expect(bottleRemainingMl(bottle({ id: "a", drawnMl: 12 }))).toBe(18);
  });

  it("never reports a negative remainder", () => {
    expect(bottleRemainingMl(bottle({ id: "a", drawnMl: 999 }))).toBe(0);
  });
});

describe("bottleUsable", () => {
  it("accepts a sealed bottle", () => {
    expect(bottleUsable(bottle({ id: "a" }), NOW)).toBe(true);
  });

  it("rejects a finished or discarded one", () => {
    expect(bottleUsable(bottle({ id: "a", state: "finished" }), NOW)).toBe(false);
    expect(bottleUsable(bottle({ id: "a", state: "discarded" }), NOW)).toBe(false);
  });

  it("rejects an empty bottle still marked open", () => {
    expect(bottleUsable(bottle({ id: "a", state: "open", drawnMl: 30 }), NOW)).toBe(false);
  });

  it("rejects one past its beyond-use date", () => {
    const b = bottle({ id: "a", state: "open", budAt: NOW - DAY });
    expect(bottleExpired(b, NOW)).toBe(true);
    expect(bottleUsable(b, NOW)).toBe(false);
  });

  it("holds a sealed bottle to the printed date", () => {
    expect(bottleUsable(bottle({ id: "a", expiresAt: NOW - DAY }), NOW)).toBe(false);
  });
});

describe("pickBottle", () => {
  it("finds nothing when the shelf is empty", () => {
    expect(pickBottle([], "bacteriostatic", 2, NOW)).toBeNull();
  });

  it("ignores a different kind of water", () => {
    const shelf = [bottle({ id: "saline", kind: "saline" })];
    expect(pickBottle(shelf, "bacteriostatic", 2, NOW)).toBeNull();
  });

  it("finishes an open bottle before breaking a seal", () => {
    const shelf = [bottle({ id: "sealed" }), bottle({ id: "open", state: "open", drawnMl: 10 })];
    expect(pickBottle(shelf, "bacteriostatic", 2, NOW)?.id).toBe("open");
  });

  it("prefers an open bottle that can cover the whole amount", () => {
    const shelf = [
      bottle({ id: "nearly-empty", state: "open", drawnMl: 29, budAt: NOW + 2 * DAY }),
      bottle({ id: "fuller", state: "open", drawnMl: 5, budAt: NOW + 10 * DAY }),
    ];
    expect(pickBottle(shelf, "bacteriostatic", 2, NOW)?.id).toBe("fuller");
  });

  it("still offers a short bottle when nothing else is open", () => {
    // Drawing the rest from a second bottle is a real thing people do, and
    // suggesting nothing would be less useful than suggesting the obvious one.
    const shelf = [bottle({ id: "nearly-empty", state: "open", drawnMl: 29 }), bottle({ id: "sealed" })];
    expect(pickBottle(shelf, "bacteriostatic", 2, NOW)?.id).toBe("nearly-empty");
  });

  it("uses the one that expires soonest among equals", () => {
    const shelf = [
      bottle({ id: "later", state: "open", budAt: NOW + 20 * DAY }),
      bottle({ id: "sooner", state: "open", budAt: NOW + 3 * DAY }),
    ];
    expect(pickBottle(shelf, "bacteriostatic", 2, NOW)?.id).toBe("sooner");
  });
});

describe("openBottle", () => {
  it("breaks the seal without taking anything out", () => {
    const out = openBottle([bottle({ id: "a" })], "a", NOW);
    expect(out[0].state).toBe("open");
    expect(out[0].openedAt).toBe(NOW);
    expect(out[0].drawnMl).toBeUndefined();
  });

  it("starts the beyond-use clock at the puncture", () => {
    const out = openBottle([bottle({ id: "a" })], "a", NOW);
    expect(out[0].budAt).toBe(NOW + 28 * DAY);
  });

  it("gives the same date however the bottle was opened", () => {
    // Otherwise the same bottle would expire on a different day depending on
    // whether it was opened by a button or by being drawn from.
    const byButton = openBottle([bottle({ id: "a" })], "a", NOW);
    const byDrawing = drawFromBottle([bottle({ id: "a" })], "a", 2, NOW);
    expect(byDrawing[0].budAt).toBe(byButton[0].budAt);
  });

  it("leaves an already open bottle alone", () => {
    const open = bottle({ id: "a", state: "open", openedAt: 5, budAt: 9 });
    expect(openBottle([open], "a", NOW)[0]).toEqual(open);
  });

  it("does not resurrect a finished bottle", () => {
    const done = bottle({ id: "a", state: "finished", drawnMl: 30 });
    expect(openBottle([done], "a", NOW)[0].state).toBe("finished");
  });
});

describe("drawFromBottle", () => {
  it("takes the water out", () => {
    const out = drawFromBottle([bottle({ id: "a" })], "a", 2, NOW);
    expect(out[0].drawnMl).toBe(2);
    expect(bottleRemainingMl(out[0])).toBe(28);
  });

  it("opens a sealed bottle, because drawing from it is what opening means", () => {
    const out = drawFromBottle([bottle({ id: "a" })], "a", 2, NOW);
    expect(out[0].state).toBe("open");
    expect(out[0].openedAt).toBe(NOW);
  });

  it("does not move the opening date on a later draw", () => {
    const first = drawFromBottle([bottle({ id: "a" })], "a", 2, NOW);
    const second = drawFromBottle(first, "a", 2, NOW + DAY);
    expect(second[0].openedAt).toBe(NOW);
  });

  it("marks it finished once it is empty", () => {
    const out = drawFromBottle([bottle({ id: "a", state: "open", drawnMl: 28 })], "a", 2, NOW);
    expect(out[0].state).toBe("finished");
    expect(bottleRemainingMl(out[0])).toBe(0);
  });

  it("never draws past empty", () => {
    const out = drawFromBottle([bottle({ id: "a" })], "a", 999, NOW);
    expect(out[0].drawnMl).toBe(30);
    expect(bottleRemainingMl(out[0])).toBe(0);
  });

  it("leaves other bottles alone and does not mutate the input", () => {
    const shelf = [bottle({ id: "a" }), bottle({ id: "b" })];
    const out = drawFromBottle(shelf, "a", 2, NOW);
    expect(out[1].drawnMl).toBeUndefined();
    expect(shelf[0].drawnMl).toBeUndefined();
  });

  it("ignores a draw of nothing", () => {
    const shelf = [bottle({ id: "a" })];
    expect(drawFromBottle(shelf, "a", 0, NOW)).toBe(shelf);
  });
});

describe("returnToBottle", () => {
  it("puts the water back and reopens a bottle that had been emptied", () => {
    const emptied = drawFromBottle([bottle({ id: "a" })], "a", 30, NOW);
    const back = returnToBottle(emptied, "a", 5);
    expect(back[0].state).toBe("open");
    expect(bottleRemainingMl(back[0])).toBe(5);
  });

  it("round-trips a draw exactly", () => {
    const after = returnToBottle(drawFromBottle([bottle({ id: "a" })], "a", 2.5, NOW), "a", 2.5);
    expect(after[0].drawnMl).toBe(0);
  });
});

describe("diluentStock", () => {
  it("adds up what is usable, and counts what is open", () => {
    const shelf = [
      bottle({ id: "a", state: "open", drawnMl: 10 }),
      bottle({ id: "b" }),
      bottle({ id: "gone", state: "finished", drawnMl: 30 }),
      bottle({ id: "other", kind: "saline" }),
    ];
    expect(diluentStock(shelf, "bacteriostatic", NOW)).toEqual({
      remainingMl: 50,
      bottles: 2,
      openBottles: 1,
    });
  });

  it("is empty rather than absent when there is none", () => {
    expect(diluentStock([], "bacteriostatic", NOW)).toEqual({
      remainingMl: 0,
      bottles: 0,
      openBottles: 0,
    });
  });
});

describe("shelfOrder", () => {
  const ids = (rows: DiluentBottle[]) => rows.map((b) => b.id);

  it("puts open bottles before sealed ones", () => {
    // The order they were entered in, which is what the shelf used to show:
    // an open bottle, a sealed one, and another open one, in a row.
    const shelf = [
      bottle({ id: "open-1", state: "open", budAt: NOW + 20 * DAY }),
      bottle({ id: "sealed", state: "sealed" }),
      bottle({ id: "open-2", state: "open", budAt: NOW + 10 * DAY }),
    ];
    expect(ids(shelfOrder(shelf, NOW))).toEqual(["open-2", "open-1", "sealed"]);
  });

  it("agrees with the bottle the app would pick", () => {
    // The point of sorting this way rather than any other: the top of the
    // shelf is the one reconstituting will suggest. Two orders for one shelf
    // would teach the eye the wrong first bottle.
    const shelf = [
      bottle({ id: "sealed", state: "sealed", expiresAt: NOW + 5 * DAY }),
      bottle({ id: "open-late", state: "open", budAt: NOW + 25 * DAY }),
      bottle({ id: "open-soon", state: "open", budAt: NOW + 3 * DAY }),
    ];
    expect(shelfOrder(shelf, NOW)[0].id).toBe(pickBottle(shelf, "bacteriostatic", 1, NOW)!.id);
  });

  it("brings the soonest deadline forward, so water gets used rather than binned", () => {
    const shelf = [
      bottle({ id: "later", state: "open", budAt: NOW + 20 * DAY }),
      bottle({ id: "sooner", state: "open", budAt: NOW + 2 * DAY }),
    ];
    expect(ids(shelfOrder(shelf, NOW))).toEqual(["sooner", "later"]);
  });

  it("sinks anything that cannot be drawn from to the bottom", () => {
    const shelf = [
      bottle({ id: "expired", state: "open", budAt: NOW - DAY }),
      bottle({ id: "empty", state: "open", drawnMl: 30, budAt: NOW + DAY }),
      bottle({ id: "good", state: "open", budAt: NOW + 10 * DAY }),
      bottle({ id: "sealed", state: "sealed" }),
    ];
    const out = ids(shelfOrder(shelf, NOW));
    expect(out.slice(0, 2)).toEqual(["good", "sealed"]);
    expect(out.slice(2).sort()).toEqual(["empty", "expired"]);
  });

  it("keeps a stable order for bottles with no dates at all", () => {
    const shelf = [bottle({ id: "b", state: "open" }), bottle({ id: "a", state: "open" })];
    expect(ids(shelfOrder(shelf, NOW))).toEqual(["a", "b"]);
    // Twice, because an order that changes between renders makes the list jump
    // under the cursor.
    expect(ids(shelfOrder(shelfOrder(shelf, NOW), NOW))).toEqual(["a", "b"]);
  });

  it("leaves the array it was given alone", () => {
    const shelf = [bottle({ id: "sealed", state: "sealed" }), bottle({ id: "open", state: "open" })];
    shelfOrder(shelf, NOW);
    expect(ids(shelf)).toEqual(["sealed", "open"]);
  });

  it("handles an empty shelf", () => {
    expect(shelfOrder([], NOW)).toEqual([]);
  });
});
