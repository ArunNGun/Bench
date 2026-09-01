import { describe, expect, it } from "vitest";
import { BODY, DAY, SITE_DOTS, overusedSites, siteUsage, suggestSite } from "./sites";
import { INJECTION_SITES, type DoseLog, type InjectionSite } from "../types";

const NOW = Date.UTC(2026, 6, 29, 12, 0, 0);

const log = (site: InjectionSite, daysAgo: number, skipped = false) =>
  ({ at: NOW - daysAgo * DAY, site, skipped }) as Pick<DoseLog, "at" | "site" | "skipped">;

describe("siteUsage", () => {
  it("covers every known site even with no history", () => {
    const u = siteUsage([], NOW);
    expect(u).toHaveLength(INJECTION_SITES.length);
    expect(u.every((s) => s.lastUsedAt === null)).toBe(true);
    expect(u.every((s) => s.rested === 1)).toBe(true);
  });

  it("records the most recent use of a site", () => {
    const u = siteUsage([log("thigh-l", 5), log("thigh-l", 1)], NOW);
    const thigh = u.find((s) => s.site === "thigh-l")!;
    expect(thigh.daysSince).toBeCloseTo(1, 6);
    expect(thigh.recentCount).toBe(2);
  });

  it("scores a freshly used site as unrested", () => {
    const u = siteUsage([log("abdomen-ul", 0)], NOW);
    expect(u.find((s) => s.site === "abdomen-ul")!.rested).toBe(0);
  });

  it("counts a site as fully rested once past the rest window", () => {
    const u = siteUsage([log("abdomen-ul", 20)], NOW, 14);
    expect(u.find((s) => s.site === "abdomen-ul")!.rested).toBe(1);
  });

  it("scales rest linearly inside the window", () => {
    const u = siteUsage([log("abdomen-ul", 7)], NOW, 14);
    expect(u.find((s) => s.site === "abdomen-ul")!.rested).toBeCloseTo(0.5, 6);
  });

  it("ignores skipped doses because nothing was injected", () => {
    const u = siteUsage([log("thigh-r", 0, true)], NOW);
    expect(u.find((s) => s.site === "thigh-r")!.lastUsedAt).toBeNull();
  });

  it("ignores logs with no site recorded", () => {
    const u = siteUsage([{ at: NOW, skipped: false }], NOW);
    expect(u.every((s) => s.lastUsedAt === null)).toBe(true);
  });

  it("only counts uses inside the lookback window", () => {
    const u = siteUsage([log("arm-l", 30), log("arm-l", 2)], NOW, 14);
    expect(u.find((s) => s.site === "arm-l")!.recentCount).toBe(1);
  });

  it("sorts most rested first", () => {
    const u = siteUsage([log("abdomen-ul", 0), log("abdomen-ur", 10)], NOW, 14);
    expect(u[0].rested).toBeGreaterThanOrEqual(u[u.length - 1].rested);
    expect(u[u.length - 1].site).toBe("abdomen-ul");
  });
});

describe("suggestSite", () => {
  it("picks an untouched site over any used one", () => {
    const used = INJECTION_SITES.slice(0, 9).map((s, i) => log(s.id, i));
    const untouched = INJECTION_SITES[9].id;
    expect(suggestSite(used, NOW)).toBe(untouched);
  });

  it("picks the longest-rested site once everything has been used", () => {
    const logs = INJECTION_SITES.map((s, i) => log(s.id, i + 1));
    // The last entry in the list was used longest ago.
    expect(suggestSite(logs, NOW)).toBe(INJECTION_SITES[INJECTION_SITES.length - 1].id);
  });

  it("breaks a rest tie toward the less frequently used site", () => {
    // Both last used 3 days ago, but one was hit three times in the window.
    const logs = [
      log("thigh-l", 3),
      log("thigh-l", 5),
      log("thigh-l", 6),
      log("thigh-r", 3), ...INJECTION_SITES.filter((s) => s.id !== "thigh-l" && s.id !== "thigh-r").map((s) =>
        log(s.id, 1)),
    ];
    expect(suggestSite(logs, NOW)).toBe("thigh-r");
  });

  it("rotates away from the site just used", () => {
    const logs = INJECTION_SITES.map((s, i) => log(s.id, i + 1));
    const next = suggestSite(logs, NOW);
    expect(next).not.toBe(INJECTION_SITES[0].id);
  });

  it("produces a full rotation before repeating", () => {
    const logs: Pick<DoseLog, "at" | "site" | "skipped">[] = [];
    const picked: InjectionSite[] = [];
    for (let i = 0; i < INJECTION_SITES.length; i++) {
      const site = suggestSite(logs, NOW + i * 1000);
      picked.push(site);
      logs.push({ at: NOW + i * 1000, site, skipped: false });
    }
    expect(new Set(picked).size).toBe(INJECTION_SITES.length);
  });
});

