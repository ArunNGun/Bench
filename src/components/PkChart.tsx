"use client";

import { useId, useMemo, useRef } from "react";
import {
  isMeasuredInPeople,
  levelAt,
  levelSeries,
  type CurveBasis,
  type CurveParams,
  type DoseEvent,
} from "@/lib/calc/pk";
import { formatDate, formatTime } from "@/lib/format";

/**
 * Relative plasma level over a window, with a marker at the current moment.
 *
 * The y axis is deliberately unlabelled in absolute terms. Bioavailability and
 * volume of distribution are unpublished for most of these compounds, so the
 * curve is normalised to "one reference dose peaks at 1.0". It answers how much
 * is on board relative to a normal dose, not how many nanograms per millilitre.
 */

const W = 640;
const H = 150;
const PAD_L = 4;
const PAD_R = 4;
const PAD_T = 12;
const PAD_B = 20;

export interface PkSeries {
  id: string;
  label: string;
  color: string;
  doses: DoseEvent[];
  params: CurveParams;
  referenceMcg: number;
  /**
   * Where the half-life came from. Anything other than a published human
   * figure is drawn as a different kind of statement: dashed and faded, with no
   * filled area under it, because the area reads as a quantity and there is no
   * quantity here. The shape of the decay is the whole claim.
   */
  basis?: CurveBasis;
}

