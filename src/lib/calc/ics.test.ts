import { describe, expect, it } from "vitest";
import { buildCalendar, calendarEventCount, calendarFileName, foldLine } from "./ics";
import { DEFAULT_REMINDERS, type Protocol, type RemindersSettings } from "../types";

const NOW = new Date(2026, 0, 5, 6, 0, 0).getTime();

const settings = (over: Partial<RemindersSettings> = {}): RemindersSettings => ({
  ...DEFAULT_REMINDERS,
  ...over,
});

const protocol = (over: Partial<Protocol> = {}): Protocol => ({
  id: "p1",
  profileId: "me",
  peptideId: "bpc-157",
  name: "",
  active: true,
  startedAt: new Date(2026, 0, 1, 7, 0, 0).getTime(),
  doseMcg: 250,
  route: "subcutaneous",
  schedule: { kind: "daily", timesOfDay: ["07:00"] },
  titrationAutoAdvance: false,
  ...over,
});

const peptides = [{ id: "bpc-157", name: "BPC-157" }];

const build = (over: Partial<Parameters<typeof buildCalendar>[0]> = {}) =>
  buildCalendar({
    protocols: [protocol()],
    peptides,
    settings: settings(),
    nowMs: NOW,
    days: 7,
    ...over,
  });

const lines = (ics: string) => ics.split("\r\n");

