import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDelimited, toTable } from "./delimited";
import {
  detectProfile,
  genericProfile,
  mapSite,
  resolvePeptide,
  shotsyProfile,
  splitLabelAndDose,
  weightUnitFromHeader,
} from "./profiles";
import { PEPTIDES } from "../data/peptides";
import { INJECTION_SITES } from "../types";

const fixture = readFileSync(join(__dirname, "__fixtures__/shotsy.csv"), "utf8");

const tableOf = (csv: string) => toTable(parseDelimited(csv));

describe("mapSite", () => {
  it("maps Shotsy's seven abdominal positions", () => {
    expect(mapSite("Stomach - Upper Left")).toBe("abdomen-ul");
    expect(mapSite("Stomach - Upper Mid")).toBe("abdomen-um");
    expect(mapSite("Stomach - Upper Right")).toBe("abdomen-ur");
    expect(mapSite("Stomach - Lower Left")).toBe("abdomen-ll");
    expect(mapSite("Stomach - Lower Mid")).toBe("abdomen-lm");
    expect(mapSite("Stomach - Lower Right")).toBe("abdomen-lr");
    expect(mapSite("Left Arm")).toBe("arm-l");
  });

  it("accepts other wordings for the same places", () => {
    expect(mapSite("abdomen upper left")).toBe("abdomen-ul");
    expect(mapSite("Belly (lower right)")).toBe("abdomen-lr");
    expect(mapSite("L thigh")).toBe("thigh-l");
    expect(mapSite("right quad")).toBe("thigh-r");
    expect(mapSite("Left delt")).toBe("arm-l");
    expect(mapSite("right buttock")).toBe("glute-r");
  });

  it("defaults an abdominal site with no band to upper", () => {
    expect(mapSite("Stomach - Left")).toBe("abdomen-ul");
  });

  it("returns nothing rather than guessing a side", () => {
    expect(mapSite("Stomach")).toBeUndefined();
    expect(mapSite("thigh")).toBeUndefined();
    expect(mapSite("")).toBeUndefined();
    expect(mapSite("somewhere")).toBeUndefined();
  });

  it("only ever returns a site the app actually has", () => {
    const known = new Set(INJECTION_SITES.map((s) => s.id));
    for (const text of [
      "Stomach - Upper Left",
      "Stomach - Upper Mid",
      "Stomach - Lower Mid",
      "Left Arm",
      "right glute",
      "L thigh",
    ]) {
      expect(known.has(mapSite(text)!), text).toBe(true);
    }
  });
});

describe("splitLabelAndDose", () => {
  it("separates a trailing dose from a brand name", () => {
    expect(splitLabelAndDose("Mounjaro® 10.0 mg")).toEqual({ name: "Mounjaro", doseMcg: 10_000 });
    expect(splitLabelAndDose("Mounjaro® 2.5 mg")).toEqual({ name: "Mounjaro", doseMcg: 2500 });
    expect(splitLabelAndDose("BPC-157 500mcg")).toEqual({ name: "BPC-157", doseMcg: 500 });
  });

  it("leaves a name with no dose alone", () => {
    expect(splitLabelAndDose("Retatrutide")).toEqual({ name: "Retatrutide", doseMcg: null });
  });

  it("does not eat a hyphenated number that is part of the name", () => {
    // TB-500's number must survive, since it identifies the compound.
    expect(splitLabelAndDose("TB-500").name).toBe("TB-500");
    expect(splitLabelAndDose("CJC-1295 2 mg")).toEqual({ name: "CJC-1295", doseMcg: 2000 });
  });
});

describe("resolvePeptide", () => {
  const resolve = (name: string) => resolvePeptide(name, PEPTIDES);

  it("resolves brand names to their compound", () => {
    expect(resolve("Mounjaro")?.id).toBe("tirzepatide");
    expect(resolve("Zepbound")?.id).toBe("tirzepatide");
    expect(resolve("Ozempic")?.id).toBe("semaglutide");
    expect(resolve("Wegovy")?.id).toBe("semaglutide");
    expect(resolve("Saxenda")?.id).toBe("liraglutide");
  });

  it("resolves generic names and is case-insensitive", () => {
    expect(resolve("tirzepatide")?.id).toBe("tirzepatide");
    expect(resolve("RETATRUTIDE")?.id).toBe("retatrutide");
    expect(resolve("Reta")?.id).toBe("retatrutide");
  });

  it("ignores trademark symbols and extra whitespace", () => {
    expect(resolve("  Mounjaro®  ")?.id).toBe("tirzepatide");
  });

  it("does not let a blend capture one of its components", () => {
    // "Semaglutide" must not resolve to CagriSema just because the name contains
    // "sema", the dose would then be attributed to the wrong compound.
    expect(resolve("Semaglutide")?.id).toBe("semaglutide");
    expect(resolve("CagriSema")?.id).toBe("cagrisema");
  });

  it("returns nothing for something not in the library", () => {
    expect(resolve("Insulin glargine")).toBeUndefined();
    expect(resolve("")).toBeUndefined();
    expect(resolve("xyz")).toBeUndefined();
  });
});

