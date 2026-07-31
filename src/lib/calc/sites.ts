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
