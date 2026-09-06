/**
 * Which reminders should exist right now.
 *
 * A pure function of the plan, the log and the settings. Nothing here talks to
 * a device, which is the point: the hard part of reminders is deciding what to
 * fire and when, and that part is testable. The adapter that hands this list to
 * the operating system is twenty lines and holds no decisions at all.
 *
 * The model is cancel everything and re-arm from this list, rather than adding
 * and removing individual alarms as the plan changes. Plans change in ways that
 * move many doses at once, a phase boundary shifts by a day, a protocol is
 * paused, a profile is switched, and reconciling that incrementally is how you
 * end up with an alarm for a dose that no longer exists. Re-deriving the whole
 * set costs nothing and cannot drift.
 */

import type { Peptide, Protocol, RemindersSettings } from "../types";
import { formatDose } from "../format";
import { logsForProtocol, scheduledDoseMcg, unloggedDoseTimes } from "./schedule";

const MINUTE_MS = 60_000;

/** How far ahead alarms are placed. */
export const REMINDER_HORIZON_DAYS = 14;

export interface Reminder {
  /**
   * Stable within one re-arm, and derived rather than random.
   *
   * Android wants a 32-bit integer, so this is a hash rather than the readable
   * key. `key` keeps the readable form for tests and for debugging, since a
   * number that identifies an alarm is no help when something misfires.
   */
  id: number;
  key: string;
  /** When it fires, already offset by the lead time. */
  at: number;
  /** When the dose itself is due. */
  doseAt: number;
  protocolId: string;
  title: string;
  body: string;
}

/**
 * A small stable hash, because the platform identifies alarms by number.
 *
 * FNV-1a, kept to 31 bits so it is always a positive signed int. Collisions
 * would mean one alarm quietly replacing another; at a few dozen alarms over a
 * fortnight the chance is negligible, and the failure is a missing reminder
 * rather than a wrong one.
 */
export function reminderId(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 1) % 2_000_000_000;
}

export interface ReminderInput {
  /** Protocols of the active profile only. */
  protocols: Protocol[];
  /** Logs of the active profile only. */
  logs: { at: number; skipped?: boolean; protocolId?: string; peptideId: string }[];
  /** For naming the compound, when the user has asked for names. */
  peptides: Pick<Peptide, "id" | "name">[];
  settings: RemindersSettings;
  nowMs: number;
  /** Days ahead to arm. Defaults to the fortnight the app re-arms on. */
  horizonDays?: number;
}

/**
 * What a reminder says.
 *
 * Discreet by default. "Bench" and "A dose is due" tell the person holding the
 * phone everything they need and tell the person beside them nothing, which is
 * the right default for a lock screen. Turning names on is a decision, and it
 * is theirs to make.
 */
function textFor(
  protocol: Protocol,
  name: string | null,
  doseMcg: number,
  settings: RemindersSettings): { title: string; body: string } {
  if (!settings.showCompound) {
    return { title: "Bench", body: "A dose is due." };
  }

  const label = protocol.name?.trim() || name || "Dose";
  return { title: label, body: `${formatDose(doseMcg)} due.` };
}

/**
 * Every reminder that should be armed, soonest first.
 *
 * Only the active profile's protocols, only active ones, only doses nothing has
 * been logged against, and never a time already past. A dose logged early stops
 * asking here for the same reason it stops asking on the Today page: both go
 * through `unloggedDoseTimes`, so the notification and the screen cannot
 * disagree about whether something is still owed.
 */
export function remindersFor(input: ReminderInput): Reminder[] {
  const { protocols, logs, peptides, settings, nowMs } = input;
  if (!settings.enabled) return [];

  const horizon = input.horizonDays ?? REMINDER_HORIZON_DAYS;
  const until = nowMs + horizon * 86_400_000;
  const lead = Math.max(0, settings.leadMinutes) * MINUTE_MS;
  const nameById = new Map(peptides.map((p) => [p.id, p.name]));

  const out: Reminder[] = [];

  for (const protocol of protocols) {
    if (!protocol.active) continue;
    if (protocol.schedule.kind === "as-needed") continue;
    if (protocol.endedAt != null && protocol.endedAt < nowMs) continue;

    const mine = logsForProtocol(protocol, logs);

    // The window opens at the earliest dose that could still need an alarm,
    // which is a lead time before now, not now. A dose at 07:00 with a fifteen
    // minute lead is still worth arming at 06:50.
    const due = unloggedDoseTimes(protocol, mine, nowMs - lead, until);

    for (const doseAt of due) {
      const at = doseAt - lead;
      if (at <= nowMs) continue;

      const key = `${protocol.id}:${doseAt}`;
      const { title, body } = textFor(
        protocol,
        nameById.get(protocol.peptideId) ?? null,
        scheduledDoseMcg(protocol, doseAt),
        settings);

      out.push({ id: reminderId(key), key, at, doseAt, protocolId: protocol.id, title, body });
    }
  }

  return out.sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));
}
