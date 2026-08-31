import { describe, expect, it } from "vitest";
import {
  addLocalDays,
  adherence,
  doseTimesBetween,
  dueStatus,
  nextDoseTime,
  phaseSpanAt,
  phaseSpans,
  previousDoseTime,
  protocolDoseTimesBetween,
  protocolDosesPerWeek,
  protocolNextDoseTime,
  protocolPhases,
  protocolPreviousDoseTime,
  scheduledDoseMcg,
  startOfLocalDay,
} from "./schedule";
import type { Protocol, ProtocolPhase } from "../types";

/** A local-time date, so tests match the local reasoning the module uses. */
const local = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min, 0, 0).getTime();

/** A Monday, so "every 7 days" and "Mondays" describe the same days. */
const start = local(2026, 1, 5, 9, 0);

const protocol = (over: Partial<Protocol> = {}): Protocol => ({
  id: "p1",
  profileId: "me",
  peptideId: "retatrutide",
  name: "Test",
  active: true,
  startedAt: start,
  doseMcg: 1000,
  route: "subcutaneous",
  schedule: { kind: "interval-days", intervalDays: 7, timeOfDay: "09:00" },
  titrationAutoAdvance: false, ...over,
});

/** The ladder from the feature request: 1, 2, 3 then 4 mg. */
const ladder: ProtocolPhase[] = [
  { step: 1, doseMcg: 1000, weeks: 3 },
  { step: 2, doseMcg: 2000, weeks: 3 },
  { step: 3, doseMcg: 3000, weeks: 1 },
  { step: 4, doseMcg: 4000, weeks: 1 },
];

describe("protocolPhases", () => {
  it("is null when nothing governs the dose", () => {
    expect(protocolPhases(protocol())).toBeNull();
  });

  it("reads an auto-advancing titration as a phase list", () => {
    const p = protocol({
      titration: [
        { step: 1, doseMcg: 2000, weeks: 4 },
        { step: 2, doseMcg: 4000, weeks: 4 },
      ],
      titrationAutoAdvance: true,
    });
    expect(protocolPhases(p)?.map((s) => s.doseMcg)).toEqual([2000, 4000]);
  });

  it("ignores a titration that is only shown for reference", () => {
    const p = protocol({
      titration: [{ step: 1, doseMcg: 2000, weeks: 4 }],
      titrationAutoAdvance: false,
    });
    expect(protocolPhases(p)).toBeNull();
  });

  it("prefers a hand-built plan over a titration", () => {
    const p = protocol({
      phases: ladder,
      titration: [{ step: 1, doseMcg: 9000, weeks: 4 }],
      titrationAutoAdvance: true,
    });
    expect(protocolPhases(p)?.[0].doseMcg).toBe(1000);
  });
});

describe("phaseSpans", () => {
  it("collapses to a single open-ended span with no phases", () => {
    const spans = phaseSpans(protocol());
    expect(spans).toHaveLength(1);
    expect(spans[0].anchor).toBe(start);
    expect(spans[0].to).toBe(Infinity);
  });

  it("anchors the first phase at the protocol start, not that midnight", () => {
    expect(phaseSpans(protocol({ phases: ladder }))[0].anchor).toBe(start);
  });

  it("gives each later phase its own anchor, a whole number of weeks in", () => {
    const spans = phaseSpans(protocol({ phases: ladder }));
    expect(spans[1].anchor).toBe(addLocalDays(local(2026, 1, 5), 21));
    expect(spans[2].anchor).toBe(addLocalDays(local(2026, 1, 5), 42));
    expect(spans[3].anchor).toBe(addLocalDays(local(2026, 1, 5), 49));
  });

  it("runs the last phase on regardless of the weeks it claims", () => {
    expect(phaseSpans(protocol({ phases: ladder })).at(-1)!.to).toBe(Infinity);
  });

  it("leaves no gap between one phase ending and the next beginning", () => {
    const spans = phaseSpans(protocol({ phases: ladder }));
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i].from).toBe(spans[i - 1].to + 1);
    }
  });
});

