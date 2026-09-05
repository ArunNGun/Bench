import { describe, expect, it } from "vitest";
import {
  DEFAULT_ML_PER_SPRAY,
  isSpray,
  mcgForSprays,
  mcgPerSpray,
  mlForSprays,
  mlPerSpray,
  routeChoices,
  spraysForDose,
  spraysRemaining,
  transferToSpray,
} from "./spray";
import { vialConcentration, vialRemainingMcg } from "./inventory";
import type { Vial } from "../types";

const NOW = Date.UTC(2026, 8, 5, 9, 0, 0);

const vial = (over: Partial<Vial> = {}): Vial => ({
  id: "v1",
  profileId: "me",
  peptideId: "bpc-157",
  strengthMg: 5,
  state: "reconstituted",
  diluentMl: 1,
  diluent: "saline",
  drawnMcg: 0,
  ...over,
});

describe("what a press delivers", () => {
  it("works the worked example through, end to end", () => {
    // 5 mg in 1 mL, poured into a bottle and made up with 4 mL more.
    const plan = transferToSpray(vial(), { addedMl: 4, mlPerSpray: 0.1, atMs: NOW })!;

    expect(plan.bottle.strengthMg).toBe(5);
    expect(plan.bottle.diluentMl).toBe(5);
    expect(vialConcentration(plan.bottle)).toBe(1000);
    expect(mcgPerSpray(plan.bottle)).toBe(100);
    // Two presses is 0.2 mL and 200 mcg, which is the figure in the request.
    expect(mcgForSprays(plan.bottle, 2)).toBe(200);
    expect(mlForSprays(plan.bottle, 2)).toBeCloseTo(0.2, 10);
  });

  it("falls back to the usual pump when nobody measured this one", () => {
    expect(mlPerSpray({})).toBe(DEFAULT_ML_PER_SPRAY);
    expect(mlPerSpray({ mlPerSpray: 0 })).toBe(DEFAULT_ML_PER_SPRAY);
    expect(mlPerSpray({ mlPerSpray: 0.05 })).toBe(0.05);
  });

  it("says nothing rather than something invented when there is no volume", () => {
    // A concentration cannot be had without a volume, and a made up number
    // would be read standing over a nose.
    expect(mcgPerSpray({ strengthMg: 5, mlPerSpray: 0.1 })).toBe(0);
  });

  it("halves the dose when the bottle is swapped for a finer pump", () => {
    const bottle = vial({ container: "spray", diluentMl: 5, mlPerSpray: 0.05 });
    expect(mcgPerSpray(bottle)).toBe(50);
  });
});

describe("presses for a dose", () => {
  const bottle = vial({ container: "spray", diluentMl: 5, mlPerSpray: 0.1 });

  it("gives whole presses, because half a press is a failed dose", () => {
    expect(spraysForDose(bottle, 200)).toBe(2);
    expect(spraysForDose(bottle, 250)).toBe(3);
    expect(spraysForDose(bottle, 240)).toBe(2);
    expect(Number.isInteger(spraysForDose(bottle, 333))).toBe(true);
  });

  it("never asks for a negative number of presses", () => {
    expect(spraysForDose(bottle, -100)).toBe(0);
  });

  it("gives none when the bottle cannot say what it holds", () => {
    expect(spraysForDose({ strengthMg: 5 }, 200)).toBe(0);
  });
});

describe("presses left, which is an estimate", () => {
  it("counts whole presses out of the volume remaining", () => {
    const bottle = vial({ container: "spray", diluentMl: 5, mlPerSpray: 0.1, drawnMcg: 0 });
    expect(spraysRemaining(bottle)).toBe(50);
  });

  it("falls as the bottle is used", () => {
    // 2,000 of 5,000 mcg gone is 3 mL left, so about thirty presses.
    const bottle = vial({ container: "spray", diluentMl: 5, mlPerSpray: 0.1, drawnMcg: 2000 });
    expect(spraysRemaining(bottle)).toBe(30);
  });

  it("rounds down, since a partial press is not a press", () => {
    const bottle = vial({ container: "spray", diluentMl: 5, mlPerSpray: 0.3, drawnMcg: 0 });
    expect(spraysRemaining(bottle)).toBe(16);
  });

  it("reads empty once the mass is gone", () => {
    const bottle = vial({ container: "spray", diluentMl: 5, mlPerSpray: 0.1, drawnMcg: 5000 });
    expect(spraysRemaining(bottle)).toBe(0);
  });
});

