/**
 * Noticing that records have gone, and being able to put them back.
 *
 * Twice now a collection has emptied itself without anyone doing anything, and
 * both times it was found days later by accident: once when a user went looking
 * for bottles of water that were not there, once when the same bottles were not
 * there again. Both times the data was recoverable only because an export
 * happened to exist from before it happened.
 *
 * The lesson is not about bottles. It is that the app had no opinion about a
 * write that destroys records. Every write was equally welcome, so a write that
 * emptied an entire collection went through as quietly as one that added a
 * dose, and the only witness was a file the user happened to have saved.
 *
 * This file gives the app that opinion. It does not decide what caused a loss,
 * because it cannot know, and it does not refuse the write, because refusing
 * would fight legitimate deletion and a person is entitled to delete their own
 * records. What it does is much smaller and much harder to get wrong: it says
 * which collections got smaller, judges whether that looks like editing or like
 * an accident, and can union the missing rows back afterwards.
 */

import type { AppData } from "../types";

/**
 * Collections of records, each keyed by an id.
 *
 * `settings` and `halfLifeOverrides` are excluded on purpose: neither is a list
 * of rows, so neither can be counted or unioned, and the whole idea here is
 * rows that vanish. `profiles` is in, because losing one takes everything it
 * owns with it, which is exactly the accident worth catching.
 */
export const RECORD_KEYS = [
  "profiles",
  "protocols",
  "logs",
  "vials",
  "measurements",
  "labs",
  "checkIns",
  "customPeptides",
  "orders",
  "diluents",
] as const satisfies readonly (keyof AppData)[];

export type RecordKey = (typeof RECORD_KEYS)[number];

export type RecordCounts = Record<RecordKey, number>;

/** How many rows each collection holds. Absent or malformed counts as none. */
export function countRecords(doc: Partial<AppData> | null | undefined): RecordCounts {
  const out = {} as RecordCounts;
  for (const key of RECORD_KEYS) {
    const value = doc?.[key];
    out[key] = Array.isArray(value) ? value.length : 0;
  }
  return out;
}

export interface Loss {
  key: RecordKey;
  from: number;
  to: number;
}

/**
 * Which collections lost rows, and how many.
 *
 * Counts only. Comparing row by row would be more precise and would also mean
 * walking every dose in a year of history on every keystroke, for an answer
 * that is only ever acted on when the numbers disagree.
 */
export function losses(before: RecordCounts, after: RecordCounts): Loss[] {
  const out: Loss[] = [];
  for (const key of RECORD_KEYS) {
    if (after[key] < before[key]) out.push({ key, from: before[key], to: after[key] });
  }
  return out;
}

/**
 * Whether a loss looks like an accident rather than like editing.
 *
 * Deleting things is normal and must stay silent, or the warning becomes noise
 * and noise gets ignored, which would leave the app worse off than before. So
 * the bar is deliberately high, and it is drawn at two places:
 *
 * A collection emptying completely, from something to nothing, is the shape
 * both real incidents had. Deleting your last vial by hand has the same shape,
 * which is the false positive this accepts: it costs a dismissible panel, and
 * the alternative costs an inventory.
 *
 * Losing most of a collection at once is the other. Half is a judgement, not a
 * derivation. Below it sit the ordinary cases, deleting a dose, a vial, a
 * protocol; above it sit the ones nobody does by accident one row at a time.
 * Two rows becoming one is exempt whatever the fraction says, because on a
 * short list any single deletion is a large fraction of it.
 */
export function isAlarming(loss: Loss): boolean {
  if (loss.from === 0) return false;
  if (loss.to === 0) return true;

  const gone = loss.from - loss.to;
  return gone > 1 && gone / loss.from >= 0.5;
}

/** The losses worth telling someone about. Empty when everything looks normal. */
export function alarmingLosses(before: RecordCounts, after: RecordCounts): Loss[] {
  return losses(before, after).filter(isAlarming);
}

/**
 * The rows that were kept aside, and what was lost when they were.
 *
 * Stored beside the document rather than inside it. Inside, it would be part of
 * every export and every sync payload, and a copy of your data hidden in your
 * data is the kind of thing that doubles in size once a year until somebody
 * notices.
 */
export interface Rescue {
  /** When the loss happened. */
  at: number;
  /** What went, in the shape the panel reports. */
  losses: Loss[];
  /** The document as it stood immediately before. */
  document: AppData;
}

/**
 * Put the missing rows back, keeping everything that has happened since.
 *
 * A union by id, not a replacement. Between the loss and the repair there may
 * be days of doses, and restoring wholesale would trade one silent loss for
 * another. Rows the current document already has win, because they are the
 * newer version of themselves: a bottle drawn down since is more current in the
 * live document than in the copy taken before the loss.
 *
 * Only the named collections are touched. Everything else is returned exactly
 * as it came in.
 */
export function restoreLost(current: AppData, rescue: Rescue): AppData {
  const out = { ...current };

  for (const { key } of rescue.losses) {
    const live = (current[key] ?? []) as { id?: string }[];
    const saved = (rescue.document[key] ?? []) as { id?: string }[];
    if (!Array.isArray(live) || !Array.isArray(saved)) continue;

    const have = new Set(live.map((r) => r?.id).filter(Boolean));
    const missing = saved.filter((r) => r?.id && !have.has(r.id));
    if (!missing.length) continue;

    (out as Record<string, unknown>)[key] = [...live, ...missing];
  }

  return out;
}

/** How many rows `restoreLost` would bring back, per collection. */
export function recoverable(current: AppData, rescue: Rescue): Loss[] {
  const before = countRecords(current);
  const after = countRecords(restoreLost(current, rescue));
  // Reported as a gain, which is the same comparison read the other way round.
  return RECORD_KEYS.filter((key) => after[key] > before[key]).map((key) => ({
    key,
    from: before[key],
    to: after[key],
  }));
}

/** What a collection is called when the app has to say it out loud. */
export const RECORD_LABEL: Record<RecordKey, { one: string; many: string }> = {
  profiles: { one: "profile", many: "profiles" },
  protocols: { one: "protocol", many: "protocols" },
  logs: { one: "logged dose", many: "logged doses" },
  vials: { one: "vial", many: "vials" },
  measurements: { one: "measurement", many: "measurements" },
  labs: { one: "lab result", many: "lab results" },
  checkIns: { one: "daily rating", many: "daily ratings" },
  customPeptides: { one: "compound you added", many: "compounds you added" },
  orders: { one: "order", many: "orders" },
  diluents: { one: "bottle of water", many: "bottles of water" },
};

/** "3 bottles of water", for a sentence rather than for a table. */
export function describeLoss(loss: Loss): string {
  const gone = loss.from - loss.to;
  const label = RECORD_LABEL[loss.key];
  return `${gone} ${gone === 1 ? label.one : label.many}`;
}