describe("overusedSites", () => {
  it("flags a site hit three or more times in the window", () => {
    const logs = [log("abdomen-lr", 1), log("abdomen-lr", 3), log("abdomen-lr", 5)];
    const flagged = overusedSites(logs, NOW);
    expect(flagged.map((s) => s.site)).toContain("abdomen-lr");
  });

  it("does not flag light use", () => {
    expect(overusedSites([log("abdomen-lr", 1), log("abdomen-lr", 3)], NOW)).toEqual([]);
  });

  it("does not flag old use outside the window", () => {
    const logs = [log("abdomen-lr", 20), log("abdomen-lr", 25), log("abdomen-lr", 30)];
    expect(overusedSites(logs, NOW, 14)).toEqual([]);
  });
});

describe("suggestSite with a pinned set", () => {
  const pinned: InjectionSite[] = ["thigh-l", "thigh-r", "glute-l"];

  it("only ever suggests from the pinned sites", () => {
    // Abdomen is completely rested but is not pinned.
    const logs = pinned.map((s, i) => log(s, i + 1));
    for (let i = 0; i < 20; i++) {
      expect(pinned).toContain(suggestSite(logs, NOW + i, 14, pinned));
    }
  });

  it("picks the longest-rested site inside the pinned set", () => {
    const logs = [log("thigh-l", 1), log("thigh-r", 9), log("glute-l", 4)];
    expect(suggestSite(logs, NOW, 14, pinned)).toBe("thigh-r");
  });

  it("rotates through the pinned sites in turn", () => {
    const logs: Pick<DoseLog, "at" | "site" | "skipped">[] = [];
    const picked: InjectionSite[] = [];
    for (let i = 0; i < pinned.length; i++) {
      const s = suggestSite(logs, NOW + i * 1000, 14, pinned);
      picked.push(s);
      logs.push({ at: NOW + i * 1000, site: s, skipped: false });
    }
    expect(new Set(picked).size).toBe(pinned.length);
  });

  it("falls back to every site when nothing is pinned", () => {
    const logs = INJECTION_SITES.slice(0, 9).map((s, i) => log(s.id, i + 1));
    expect(suggestSite(logs, NOW, 14, [])).toBe(INJECTION_SITES[9].id);
    expect(suggestSite(logs, NOW, 14, null)).toBe(INJECTION_SITES[9].id);
    expect(suggestSite(logs, NOW, 14, undefined)).toBe(INJECTION_SITES[9].id);
  });

  it("ignores history from sites outside the pinned set", () => {
    // Heavy abdomen use must not influence which thigh comes next.
    const logs = [
      ...Array.from({ length: 5 }, (_, i) => log("abdomen-ul", i + 1)),
      log("thigh-l", 2),
      log("thigh-r", 8),
      log("glute-l", 5),
    ];
    expect(suggestSite(logs, NOW, 14, pinned)).toBe("thigh-r");
  });

  it("still returns a pinned site when none of them has ever been used", () => {
    const logs = [log("abdomen-ul", 1), log("abdomen-ur", 2)];
    expect(pinned).toContain(suggestSite(logs, NOW, 14, pinned));
  });

  it("handles a single pinned site by always returning it", () => {
    const logs = [log("thigh-l", 0)];
    expect(suggestSite(logs, NOW, 14, ["thigh-l"])).toBe("thigh-l");
  });
});

// ---------------------------------------------------------------------------
// Where the dots are drawn
//
// The figure was redrawn shorter and the coordinates were not, so the thighs
// ended up on the shins, the glutes above the knees and one abdomen dot in the
// gap between the legs. Nothing failed, because nothing was checking. These
// bounds are the same numbers the body is drawn with, so redrawing it means
// updating BODY, and that is what tells the next person the dots have moved.
// ---------------------------------------------------------------------------

