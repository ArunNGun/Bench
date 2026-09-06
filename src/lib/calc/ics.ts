/**
 * The dose schedule as a calendar file.
 *
 * This exists because the web cannot do what the Android build can. There is no
 * way for a web page to raise a notification at a set hour while it is closed:
 * the API written for exactly that, Notification Triggers, was abandoned by
 * Chrome and never shipped, Periodic Background Sync leaves the cadence to the
 * browser and offers hours rather than a time, and Push needs a server, which
 * this project does not have and will not get. Rather than ship a switch that
 * quietly does nothing in a browser, the reminder is handed to the one piece of
 * software on every device that is already good at this: the calendar.
 *
 * Two choices in here are worth explaining, because both look wrong at a glance.
 *
 * **Every dose is written out, rather than one recurring rule per protocol.**
 * RRULE could express "every other day at seven", but it cannot express what
 * this app actually does: phases that change the dose partway, weeks on and
 * weeks off, a plan that ends, several times a day that a phase may override.
 * Encoding that in recurrence rules means a second implementation of the
 * schedule, and a second implementation is a second answer. Asking
 * `protocolDoseTimesBetween` for the doses gives a file that agrees with the
 * app by construction. A quarter of daily doses is ninety events and about
 * twenty kilobytes, which is nothing.
 *
 * **Times are floating, with no timezone and no trailing Z.** RFC 5545 calls
 * this local time, and it means seven o'clock wherever you are, which is what
 * the app itself means: `schedule.ts` reasons in local time throughout so that
 * a dose keeps its hour across a daylight-saving shift. Writing UTC would pin
 * every dose to an absolute instant and drift it by an hour twice a year.
 * Writing TZID would need a VTIMEZONE block with the transition rules for the
 * user's zone, which cannot be derived without shipping a timezone database,
 * and a VTIMEZONE that names only today's offset is wrong in exactly the way
 * this is trying to avoid.
 */

import type { Peptide, Protocol, RemindersSettings } from "../types";
import { formatDose } from "../format";
import { protocolDoseTimesBetween, scheduledDoseMcg } from "./schedule";

/**
 * A ceiling on the file, so a stack of protocols over a long horizon cannot
 * produce something a phone will refuse to open. Reached only by a plan far
 * larger than anything realistic, and the file stays valid, it simply stops.
 */
const MAX_EVENTS = 2000;

/** Long enough to show as a block in a day view rather than a hairline. */
const EVENT_MINUTES = 15;

export interface CalendarInput {
  /** Protocols of the active profile only. */
  protocols: Protocol[];
  peptides: Pick<Peptide, "id" | "name">[];
  settings: RemindersSettings;
  nowMs: number;
  /** Overrides `settings.calendarDays`, for tests. */
  days?: number;
}

export function calendarFileName(atMs: number = Date.now()): string {
  return `bench-doses-${new Date(atMs).toISOString().slice(0, 10)}.ics`;
}

/**
 * Escape a TEXT value.
 *
 * Backslash first, or the escapes this adds get escaped again.
 */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Fold a content line to 75 octets, as the spec requires.
 *
 * Counted in bytes rather than characters, because a compound name can carry
 * anything and a line split through the middle of a multi-byte character is how
 * a file that opens everywhere becomes a file that opens nowhere.
 */
export function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;

  const out: string[] = [];
  let current = "";
  let width = 0;
  // The first line allows 75 octets, continuations 74, since each gains a space.
  let limit = 75;

  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    if (width + size > limit) {
      out.push(current);
      current = "";
      width = 0;
      limit = 74;
    }
    current += char;
    width += size;
  }
  out.push(current);

  return out.join("\r\n ");
}

/** Local date and time, floating. See the note at the top of this file. */
function floating(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `T${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

/** UTC, for DTSTAMP, which is a stamp on the file rather than a wall clock. */
function utc(ms: number): string {
  return `${new Date(ms).toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
}

/**
 * A version number that rises with every export.
 *
 * Calendars accept a re-import as an edit rather than a duplicate when the UID
 * matches and SEQUENCE has gone up. Minutes since the epoch rises on any
 * realistic re-export and stays a small integer for the next century, where
 * seconds would cross the signed 32-bit line some clients still assume.
 */
function sequence(nowMs: number): number {
  return Math.floor(nowMs / 60_000);
}

/**
 * The calendar file for a plan.
 *
 * Doses only, from now to the horizon, active protocols of the active profile.
 * Nothing in the past: the Log already holds what happened, and a calendar full
 * of injections you have already had is noise.
 */
export function buildCalendar(input: CalendarInput): string {
  const { protocols, peptides, settings, nowMs } = input;
  const days = Math.max(1, input.days ?? settings.calendarDays);
  const until = nowMs + days * 86_400_000;
  const nameById = new Map(peptides.map((p) => [p.id, p.name]));
  const seq = sequence(nowMs);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bench//Dose schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText("Bench doses")}`,
  ];

  let count = 0;

  for (const protocol of protocols) {
    if (!protocol.active) continue;
    if (protocol.schedule.kind === "as-needed") continue;
    if (protocol.endedAt != null && protocol.endedAt < nowMs) continue;

    for (const at of protocolDoseTimesBetween(protocol, nowMs, until)) {
      if (count >= MAX_EVENTS) break;
      count++;

      const label = settings.showCompound
        ? protocol.name?.trim() || nameById.get(protocol.peptideId) || "Dose"
        : "Bench";
      const summary = settings.showCompound
        ? `${label} ${formatDose(scheduledDoseMcg(protocol, at))}`
        : "Bench: dose due";

      lines.push(
        "BEGIN:VEVENT",
        `UID:${protocol.id}-${at}@bench.app`,
        `DTSTAMP:${utc(nowMs)}`,
        `SEQUENCE:${seq}`,
        `DTSTART:${floating(at)}`,
        `DURATION:PT${EVENT_MINUTES}M`,
        `SUMMARY:${escapeText(summary)}`,
        // Not busy. A dose takes a minute and should not make you look booked.
        "TRANSP:TRANSPARENT",
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `TRIGGER:${settings.leadMinutes > 0 ? `-PT${Math.round(settings.leadMinutes)}M` : "PT0S"}`,
        `DESCRIPTION:${escapeText(summary)}`,
        "END:VALARM",
        "END:VEVENT");
    }
  }

  lines.push("END:VCALENDAR");

  // CRLF throughout, and a trailing one. Both are in the spec, and the parsers
  // that tolerate neither are the ones people actually use.
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** How many doses a file would carry, for the button to say so before it saves. */
export function calendarEventCount(ics: string): number {
  return (ics.match(/BEGIN:VEVENT/g) ?? []).length;
}