describe("the shape of the file", () => {
  it("opens and closes as a calendar", () => {
    const l = lines(build());
    expect(l[0]).toBe("BEGIN:VCALENDAR");
    expect(l).toContain("VERSION:2.0");
    expect(l.filter(Boolean).at(-1)).toBe("END:VCALENDAR");
  });

  it("ends every line with CRLF, including the last", () => {
    const ics = build();
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.includes("\n\n")).toBe(false);
    // A bare LF anywhere means a line was joined with the wrong separator.
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("balances every event", () => {
    const ics = build();
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe((ics.match(/END:VEVENT/g) ?? []).length);
    expect((ics.match(/BEGIN:VALARM/g) ?? []).length).toBe((ics.match(/END:VALARM/g) ?? []).length);
  });

  it("gives every event the fields a calendar refuses to import without", () => {
    for (const field of ["UID:", "DTSTAMP:", "DTSTART:", "SUMMARY:"]) {
      expect(build()).toContain(field);
    }
  });

  it("names the file by the day it was made", () => {
    expect(calendarFileName(NOW)).toMatch(/^bench-doses-2026-01-0\d\.ics$/);
  });
});

describe("which doses are in it", () => {
  it("writes one event per scheduled dose", () => {
    expect(calendarEventCount(build())).toBe(7);
  });

  it("writes both of a twice-daily plan", () => {
    const ics = build({
      protocols: [protocol({ schedule: { kind: "daily", timesOfDay: ["07:00", "19:00"] } })],
    });
    expect(calendarEventCount(ics)).toBe(14);
  });

  it("holds nothing from the past", () => {
    const ics = build();
    // The fourth was yesterday. Nothing from it belongs in a plan for ahead.
    expect(ics).not.toContain("DTSTART:20260104");
    expect(ics).toContain("DTSTART:20260105T070000");
  });

  it("stops at the horizon", () => {
    // A daily plan gives one event a day. The horizon is a fixed span of
    // milliseconds from now, so a daylight-saving shift inside the window moves
    // the wall clock under it and can let one more dose in. Ninety days from
    // January in a zone that springs forward is ninety-one events, and that is
    // the horizon behaving, not failing.
    // Every span the Settings panel offers.
    for (const days of [7, 14, 21, 30, 60, 90, 180]) {
      const count = calendarEventCount(build({ days }));
      expect(count, `${days} days`).toBeGreaterThanOrEqual(days);
      expect(count, `${days} days`).toBeLessThanOrEqual(days + 1);
    }
  });

  it("reads the span from settings when the caller names none", () => {
    const ics = buildCalendar({
      protocols: [protocol()],
      peptides,
      settings: settings({ calendarDays: 14 }),
      nowMs: NOW,
    });
    expect(calendarEventCount(ics)).toBeGreaterThanOrEqual(14);
    expect(calendarEventCount(ics)).toBeLessThanOrEqual(15);
  });

  it("skips a paused protocol, one that has ended, and an as-needed one", () => {
    expect(calendarEventCount(build({ protocols: [protocol({ active: false })] }))).toBe(0);
    expect(calendarEventCount(build({ protocols: [protocol({ endedAt: NOW - 86_400_000 })] }))).toBe(0);
    expect(
      calendarEventCount(build({ protocols: [protocol({ schedule: { kind: "as-needed" } })] }))).toBe(0);
  });

  it("respects weeks off, which no recurrence rule could express", () => {
    // Three weeks on, one off, from 1 January. The fourth week is silent, and
    // this is the case that decided against RRULE.
    const ics = build({
      protocols: [
        protocol({
          schedule: { kind: "daily", timesOfDay: ["07:00"], cycleWeeksOn: 3, cycleWeeksOff: 1 },
        }),
      ],
      days: 40,
    });
    expect(ics).toContain("DTSTART:20260120T070000");
    // 22 January is day 21, the first day of the week off.
    expect(ics).not.toContain("DTSTART:20260123T070000");
  });
});

describe("what each event says", () => {
  it("says nothing identifying by default", () => {
    const ics = build();
    expect(ics).toContain("SUMMARY:Bench: dose due");
    expect(ics).not.toContain("BPC");
    expect(ics).not.toContain("mcg");
  });

  it("names the compound and dose when that is turned on", () => {
    const ics = build({ settings: settings({ showCompound: true }) });
    expect(ics).toContain("SUMMARY:BPC-157 250 mcg");
  });

  it("follows the phase, so a later event carries the later dose", () => {
    const ics = build({
      protocols: [
        protocol({
          phases: [
            { step: 1, doseMcg: 250, weeks: 1 },
            { step: 2, doseMcg: 500, weeks: 8 },
          ],
        }),
      ],
      settings: settings({ showCompound: true }),
      days: 14,
    });
    expect(ics).toContain("SUMMARY:BPC-157 250 mcg");
    expect(ics).toContain("SUMMARY:BPC-157 500 mcg");
  });

  it("carries its own alarm, so nothing has to be set by hand", () => {
    expect(build()).toContain("TRIGGER:PT0S");
    expect(build({ settings: settings({ leadMinutes: 15 }) })).toContain("TRIGGER:-PT15M");
  });

  it("does not mark the day busy", () => {
    expect(build()).toContain("TRANSP:TRANSPARENT");
  });
});

describe("re-importing", () => {
  it("keeps a dose's UID the same, so a second import edits rather than doubles", () => {
    const a = build();
    const b = build({ nowMs: NOW + 3_600_000 });
    const uid = (ics: string) => lines(ics).filter((l) => l.startsWith("UID:"))[0];
    expect(uid(a)).toBe(uid(b));
  });

  it("raises SEQUENCE on a later export, so the edit is accepted", () => {
    const seq = (ics: string) => Number(lines(ics).find((l) => l.startsWith("SEQUENCE:"))!.slice(9));
    expect(seq(build({ nowMs: NOW + 3_600_000 }))).toBeGreaterThan(seq(build()));
  });

  it("keeps SEQUENCE inside the range every client handles", () => {
    const seq = Number(lines(build()).find((l) => l.startsWith("SEQUENCE:"))!.slice(9));
    expect(Number.isSafeInteger(seq)).toBe(true);
    expect(seq).toBeLessThan(2_147_483_647);
  });

  it("gives two protocols on the same day different UIDs", () => {
    const ics = build({ protocols: [protocol(), protocol({ id: "p2", peptideId: "tb-500" })] });
    const uids = lines(ics).filter((l) => l.startsWith("UID:"));
    expect(new Set(uids).size).toBe(uids.length);
  });
});

describe("the clocks changing", () => {
  it("keeps every dose at 07:00, which UTC would not", () => {
    const ics = buildCalendar({
      protocols: [protocol({ startedAt: new Date(2026, 1, 1, 7, 0, 0).getTime() })],
      peptides,
      settings: settings(),
      nowMs: new Date(2026, 2, 1, 6, 0, 0).getTime(),
      days: 40,
    });

    const starts = lines(ics).filter((l) => l.startsWith("DTSTART:"));
    expect(starts.length).toBeGreaterThan(30);
    for (const s of starts) expect(s).toMatch(/T070000$/);
  });

  it("writes floating local time, with no Z and no TZID", () => {
    const ics = build();
    for (const s of lines(ics).filter((l) => l.startsWith("DTSTART"))) {
      expect(s).not.toContain("Z");
      expect(s).not.toContain("TZID");
    }
    // DTSTAMP is a different thing, a stamp on the file, and is UTC.
    expect(lines(ics).find((l) => l.startsWith("DTSTAMP:"))).toMatch(/Z$/);
  });
});

describe("escaping and folding", () => {
  it("escapes the characters that would end a field early", () => {
    const ics = build({
      protocols: [protocol({ name: "Morning; healing, phase\\one" })],
      settings: settings({ showCompound: true }),
    });
    expect(ics).toContain("SUMMARY:Morning\\; healing\\, phase\\\\one");
  });

  it("leaves a short line alone", () => {
    expect(foldLine("SUMMARY:Bench")).toBe("SUMMARY:Bench");
  });

  it("folds a long line onto continuations that begin with a space", () => {
    const folded = foldLine("SUMMARY:" + "a".repeat(200));
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0].length).toBeLessThanOrEqual(75);
    for (const p of parts.slice(1)) expect(p.startsWith(" ")).toBe(true);
  });

  it("never splits a multi-byte character down the middle", () => {
    const folded = foldLine("SUMMARY:" + "é".repeat(80));
    for (const part of folded.split("\r\n")) {
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    }
    expect(folded.replace(/\r\n /g, "")).toBe("SUMMARY:" + "é".repeat(80));
  });
});
