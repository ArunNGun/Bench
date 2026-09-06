import { describe, expect, it } from "vitest";
import {
  averages,
  checkInFor,
  diaryDays,
  inWindow,
  isTrendworthy,
  ratableDay,
  series,
  shiftAround,
  streak,
} from "./checkins";
import { startOfLocalDay, addLocalDays } from "./schedule";
import { SYMPTOMS, type CheckIn, type SymptomId } from "../types";

const NOW = new Date(2026, 6, 30, 14, 30).getTime();
const TODAY = startOfLocalDay(NOW);

const at = (daysAgo: number) => addLocalDays(TODAY, -daysAgo);

const checkIn = (daysAgo: number, ratings: Partial<Record<SymptomId, number>>): CheckIn => ({
  id: `c${daysAgo}`,
  profileId: "me",
  at: at(daysAgo),
  ratings,
});

describe("averages", () => {
  it("means each symptom over the days that carried one", () => {
    const rows = averages([
      checkIn(0, { energy: 4, mood: 5 }),
      checkIn(1, { energy: 2, mood: 3 }),
    ]);
    const energy = rows.find((r) => r.id === "energy")!;
    expect(energy.mean).toBe(3);
    expect(energy.days).toBe(2);
  });

  it("reports null rather than zero for a symptom never rated", () => {
    // Zero would chart as the bottom of the scale, which is a claim. Null is
    // the absence of one.
    const rows = averages([checkIn(0, { energy: 4 })]);
    const libido = rows.find((r) => r.id === "libido")!;
    expect(libido.mean).toBeNull();
    expect(libido.days).toBe(0);
  });

  it("counts only the days that rated the symptom, not all check-ins", () => {
    const rows = averages([
      checkIn(0, { energy: 4, sleep: 2 }),
      checkIn(1, { energy: 2 }),
      checkIn(2, {}),
    ]);
    expect(rows.find((r) => r.id === "energy")!.days).toBe(2);
    expect(rows.find((r) => r.id === "sleep")!.days).toBe(1);
  });

  it("returns a row per symptom even with no data at all", () => {
    // Counted from the library rather than written out, so adding an axis is
    // one edit rather than a hunt through the tests for the number six.
    expect(averages([])).toHaveLength(SYMPTOMS.length);
    expect(averages([]).every((r) => r.mean === null)).toBe(true);
  });

  it("carries the direction, and leaves appetite without one", () => {
    const rows = averages([]);
    expect(rows.find((r) => r.id === "energy")!.higherIsBetter).toBe(true);
    // Suppressed appetite is the goal on a GLP-1 and a problem on a bulk, so
    // the app charts it and declines to say which way is good.
    expect(rows.find((r) => r.id === "appetite")!.higherIsBetter).toBeUndefined();
  });
});

describe("inWindow", () => {
  it("is half open, including the start and excluding the end", () => {
    const rows = [checkIn(0, { energy: 1 }), checkIn(1, { energy: 2 }), checkIn(2, { energy: 3 })];
    const got = inWindow(rows, at(2), at(0));
    expect(got.map((c) => c.ratings.energy).sort()).toEqual([2, 3]);
  });
});

describe("shiftAround", () => {
  const before = [5, 6, 7, 8, 9].map((d) => checkIn(d, { energy: 2, appetite: 4 }));
  const after = [0, 1, 2, 3].map((d) => checkIn(d, { energy: 4, appetite: 2 }));

  it("compares the two sides of a pivot", () => {
    const rows = shiftAround([...before, ...after], at(4), 28, NOW);
    const energy = rows.find((r) => r.id === "energy")!;
    expect(energy.before).toBe(2);
    expect(energy.after).toBe(4);
    expect(energy.delta).toBe(2);
  });

  it("reports a fall as a negative delta without judging it", () => {
    const rows = shiftAround([...before, ...after], at(4), 28, NOW);
    const appetite = rows.find((r) => r.id === "appetite")!;
    expect(appetite.delta).toBe(-2);
    expect(appetite.higherIsBetter).toBeUndefined();
  });

  it("gives a null delta when one side has nothing", () => {
    const rows = shiftAround(after, at(4), 28, NOW);
    const energy = rows.find((r) => r.id === "energy")!;
    expect(energy.before).toBeNull();
    expect(energy.delta).toBeNull();
  });

  it("bounds both sides by the window", () => {
    const ancient = checkIn(400, { energy: 1 });
    const rows = shiftAround([ancient, ...before, ...after], at(4), 28, NOW);
    // The 400-day-old entry is outside a 28 day window and must not drag the mean.
    expect(rows.find((r) => r.id === "energy")!.before).toBe(2);
  });

  it("does not reach past today when the pivot is in the future", () => {
    // A device clock that has jumped forward makes this reachable, and the
    // forward window would otherwise cover days that have not happened.
    const rows = shiftAround([...before, ...after], addLocalDays(TODAY, 10), 28, NOW);
    expect(rows.find((r) => r.id === "energy")!.after).toBeNull();
  });

  it("reports the day count behind each side", () => {
    const rows = shiftAround([...before, ...after], at(4), 28, NOW);
    const energy = rows.find((r) => r.id === "energy")!;
    expect(energy.daysBefore).toBe(5);
    expect(energy.daysAfter).toBe(4);
  });
});

