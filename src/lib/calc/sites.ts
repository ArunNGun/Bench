/**
 * Injection site rotation.
 *
 * Repeatedly injecting the same spot causes lipohypertrophy, firm thickened
 * tissue that absorbs erratically. That makes it a dosing-accuracy problem,
 * not a cosmetic one: the same dose into a built-up site does not deliver the
 * same exposure. Rotation is therefore tracked and suggested, not left to
 * memory.
 */

import { INJECTION_SITES, type DoseLog, type InjectionSite } from "../types";

export const DAY = 86_400_000;

/**
 * The body figure the map is drawn on, in its own viewBox units.
 *
 * The dots used to live beside the drawing with a comment describing where the
 * body was. The body was later redrawn shorter and the comment was not, so the
 * coordinates went on pointing at a figure that no longer existed: the thighs
 * landed on the shins, the glutes above the knees, and one abdomen dot in the
 * gap between the legs, over no body at all. A user reported it as selecting a
 * thigh and watching a dot light up by his ankle.
 *
 * Numbers below are read off the path in SiteMap, not remembered, and they sit
 * here rather than in the component so a test can hold every dot inside them.
 * Redraw the figure and these change, and the test says which dots moved.
 */
export const BODY = {
  /** Where the shoulders meet the neck, and the top of anything torso. */
  torsoTop: 40,
  torsoLeft: 74,
  torsoRight: 126,
  /** Below this line the body is two legs with a gap between them. */
  crotchY: 118,
  /** The upper leg ends here. Anything lower is a shin. */
  kneeY: 162,
  ankleY: 230,
  /** The gap between the legs, which is background, not body. */
  gapLeft: 90,
  gapRight: 110,
  /** The arm, from the shoulder down to the hem of the sleeve. */
  armTopY: 52,
  armBottomY: 85,
} as const;

export interface SiteDot {
  id: InjectionSite;
  cx: number;
  cy: number;
  label: string;
}

/** Where each site is drawn on `BODY`. */
export const SITE_DOTS: SiteDot[] = [
  // Abdomen, two rows around the navel, both above the crotch line. The lower
  // row used to straddle it, which put its middle dot in the gap between the
  // legs.
  { id: "abdomen-ul", cx: 84,  cy: 94,  label: "Abdomen upper-left"  },
  { id: "abdomen-um", cx: 100, cy: 92,  label: "Abdomen upper-mid"   },
  { id: "abdomen-ur", cx: 116, cy: 94,  label: "Abdomen upper-right" },
  { id: "abdomen-ll", cx: 84,  cy: 108, label: "Abdomen lower-left"  },
  { id: "abdomen-lm", cx: 100, cy: 110, label: "Abdomen lower-mid"   },
  { id: "abdomen-lr", cx: 116, cy: 108, label: "Abdomen lower-right" },
  // Deltoids, on the sleeve rather than beside it.
  { id: "arm-l",      cx: 68,  cy: 68,  label: "Left deltoid"        },
  { id: "arm-r",      cx: 132, cy: 68,  label: "Right deltoid"       },
  // Glutes take the hip. A figure drawn from the front cannot show the buttock,
  // and the hip is where a person points when asked where they injected.
  { id: "glute-l",    cx: 80,  cy: 128, label: "Left glute"          },
  { id: "glute-r",    cx: 120, cy: 128, label: "Right glute"         },
  // Thighs, midway down the upper leg and well clear of the knee.
  { id: "thigh-l",    cx: 83,  cy: 146, label: "Left thigh"          },
  { id: "thigh-r",    cx: 117, cy: 146, label: "Right thigh"         },
];

export interface SiteUsage {
  site: InjectionSite;
  label: string;
  group: string;
  /** Most recent use, or null if never used. */
  lastUsedAt: number | null;
  /** Days since last use. Infinity when never used. */
  daysSince: number;
  /** Times used inside the lookback window. */
  recentCount: number;
  /**
   * 0 = freshly used, 1 = fully rested. Drives the heat map, and is what the
   * suggestion sorts on.
   */
  rested: number;
}

/**
 * How rested every site is, most rested first.
 *
 * `restDays` is how long a site should ideally be left alone; past that it
 * counts as fully recovered.
 */
export function siteUsage(
  logs: Pick<DoseLog, "at" | "site" | "skipped">[],
  nowMs: number,
  restDays = 14): SiteUsage[] {
  const windowStart = nowMs - restDays * DAY;
  const relevant = logs.filter((l) => !l.skipped && l.site);

  return INJECTION_SITES.map(({ id, label, group }) => {
    const uses = relevant.filter((l) => l.site === id).map((l) => l.at);
    const lastUsedAt = uses.length ? Math.max(...uses) : null;
    const daysSince = lastUsedAt == null ? Infinity : (nowMs - lastUsedAt) / DAY;
    const recentCount = uses.filter((t) => t >= windowStart).length;

    return {
      site: id,
      label,
      group,
      lastUsedAt,
      daysSince,
      recentCount,
      rested: Math.max(0, Math.min(1, daysSince / restDays)),
    };
  }).sort((a, b) => b.rested - a.rested || a.recentCount - b.recentCount);
}

/**
 * The site to use next: whichever has rested longest.
 *
 * Ties break toward the site used least often recently, so a site that was
 * hit three times last week loses to one hit once, even at equal rest.
 */
export function suggestSite(
  logs: Pick<DoseLog, "at" | "site" | "skipped">[],
  nowMs: number,
  restDays = 14,
  allowed?: InjectionSite[] | null): InjectionSite {
  const ranked = siteUsage(logs, nowMs, restDays);
  if (allowed?.length) {
    const set = new Set(allowed);
    const within = ranked.filter((s) => set.has(s.site));
    if (within.length) return within[0].site;
  }
  return ranked[0].site;
}

/** Sites hit hard enough recently that they are worth resting. */
export function overusedSites(
  logs: Pick<DoseLog, "at" | "site" | "skipped">[],
  nowMs: number,
  restDays = 14,
  threshold = 3): SiteUsage[] {
  return siteUsage(logs, nowMs, restDays).filter((s) => s.recentCount >= threshold);
}
