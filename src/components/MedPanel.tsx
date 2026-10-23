"use client";

/**
 * The Now page section for medicines and supplements.
 *
 * Active state: a single shared PK chart (all meds, each a different colour)
 * followed by the med list with colour-coded status dots and one-tap log buttons.
 */

import { useMemo } from "react";
import Link from "next/link";
import { Check, ChevronRight, Pill, Plus } from "lucide-react";
import { Badge, ButtonLink, Card, SectionLabel } from "./ui";
import { useProfileData } from "@/lib/store";
import { MED_LIBRARY_BY_ID } from "@/lib/data/meds";
import type { Med, MedLog } from "@/lib/types";

// ---------------------------------------------------------------------------
// Colour palette — distinct, works on light + dark
// ---------------------------------------------------------------------------

const COLORS = [
  "#6366f1", // indigo
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
  "#ec4899", // pink
  "#84cc16", // lime
  "#14b8a6", // teal
];

// ---------------------------------------------------------------------------
// PK math — one-compartment oral, normalised to peak = 1 PER COMPOUND
// (compounds have very different half-lives; we normalise each independently
//  so a 3-week dutasteride curve and a 45-min melatonin curve both show shape)
// ---------------------------------------------------------------------------

function pkPoints(
  tmaxH: number,
  halfLifeH: number,
  windowH: number,
  pts: number,
): number[] {
  const ke = Math.LN2 / halfLifeH;
  const ka = (() => {
    // ka must be > ke; bisect log-space to find ka such that tmax is satisfied
    if (tmaxH <= 0) return ke * 100;
    const tmaxFor = (k: number) => Math.log(k / ke) / (k - ke);
    const limit = 1 / ke;
    if (tmaxH >= limit * 0.999) return ke * 1.0001;
    let lo = ke * 1.0001, hi = ke * 1e6;
    for (let i = 0; i < 120; i++) {
      const mid = Math.sqrt(lo * hi);
      tmaxFor(mid) > tmaxH ? (lo = mid) : (hi = mid);
    }
    return Math.sqrt(lo * hi);
  })();

  const raw: number[] = [];
  for (let i = 0; i < pts; i++) {
    const t = (i / (pts - 1)) * windowH;
    raw.push(Math.max(0, Math.exp(-ke * t) - Math.exp(-ka * t)));
  }
  const peak = Math.max(...raw, 1e-9);
  return raw.map((v) => v / peak);
}

// ---------------------------------------------------------------------------
// Combined chart
// ---------------------------------------------------------------------------

interface ChartSeries {
  medId: string;
  name: string;
  color: string;
  tmaxH: number;
  halfLifeH: number;
  loggedAt: number | null; // null = not taken today
}

