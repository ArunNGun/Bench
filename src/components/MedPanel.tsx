"use client";

/**
 * The Now page section for medicines and supplements.
 *
 * Two states:
 *   - Empty: user has no active meds → show "Set up meds" CTA
 *   - Active: show each active med with today's intake status and a one-tap log button.
 *     For meds linked to the library, show a simple "on board" bar using the half-life.
 */

import { useMemo } from "react";
import Link from "next/link";
import { Check, ChevronRight, Pill, Plus } from "lucide-react";
import { Badge, Button, ButtonLink, Card, Meter, SectionLabel } from "./ui";
import { useStore, useProfileData } from "@/lib/store";
import { MED_LIBRARY_BY_ID } from "@/lib/data/meds";
import type { Med, MedLog } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fraction of the last dose still on board, given a half-life. */
function fractionOnBoard(loggedAt: number, halfLifeHours: number, nowMs: number): number {
  const hoursElapsed = (nowMs - loggedAt) / 3_600_000;
  if (hoursElapsed <= 0) return 1;
  return Math.pow(2, -hoursElapsed / halfLifeHours);
}

/** Hours remaining until <5% on board (effectively cleared). */
function hoursUntilCleared(loggedAt: number, halfLifeHours: number, nowMs: number): number {
  // 5% threshold = 4.32 half-lives; 2% = 5.64 half-lives
  const clearHalfLives = 4.32;
  const clearAt = loggedAt + clearHalfLives * halfLifeHours * 3_600_000;
  return Math.max(0, (clearAt - nowMs) / 3_600_000);
}

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 24) return `${h.toFixed(0)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function OnBoardBar({
  lastLog,
  halfLifeHours,
  nowMs,
}: {
  lastLog: MedLog;
  halfLifeHours: number;
  nowMs: number;
}) {
  const fraction = fractionOnBoard(lastLog.at, halfLifeHours, nowMs);
  const hoursLeft = hoursUntilCleared(lastLog.at, halfLifeHours, nowMs);

  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
        <span>On board</span>
        <span>{hoursLeft > 0 ? `clears in ${formatHours(hoursLeft)}` : "cleared"}</span>
      </div>
      <Meter value={fraction} tone="mint" />
    </div>
  );
}

function MedRow({
  med,
  todayLogs,
  nowMs,
  onLog,
}: {
  med: Med;
  todayLogs: MedLog[];
  nowMs: number;
  onLog: (med: Med) => void;
}) {
  const entry = med.libraryId ? MED_LIBRARY_BY_ID.get(med.libraryId) : undefined;
  const lastLog = todayLogs.find((l) => !l.skipped);
  const loggedToday = !!lastLog;
  const skippedToday = !lastLog && todayLogs.some((l) => l.skipped);

  return (
    <div className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        {/* Status dot */}
        <div
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
            loggedToday
              ? "bg-[var(--leaf)]"
              : skippedToday
                ? "bg-[var(--muted-foreground)]"
                : "border-2 border-[var(--border)] bg-transparent"
          }`}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="truncate text-[13.5px] font-semibold text-[var(--ink)]">
                {med.name}
              </span>
              <span className="ml-2 text-[12px] text-[var(--muted)]">{med.dose}</span>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {loggedToday ? (
                <Badge tone="mint">
                  <Check size={11} className="mr-1" />
                  Taken
                </Badge>
              ) : skippedToday ? (
                <Badge tone="neutral">Skipped</Badge>
              ) : (
                <button
                  onClick={() => onLog(med)}
                  className="flex items-center gap-1 rounded-[var(--r-pill)] bg-[var(--accent-soft,var(--card))] px-2.5 py-1 text-[12px] font-medium text-[var(--accent)] hover:opacity-80 border border-[var(--border)]"
                >
                  <Plus size={12} />
                  Log
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* On-board bar for library-linked meds with known half-life */}
      {lastLog && entry?.halfLife && (
        <div className="ml-5 pl-0.5">
          <OnBoardBar
            lastLog={lastLog}
            halfLifeHours={entry.halfLife.hours}
            nowMs={nowMs}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function MedPanel({
  nowMs,
  onLogMed,
}: {
  nowMs: number;
  onLogMed: (med: Med) => void;
}) {
  const { meds, medLogs } = useProfileData();

  const todayStart = today();

  const activeMeds = useMemo(() => meds.filter((m) => m.active), [meds]);

  const todayLogsByMed = useMemo(() => {
    const map = new Map<string, MedLog[]>();
    for (const l of medLogs) {
      if (l.at >= todayStart && l.at < todayStart + 86_400_000) {
        if (!map.has(l.medId)) map.set(l.medId, []);
        map.get(l.medId)!.push(l);
      }
    }
    return map;
  }, [medLogs, todayStart]);

  // Empty state
  if (activeMeds.length === 0) {
    return (
      <Card className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <Pill size={18} className="shrink-0 text-[var(--muted)]" />
          <div>
            <p className="text-[13.5px] font-semibold text-[var(--ink)]">Meds & supplements</p>
            <p className="text-[12px] text-[var(--muted)]">
              Track finasteride, omega-3, magnesium and more
            </p>
          </div>
        </div>
        <ButtonLink href="/meds" variant="ghost" className="shrink-0 text-xs">
          Set up
          <ChevronRight size={14} className="ml-0.5" />
        </ButtonLink>
      </Card>
    );
  }

  const takenCount = activeMeds.filter((m) =>
    (todayLogsByMed.get(m.id) ?? []).some((l) => !l.skipped),
  ).length;

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <SectionLabel className="mb-0">Meds & supplements</SectionLabel>
        <Link
          href="/meds"
          className="flex items-center gap-0.5 text-[12px] text-[var(--muted)] hover:text-[var(--ink)]"
        >
          Manage
          <ChevronRight size={13} />
        </Link>
      </div>

      <Card className="divide-y divide-[var(--border)] px-4">
        {activeMeds.map((med) => (
          <MedRow
            key={med.id}
            med={med}
            todayLogs={todayLogsByMed.get(med.id) ?? []}
            nowMs={nowMs}
            onLog={onLogMed}
          />
        ))}
      </Card>

      <p className="mt-1.5 text-right text-[11.5px] text-[var(--muted)]">
        {takenCount} of {activeMeds.length} taken today
      </p>
    </section>
  );
}