describe("scheduledDoseMcg with phases", () => {
  const p = protocol({ phases: ladder });

  it("gives the first dose in week one", () => {
    expect(scheduledDoseMcg(p, start)).toBe(1000);
  });

  it("holds a band for its whole length", () => {
    expect(scheduledDoseMcg(p, addLocalDays(start, 20))).toBe(1000);
  });

  it("steps up on the day the next band starts", () => {
    expect(scheduledDoseMcg(p, addLocalDays(start, 21))).toBe(2000);
  });

  it("walks the whole ladder", () => {
    expect(scheduledDoseMcg(p, addLocalDays(start, 42))).toBe(3000);
    expect(scheduledDoseMcg(p, addLocalDays(start, 49))).toBe(4000);
  });

  it("holds the last band indefinitely, which is what week 8 onwards means", () => {
    expect(scheduledDoseMcg(p, addLocalDays(start, 400))).toBe(4000);
  });

  it("falls back to the fixed dose before the protocol starts", () => {
    expect(scheduledDoseMcg(p, addLocalDays(start, -1))).toBe(1000);
  });
});

describe("phaseSpanAt", () => {
  it("is null before the protocol starts", () => {
    expect(phaseSpanAt(protocol({ phases: ladder }), addLocalDays(start, -2))).toBeNull();
  });

  it("reports the index the card badge counts from", () => {
    const p = protocol({ phases: ladder });
    expect(phaseSpanAt(p, addLocalDays(start, 22))?.index).toBe(1);
  });
});

