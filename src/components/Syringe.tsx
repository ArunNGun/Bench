"use client";

import { capacityUnits, type SyringeSpec } from "@/lib/calc/reconstitution";
import type { VialState } from "@/lib/types";

/**
 * A syringe drawn to the real proportions of the selected barrel.
 *
 * The graduations are generated from the barrel spec rather than decorated on,
 * so a 1 mL barrel with 2-unit marks renders half as many ticks as a 1-unit
 * one, and a U-40 barrel is numbered 0-40. The intent is that you can hold the
 * real syringe against the screen and see the same picture.
 *
 * Orientation matches a real insulin syringe: needle at the right, plunger
 * entering from the left, zero at the needle end with the numbers increasing
 * as the plunger is drawn back.
 */

const VB_W = 640;
const VB_H = 132;

const BARREL_L = 96;
const BARREL_R = 494;
const BARREL_T = 34;
const BARREL_B = 92;
const BARREL_W = BARREL_R - BARREL_L;
const MID = (BARREL_T + BARREL_B) / 2;

interface SyringeProps {
  spec: SyringeSpec;
  /** Units drawn, on the barrel's own scale. */
  units: number;
  /** Renders in an alarmed state when the draw will not fit. */
  overCapacity?: boolean;
  /** Second, ghosted marker, used to show the exact figure behind the rounded one. */
  ghostUnits?: number;
  className?: string;
}

export function Syringe({ spec, units, overCapacity, ghostUnits, className }: SyringeProps) {
  const capacity = capacityUnits(spec);
  const safeUnits = Number.isFinite(units) ? Math.max(0, units) : 0;
  const fraction = capacity > 0 ? Math.min(1, safeUnits / capacity) : 0;

  const plungerX = BARREL_R - fraction * BARREL_W;
  const fluidW = BARREL_R - plungerX;

  const ticks: { x: number; u: number; major: boolean }[] = [];
  const majorEvery = capacity <= 30 ? 5 : 10;
  const step = spec.graduationUnits;
  // Cap tick count so a fine barrel does not turn into a solid block of ink.
  const drawEvery = BARREL_W / (capacity / step) < 3 ? step * 2 : step;

  for (let u = 0; u <= capacity + 1e-9; u += drawEvery) {
    const rounded = Math.round(u * 1000) / 1000;
    ticks.push({
      x: BARREL_R - (rounded / capacity) * BARREL_W,
      u: rounded,
      major: Math.abs(rounded % majorEvery) < 1e-9,
    });
  }

  const fluidId = `fluid-${spec.id}`;
  const glassId = `glass-${spec.id}`;

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      className={className}
      role="img"
      aria-label={`Syringe showing ${safeUnits.toFixed(1)} of ${capacity} units on a ${
        spec.scale === "U100" ? "U-100" : "U-40"
      } barrel`}
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      <defs>
        <linearGradient id={fluidId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--fluid-top)" />
          <stop offset="100%" stopColor="var(--fluid-bottom)" />
        </linearGradient>
        <linearGradient id={glassId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--line)" stopOpacity="0.5" />
          <stop offset="45%" stopColor="var(--glass)" stopOpacity="0.15" />
          <stop offset="100%" stopColor="var(--line)" stopOpacity="0.45" />
        </linearGradient>
      </defs>

      {/* Plunger rod and thumb flange */}
      <rect x={plungerX - 78} y={MID - 4} width={80} height={8} fill="var(--line)" rx={1} />
      <rect x={plungerX - 84} y={MID - 21} width={9} height={42} fill="var(--faint)" rx={2} />

      {/* Barrel glass */}
      <rect
        x={BARREL_L}
        y={BARREL_T}
        width={BARREL_W}
        height={BARREL_B - BARREL_T}
        fill={`url(#${glassId})`}
        stroke="var(--line)"
        strokeWidth={1.5}
        rx={2}
      />

      {/* Fluid, filling from the needle end back toward the plunger */}
      {fluidW > 0.5 && (
        <g className="animate-fluid" style={{ transformOrigin: `${BARREL_R}px ${MID}px` }}>
          <rect
            x={plungerX}
            y={BARREL_T + 1.5}
            width={fluidW}
            height={BARREL_B - BARREL_T - 3}
            fill={overCapacity ? "var(--rose)" : `url(#${fluidId})`}
            opacity={0.92}
          />
          {/* Meniscus at the plunger face */}
          <rect x={plungerX} y={BARREL_T + 1.5} width={2.5} height={BARREL_B - BARREL_T - 3} fill="var(--ink)" opacity={0.28} />
        </g>
      )}

      {/* Plunger head */}
      <rect
        x={plungerX - 3}
        y={BARREL_T + 1}
        width={9}
        height={BARREL_B - BARREL_T - 2}
        fill="var(--faint)"
        rx={1.5}
      />

      {/* Graduations */}
      <g>
        {ticks.map((t) => (
          <g key={t.u}>
            <line
              x1={t.x}
              y1={BARREL_T + 1}
              x2={t.x}
              y2={t.major ? BARREL_T + 17 : BARREL_T + 9}
              stroke="var(--ink)"
              strokeWidth={t.major ? 1.4 : 0.8}
              opacity={t.major ? 0.75 : 0.35}
            />
            {/* Skip the zero mark, and any label close enough to the flange
                that it would collide with it. */}
            {t.major && t.u > 0 && t.x > BARREL_L + 13 && (
              <text
                x={t.x}
                y={BARREL_B - 6}
                textAnchor="middle"
                fontSize={13}
                fill="var(--muted)"
                fontFamily="var(--font-mono)"
              >
                {t.u}
              </text>
            )}
          </g>
        ))}
      </g>

      {/* Exact reading before rounding, when it differs from what is drawn */}
      {ghostUnits != null && Math.abs(ghostUnits - safeUnits) > 1e-6 && capacity > 0 && (
        <line
          x1={BARREL_R - Math.min(1, ghostUnits / capacity) * BARREL_W}
          y1={BARREL_T - 7}
          x2={BARREL_R - Math.min(1, ghostUnits / capacity) * BARREL_W}
          y2={BARREL_B + 7}
          stroke="var(--sky)"
          strokeWidth={1.5}
          strokeDasharray="3 3"
        />
      )}

      {/* Needle hub and needle */}
      <path
        d={`M ${BARREL_R} ${BARREL_T + 6} L ${BARREL_R + 26} ${MID - 7} L ${BARREL_R + 26} ${MID + 7} L ${BARREL_R} ${BARREL_B - 6} Z`}
        fill="var(--line)"
      />
      <rect x={BARREL_R + 26} y={MID - 6} width={22} height={12} fill="var(--faint)" rx={2} />
      <line
        x1={BARREL_R + 48}
        y1={MID}
        x2={VB_W - 8}
        y2={MID}
        stroke="var(--muted)"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      {/* Bevel */}
      <line x1={VB_W - 16} y1={MID - 2} x2={VB_W - 8} y2={MID} stroke="var(--ink)" strokeWidth={2} />

      {/* Flange at the barrel's open end */}
      <rect x={BARREL_L - 5} y={BARREL_T - 9} width={7} height={BARREL_B - BARREL_T + 18} fill="var(--line)" rx={2} />
    </svg>
  );
}