function MedCombinedChart({
  series,
  nowMs,
}: {
  series: ChartSeries[];
  nowMs: number;
}) {
  const PTS = 120;
  const W = 400;
  const H = 80;
  const PAD_B = 14; // room for x-axis labels

  // Window = max(48 h, largest 3×halfLife among taken meds, else 24 h default)
  const windowH = useMemo(() => {
    const taken = series.filter((s) => s.loggedAt != null);
    if (!taken.length) return Math.max(48, ...series.map((s) => s.halfLifeH * 3));
    return Math.max(48, ...taken.map((s) => s.halfLifeH * 3));
  }, [series]);

  const nowX = useMemo(() => {
    // now is at "hours since the earliest dose today" on the x-axis
    const earliest = series
      .map((s) => s.loggedAt)
      .filter((t): t is number => t != null)
      .reduce((a, b) => Math.min(a, b), nowMs);
    const elapsedH = (nowMs - earliest) / 3_600_000;
    return Math.min((elapsedH / windowH) * W, W);
  }, [series, nowMs, windowH]);

  // Render each series
  const rendered = useMemo(() =>
    series.map((s) => {
      const curve = pkPoints(s.tmaxH, s.halfLifeH, windowH, PTS);
      // Offset the curve so t=0 is when the dose was taken
      const doseOffsetH = s.loggedAt != null ? (nowMs - s.loggedAt) / 3_600_000 : 0;
      const doseOffsetPts = (doseOffsetH / windowH) * PTS;

      // Build points: shift curve right by dose offset
      const pts: string[] = [];
      for (let i = 0; i < PTS; i++) {
        const srcIdx = Math.round(i - doseOffsetPts);
        const v = srcIdx >= 0 && srcIdx < PTS ? curve[srcIdx]! : 0;
        const x = (i / (PTS - 1)) * W;
        const y = H - v * (H - 2) - 1;
        pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }

      // Current level dot
      const nowIdx = Math.round(doseOffsetPts);
      const nowFrac = nowIdx >= 0 && nowIdx < PTS ? (curve[nowIdx] ?? 0) : 0;
      const dotY = H - nowFrac * (H - 2) - 1;

      return { ...s, pts: pts.join(" "), dotY, taken: s.loggedAt != null };
    }),
  [series, nowMs, windowH]);

  // X-axis tick labels
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    x: f * W,
    label: fmt(f * windowH),
  }));

  return (
    <div className="rounded-[var(--r-inner)] bg-[var(--sunken)] px-3 pb-1 pt-3">
      <svg
        viewBox={`0 0 ${W} ${H + PAD_B}`}
        className="w-full"
        style={{ height: 90 }}
        preserveAspectRatio="none"
      >
        <defs>
          {rendered.map((s) => (
            <linearGradient key={s.medId} id={`mfill-${s.medId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={s.taken ? 0.18 : 0.06} />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={0} y1={H * (1 - f)} x2={W} y2={H * (1 - f)}
            stroke="var(--line)"
            strokeWidth="0.5"
            opacity="0.5"
          />
        ))}

        {/* Area fills */}
        {rendered.map((s) => (
          <polygon
            key={`fill-${s.medId}`}
            points={`0,${H} ${s.pts} ${W},${H}`}
            fill={`url(#mfill-${s.medId})`}
          />
        ))}

        {/* Curves */}
        {rendered.map((s) => (
          <polyline
            key={`line-${s.medId}`}
            points={s.pts}
            fill="none"
            stroke={s.color}
            strokeWidth="1.8"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={s.taken ? 1 : 0.25}
          />
        ))}

        {/* Now line */}
        <line
          x1={nowX} y1={0} x2={nowX} y2={H}
          stroke="var(--ink)"
          strokeWidth="1"
          strokeDasharray="3 2"
          opacity="0.3"
        />

        {/* Dots at current level for taken meds */}
        {rendered.filter((s) => s.taken).map((s) => (
          <circle
            key={`dot-${s.medId}`}
            cx={nowX}
            cy={s.dotY}
            r="3.5"
            fill={s.color}
            stroke="var(--card)"
            strokeWidth="1.5"
          />
        ))}

        {/* X-axis labels */}
        {ticks.map((tk) => (
          <text
            key={tk.x}
            x={tk.x}
            y={H + PAD_B - 1}
            textAnchor={tk.x === 0 ? "start" : tk.x === W ? "end" : "middle"}
            fontSize="7"
            fill="var(--faint)"
          >
            {tk.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hoursUntilCleared(loggedAt: number, halfLifeH: number, nowMs: number): number {
  return Math.max(0, (loggedAt + 4.32 * halfLifeH * 3_600_000 - nowMs) / 3_600_000);
}

function fmt(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(0)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// ---------------------------------------------------------------------------
// Med row (no per-row chart anymore)
// ---------------------------------------------------------------------------

function MedRow({
  med,
  color,
  todayLogs,
  onLog,
}: {
  med: Med;
  color: string;
  todayLogs: MedLog[];
  onLog: (med: Med) => void;
}) {
  const lastLog = todayLogs.find((l) => !l.skipped);
  const loggedToday = !!lastLog;
  const skippedToday = !lastLog && todayLogs.some((l) => l.skipped);

  return (
    <div className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
      {/* Colour dot */}
      <div
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{
          background: loggedToday ? color : "transparent",
          border: loggedToday ? "none" : `2px solid ${skippedToday ? "var(--faint)" : color}`,
          opacity: skippedToday ? 0.4 : 1,
        }}
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
              className="flex items-center gap-1 rounded-[var(--r-pill)] border border-[var(--border)] px-2.5 py-1 text-[12px] font-medium text-[var(--ink)] hover:bg-[var(--card)]"
            >
              <Plus size={11} />
              Log
            </button>
          )}
        </div>
      </div>
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

  // Assign colours
  const medColors = Object.fromEntries(
    activeMeds.map((m, i) => [m.id, COLORS[i % COLORS.length]!]),
  );

  // Build chart series — only for meds with library entries that have a half-life
  const chartSeries: ChartSeries[] = activeMeds
    .map((med) => {
      const entry = med.libraryId ? MED_LIBRARY_BY_ID.get(med.libraryId) : undefined;
      if (!entry?.halfLife) return null;
      const lastLog = (todayLogsByMed.get(med.id) ?? []).find((l) => !l.skipped);
      return {
        medId: med.id,
        name: med.name,
        color: medColors[med.id]!,
        tmaxH: entry.tmaxHours,
        halfLifeH: entry.halfLife.hours,
        loggedAt: lastLog?.at ?? null,
      };
    })
    .filter((s): s is ChartSeries => s !== null);

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

      <Card className="p-[14px]">
        {/* Combined chart — shown when at least one med has library PK data */}
        {chartSeries.length > 0 && (
          <div className="mb-4">
            <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1">
              {chartSeries.map((s) => (
                <span key={s.medId} className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {s.name}
                </span>
              ))}
            </div>
            <MedCombinedChart series={chartSeries} nowMs={nowMs} />
            <p className="mt-1 text-right text-[10px] text-[var(--faint)]">
              Relative levels · dashed line = now
            </p>
          </div>
        )}

        {/* Med list */}
        <div className="divide-y divide-[var(--line)]">
          {activeMeds.map((med) => (
            <MedRow
              key={med.id}
              med={med}
              color={medColors[med.id]!}
              todayLogs={todayLogsByMed.get(med.id) ?? []}
              onLog={onLogMed}
            />
          ))}
        </div>

        <p className="mt-3 text-right text-[11.5px] text-[var(--faint)]">
          {takenCount} of {activeMeds.length} taken today
        </p>
      </Card>
    </section>
  );
}
