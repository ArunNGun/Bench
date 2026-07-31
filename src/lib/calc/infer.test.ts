import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { inferAllProtocols, inferProtocol } from "./infer";
import { PEPTIDE_BY_ID } from "../data/peptides";
import { parseDelimited, toTable } from "../import/delimited";
import { shotsyProfile } from "../import/profiles";
import { buildImportPlan } from "../import/plan";
import { PEPTIDES } from "../data/peptides";
import type { DoseLog } from "../types";

const resolve = (id: string) => PEPTIDE_BY_ID.get(id);
const DAY = 86_400_000;

type Log = Pick<DoseLog, "at" | "peptideId" | "doseMcg" | "site" | "skipped">;

const log = (over: Partial<Log> & { at: number }): Log => ({
  peptideId: "tirzepatide",
  doseMcg: 10_000, ...over,
});

/** A run of doses every `everyDays`, at 13:00 local. */
function series(count: number, everyDays: number, startAt: number, over: Partial<Log> = {}): Log[] {
  return Array.from({ length: count }, (_, i) =>
    log({ at: startAt + i * everyDays * DAY, ...over }));
}

const START = new Date(2026, 1, 8, 13, 0).getTime();

describe("inferProtocol, schedule", () => {
  it("reads a weekly run as a weekday schedule", () => {
    // A weekday anchor rather than "every 7 days", so a dose taken a day late does
    // not make the whole schedule drift.
    const p = inferProtocol(series(10, 7, START), resolve)!;
    expect(p.schedule.kind).toBe("days-of-week");
    expect(p.schedule.daysOfWeek).toEqual([new Date(START).getDay()]);
    expect(p.confidence).toBe("clear");
  });

  it("reads a daily run as daily", () => {
    const p = inferProtocol(series(14, 1, START), resolve)!;
    expect(p.schedule.kind).toBe("daily");
    expect(p.confidence).toBe("clear");
  });

  it("reads an every-three-days run as an interval", () => {
    const p = inferProtocol(series(10, 3, START), resolve)!;
    expect(p.schedule).toMatchObject({ kind: "interval-days", intervalDays: 3 });
    expect(p.confidence).toBe("clear");
  });

  it("tolerates a dose taken a few hours off", () => {
    const times = [0, 7, 14.1, 20.9, 28].map((d) => START + d * DAY);
    const p = inferProtocol(times.map((at) => log({ at })), resolve)!;
    expect(p.schedule.kind).toBe("days-of-week");
    expect(p.confidence).toBe("clear");
  });

  it("still calls a regular schedule clear despite one long break", () => {
    // A holiday or a supply gap should not reclassify an otherwise weekly run.
    const times = [0, 7, 14, 21, 60, 67, 74, 81].map((d) => START + d * DAY);
    const p = inferProtocol(times.map((at) => log({ at })), resolve)!;
    expect(p.schedule.kind).toBe("days-of-week");
    expect(p.confidence).toBe("clear");
  });

  it("marks an erratic history as rough", () => {
    const times = [0, 3, 11, 12, 30, 31].map((d) => START + d * DAY);
    const p = inferProtocol(times.map((at) => log({ at })), resolve)!;
    expect(p.confidence).toBe("rough");
  });

  it("treats a single dose as a rough weekly guess", () => {
    const p = inferProtocol([log({ at: START })], resolve)!;
    expect(p.confidence).toBe("rough");
    expect(p.schedule.kind).toBe("days-of-week");
    expect(p.doseCount).toBe(1);
  });

  it("ignores a duplicate logged hours apart when measuring gaps", () => {
    const times = [0, 0.1, 7, 14, 21].map((d) => START + d * DAY);
    const p = inferProtocol(times.map((at) => log({ at })), resolve)!;
    expect(p.schedule.kind).toBe("days-of-week");
  });
});

describe("inferProtocol, dose, sites and dates", () => {
  it("continues from the most recent dose, not the first", () => {
    // A titration ends where it ends; continuing from 2.5 mg would be wrong.
    const logs = [
      log({ at: START, doseMcg: 2500 }),
      log({ at: START + 7 * DAY, doseMcg: 5000 }),
      log({ at: START + 14 * DAY, doseMcg: 10_000 }),
    ];
    expect(inferProtocol(logs, resolve)!.doseMcg).toBe(10_000);
  });

  it("takes the site rotation from recent history only", () => {
    const logs = [
      ...series(12, 7, START, { site: "abdomen-ul" }),
      log({ at: START + 84 * DAY, site: "thigh-l" }),
      log({ at: START + 91 * DAY, site: "thigh-r" }),
    ];
    const p = inferProtocol(logs, resolve, { siteWindow: 3 })!;
    expect(p.sites.sort()).toEqual(["abdomen-ul", "thigh-l", "thigh-r"]);
  });

  it("leaves sites empty when none were recorded", () => {
    expect(inferProtocol(series(5, 7, START), resolve)!.sites).toEqual([]);
  });

  it("starts the protocol at the first dose and reports the last", () => {
    const p = inferProtocol(series(5, 7, START), resolve)!;
    expect(p.startedAt).toBe(START);
    expect(p.lastAt).toBe(START + 28 * DAY);
  });

  it("picks the usual time of day", () => {
    const p = inferProtocol(series(6, 7, new Date(2026, 1, 8, 9, 40).getTime()), resolve)!;
    expect(p.schedule.timeOfDay).toBe("09:30");
  });

  it("gives no time of day when the file only had dates", () => {
    // Midnight means "date only", not a real 00:00 injection. This series also
    // steps across the northern-hemisphere DST change, so in a zone that observes
    // it a couple of doses land on 01:00, the midnight majority must still win.
    const p = inferProtocol(series(6, 7, new Date(2026, 1, 8, 0, 0).getTime()), resolve)!;
    expect(p.schedule.timeOfDay).toBeUndefined();
  });

  it("is not swayed by a minority of odd times", () => {
    const base = new Date(2026, 1, 8, 13, 0).getTime();
    const logs = [
      ...series(6, 7, base),
      log({ at: new Date(2026, 5, 1, 3, 15).getTime() }),
      log({ at: new Date(2026, 5, 8, 22, 45).getTime() }),
    ];
    expect(inferProtocol(logs, resolve)!.schedule.timeOfDay).toBe("13:00");
  });
});

