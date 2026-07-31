import { describe, expect, it } from "vitest";
import { hoursSince, timelinePhaseAt, timelineWithCurrent } from "./phase";
import { PEPTIDE_BY_ID } from "../data/peptides";
import type { Peptide } from "../types";

const reta = PEPTIDE_BY_ID.get("retatrutide")!;
const tirz = PEPTIDE_BY_ID.get("tirzepatide")!;
const noTimeline: Peptide = { ...reta, id: "bare", timeline: undefined };

describe("timelinePhaseAt", () => {
  it("finds the window covering a moment", () => {
    // Retatrutide: 0 to 12 absorbing, 12 to 48 peak, 48 to 144 active, 144 to 336 trailing.
    expect(timelinePhaseAt(reta, 6)?.label).toContain("Absorbing");
    expect(timelinePhaseAt(reta, 24)?.label).toContain("Peak");
    expect(timelinePhaseAt(reta, 100)?.label).toContain("Past peak");
  });

  it("takes the later window at a boundary", () => {
    // A window runs from inclusive to exclusive, so hour 12 is the peak one.
    expect(timelinePhaseAt(reta, 12)?.fromHours).toBe(12);
  });

  it("reports how far through the window you are", () => {
    // Peak window is 12 to 48, so hour 30 is halfway.
    const p = timelinePhaseAt(reta, 30)!;
    expect(p.progress).toBeCloseTo(0.5, 6);
  });

  it("counts down to the next window", () => {
    const p = timelinePhaseAt(reta, 40)!;
    expect(p.hoursToNext).toBeCloseTo(8, 6);
  });

  it("has no next window on the final one", () => {
    const last = reta.timeline![reta.timeline!.length - 1];
    const p = timelinePhaseAt(reta, last.fromHours + 1)!;
    expect(p.hoursToNext).toBeNull();
  });

  it("returns nothing once past the end of the timeline", () => {
    const end = reta.timeline![reta.timeline!.length - 1].toHours;
    expect(timelinePhaseAt(reta, end + 1)).toBeNull();
  });

  it("returns nothing before the dose", () => {
    expect(timelinePhaseAt(reta, -1)).toBeNull();
  });

  it("returns nothing for a compound with no timeline", () => {
    expect(timelinePhaseAt(noTimeline, 5)).toBeNull();
  });

  it("starts in the first window at hour zero", () => {
    expect(timelinePhaseAt(reta, 0)?.fromHours).toBe(0);
    expect(timelinePhaseAt(reta, 0)?.progress).toBe(0);
  });

  it("works for a compound with a different timeline shape", () => {
    expect(timelinePhaseAt(tirz, 20)?.label).toContain("Peak");
  });

  it("never returns overlapping windows for any hour in range", () => {
    for (const p of [reta, tirz]) {
      const end = p.timeline![p.timeline!.length - 1].toHours;
      for (let h = 0; h < end; h += 0.5) {
        const found = p.timeline!.filter((w) => h >= w.fromHours && h < w.toHours);
        expect(found.length, `${p.id} at ${h}h`).toBe(1);
      }
    }
  });
});

describe("timelineWithCurrent", () => {
  it("marks exactly one window current", () => {
    const rows = timelineWithCurrent(reta, 24);
    expect(rows.filter((r) => r.current)).toHaveLength(1);
    expect(rows.find((r) => r.current)?.fromHours).toBe(12);
  });

  it("marks earlier windows as past", () => {
    const rows = timelineWithCurrent(reta, 100);
    expect(rows[0].past).toBe(true);
    expect(rows[1].past).toBe(true);
    expect(rows[2].current).toBe(true);
  });

  it("marks nothing when no dose has been logged", () => {
    const rows = timelineWithCurrent(reta, null);
    expect(rows.every((r) => !r.current && !r.past)).toBe(true);
  });

  it("returns an empty list for a compound with no timeline", () => {
    expect(timelineWithCurrent(noTimeline, 5)).toEqual([]);
  });
});

describe("hoursSince", () => {
  const now = Date.UTC(2026, 6, 29, 12);

  it("converts a timestamp into elapsed hours", () => {
    expect(hoursSince(now - 6 * 3_600_000, now)).toBeCloseTo(6, 9);
  });

  it("is null when nothing has been logged", () => {
    expect(hoursSince(null, now)).toBeNull();
  });

  it("floors a future timestamp at zero", () => {
    expect(hoursSince(now + 3_600_000, now)).toBe(0);
  });
});
