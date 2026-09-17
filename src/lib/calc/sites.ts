/**
 * Injection site rotation.
 *
 * Repeatedly injecting the same spot causes lipohypertrophy, firm thickened
 * tissue that absorbs erratically. That makes it a dosing-accuracy problem,
 * not a cosmetic one: the same dose into a built-up site does not deliver the
 * same exposure. Rotation is therefore tracked and suggested, not left to
 * memory.
 */

import { INJECTION_SITES, type DoseLog, type InjectionSite, type Route } from "../types";

export const DAY = 86_400_000;

/**
 * Routes that put a needle into tissue, and so have a site to rotate.
 *
 * The whole of this module exists because of lipohypertrophy, which is what
 * repeated injections into one spot do to that spot. Nothing else in the list
 * of routes does that: a tablet is swallowed, a spray goes up a nose, a cream
 * is rubbed in, and an intravenous dose goes into a vein rather than into the
 * areas this module knows about.
 *
 * So the site is a fact about an injection, not about a dose. It was written
 * onto every dose regardless, which showed a box of tablets as having been
 * given in the left abdomen, on a rotation it was also quietly consuming.
 */
const INJECTED_ROUTES: Route[] = ["subcutaneous", "intramuscular"];

export function routeHasSite(route: Route): boolean {
  return INJECTED_ROUTES.includes(route);
}

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
}

/** Where each site is drawn on `BODY`. */
export const SITE_DOTS: SiteDot[] = [
  // Abdomen, two rows around the navel, both above the crotch line. The lower
  // row used to straddle it, which put its middle dot in the gap between the
  // legs.
  { id: "abdomen-ul", cx: 84,  cy: 94  },
  { id: "abdomen-um", cx: 100, cy: 92  },
  { id: "abdomen-ur", cx: 116, cy: 94  },
  { id: "abdomen-ll", cx: 84,  cy: 108 },
  { id: "abdomen-lm", cx: 100, cy: 110 },
  { id: "abdomen-lr", cx: 116, cy: 108 },
  // Deltoids, on the sleeve rather than beside it.
  { id: "arm-l",      cx: 68,  cy: 68  },
  { id: "arm-r",      cx: 132, cy: 68  },
  // Glutes take the hip. A figure drawn from the front cannot show the buttock,
  // and the hip is where a person points when asked where they injected.
  { id: "glute-l",    cx: 80,  cy: 128 },
  { id: "glute-r",    cx: 120, cy: 128 },
  // Thighs, midway down the upper leg and well clear of the knee.
  { id: "thigh-l",    cx: 83,  cy: 146 },
  { id: "thigh-r",    cx: 117, cy: 146 },
];

export interface SiteUsage {
  site: InjectionSite;
  /*
   * No label. This module used to carry the English name of each site
   * alongside its id, which made it one more place the app wrote words, and
   * the wrong place: whoever draws the row knows which language the reader
   * picked and this file does not. `siteLabel` in format.ts turns the id into
   * a name, at the edge, the same way a date becomes a date there.
   */
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
  logs: Pick<DoseLog, "at" | "site" | "skipped" | "route">[],
  nowMs: number,
  restDays = 14): SiteUsage[] {
  const windowStart = nowMs - restDays * DAY;
  /*
   * A record can carry a site it had no business carrying: until the form was
   * corrected it wrote whichever site it had suggested onto every dose, so a
   * swallowed tablet and a nasal spray both landed on a thigh. Filtering here
   * rather than only at the point of writing means the old records stop
   * counting against a rotation they never touched, without editing anyone's
   * history to make it so.
   */
  const relevant = logs.filter((l) => !l.skipped && l.site && routeHasSite(l.route));

  return INJECTION_SITES.map(({ id }) => {
    const uses = relevant.filter((l) => l.site === id).map((l) => l.at);
    const lastUsedAt = uses.length ? Math.max(...uses) : null;
    const daysSince = lastUsedAt == null ? Infinity : (nowMs - lastUsedAt) / DAY;
    const recentCount = uses.filter((t) => t >= windowStart).length;

    return {
      site: id,
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
  logs: Pick<DoseLog, "at" | "site" | "skipped" | "route">[],
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

/**
 * The sites worth offering for the next dose, best first.
 *
 * The same ranking and the same filter `suggestSite` uses, stopped short rather
 * than reduced to one. That is the point: the first entry here and the site the
 * one-tap button writes have to be the same site, or the list contradicts the
 * button standing next to it. A test holds them together.
 *
 * `limit` keeps the panel short enough not to shove the page around. Where a
 * protocol pins its own sites there are usually three or four of them, and the
 * screen offers a way through to all of them for the rest.
 */
export function siteChoices(
  logs: Pick<DoseLog, "at" | "site" | "skipped" | "route">[],
  nowMs: number,
  restDays = 14,
  allowed?: InjectionSite[] | null,
  limit = 5): SiteUsage[] {
  const ranked = siteUsage(logs, nowMs, restDays);
  const set = allowed?.length ? new Set(allowed) : null;
  const within = set ? ranked.filter((s) => set.has(s.site)) : ranked;

  // An empty pinned list, or one naming sites that no longer exist, falls back
  // to every site rather than to nothing. suggestSite does the same.
  return (within.length ? within : ranked).slice(0, Math.max(1, limit));
}

/** Sites hit hard enough recently that they are worth resting. */
export function overusedSites(
  logs: Pick<DoseLog, "at" | "site" | "skipped" | "route">[],
  nowMs: number,
  restDays = 14,
  threshold = 3): SiteUsage[] {
  return siteUsage(logs, nowMs, restDays).filter((s) => s.recentCount >= threshold);
}
