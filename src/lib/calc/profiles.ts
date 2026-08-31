/**
 * What belongs to a profile, in one list.
 *
 * Every screen filters by `profileId`, so a row whose owner does not exist is
 * invisible, which from the outside is indistinguishable from lost. Two rules
 * follow from that, and both were being applied by hand in different files
 * until one of them quietly stopped keeping up.
 *
 * Deleting a profile has to take that profile's rows with it. `removeProfile`
 * listed the collections inline and was written when there were six of them;
 * orders and bottles of water arrived later and nobody added them, so deleting
 * a profile left them behind, owned by nothing and counted by nothing.
 *
 * And a row pointing at a profile that no longer exists has to find a home
 * again. The migration already adopts rows with no owner at all, on exactly
 * this reasoning, and stopped short of rows whose owner has since been deleted.
 *
 * The list is here so both rules read from it, and a test walks `EMPTY_DATA` to
 * prove that every part of the document is either owned by a profile or named
 * as shared, with the reason written down.
 */

import type { AppData } from "../types";

/** Collections whose rows each belong to exactly one profile. */
export const PROFILE_OWNED_KEYS = [
  "protocols",
  "logs",
  "vials",
  "measurements",
  "labs",
  "checkIns",
  "orders",
  "diluents",
] as const satisfies readonly (keyof AppData)[];

/** Shared by the whole install, with the reason rather than the implication. */
export const SHARED_KEYS = {
  version: "a stamp on the document, not on anyone",
  profiles: "the list of owners itself",
  activeProfileId: "which owner is on screen, a property of the device",
  settings: "one set of preferences per install, including the sync address",
  customPeptides: "a compound you added is a fact about the compound, not about you",
  halfLifeOverrides: "a belief about a compound, deliberately not per profile",
} as const satisfies Partial<Record<keyof AppData, string>>;

type OwnedKey = (typeof PROFILE_OWNED_KEYS)[number];
type Owned = Pick<AppData, OwnedKey>;

/**
 * The document with one profile's rows removed.
 *
 * Only the owned collections are touched. Leaving them behind would corrupt
 * every total on the remaining profile's screens, which is the whole reason
 * deletion cascades at all.
 */
export function withoutProfile<T extends Owned>(data: T, profileId: string): Owned {
  const out = {} as Owned;

  for (const key of PROFILE_OWNED_KEYS) {
    // Each collection is an array of rows carrying a profileId; the cast is the
    // price of walking them by key rather than naming all eight by hand.
    const rows = data[key] as unknown as { profileId?: string }[];
    (out as Record<string, unknown>)[key] = rows.filter((r) => r.profileId !== profileId);
  }

  return out;
}

/**
 * Whether a row is visible to anyone, given the profiles that exist.
 *
 * The other half of the same rule, and the one the migration applies: a row
 * pointing at a profile that has been deleted is filtered off every screen, so
 * it is in the file and nowhere else. `migrateAppData` adopts those rather than
 * dropping them, because throwing away records a person entered is the one
 * thing that cannot be undone.
 */
export function isOrphaned(row: { profileId?: string }, profileIds: Iterable<string>): boolean {
  const live = profileIds instanceof Set ? profileIds : new Set(profileIds);
  return !row.profileId || !live.has(row.profileId);
}