describe("weightUnitFromHeader", () => {
  it("reads the unit out of a parenthesised header", () => {
    expect(weightUnitFromHeader("Weight (kg)")).toBe("kg");
    expect(weightUnitFromHeader("Recorded Weight (kg)")).toBe("kg");
    expect(weightUnitFromHeader("Weight (lb)")).toBe("lb");
    expect(weightUnitFromHeader("Weight in lbs")).toBe("lb");
    expect(weightUnitFromHeader("Body weight pounds")).toBe("lb");
  });

  it("returns null when the header says nothing", () => {
    expect(weightUnitFromHeader("Weight")).toBeNull();
    expect(weightUnitFromHeader("Mass")).toBeNull();
  });
});

describe("detectProfile", () => {
  it("recognises the real Shotsy export", () => {
    const t = tableOf(fixture);
    expect(detectProfile(t.headers)?.id).toBe("shotsy");
  });

  it("falls back to generic for an unfamiliar but readable table", () => {
    const t = tableOf("Date,Medication,Dose,Weight\n2026-07-26,Ozempic,1 mg,85");
    expect(detectProfile(t.headers)?.id).toBe("generic");
  });

  it("prefers a specific profile over generic when both could read it", () => {
    // Shotsy files also have a Date column, which generic would accept.
    const t = tableOf(fixture);
    expect(genericProfile.score(t.headers)).toBeGreaterThan(0);
    expect(shotsyProfile.score(t.headers)).toBeGreaterThan(genericProfile.score(t.headers));
  });

  it("refuses a table it cannot read at all", () => {
    expect(detectProfile(["colour", "size"])).toBeNull();
    // A date on its own says nothing about what happened.
    expect(detectProfile(["date"])).toBeNull();
    expect(detectProfile([])).toBeNull();
  });
});

describe("reading the real Shotsy export", () => {
  const t = tableOf(fixture);
  const result = shotsyProfile.read(t.records, t.headers);
  const doses = result.records.filter((r) => r.kind === "dose");
  const weights = result.records.filter((r) => r.kind === "weight");

  it("reads every row without complaint", () => {
    expect(result.problems).toEqual([]);
  });

  it("finds all 25 injections and all 14 weights", () => {
    expect(doses).toHaveLength(25);
    expect(weights).toHaveLength(14);
  });

  it("reads the first injection with its dose, time and site", () => {
    const first = doses[0];
    expect(first).toMatchObject({
      kind: "dose",
      label: "Mounjaro",
      doseMcg: 2500,
      site: "abdomen-ul",
    });
    expect(new Date(first.at).getFullYear()).toBe(2026);
    expect(new Date(first.at).getMonth()).toBe(1);
    expect(new Date(first.at).getDate()).toBe(8);
    expect(new Date(first.at).getHours()).toBe(11);
    expect(new Date(first.at).getMinutes()).toBe(54);
  });

  it("captures the whole titration including the step back down", () => {
    const byDose = doses.map((d) => (d.kind === "dose" ? d.doseMcg : null));
    expect(byDose.slice(0, 4)).toEqual([2500, 5000, 7500, 10_000]);
    // 12 April drops back to 5 mg after a run at 10 mg.
    const april12 = doses.find(
      (d) => d.kind === "dose" && new Date(d.at).getMonth() === 3 && new Date(d.at).getDate() === 12);
    expect(april12 && april12.kind === "dose" && april12.doseMcg).toBe(5000);
  });

  it("resolves every injection to tirzepatide", () => {
    for (const d of doses) {
      if (d.kind !== "dose") continue;
      expect(resolvePeptide(d.label, PEPTIDES)?.id, d.label).toBe("tirzepatide");
    }
  });

  it("maps every recorded site, including the midline ones", () => {
    const sites = new Set(doses.map((d) => (d.kind === "dose" ? d.site : undefined)));
    expect(sites.has(undefined)).toBe(false);
    expect(sites.has("abdomen-um")).toBe(true);
    expect(sites.has("abdomen-lm")).toBe(true);
    expect(sites.has("arm-l")).toBe(true);
  });

  it("reads weights from rows that have no injection", () => {
    // 17 Nov 2025 is a weight-only row, months before the first jab.
    const first = weights[0];
    expect(first.kind === "weight" && first.weightKg).toBe(94.2);
    expect(new Date(first.at).getFullYear()).toBe(2025);
  });

  it("does not invent a record from the symptom-only row", () => {
    // 11 Feb 2026 carries only a Nausea value of 0, no jab, no weight.
    const feb11 = result.records.filter(
      (r) => new Date(r.at).getMonth() === 1 && new Date(r.at).getDate() === 11);
    expect(feb11).toEqual([]);
  });
});