describe("per phase frequency", () => {
  /** Twice a week to begin with, then weekly. */
  const mixed: ProtocolPhase[] = [
    {
      step: 1,
      doseMcg: 500,
      weeks: 2,
      schedule: { kind: "interval-days", intervalDays: 3, timeOfDay: "09:00" },
    },
    {
      step: 2,
      doseMcg: 1000,
      weeks: 4,
      schedule: { kind: "interval-days", intervalDays: 7, timeOfDay: "09:00" },
    },
  ];

  const p = protocol({ phases: mixed });

  it("doses every three days while the first band runs", () => {
    const times = protocolDoseTimesBetween(p, start, addLocalDays(start, 13));
    expect(times.map((t) => new Date(t).getDate())).toEqual([5, 8, 11, 14, 17]);
  });

  it("restarts the interval at the band boundary rather than inheriting it", () => {
    // Band two begins on day 14. Weekly from there is day 14, 21, 28, not an
    // offset carried over from a rhythm that began on day zero.
    const times = protocolDoseTimesBetween(p, addLocalDays(start, 14), addLocalDays(start, 30));
    expect(times.map((t) => new Date(t).getDate())).toEqual([19, 26, 2]);
  });

  it("reports the current band's rate, not an average over the plan", () => {
    expect(protocolDosesPerWeek(p, addLocalDays(start, 3))).toBeCloseTo(7 / 3, 5);
    expect(protocolDosesPerWeek(p, addLocalDays(start, 20))).toBe(1);
  });

  it("skips a band that doses on demand and finds the next real one", () => {
    const withGap = protocol({
      phases: [
        { step: 1, doseMcg: 500, weeks: 2, schedule: { kind: "as-needed" } },
        { step: 2, doseMcg: 1000, weeks: 4 },
      ],
    });
    const next = protocolNextDoseTime(withGap, start);
    expect(next).not.toBeNull();
    expect(next!).toBeGreaterThanOrEqual(addLocalDays(start, 14));
  });

  it("produces times in order across a boundary", () => {
    const times = protocolDoseTimesBetween(p, start, addLocalDays(start, 40));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("never repeats a time at a boundary", () => {
    const times = protocolDoseTimesBetween(p, start, addLocalDays(start, 40));
    expect(new Set(times).size).toBe(times.length);
  });
});

describe("a band overrides only what it names", () => {
  /**
   * A band's schedule is a copy of the protocol's, taken when the band was
   * given a frequency of its own. Anything a schedule learns to hold after
   * that copy was made would never reach the band, which is how an evening
   * dose added at the top of the form went nowhere for a plan in bands.
   */
  const banded = protocol({
    schedule: { kind: "daily", timeOfDay: "07:00", timesOfDay: ["07:00", "19:00"] },
    phases: [
      // Written the way the editor wrote them before times existed.
      { step: 1, doseMcg: 500, weeks: 4, schedule: { kind: "daily", timeOfDay: "07:00" } },
      { step: 2, doseMcg: 1000, weeks: 4, schedule: { kind: "daily", timeOfDay: "07:00" } },
    ],
  });

  it("gives an older band the times the protocol has since gained", () => {
    const day = startOfLocalDay(addLocalDays(start, 3));
    const times = protocolDoseTimesBetween(banded, day, addLocalDays(day, 1) - 1);
    expect(times.map((t) => new Date(t).getHours())).toEqual([7, 19]);
  });

  it("splits the band's dose across those times", () => {
    expect(scheduledDoseMcg(banded, addLocalDays(start, 3))).toBe(250);
  });

  it("leaves a band that names its own times alone", () => {
    const own = protocol({
      schedule: { kind: "daily", timeOfDay: "07:00", timesOfDay: ["07:00", "19:00"] },
      phases: [
        { step: 1, doseMcg: 500, weeks: 4, schedule: { kind: "daily", timesOfDay: ["12:00"] } },
      ],
    });
    const day = startOfLocalDay(addLocalDays(start, 3));
    const times = protocolDoseTimesBetween(own, day, addLocalDays(day, 1) - 1);
    expect(times.map((t) => new Date(t).getHours())).toEqual([12]);
    expect(scheduledDoseMcg(own, day)).toBe(500);
  });

  it("keeps the band's own kind, which is the thing it does name", () => {
    const weeklyBand = protocol({
      schedule: { kind: "daily", timeOfDay: "07:00" },
      phases: [
        { step: 1, doseMcg: 500, weeks: 4, schedule: { kind: "interval-days", intervalDays: 7 } },
      ],
    });
    expect(protocolDosesPerWeek(weeklyBand, addLocalDays(start, 3))).toBe(1);
  });
});

describe("a protocol with no phases behaves exactly as it always did", () => {
  const cases: Partial<Protocol>[] = [
    { schedule: { kind: "daily", timeOfDay: "08:00" } },
    { schedule: { kind: "interval-days", intervalDays: 3, timeOfDay: "09:00" } },
    { schedule: { kind: "days-of-week", daysOfWeek: [1, 4], timeOfDay: "20:00" } },
    { schedule: { kind: "as-needed" } },
    {
      schedule: {
        kind: "daily",
        timeOfDay: "09:00",
        cycleWeeksOn: 2,
        cycleWeeksOff: 1,
      },
    },
    { schedule: { kind: "daily", timeOfDay: "09:00" }, endedAt: addLocalDays(start, 10) },
  ];

  it("matches doseTimesBetween", () => {
    for (const over of cases) {
      const p = protocol(over);
      const to = addLocalDays(start, 60);
      expect(protocolDoseTimesBetween(p, start, to)).toEqual(
        doseTimesBetween(p.schedule, p.startedAt, start, to, p.endedAt));
    }
  });

  it("matches nextDoseTime", () => {
    for (const over of cases) {
      const p = protocol(over);
      const from = addLocalDays(start, 5);
      expect(protocolNextDoseTime(p, from)).toEqual(
        nextDoseTime(p.schedule, p.startedAt, from, p.endedAt));
    }
  });

  it("matches previousDoseTime", () => {
    for (const over of cases) {
      const p = protocol(over);
      const from = addLocalDays(start, 20);
      expect(protocolPreviousDoseTime(p, from)).toEqual(
        previousDoseTime(p.schedule, p.startedAt, from));
    }
  });
});

describe("phases reach the figures built on them", () => {
  const p = protocol({ phases: ladder });

  it("counts expected doses band by band in adherence", () => {
    // Weekly throughout, so eight weeks is eight scheduled doses whatever the
    // dose ladder does on top.
    const a = adherence(p, [], start, addLocalDays(start, 55));
    expect(a.expected).toBe(8);
  });

  it("still marks a due dose as due", () => {
    const now = addLocalDays(start, 21) + 60_000;
    expect(dueStatus(p, now, { lastLoggedAt: null }).state).toBe("due-now");
  });
});