/**
 * A vial whose liquid level tracks how much is left.
 * Used in inventory lists, where a row of these reads at a glance.
 */
export function VialGlyph({
  fraction,
  state,
  className,
}: {
  fraction: number;
  state: VialState;
  className?: string;
}) {
  const f = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  const bodyTop = 22;
  const bodyBottom = 60;
  const fluidH = (bodyBottom - bodyTop) * f;
  const empty = state === "finished" || state === "discarded";
  // Not here yet, so it is drawn as an outline with nothing in it. A sealed
  // vial's cake would claim there is something to draw from.
  const onOrder = state === "on-order";

  return (
    <svg viewBox="0 0 32 68" className={className} role="img" aria-hidden="true" style={{ height: "100%" }}>
      {/* Crimp cap */}
      <rect
        x={8}
        y={2}
        width={16}
        height={7}
        rx={1}
        fill={empty || onOrder ? "var(--faint)" : "var(--tangerine)"}
        opacity={empty || onOrder ? 0.5 : 1}
      />
      <rect x={10} y={9} width={12} height={4} fill="var(--line)" />
      {/* Neck and shoulder */}
      <path d="M 11 13 L 11 18 L 5 24 L 5 62 Q 5 65 8 65 L 24 65 Q 27 65 27 62 L 27 24 L 21 18 L 21 13 Z"
        fill="var(--glass)" stroke="var(--line)" strokeWidth={1.2} />
      {/* Contents */}
      {onOrder ? null : state === "sealed" ? (
        // Lyophilised cake sits as a plug in the bottom of the vial.
        <rect x={6.2} y={52} width={19.6} height={11} fill="var(--ink)" opacity={0.55} rx={1} />
      ) : (
        f > 0.01 && (
          <rect
            x={6.2}
            y={bodyBottom - fluidH + 2}
            width={19.6}
            height={fluidH}
            fill="var(--tangerine)"
            opacity={0.75}
            rx={1}
          />
        )
      )}
    </svg>
  );
}
