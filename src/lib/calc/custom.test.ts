import { describe, expect, it } from "vitest";
import {
  CUSTOM_PREFIX,
  draftToPeptide,
  peptideToDraft,
  isCustomId,
  slugifyCompound,
  validateDraft,
  type CustomDraft,
} from "./custom";
import { curveFor } from "./pk";
import { PEPTIDES } from "../data/peptides";

const draft = (over: Partial<CustomDraft> = {}): CustomDraft => ({
  name: "Mystery peptide",
  category: "repair",
  routes: ["subcutaneous"],
  preparation: "powder", ...over,
});

describe("slugifyCompound", () => {
  it("namespaces every custom id", () => {
    expect(slugifyCompound("Mystery peptide")).toBe("custom-mystery-peptide");
    expect(isCustomId(slugifyCompound("anything"))).toBe(true);
  });

  it("cannot collide with a built-in id", () => {
    // Even naming it exactly after a library entry produces a different id.
    expect(slugifyCompound("BPC-157")).toBe("custom-bpc-157");
    for (const p of PEPTIDES) expect(p.id.startsWith(CUSTOM_PREFIX)).toBe(false);
  });

  it("strips punctuation and accents", () => {
    // NFKD splits the accent off é and folds ² to 2; neither should leave a gap.
    expect(slugifyCompound("  Péptide  X²  ")).toBe("custom-peptide-x2");
    expect(slugifyCompound("AOD, 9604")).toBe("custom-aod-9604");
  });

  it("still produces something usable from an unusable name", () => {
    expect(slugifyCompound("!!!")).toBe("custom-compound");
  });
});

describe("validateDraft", () => {
  it("accepts the minimum: a name, a category and a route", () => {
    expect(validateDraft(draft(), PEPTIDES)).toEqual([]);
  });

  it("insists on a name", () => {
    expect(validateDraft(draft({ name: "   " }), PEPTIDES)[0].field).toBe("name");
  });

  it("refuses a name the library already uses", () => {
    const problems = validateDraft(draft({ name: "Tirzepatide" }), PEPTIDES);
    expect(problems[0].field).toBe("name");
    expect(problems[0].message).toMatch(/already in the library/);
  });

  it("is case-insensitive about that", () => {
    expect(validateDraft(draft({ name: "tirzepatide" }), PEPTIDES)).toHaveLength(1);
  });

  it("refuses a second custom compound with the same name", () => {
    const mine = draftToPeptide(draft({ name: "Mystery peptide" }));
    const problems = validateDraft(draft({ name: "Mystery peptide" }), [...PEPTIDES, mine]);
    expect(problems[0].field).toBe("name");
  });

  it("refuses two different names that would produce the same id", () => {
    // The id is what protocols and logs reference, so a collision here would
    // silently merge two compounds.
    const mine = draftToPeptide(draft({ name: "Mystery peptide" }));
    const problems = validateDraft(draft({ name: "Mystery  Peptide!" }), [...PEPTIDES, mine]);
    expect(problems[0].message).toMatch(/already have a compound/);
  });

  it("insists on a route", () => {
    expect(validateDraft(draft({ routes: [] }), PEPTIDES)[0].field).toBe("routes");
  });

  it("rejects a dose range the wrong way round", () => {
    const problems = validateDraft(draft({ doseLowMcg: 500, doseHighMcg: 100 }), PEPTIDES);
    expect(problems[0].field).toBe("doseHighMcg");
  });

  it("accepts a single-point dose range", () => {
    expect(validateDraft(draft({ doseLowMcg: 500, doseHighMcg: 500 }), PEPTIDES)).toEqual([]);
  });

  it("rejects the values that would divide by zero downstream", () => {
    // Supply-days and burn rate both divide by doses per week.
    expect(validateDraft(draft({ perWeek: 0 }), PEPTIDES)[0].field).toBe("perWeek");
    expect(validateDraft(draft({ halfLifeHours: 0 }), PEPTIDES)[0].field).toBe("halfLifeHours");
    expect(validateDraft(draft({ iuPerMg: 0 }), PEPTIDES)[0].field).toBe("iuPerMg");
    expect(validateDraft(draft({ vialSizeMg: 0 }), PEPTIDES)[0].field).toBe("vialSizeMg");
    expect(validateDraft(draft({ doseLowMcg: -5 }), PEPTIDES)[0].field).toBe("doseLowMcg");
  });

  it("does not second-guess the pharmacology", () => {
    // The app has no basis to call an unfamiliar compound's dose wrong.
    expect(
      validateDraft(draft({ doseLowMcg: 1, doseHighMcg: 5_000_000, halfLifeHours: 4000 }), PEPTIDES)).toEqual([]);
  });
});