export function PkChart({
  series,
  fromMs,
  toMs,
  nowMs,
  className,
  animate = true,
  pickedMs = null,
  onPick,
  weightEntries,
}: {
  series: PkSeries[];
  fromMs: number;
  toMs: number;
  nowMs: number;
  className?: string;
  animate?: boolean;
  pickedMs?: number | null;
  onPick?: (ms: number | null) => void;
  /**
   * Optional weight entries to render as labelled dots on the chart.
   * Each entry is a timestamp + weight in kg. Rendered at the bottom of the
   * chart so they sit on the time axis without interfering with the curves.
   */
  weightEntries?: { at: number; weightKg: number; displayLabel: string }[];
}) {
  const uid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);

  const { paths, maxLevel, ticks, ceiling } = useMemo(() => {
    const steps = 160;
    const computed = series.map((s) => ({
      ...s,
      points: levelSeries(fromMs, toMs, steps, s.doses, s.params, s.referenceMcg),
    }));

    const peak = Math.max(
      1, ...computed.flatMap((c) => c.points.map((p) => p.level)));
    // Round the ceiling up so the curve never grazes the top edge.
    const ceiling = Math.ceil(peak * 1.15 * 4) / 4;

    const x = (t: number) => PAD_L + ((t - fromMs) / (toMs - fromMs)) * (W - PAD_L - PAD_R);
    const y = (level: number) => H - PAD_B - (level / ceiling) * (H - PAD_T - PAD_B);

    const built = computed.map((c) => {
      const line = c.points
        .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.t).toFixed(2)} ${y(p.level).toFixed(2)}`)
        .join(" ");
      const area = `${line} L ${x(toMs).toFixed(2)} ${(H - PAD_B).toFixed(2)} L ${x(fromMs).toFixed(
        2)} ${(H - PAD_B).toFixed(2)} Z`;
      return { ...c, line, area };
    });

    // A tick per day, or per few days on a longer window.
    const days = (toMs - fromMs) / 86_400_000;
    const stepDays = days <= 8 ? 1 : days <= 21 ? 3 : 7;
    const t: { x: number; label: string }[] = [];
    const first = new Date(fromMs);
    first.setHours(0, 0, 0, 0);
    for (let d = new Date(first); d.getTime() <= toMs; d.setDate(d.getDate() + stepDays)) {
      if (d.getTime() >= fromMs) t.push({ x: x(d.getTime()), label: formatDate(d.getTime()) });
    }

    return { paths: built, maxLevel: peak, ticks: t, ceiling };
  }, [series, fromMs, toMs]);

  const nowX = PAD_L + ((nowMs - fromMs) / (toMs - fromMs)) * (W - PAD_L - PAD_R);
  const inWindow = nowMs >= fromMs && nowMs <= toMs;

  const toX = (t: number) => PAD_L + ((t - fromMs) / (toMs - fromMs)) * (W - PAD_L - PAD_R);
  const yFor = (level: number) => H - PAD_B - (level / ceiling) * (H - PAD_T - PAD_B);

  /**
   * Where a pointer is, as a moment.
   *
   * The svg is drawn in viewBox units and displayed at whatever width the card
   * gives it, so a client x has to be scaled by the ratio between the two. Read
   * from the live element rather than assumed, since that width changes with
   * the window and on a phone rotating it.
   */
  function pickFromPointer(e: React.PointerEvent<SVGSVGElement>) {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || box.width <= 0) return;

    const xInView = ((e.clientX - box.left) / box.width) * W;
    const frac = (xInView - PAD_L) / (W - PAD_L - PAD_R);
    const clamped = Math.max(0, Math.min(1, frac));
    onPick?.(fromMs + clamped * (toMs - fromMs));
  }

  /** Each curve's height at the moment being read, for the dots on the lines. */
  const readings = useMemo(() => {
    if (pickedMs == null) return [];
    return paths.map((p) => ({
      id: p.id,
      color: p.color,
      level: levelAt(pickedMs, p.doses, p.params, p.referenceMcg),
    }));
  }, [pickedMs, paths]);

  const pickedX = pickedMs == null ? 0 : toX(pickedMs);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      style={{ width: "100%", height: "auto", display: "block", touchAction: "pan-y" }}
      onPointerDown={(e) => {
        // Capture, so a finger that slides off the chart keeps being followed
        // rather than handing the gesture to whatever it lands on.
        e.currentTarget.setPointerCapture(e.pointerId);
        pickFromPointer(e);
      }}
      onPointerMove={(e) => {
        // A mouse tracks on hover. A finger only tracks while it is down,
        // which is what `buttons` reports for touch as well as for a drag.
        if (e.pointerType === "mouse" || e.buttons > 0) pickFromPointer(e);
      }}
      // Leaving with a mouse means the question is over. A finger lifting does
      // not, since on touch the reading has to stay to be read at all.
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") onPick?.(null);
      }}
      role="img"
      aria-label={`Relative plasma levels from ${formatDate(fromMs)} to ${formatDate(toMs)}. Peak ${(
        maxLevel * 100
      ).toFixed(0)} percent of a single reference dose.`}
    >
      <defs>
        {paths.map((p) => (
          <linearGradient key={p.id} id={`fill-${uid}-${p.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={p.color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={p.color} stopOpacity="0.02" />
          </linearGradient>
        ))}
      </defs>

      {/* Day gridlines */}
      {ticks.map((t) => (
        <path
          key={t.x}
          d={`M ${t.x} ${PAD_T - 4} V ${H - PAD_B}`}
          stroke="var(--line)"
          strokeWidth={1}
        />
      ))}

      {/* Baseline */}
      <path d={`M ${PAD_L} ${H - PAD_B} H ${W - PAD_R}`} stroke="var(--line)" strokeWidth={1} />

      {/* Curves */}
      {paths.map((p) => (
        <g key={p.id}>
          {isMeasuredInPeople(p.basis ?? "published") && (
            <path d={p.area} fill={`url(#fill-${uid}-${p.id})`} />
          )}
          <path
            d={p.line}
            fill="none"
            stroke={p.color}
            strokeWidth={isMeasuredInPeople(p.basis ?? "published") ? 1.8 : 1.4}
            strokeDasharray={isMeasuredInPeople(p.basis ?? "published") ? undefined : "5 4"}
            opacity={isMeasuredInPeople(p.basis ?? "published") ? 1 : 0.65}
            strokeLinejoin="round"
            strokeLinecap="round"
            className={animate ? "animate-trace" : undefined}
            style={animate ? ({ "--trace-length": 2400 } as React.CSSProperties) : undefined}
          />
        </g>
      ))}

      {/* Dose markers along the baseline */}
      {paths.flatMap((p) =>
        p.doses
          .filter((d) => d.at >= fromMs && d.at <= toMs)
          .map((d) => {
            const dx = PAD_L + ((d.at - fromMs) / (toMs - fromMs)) * (W - PAD_L - PAD_R);
            return (
              <path
                key={`${p.id}-${d.at}`}
                d={`M ${dx} ${H - PAD_B} l -3.5 5 l 7 0 Z`}
                fill={p.color}
                opacity={0.85}
              />
            );
          }))}

      {/* Now */}
      {inWindow && (
        <g>
          <path
            d={`M ${nowX} ${PAD_T - 8} V ${H - PAD_B}`}
            stroke="var(--ink)"
            strokeWidth={1.2}
            strokeDasharray="2 3"
            className="animate-now"
          />
          <circle cx={nowX} cy={PAD_T - 8} r={2.5} fill="var(--ink)" />
        </g>
      )}

      {/*
        The moment being read. A line and a dot per curve, and nothing else:
        the words go in the readout below the chart, where they cannot be
        clipped by the card and cannot cover the curve they describe.
      */}
      {pickedMs != null && (
        <g pointerEvents="none">
          <path
            d={`M ${pickedX} ${PAD_T - 8} V ${H - PAD_B}`}
            stroke="var(--muted)"
            strokeWidth={1}
          />
          {readings.map((r) => (
            <circle
              key={r.id}
              cx={pickedX}
              cy={yFor(r.level)}
              r={3}
              fill="var(--card)"
              stroke={r.color}
              strokeWidth={2}
            />
          ))}
        </g>
      )}

      {/* Weight overlay — dot on the baseline with label above it, inside the chart */}
      {weightEntries
        ?.filter((w) => w.at >= fromMs && w.at <= toMs)
        .map((w) => {
          const wx = toX(w.at);
          const baseY = H - PAD_B;          // the baseline
          const dotY  = baseY - 1;          // sit on the baseline
          const labelY = baseY - 8;         // label just above the dot, still inside chart
          return (
            <g key={w.at} pointerEvents="none">
              {/* Stem: a short tick from the baseline up to the dot */}
              <line
                x1={wx}
                y1={baseY}
                x2={wx}
                y2={dotY - 3}
                stroke="var(--tangerine)"
                strokeWidth={1}
                opacity={0.6}
              />
              {/* Dot on the baseline */}
              <circle
                cx={wx}
                cy={dotY}
                r={2.5}
                fill="var(--tangerine)"
                opacity={0.95}
              />
              {/* Label above the dot, inside the chart area */}
              <text
                x={wx}
                y={labelY}
                fontSize={8.5}
                fill="var(--tangerine)"
                fontFamily="var(--font-mono)"
                textAnchor="middle"
              >
                {w.displayLabel}
              </text>
            </g>
          );
        })}

      {/* Date labels */}
      {ticks.map((t) => (
        <text
          key={`l-${t.x}`}
          x={t.x + 3}
          y={H - 6}
          fontSize={10}
          fill="var(--faint)"
          fontFamily="var(--font-mono)"
        >
          {t.label}
        </text>
      ))}

      {inWindow && (
        <text
          x={Math.min(nowX + 4, W - 34)}
          y={PAD_T - 4}
          fontSize={9}
          fill="var(--muted)"
          fontFamily="var(--font-mono)"
        >
          {formatTime(nowMs)}
        </text>
      )}
    </svg>
  );
}

/** A compact level bar for list rows, where a full chart would be too much. */
export function LevelBar({ level, color }: { level: number; color: string }) {
  const pct = Math.max(0, Math.min(1, level));
  return (
    <div
      className="h-1 w-full overflow-hidden rounded-full bg-[var(--line)]"
      role="img"
      aria-label={`${(pct * 100).toFixed(0)} percent of peak`}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${pct * 100}%`, background: color }}
      />
    </div>
  );
}