describe("inferProtocol, refusals", () => {
  it("returns null with no logs", () => {
    expect(inferProtocol([], resolve)).toBeNull();
  });

  it("ignores skipped doses", () => {
    expect(inferProtocol([log({ at: START, skipped: true })], resolve)).toBeNull();
  });

  it("ignores zero doses", () => {
    expect(inferProtocol([log({ at: START, doseMcg: 0 })], resolve)).toBeNull();
  });

  it("returns null when the compound is not in the library", () => {
    expect(inferProtocol([log({ at: START, peptideId: "nope" })], resolve)).toBeNull();
  });
});

describe("inferProtocol, which compound", () => {
  it("picks whatever was taken most recently", () => {
    const logs = [
      ...series(5, 7, START, { peptideId: "semaglutide", doseMcg: 1000 }),
      log({ at: START + 40 * DAY, peptideId: "tirzepatide", doseMcg: 10_000 }),
    ];
    expect(inferProtocol(logs, resolve)!.peptideId).toBe("tirzepatide");
  });

  it("measures gaps only within that compound's own history", () => {
    // Interleaved compounds would otherwise look like a much tighter schedule.
    const logs = [
      ...series(5, 7, START, { peptideId: "tirzepatide" }), ...series(5, 7, START + 3 * DAY, { peptideId: "semaglutide", doseMcg: 1000 }),
      log({ at: START + 35 * DAY, peptideId: "tirzepatide" }),
    ];
    const p = inferProtocol(logs, resolve)!;
    expect(p.peptideId).toBe("tirzepatide");
    expect(p.schedule.kind).toBe("days-of-week");
  });
});

describe("inferAllProtocols", () => {
  it("proposes one per compound, most recent first", () => {
    const logs = [
      ...series(4, 7, START, { peptideId: "semaglutide", doseMcg: 1000 }), ...series(4, 7, START + 40 * DAY, { peptideId: "tirzepatide" }),
    ];
    const all = inferAllProtocols(logs, resolve);
    expect(all.map((p) => p.peptideId)).toEqual(["tirzepatide", "semaglutide"]);
  });

  it("returns nothing for an empty history", () => {
    expect(inferAllProtocols([], resolve)).toEqual([]);
  });
});

describe("against the real imported Shotsy history", () => {
  const t = toTable(parseDelimited(readFileSync(join(__dirname, "../import/__fixtures__/shotsy.csv"), "utf8")));
  const { records, problems } = shotsyProfile.read(t.records, t.headers);
  const plan = buildImportPlan({
    records,
    problems,
    peptides: PEPTIDES,
    existingLogs: [],
    existingMeasurements: [],
  });
  const logs: Log[] = plan.doses.map((d) => ({
    at: d.at,
    peptideId: d.peptideId,
    doseMcg: d.doseMcg,
    site: d.site,
  }));

  const inferred = inferProtocol(logs, resolve)!;

  it("recognises it as weekly tirzepatide", () => {
    expect(inferred.peptideId).toBe("tirzepatide");
    expect(inferred.schedule.kind).toBe("days-of-week");
    expect(inferred.confidence).toBe("clear");
  });

  it("lands on the weekday the injections actually fall on", () => {
    // Every jab in the file is a Sunday.
    expect(inferred.schedule.daysOfWeek).toEqual([0]);
  });

  it("continues from 10 mg, where the titration ended", () => {
    expect(inferred.doseMcg).toBe(10_000);
  });

  it("pins the rotation currently in use, not one abandoned months ago", () => {
    // The midline positions were last used on 26 April and 17 May, so they are
    // outside the recent window and correctly left out, pinning a site that has
    // not been touched in ten weeks would put it back into the suggestions.
    expect(inferred.sites.sort()).toEqual([
      "abdomen-ll",
      "abdomen-lr",
      "abdomen-ul",
      "abdomen-ur",
      "arm-l",
    ]);
  });

  it("does pick up the midline positions when the window covers them", () => {
    const wide = inferProtocol(logs, resolve, { siteWindow: 25 })!;
    expect(wide.sites).toContain("abdomen-um");
    expect(wide.sites).toContain("abdomen-lm");
    expect(wide.sites).toHaveLength(7);
  });

  it("starts where the history starts", () => {
    expect(new Date(inferred.startedAt).getMonth()).toBe(1);
    expect(new Date(inferred.startedAt).getDate()).toBe(8);
    expect(inferred.doseCount).toBe(25);
  });

  it("describes itself in a sentence", () => {
    expect(inferred.summary).toMatch(/^10 mg of Tirzepatide every Sunday, from 25 logged doses/);
  });
});