describe("the transfer", () => {
  it("moves the whole mass and finishes the vial", () => {
    const source = vial();
    const plan = transferToSpray(source, { addedMl: 4, mlPerSpray: 0.1, atMs: NOW })!;

    expect(plan.source.state).toBe("finished");
    expect(vialRemainingMcg(plan.source)).toBe(0);
    expect(plan.bottle.strengthMg * 1000).toBe(5000);
  });

  it("carries what was already drawn, so a part used vial transfers what is left", () => {
    const source = vial({ drawnMcg: 1000 });
    const plan = transferToSpray(source, { addedMl: 4, mlPerSpray: 0.1, atMs: NOW })!;

    // 4 mg left in 0.8 mL, made up to 4.8 mL.
    expect(plan.bottle.strengthMg).toBe(4);
    expect(plan.bottle.diluentMl).toBeCloseTo(4.8, 10);
  });

  it("moves the money rather than copying it", () => {
    // Counting the same purchase in both rows would inflate Spent.
    const source = vial({ cost: 42, currency: "EUR" });
    const plan = transferToSpray(source, { addedMl: 4, mlPerSpray: 0.1, atMs: NOW })!;

    expect(plan.bottle.cost).toBe(42);
    expect(plan.bottle.currency).toBe("EUR");
    expect(plan.source.cost).toBeUndefined();
  });

  it("leaves the order behind, because the bottle was never posted", () => {
    const source = vial({ orderId: "o1" });
    const plan = transferToSpray(source, { addedMl: 4, mlPerSpray: 0.1, atMs: NOW })!;

    expect(plan.source.orderId).toBe("o1");
    expect(plan.bottle.orderId).toBeUndefined();
  });

  it("records when it was filled and asserts no beyond-use date", () => {
    // The twenty-eight days used for a punctured vial comes from a convention
    // that says nothing about a preservative-free solution in a pump.
    const plan = transferToSpray(vial(), { addedMl: 4, mlPerSpray: 0.1, atMs: NOW })!;

    expect(plan.bottle.reconstitutedAt).toBe(NOW);
    expect(plan.bottle.budAt).toBeUndefined();
  });

  it("marks the bottle as a spray and remembers where it came from", () => {
    const plan = transferToSpray(vial({ id: "src" }), { addedMl: 4, mlPerSpray: 0.1, atMs: NOW })!;

    expect(isSpray(plan.bottle)).toBe(true);
    expect(plan.bottle.filledFromVialId).toBe("src");
  });

  it("keeps the compound, so the bottle is the same peptide", () => {
    const plan = transferToSpray(vial({ peptideId: "kpv" }), { addedMl: 4, mlPerSpray: 0.1, atMs: NOW })!;
    expect(plan.bottle.peptideId).toBe("kpv");
  });

  it("draws saline only when a source for it was named", () => {
    const withBottle = transferToSpray(vial(), {
      addedMl: 4,
      mlPerSpray: 0.1,
      atMs: NOW,
      diluentBottleId: "amp1",
    })!;
    expect(withBottle.drawnMl).toBe(4);

    const untracked = transferToSpray(vial(), { addedMl: 4, mlPerSpray: 0.1, atMs: NOW })!;
    expect(untracked.drawnMl).toBe(0);
  });

  it("takes the saline kind for the bottle, since a nose does not take bacteriostatic", () => {
    const plan = transferToSpray(vial({ diluent: "bacteriostatic" }), {
      addedMl: 4,
      mlPerSpray: 0.1,
      diluent: "saline",
      atMs: NOW,
    })!;
    expect(plan.bottle.diluent).toBe("saline");
  });

  it("refuses a vial with nothing left in it", () => {
    expect(transferToSpray(vial({ drawnMcg: 5000 }), { addedMl: 4, mlPerSpray: 0.1, atMs: NOW }))
      .toBeNull();
  });

  it("refuses a vial that was never made up, since there is nothing to pour", () => {
    expect(
      transferToSpray(vial({ state: "sealed", diluentMl: undefined }), {
        addedMl: 0,
        mlPerSpray: 0.1,
        atMs: NOW,
      })).toBeNull();
  });

  it("allows a transfer with no saline added, which is a straight pour", () => {
    const plan = transferToSpray(vial(), { addedMl: 0, mlPerSpray: 0.1, atMs: NOW })!;
    expect(plan.bottle.diluentMl).toBe(1);
    expect(mcgPerSpray(plan.bottle)).toBe(500);
  });

  it("uses the usual pump when given a nonsense one", () => {
    const plan = transferToSpray(vial(), { addedMl: 4, mlPerSpray: 0, atMs: NOW })!;
    expect(plan.bottle.mlPerSpray).toBe(DEFAULT_ML_PER_SPRAY);
  });
});

describe("telling the two containers apart", () => {
  it("treats a row with no container as a vial, which every old row is", () => {
    expect(isSpray(vial())).toBe(false);
    expect(isSpray({ container: "vial" })).toBe(false);
    expect(isSpray({ container: "spray" })).toBe(true);
  });
});

describe("which routes can be recorded", () => {
  const spray = vial({ id: "b", container: "spray", peptideId: "bpc-157" });
  const plain = vial({ id: "v", peptideId: "bpc-157" });

  it("offers what the library says when there is no bottle", () => {
    expect(routeChoices(["subcutaneous"], [plain], "bpc-157")).toEqual(["subcutaneous"]);
  });

  it("adds intranasal once a bottle of that compound exists", () => {
    // The bug this fixes: three compounds in the library name intranasal, so a
    // bottle of any of the others could not be logged from, because the route
    // it needed was never on offer.
    expect(routeChoices(["subcutaneous"], [spray], "bpc-157")).toEqual([
      "subcutaneous",
      "intranasal",
    ]);
  });

  it("does not add it for a different compound's bottle", () => {
    expect(routeChoices(["subcutaneous"], [spray], "kpv")).toEqual(["subcutaneous"]);
  });

  it("does not repeat a route the library already names", () => {
    expect(routeChoices(["intranasal", "subcutaneous"], [spray], "bpc-157")).toEqual([
      "intranasal",
      "subcutaneous",
    ]);
  });

  it("keeps the library's own order, with the added one last", () => {
    expect(routeChoices(["subcutaneous", "intramuscular"], [spray], "bpc-157")).toEqual([
      "subcutaneous",
      "intramuscular",
      "intranasal",
    ]);
  });

  it("falls back to something rather than an empty dropdown", () => {
    expect(routeChoices([], [], "bpc-157")).toEqual(["subcutaneous"]);
  });
});