const dot = (id: InjectionSite) => {
  const found = SITE_DOTS.find((s) => s.id === id);
  if (!found) throw new Error(`no dot for ${id}`);
  return found;
};

describe("the site map", () => {
  it("has a dot for every site the app offers, and none it does not", () => {
    expect(SITE_DOTS.map((s) => s.id).sort()).toEqual(
      INJECTION_SITES.map((s) => s.id).sort());
  });

  describe("abdomen", () => {
    const abdomen = SITE_DOTS.filter((s) => s.id.startsWith("abdomen"));

    it("sits on the torso, above the crotch", () => {
      for (const s of abdomen) {
        expect(s.cy, s.id).toBeGreaterThan(BODY.torsoTop);
        expect(s.cy, s.id).toBeLessThan(BODY.crotchY);
      }
    });

    it("stays between the sides of the torso", () => {
      for (const s of abdomen) {
        expect(s.cx, s.id).toBeGreaterThan(BODY.torsoLeft);
        expect(s.cx, s.id).toBeLessThan(BODY.torsoRight);
      }
    });

    it("never lands in the gap between the legs", () => {
      for (const s of abdomen) {
        const inGap = s.cx > BODY.gapLeft && s.cx < BODY.gapRight && s.cy >= BODY.crotchY;
        expect(inGap, s.id).toBe(false);
      }
    });
  });

  describe("thighs and glutes", () => {
    it("are both on the upper leg, not down on the shin", () => {
      for (const id of ["thigh-l", "thigh-r", "glute-l", "glute-r"] as InjectionSite[]) {
        expect(dot(id).cy, id).toBeGreaterThan(BODY.crotchY);
        expect(dot(id).cy, id).toBeLessThan(BODY.kneeY);
      }
    });

    it("puts the glute above the thigh, where a hip is", () => {
      expect(dot("glute-l").cy).toBeLessThan(dot("thigh-l").cy);
      expect(dot("glute-r").cy).toBeLessThan(dot("thigh-r").cy);
    });

    it("leaves enough room between them to tap one and not the other", () => {
      // Dots are drawn at r=8, so anything tighter than a diameter overlaps.
      expect(dot("thigh-l").cy - dot("glute-l").cy).toBeGreaterThanOrEqual(16);
      expect(dot("thigh-r").cy - dot("glute-r").cy).toBeGreaterThanOrEqual(16);
    });

    it("stays out of the gap between the legs", () => {
      for (const id of ["thigh-l", "glute-l"] as InjectionSite[]) {
        expect(dot(id).cx, id).toBeLessThan(BODY.gapLeft);
      }
      for (const id of ["thigh-r", "glute-r"] as InjectionSite[]) {
        expect(dot(id).cx, id).toBeGreaterThan(BODY.gapRight);
      }
    });
  });

  describe("deltoids", () => {
    it("sit on the sleeve rather than below it", () => {
      for (const id of ["arm-l", "arm-r"] as InjectionSite[]) {
        expect(dot(id).cy, id).toBeGreaterThan(BODY.armTopY);
        expect(dot(id).cy, id).toBeLessThan(BODY.armBottomY);
      }
    });

    it("sit outside the torso, where an arm is", () => {
      expect(dot("arm-l").cx).toBeLessThan(BODY.torsoLeft);
      expect(dot("arm-r").cx).toBeGreaterThan(BODY.torsoRight);
    });
  });

  it("mirrors left and right about the middle of the figure", () => {
    const pairs: [InjectionSite, InjectionSite][] = [
      ["abdomen-ul", "abdomen-ur"],
      ["abdomen-ll", "abdomen-lr"],
      ["arm-l", "arm-r"],
      ["glute-l", "glute-r"],
      ["thigh-l", "thigh-r"],
    ];
    for (const [l, r] of pairs) {
      expect(dot(l).cx + dot(r).cx, `${l}/${r}`).toBe(200);
      expect(dot(l).cy, `${l}/${r}`).toBe(dot(r).cy);
    }
  });

  it("keeps every dot inside the viewBox it is drawn in", () => {
    for (const s of SITE_DOTS) {
      expect(s.cx, s.id).toBeGreaterThan(0);
      expect(s.cx, s.id).toBeLessThan(200);
      expect(s.cy, s.id).toBeGreaterThan(0);
      expect(s.cy, s.id).toBeLessThan(240);
    }
  });
});
