"use client";

/**
 * The Now page section for medicines and supplements.
 *
 * Two states:
 *   - Empty: user has no active meds → "Set up meds" CTA
 *   - Active: each med with today's intake status, one-tap log, and a mini
 *     pharmacokinetic sparkline (absorption peak + decay) for library-linked
 *     meds that have a known half-life.
 */

import { useMemo } from "react";
import Link from "next/link";
import { Check, ChevronRight, Pill, Plus } from "lucide-react";
import { Badge, ButtonLink, Card, SectionLabel } from "./ui";
import { useProfileData } from "@/lib/store";
import { MED_LIBRARY_BY_ID } from "@/lib/data/meds";
import type { Med, MedLog } from "@/lib/types";

// ---------------------------------------------------------------------------
// PK math (one-compartment oral, normalised to peak = 1)
// ---------------------------------------------------------------------------

function pkCurve(
  tmaxH: number,
  halfLifeH: number,
  points: number,
  windowH: number,
): number[] {
  const ke = Math.LN2 / halfLifeH;
  // ka solved so the curve peaks at tmax
  const ka = tmaxH > 0 ? ke * Math.exp(1 / (tmaxH * (1 / tmaxH - ke) || 0.001)) : ke * 100;
  const safeKa = isFinite(ka) && ka > ke ? ka : ke * 10;

  const vals: number[] = [];
  for (let i = 0; i < points; i++) {
    const t = (i / (points - 1)) * windowH;
    const v = Math.exp(-ke * t) - Math.exp(-safeKa * t);
    vals.push(Math.max(0, v));
  }
  const peak = Math.max(...vals, 1e-9);
  return vals.map((v) => v / peak);
}

// ---------------------------------------------------------------------------
// Mini sparkline SVG
// ---------------------------------------------------------------------------