describe("isTrendworthy", () => {
  const base = {
    id: "energy" as SymptomId,
    label: "Energy",
    before: 2,
    after: 4,
    delta: 2,
    daysBefore: 5,
    daysAfter: 5,
  };

  it("accepts a comparison with enough days on both sides", () => {
    expect(isTrendworthy(base)).toBe(true);
  });

  it("rejects one thin side", () => {
    // One day either side yields a delta of up to 4.0 and means nothing.
    expect(isTrendworthy({ ...base, daysAfter: 1 })).toBe(false);
    expect(isTrendworthy({ ...base, daysBefore: 1 })).toBe(false);
  });

  it("rejects a null delta", () => {
    expect(isTrendworthy({ ...base, delta: null })).toBe(false);
  });
});

describe("streak", () => {
  it("counts back from today when today is rated", () => {
    const rows = [0, 1, 2].map((d) => checkIn(d, { energy: 3 }));
    expect(streak(rows, NOW).current).toBe(3);
  });

  it("does not break the streak just because today is not rated yet", () => {
    // The day is not missed until it is over.
    const rows = [1, 2, 3].map((d) => checkIn(d, { energy: 3 }));
    expect(streak(rows, NOW).current).toBe(3);
  });

  it("stops at a gap", () => {
    const rows = [0, 1, 3, 4].map((d) => checkIn(d, { energy: 3 }));
    expect(streak(rows, NOW).current).toBe(2);
  });

  it("is zero when nothing recent was rated", () => {
    expect(streak([checkIn(10, { energy: 3 })], NOW).current).toBe(0);
  });

  it("counts coverage over the last thirty days", () => {
    const rows = [0, 5, 10, 29, 40].map((d) => checkIn(d, { energy: 3 }));
    expect(streak(rows, NOW).last30).toBe(4);
  });

  it("handles an empty log", () => {
    expect(streak([], NOW)).toEqual({ current: 0, last30: 0 });
  });
});

describe("checkInFor", () => {
  it("finds the entry for a day regardless of the time of day asked about", () => {
    const rows = [checkIn(1, { energy: 3 })];
    expect(checkInFor(rows, at(1) + 20 * 3_600_000)?.id).toBe("c1");
  });

  it("returns undefined for an unrated day", () => {
    expect(checkInFor([checkIn(1, { energy: 3 })], at(2))).toBeUndefined();
  });
});

describe("series", () => {
  it("returns oldest first and skips days that did not rate it", () => {
    const rows = [
      checkIn(0, { energy: 5 }),
      checkIn(1, { sleep: 2 }),
      checkIn(2, { energy: 1 }),
    ];
    expect(series(rows, "energy")).toEqual([
      { at: at(2), value: 1 },
      { at: at(0), value: 5 },
    ]);
  });
});

