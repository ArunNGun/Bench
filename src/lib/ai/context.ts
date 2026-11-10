/**
 * Builds the system prompt sent to the AI on every message.
 *
 * Pure: takes only data, produces a string. No I/O, no React.
 *
 * The goal is an AI that can answer accurately about what the user is running,
 * what they have taken, what is in the fridge, and how they have felt, without
 * the user having to re-explain any of it. Everything relevant goes in here so
 * the AI can focus on answering rather than on asking for context.
 */

import type {
  Profile,
  Protocol,
  DoseLog,
  Vial,
  Measurement,
  LabResult,
  CheckIn,
  Peptide,
  AiChatPrefs,
} from "../types";
import { SYMPTOMS } from "../types";
import { PEPTIDES } from "../data/peptides";

function findPeptide(custom: Peptide[], id: string): Peptide | undefined {
  return custom.find((p) => p.id === id) ?? PEPTIDES.find((p) => p.id === id);
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mcgLabel(mcg: number): string {
  return mcg >= 1000 ? `${mcg / 1000} mg` : `${mcg} mcg`;
}

export const DEFAULT_ROLE =
  `You are a knowledgeable assistant embedded in Bench, a private tracker for peptide, growth hormone and anabolic protocols. The user has shared their full protocol data with you so you can answer questions accurately about what they are running, what they have taken, what is in their fridge, and how they have felt. You are not a doctor. You do not prescribe or advise on doses. You can explain pharmacokinetics, summarise what the data shows, and help the user interpret their own numbers. When you are unsure, say so. Never invent data the user has not provided.`;

export interface ContextInput {
  profile: Profile;
  protocols: Protocol[];
  logs: DoseLog[];
  vials: Vial[];
  measurements: Measurement[];
  labs: LabResult[];
  checkIns: CheckIn[];
  customPeptides: Peptide[];
  prefs: AiChatPrefs;
  nowMs?: number;
}

const DEFAULT_PREFS: AiChatPrefs = {
  logsWindowDays: 1,
  includeAllLogs: false,
  includeCheckIns: true,
  includeMeasurements: true,
  includeLabs: true,
};

export function buildSystemPrompt(input: ContextInput): string {
  const now = input.nowMs ?? Date.now();
  const prefs: AiChatPrefs = { ...DEFAULT_PREFS, ...input.prefs };
  const {
    profile,
    protocols,
    logs,
    vials,
    measurements,
    labs,
    checkIns,
    customPeptides,
  } = input;

  const sections: string[] = [];

  // --- Role ---
  sections.push(prefs.customRole?.trim() || DEFAULT_ROLE);

  // --- Profile ---
  const profileLines: string[] = [`Name: ${profile.name}`];
  if (profile.weightKg) profileLines.push(`Weight: ${profile.weightKg} kg`);
  if (profile.heightCm) profileLines.push(`Height: ${profile.heightCm} cm`);
  if (profile.sex) profileLines.push(`Sex: ${profile.sex}`);
  if (profile.birthYear) profileLines.push(`Birth year: ${profile.birthYear}`);
  if (profile.notes) profileLines.push(`Notes: ${profile.notes}`);
  sections.push(`## User profile\n${profileLines.join("\n")}`);

  // --- Active protocols ---
  const activeProtocols = protocols.filter((p) => p.active);
  const inactiveProtocols = protocols.filter((p) => !p.active);

  if (activeProtocols.length > 0) {
    const lines: string[] = [];
    for (const p of activeProtocols) {
      const compound = findPeptide(customPeptides, p.peptideId);
      const compoundName = compound?.name ?? p.peptideId;
      lines.push(`\n### ${p.name} (${compoundName})`);
      lines.push(`Dose: ${mcgLabel(p.doseMcg)} | Route: ${p.route} | Started: ${formatDate(p.startedAt)}`);

      const sched = p.schedule;
      if (sched.kind === "daily") {
        lines.push(`Frequency: daily`);
      } else if (sched.kind === "interval-days" && sched.intervalDays) {
        lines.push(`Frequency: every ${sched.intervalDays} days`);
      } else if (sched.kind === "days-of-week" && sched.daysOfWeek?.length) {
        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        lines.push(`Frequency: ${sched.daysOfWeek.map((d) => dayNames[d]).join(", ")}`);
      } else if (sched.kind === "as-needed") {
        lines.push(`Frequency: as needed`);
      }

      if (sched.cycleWeeksOn && sched.cycleWeeksOff) {
        lines.push(`Cycle: ${sched.cycleWeeksOn} weeks on / ${sched.cycleWeeksOff} weeks off`);
      }

      if (p.notes) lines.push(`Notes: ${p.notes}`);

      if (compound) {
        lines.push(`Compound summary: ${compound.summary}`);
        if (compound.halfLifeHours) {
          lines.push(`Half-life: ${compound.halfLifeHours} hours`);
        }
        if (compound.sideEffects.length) {
          lines.push(`Known side effects: ${compound.sideEffects.slice(0, 5).join(", ")}`);
        }
      }
    }
    sections.push(`## Active protocols (${activeProtocols.length})\n${lines.join("\n")}`);
  } else {
    sections.push(`## Active protocols\nNone currently active.`);
  }

  if (inactiveProtocols.length > 0) {
    const names = inactiveProtocols.map((p) => {
      const compound = findPeptide(customPeptides, p.peptideId);
      return `${p.name} (${compound?.name ?? p.peptideId}), ended ${p.endedAt ? formatDate(p.endedAt) : "unknown"}`;
    });
    sections.push(`## Past protocols\n${names.join("\n")}`);
  }

  // --- Dose logs ---
  const cutoff = prefs.includeAllLogs
    ? 0
    : now - prefs.logsWindowDays * 24 * 60 * 60 * 1000;

  const relevantLogs = logs
    .filter((l) => l.at >= cutoff)
    .sort((a, b) => b.at - a.at);

  if (relevantLogs.length > 0) {
    const windowLabel = prefs.includeAllLogs
      ? "all history"
      : `last ${prefs.logsWindowDays} day${prefs.logsWindowDays === 1 ? "" : "s"}`;
    const lines: string[] = [];
    for (const l of relevantLogs) {
      const compound = findPeptide(customPeptides, l.peptideId);
      const compoundName = compound?.name ?? l.peptideId;
      let entry = `${formatDateTime(l.at)} | ${compoundName} | ${mcgLabel(l.doseMcg)}`;
      if (l.skipped) entry += " | SKIPPED";
      if (l.site) entry += ` | site: ${l.site}`;
      if (l.feeling) entry += ` | feeling: ${l.feeling}/5`;
      if (l.sideEffects?.length) entry += ` | side effects: ${l.sideEffects.join(", ")}`;
      if (l.notes) entry += ` | note: ${l.notes}`;
      lines.push(entry);
    }
    sections.push(`## Dose logs (${windowLabel}, ${relevantLogs.length} entries)\n${lines.join("\n")}`);
  } else {
    const windowLabel = prefs.includeAllLogs ? "all history" : `last ${prefs.logsWindowDays} day${prefs.logsWindowDays === 1 ? "" : "s"}`;
    sections.push(`## Dose logs (${windowLabel})\nNo doses logged in this window.`);
  }

  // --- Stock ---
  const usableVials = vials.filter(
    (v) => v.state === "sealed" || v.state === "reconstituted"
  );
  if (usableVials.length > 0) {
    const lines: string[] = [];
    for (const v of usableVials) {
      const compound = findPeptide(customPeptides, v.peptideId);
      const compoundName = compound?.name ?? v.peptideId;
      let entry = `${compoundName} | ${v.strengthMg} mg | ${v.state}`;
      if (v.diluentMl && v.drawnMcg != null) {
        const remaining = v.strengthMg * 1000 - v.drawnMcg;
        entry += ` | remaining: ~${Math.round(remaining)} mcg`;
      }
      if (v.budAt) {
        const daysLeft = Math.round((v.budAt - now) / (24 * 60 * 60 * 1000));
        if (daysLeft > 0) {
          entry += ` | BUD: ${daysLeft} days`;
        } else {
          entry += ` | BUD: EXPIRED`;
        }
      }
      lines.push(entry);
    }
    sections.push(`## Current stock (${usableVials.length} vials)\n${lines.join("\n")}`);
  }

  // --- Measurements ---
  if (prefs.includeMeasurements) {
    const recent = measurements
      .slice()
      .sort((a, b) => b.at - a.at)
      .slice(0, 20);

    if (recent.length > 0) {
      const lines = recent.map((m) => {
        const parts: string[] = [formatDate(m.at)];
        if (m.weightKg != null) parts.push(`weight: ${m.weightKg} kg`);
        if (m.waistCm != null) parts.push(`waist: ${m.waistCm} cm`);
        if (m.bodyFatPct != null) parts.push(`body fat: ${m.bodyFatPct}%`);
        if (m.sleepHours != null) parts.push(`sleep: ${m.sleepHours} h`);
        if (m.restingHrBpm != null) parts.push(`resting HR: ${m.restingHrBpm} bpm`);
        return parts.join(" | ");
      });
      sections.push(`## Measurements (most recent 20)\n${lines.join("\n")}`);
    }
  }

  // --- Labs ---
  if (prefs.includeLabs && labs.length > 0) {
    const recent = labs.slice().sort((a, b) => b.at - a.at).slice(0, 30);
    const lines = recent.map((l) => {
      let entry = `${formatDate(l.at)} | ${l.markerId}: ${l.value}`;
      if (l.refLow != null && l.refHigh != null) {
        entry += ` (ref: ${l.refLow}-${l.refHigh})`;
      }
      if (l.lab) entry += ` | ${l.lab}`;
      if (l.notes) entry += ` | ${l.notes}`;
      return entry;
    });
    sections.push(`## Bloodwork (most recent 30 results)\n${lines.join("\n")}`);
  }

  // --- Check-ins ---
  if (prefs.includeCheckIns && checkIns.length > 0) {
    const recent = checkIns.slice().sort((a, b) => b.at - a.at).slice(0, 14);
    const lines = recent.map((c) => {
      const parts: string[] = [formatDate(c.at)];
      for (const sym of SYMPTOMS) {
        const val = c.ratings[sym.id];
        if (val != null) parts.push(`${sym.label}: ${val}/5`);
      }
      if (c.notes) parts.push(`note: ${c.notes}`);
      return parts.join(" | ");
    });
    sections.push(`## Daily check-ins (last 14)\n${lines.join("\n")}`);
  }

  sections.push(`Today: ${formatDate(now)}`);

  return sections.join("\n\n");
}