function MedSparkline({
  tmaxH,
  halfLifeH,
  elapsedH,
  windowH = 48,
}: {
  tmaxH: number;
  halfLifeH: number;
  elapsedH: number | null; // null = not taken today
  windowH?: number;
}) {
  const PTS = 80;
  const W = 200;
  const H = 44;

  const curve = useMemo(
    () => pkCurve(tmaxH, halfLifeH, PTS, windowH),
    [tmaxH, halfLifeH, windowH],
  );

  // SVG polyline points
  const points = curve
    .map((v, i) => `${(i / (PTS - 1)) * W},${H - v * (H - 2) - 1}`)
    .join(" ");

  // "now" x position
  const nowX = elapsedH != null ? Math.min((elapsedH / windowH) * W, W) : null;

  // current fraction on board
  const currentIdx =
    nowX != null ? Math.round((nowX / W) * (PTS - 1)) : null;
  const currentFrac = currentIdx != null ? (curve[currentIdx] ?? 0) : 0;
  const nowY = currentFrac != null ? H - currentFrac * (H - 2) - 1 : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ height: 44 }}
      preserveAspectRatio="none"
    >
      {/* Area fill */}
      <defs>
        <linearGradient id="mgfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--mint)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--mint)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${H} ${points} ${W},${H}`}
        fill="url(#mgfill)"
      />
      {/* Curve line */}
      <polyline
        points={points}
        fill="none"
        stroke="var(--mint)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={elapsedH != null ? 1 : 0.35}
      />
      {/* Now line */}
      {nowX != null && nowY != null && (
        <>
          <line
            x1={nowX} y1={0} x2={nowX} y2={H}
            stroke="var(--mint-ink)"
            strokeWidth="1"
            strokeDasharray="2 2"
            opacity={0.5}
          />
          <circle
            cx={nowX}
            cy={nowY}
            r="3"
            fill="var(--mint-ink)"
            opacity={0.85}
          />
        </>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hoursUntilCleared(loggedAt: number, halfLifeH: number, nowMs: number): number {
  const clearAt = loggedAt + 4.32 * halfLifeH * 3_600_000;
  return Math.max(0, (clearAt - nowMs) / 3_600_000);
}

function fmt(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 24) return `${h.toFixed(0)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// ---------------------------------------------------------------------------
// Med row
// ---------------------------------------------------------------------------

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

  const elapsedH = lastLog ? (nowMs - lastLog.at) / 3_600_000 : null;
  const hoursLeft =
    lastLog && entry?.halfLife
      ? hoursUntilCleared(lastLog.at, entry.halfLife.hours, nowMs)
      : null;

  // window = max(48h, 3x half-life) so the curve always shows the full tail
  const windowH = entry?.halfLife
    ? Math.max(48, entry.halfLife.hours * 3)
    : 48;

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      {/* Top row: name + status */}
      <div className="flex items-center gap-3">
        <div
          className={`h-2.5 w-2.5 shrink-0 rounded-full transition-colors ${
            loggedToday
              ? "bg-[var(--leaf)]"
              : skippedToday
                ? "bg-[var(--faint)]"
                : "border-2 border-[var(--border)] bg-transparent"
          }`}
        />
        <div className="flex flex-1 items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[13.5px] font-semibold text-[var(--ink)]">{med.name}</span>
            <span className="ml-2 text-[12px] text-[var(--muted)]">{med.dose}</span>
          </div>
          <div className="shrink-0">
            {loggedToday ? (
              <Badge tone="mint">
                <Check size={10} className="mr-1" />
                Taken
              </Badge>
            ) : skippedToday ? (
              <Badge tone="neutral">Skipped</Badge>
            ) : (
              <button
                onClick={() => onLog(med)}
                className="flex items-center gap-1 rounded-[var(--r-pill)] border border-[var(--border)] px-2.5 py-1 text-[12px] font-medium text-[var(--ink)] hover:bg-[var(--sunken)]"
              >
                <Plus size={11} />
                Log
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sparkline — only when the library entry has a half-life */}
      {entry?.halfLife && (
        <div className="ml-5 mt-2 rounded-[var(--r-inner)] bg-[var(--sunken)] px-3 py-2">
          <div className="mb-1 flex items-center justify-between text-[10.5px] text-[var(--muted)]">
            <span>
              {loggedToday
                ? `On board · clears in ${fmt(hoursLeft ?? 0)}`
                : "Take to see levels"}
            </span>
            <span>t½ {fmt(entry.halfLife.hours)}</span>
          </div>
          <MedSparkline
            tmaxH={entry.tmaxHours}
            halfLifeH={entry.halfLife.hours}
            elapsedH={elapsedH}
            windowH={windowH}
          />
          <div className="mt-0.5 flex justify-between text-[9.5px] text-[var(--faint)]">
            <span>{loggedToday ? "dose" : "0 h"}</span>
            <span>{fmt(windowH)}</span>
          </div>
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

  const ts = todayStart();
  const activeMeds = useMemo(() => meds.filter((m) => m.active), [meds]);

  const todayLogsByMed = useMemo(() => {
    const map = new Map<string, MedLog[]>();
    for (const l of medLogs) {
      if (l.at >= ts && l.at < ts + 86_400_000) {
        if (!map.has(l.medId)) map.set(l.medId, []);
        map.get(l.medId)!.push(l);
      }
    }
    return map;
  }, [medLogs, ts]);

  // Empty state
  if (activeMeds.length === 0) {
    return (
      <Card className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <Pill size={18} className="shrink-0 text-[var(--muted)]" />
          <div>
            <p className="text-[13.5px] font-semibold text-[var(--ink)]">Meds &amp; supplements</p>
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

  const takenCount = activeMeds.filter(
    (m) => (todayLogsByMed.get(m.id) ?? []).some((l) => !l.skipped),
  ).length;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <SectionLabel className="mb-0">Meds &amp; supplements</SectionLabel>
        <Link
          href="/meds"
          className="flex items-center gap-0.5 text-[12px] text-[var(--muted)] hover:text-[var(--ink)]"
        >
          Manage
          <ChevronRight size={13} />
        </Link>
      </div>

      <Card className="divide-y divide-[var(--line)] px-4 py-0">
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

      <p className="mt-2 text-right text-[11.5px] text-[var(--faint)]">
        {takenCount} of {activeMeds.length} taken today
      </p>
    </section>
  );
}