describe("diaryDays", () => {
  const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
  const check = (at: number, notes?: string): CheckIn => ({
    id: `c-${at}`,
    profileId: "me",
    at: startOfLocalDay(at),
    ratings: { energy: 3 },
    notes,
  });

  it("puts the day's doses and its rating together", () => {
    const dose = { at: day(2026, 8, 20, 7) };
    const [only] = diaryDays([dose], [check(day(2026, 8, 20), "rough night")]);
    expect(only.entries).toEqual([dose]);
    expect(only.checkIn?.notes).toBe("rough night");
  });

  it("keeps a day that was only rated", () => {
    // The case the report was about: side effects on a day with no injection.
    const days = diaryDays<{ at: number }>([], [check(day(2026, 8, 21), "woke at three")]);
    expect(days).toHaveLength(1);
    expect(days[0].entries).toEqual([]);
    expect(days[0].checkIn?.notes).toBe("woke at three");
  });

  it("keeps a day that was only dosed", () => {
    const days = diaryDays([{ at: day(2026, 8, 22, 8) }], []);
    expect(days).toHaveLength(1);
    expect(days[0].checkIn).toBeUndefined();
  });

  it("reads newest first", () => {
    const days = diaryDays(
      [{ at: day(2026, 8, 20) }, { at: day(2026, 8, 22) }],
      [check(day(2026, 8, 21))]);
    expect(days.map((d) => new Date(d.day).getDate())).toEqual([22, 21, 20]);
  });

  it("gathers everything logged on one day into that day", () => {
    const entries = [day(2026, 8, 23, 7), day(2026, 8, 23, 22), day(2026, 8, 24, 7)].map((at) => ({ at }));
    const days = diaryDays(entries, []);
    expect(days.map((d) => d.entries.length)).toEqual([1, 2]);
  });

  it("keeps the entries in the order it was given them", () => {
    const evening = { at: day(2026, 8, 25, 22), id: "b" };
    const morning = { at: day(2026, 8, 25, 7), id: "a" };
    expect(diaryDays([evening, morning], [])[0].entries.map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("is empty when there is nothing at all", () => {
    expect(diaryDays([], [])).toEqual([]);
  });
});

describe("ratableDay", () => {
  const NOW = new Date(2026, 5, 10, 14, 0, 0).getTime();
  const day = (d: number, h = 0) => new Date(2026, 5, d, h, 0, 0).getTime();

  it("gives back the local day a moment falls in", () => {
    expect(ratableDay(day(8, 23), NOW)).toBe(day(8));
    expect(ratableDay(day(8, 0), NOW)).toBe(day(8));
  });

  it("allows today, whatever the hour", () => {
    expect(ratableDay(day(10, 0), NOW)).toBe(day(10));
    expect(ratableDay(day(10, 23), NOW)).toBe(day(10));
    // A rating given at two in the afternoon is about today, not half of it.
    expect(ratableDay(NOW, NOW)).toBe(day(10));
  });

  it("allows any day in the past, however far back", () => {
    // Deliberately unbounded. A day five years ago is still a day that was
    // lived, and an arbitrary limit would only ever be somebody's guess.
    expect(ratableDay(new Date(2021, 0, 1).getTime(), NOW)).toBe(
      new Date(2021, 0, 1).getTime());
  });

  it("refuses tomorrow", () => {
    expect(ratableDay(day(11), NOW)).toBeNull();
    expect(ratableDay(day(11, 23), NOW)).toBeNull();
  });

  it("refuses a day far in the future, which is what a mistyped year looks like", () => {
    expect(ratableDay(new Date(2062, 5, 10).getTime(), NOW)).toBeNull();
  });

  it("does not clamp a refused day onto today", () => {
    // Clamping looks kinder and would overwrite the rating already given for
    // today with one meant for a day that has not happened.
    expect(ratableDay(day(11), NOW)).not.toBe(day(10));
  });
});

describe("the axes themselves", () => {
  it("keeps the appetite id, whatever the label says", () => {
    /*
     * The promise that made this split cheap. Every rating anyone has ever
     * saved is keyed by these ids, and the screens draw only what this list
     * mentions, so renaming the id would leave a year of ratings in the data
     * and on no screen. What the axis asks about did not change, only its name.
     */
    const hunger = SYMPTOMS.find((s) => s.id === "appetite");
    expect(hunger).toBeDefined();
    expect(hunger!.label).toBe("Physical hunger");
  });

  it("rates food noise the other way up", () => {
    const noise = SYMPTOMS.find((s) => s.id === "foodNoise")!;
    expect(noise.higherIsBetter).toBe(false);
    // Not undefined. The two are different answers now, and this axis is the
    // reason they are.
    expect(noise.higherIsBetter).not.toBeUndefined();
  });

  it("puts food noise directly after the hunger it is easily confused with", () => {
    const ids = SYMPTOMS.map((s) => s.id);
    expect(ids.indexOf("foodNoise")).toBe(ids.indexOf("appetite") + 1);
  });

  it("explains the two axes that need explaining, and no others", () => {
    const withHint = SYMPTOMS.filter((s) => s.hint).map((s) => s.id);
    expect(withHint.sort()).toEqual(["appetite", "foodNoise"]);
  });

  it("reads back an old rating unchanged", () => {
    // A check-in saved before the split, carrying only appetite. It still
    // averages, and it still counts as a rated day.
    const rows = averages([checkIn(0, { appetite: 4 })]);
    expect(rows.find((r) => r.id === "appetite")!.mean).toBe(4);
    expect(rows.find((r) => r.id === "foodNoise")!.mean).toBeNull();
    expect(streak([checkIn(0, { appetite: 4 })], NOW).current).toBe(1);
  });
});