describe("draftToPeptide", () => {
  it("produces an entry the rest of the app can use", () => {
    const p = draftToPeptide(draft({ name: "Mystery peptide", halfLifeHours: 6 }));
    expect(p.id).toBe("custom-mystery-peptide");
    expect(p.name).toBe("Mystery peptide");
    expect(p.category).toBe("repair");
    expect(p.halfLifeHours).toBe(6);
    expect(p.routes).toEqual(["subcutaneous"]);
  });

  it("leaves an unknown half-life null rather than inventing one", () => {
    const p = draftToPeptide(draft());
    expect(p.halfLifeHours).toBeNull();
    // The library integrity rule: no half-life means you must say why.
    expect(p.halfLifeNote).toBeTruthy();
  });

  it("never tags a user's own figure as anything but anecdotal", () => {
    const p = draftToPeptide(draft({ doseLowMcg: 250, doseHighMcg: 500 }));
    expect(p.doseRanges[0].evidence).toBe("anecdotal");
    expect(p.doseRanges[0].note).toMatch(/not from any published source/i);
  });

  it("carries no citations, because there are none", () => {
    expect(draftToPeptide(draft()).citations).toEqual([]);
    expect(draftToPeptide(draft()).cautionBanner).toBeTruthy();
  });

  it("omits the dose range entirely when none was given", () => {
    expect(draftToPeptide(draft()).doseRanges).toEqual([]);
  });

  it("splits aliases on commas", () => {
    const p = draftToPeptide(draft({ aka: "MP, Compound X, " }));
    expect(p.aka).toEqual(["MP", "Compound X"]);
  });

  it("gives a powder a beyond-use window and a solution none", () => {
    expect(draftToPeptide(draft({ preparation: "powder" })).reconstitutedDays).toBe(28);
    expect(draftToPeptide(draft({ preparation: "solution" })).reconstitutedDays).toBeUndefined();
  });

  it("carries IU dosing through when given", () => {
    expect(draftToPeptide(draft({ iuPerMg: 3 })).iuPerMg).toBe(3);
    expect(draftToPeptide(draft()).iuPerMg).toBeUndefined();
  });

  it("round-trips through validation", () => {
    const d = draft({ name: "Round trip", doseLowMcg: 100, doseHighMcg: 200, perWeek: 3 });
    expect(validateDraft(d, PEPTIDES)).toEqual([]);
    const p = draftToPeptide(d);
    expect(p.doseRanges[0]).toMatchObject({ lowMcg: 100, highMcg: 200, perWeek: 3 });
  });
});

describe("editing a compound you added", () => {
  const made = (over: Partial<CustomDraft> = {}) =>
    draftToPeptide({
      name: "SS-31",
      category: "longevity",
      routes: ["subcutaneous"],
      preparation: "powder",
      doseLowMcg: 10_000,
      doseHighMcg: 10_000,
      frequency: "once daily",
      perWeek: 7,
      vialSizeMg: 50,
      ...over,
    });

  it("reads an entry back into the form it came from", () => {
    const p = made({ aka: "Elamipretide, MTP-131", halfLifeHours: 4 });
    const d = peptideToDraft(p);
    expect(d.name).toBe("SS-31");
    expect(d.category).toBe("longevity");
    expect(d.halfLifeHours).toBe(4);
    expect(d.routes).toEqual(["subcutaneous"]);
    expect(d.doseLowMcg).toBe(10_000);
    expect(d.perWeek).toBe(7);
    expect(d.vialSizeMg).toBe(50);
    expect(d.aka).toBe("Elamipretide, MTP-131");
  });

  it("round-trips without changing anything", () => {
    const p = made({ halfLifeHours: 4 });
    expect(draftToPeptide(peptideToDraft(p))).toEqual(p);
  });

  it("survives a compound that has no half-life and no dose", () => {
    const bare = draftToPeptide({
      name: "Mystery",
      category: "repair",
      routes: ["subcutaneous"],
      preparation: "powder",
    });
    const d = peptideToDraft(bare);
    expect(d.halfLifeHours).toBeNull();
    expect(d.doseLowMcg).toBeUndefined();
    expect(draftToPeptide(d)).toEqual(bare);
  });

  it("lets an entry keep its own name while editing", () => {
    const mine = made({ name: "Something Of My Own" });
    // Without the exemption this is "you already have a compound with that
    // name", which is true, and which would make the form unsaveable.
    expect(validateDraft(peptideToDraft(mine), [...PEPTIDES, mine], mine.id)).toEqual([]);
    expect(validateDraft(peptideToDraft(mine), [...PEPTIDES, mine])).not.toEqual([]);
  });

  it("still refuses a name that belongs to another of your compounds", () => {
    const mine = made({ name: "Something Of My Own" });
    const other = draftToPeptide({
      name: "Taken",
      category: "repair",
      routes: ["subcutaneous"],
      preparation: "powder",
    });
    const renamed = { ...peptideToDraft(mine), name: "Taken" };
    const problems = validateDraft(renamed, [...PEPTIDES, mine, other], mine.id);
    expect(problems.map((p) => p.field)).toContain("name");
  });

  it("keeps an entry editable after the library adds the same compound", () => {
    // The real case: SS-31 existed as somebody's own entry before it was added
    // to the library. Blocking the save would not remove the duplicate, it
    // would only stop them giving their copy the half-life it is missing.
    const mine = made({ name: "SS-31" });
    expect(PEPTIDES.some((p) => p.name === "SS-31")).toBe(true);
    expect(validateDraft(peptideToDraft(mine), [...PEPTIDES, mine], mine.id)).toEqual([]);
  });

  it("adding a half-life is all it takes to get a curve", () => {
    const before = made({ name: "Something Of My Own" });
    expect(curveFor(before)).toBeNull();

    const after = draftToPeptide({ ...peptideToDraft(before), halfLifeHours: 4 });
    expect(curveFor(after)).toEqual({
      params: { halfLifeHours: 4, tmaxHours: undefined },
      basis: "published",
    });
  });
});