describe("the generic profile", () => {
  it("reads a simple medication log", () => {
    const t = tableOf(
      "Date,Time,Medication,Dose,Site,Notes\n2026-07-26,09:30,Ozempic,1 mg,left thigh,felt fine");
    const { records, problems } = genericProfile.read(t.records, t.headers);
    expect(problems).toEqual([]);
    expect(records[0]).toMatchObject({
      kind: "dose",
      label: "Ozempic",
      doseMcg: 1000,
      site: "thigh-l",
      notes: "felt fine",
    });
  });

  it("prefers a dedicated dose column over one embedded in the name", () => {
    const t = tableOf("Date,Product,Dose\n2026-07-26,Ozempic 0.25 mg,1 mg");
    const { records } = genericProfile.read(t.records, t.headers);
    expect(records[0].kind === "dose" && records[0].doseMcg).toBe(1000);
  });

  it("reads a weight-only table", () => {
    const t = tableOf("Date,Body Weight\n2026-07-26,85.4");
    const { records } = genericProfile.read(t.records, t.headers);
    expect(records).toEqual([{ kind: "weight", at: expect.any(Number), weightKg: 85.4, sourceRow: 2 }]);
  });

  it("reports an ambiguous date instead of guessing at it", () => {
    const t = tableOf("Date,Medication\n26/07/2026,Ozempic");
    const { records, problems } = genericProfile.read(t.records, t.headers);
    expect(records).toEqual([]);
    expect(problems[0].reason).toMatch(/lead with the year/);
  });

  it("converts a column that declares pounds", () => {
    const t = tableOf("Date,Weight (lb)\n2026-07-26,188");
    const { records, problems } = genericProfile.read(t.records, t.headers);
    expect(problems).toEqual([]);
    expect(records[0].kind === "weight" && records[0].weightKg).toBeCloseTo(85.28, 2);
  });

  it("trusts a column that declares kilograms", () => {
    const t = tableOf("Date,Weight (kg)\n2026-07-26,85.4");
    const { records } = genericProfile.read(t.records, t.headers);
    expect(records[0].kind === "weight" && records[0].weightKg).toBe(85.4);
  });

  it("accepts a plausible unitless weight as kilograms", () => {
    const t = tableOf("Date,Weight\n2026-07-26,85.4");
    const { records, problems } = genericProfile.read(t.records, t.headers);
    expect(problems).toEqual([]);
    expect(records[0].kind === "weight" && records[0].weightKg).toBe(85.4);
  });

  it("refuses an unlabelled weight too large to be kilograms", () => {
    // 400 is impossible as kg and almost certainly pounds, but silently dividing
    // by 2.2 would rewrite a weight history on a hunch.
    const t = tableOf("Date,Weight\n2026-07-26,400");
    const { records, problems } = genericProfile.read(t.records, t.headers);
    expect(records).toEqual([]);
    expect(problems[0].reason).toMatch(/too high to be kilograms/);
  });

  it("skips a row whose date cell is simply blank", () => {
    const t = tableOf("Date,Medication\n,Ozempic\n2026-07-26,Ozempic");
    const { records, problems } = genericProfile.read(t.records, t.headers);
    expect(records).toHaveLength(1);
    expect(problems).toEqual([]);
  });

  it("reports the row number a human would see in a spreadsheet", () => {
    const t = tableOf("Date,Medication\n2026-07-26,Ozempic\n2026-07-27,Ozempic");
    const { records } = genericProfile.read(t.records, t.headers);
    // Row 1 is the header, so the first data row is row 2.
    expect(records.map((r) => r.sourceRow)).toEqual([2, 3]);
  });
});
