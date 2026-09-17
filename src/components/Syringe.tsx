"use client";

import { barrelTicks } from "@/lib/calc/barrel";
import { capacityUnits, type SyringeSpec } from "@/lib/calc/reconstitution";
import { blisterDots } from "@/lib/calc/tablet";
import type { ContainerKind } from "@/lib/calc/inventory";
import type { VialState } from "@/lib/types";
import { useLang } from "@/lib/i18n";

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
  const { t } = useLang();
  const capacity = capacityUnits(spec);
  const safeUnits = Number.isFinite(units) ? Math.max(0, units) : 0;
  const fraction = capacity > 0 ? Math.min(1, safeUnits / capacity) : 0;

  const plungerX = BARREL_R - fraction * BARREL_W;
  const fluidW = BARREL_R - plungerX;

  /*
   * Shared with the thumbnails in the picker, so the same barrel is the same
   * picture in both places. It also replaces a local rule that doubled the
   * step when marks got tight: on a barrel numbered every five, a step of two
   * doubled to four, and four never lands on five, so the marks that were
   * supposed to carry the numbers stopped being drawn at all. At this size
   * nothing is tight enough to have triggered it, which is why it survived.
   */
  const { ticks } = barrelTicks(spec, BARREL_W);

  const fluidId = `fluid-${spec.id}`;
  const glassId = `glass-${spec.id}`;

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      className={className}
      role="img"
      aria-label={t("syringe_aria_showing", {
        units: safeUnits.toFixed(1),
        capacity,
        scale: spec.scale === "U100" ? "U-100" : "U-40",
      })}
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
        {ticks.map((t) => {
          const x = BARREL_R - t.fraction * BARREL_W;
          return (
            <g key={t.units}>
              <line
                x1={x}
                y1={BARREL_T + 1}
                x2={x}
                y2={t.major ? BARREL_T + 17 : BARREL_T + 9}
                stroke="var(--ink)"
                strokeWidth={t.major ? 1.4 : 0.8}
                opacity={t.major ? 0.75 : 0.35}
              />
              {/* Skip the zero mark, and any label close enough to the flange
                  that it would collide with it. */}
              {t.major && t.units > 0 && x > BARREL_L + 13 && (
                <text
                  x={x}
                  y={BARREL_B - 6}
                  textAnchor="middle"
                  fontSize={13}
                  fill="var(--muted)"
                  fontFamily="var(--font-mono)"
                >
                  {t.units}
                </text>
              )}
            </g>
          );
        })}
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
 * The same viewBox for all three containers, so a column of them lines up and
 * one can be swapped for another without the row moving.
 */
const GLYPH_VB = "0 0 32 68";

/** Both states where the row is drawn hollow or grey rather than full. */
function glyphTone(state: VialState) {
  return {
    // Finished or thrown away. The cap greys out with the contents.
    empty: state === "finished" || state === "discarded",
    // Not here yet, so it is drawn as an outline with nothing in it. Contents
    // would claim there is something to take.
    onOrder: state === "on-order",
  };
}

/** Slots in the drawn blister. Fixed; see `blisterDots`. */
const BLISTER_SLOTS = 10;

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
  const { empty, onOrder } = glyphTone(state);

  return (
    <svg viewBox={GLYPH_VB} className={className} role="img" aria-hidden="true" style={{ height: "100%" }}>
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


/**
 * A pack of tablets, counted rather than poured.
 *
 * Drawn as a blister because that is the thing in the drawer, and because the
 * quantity it has to show is a count: ten slots, emptying from the top as they
 * are pressed out. A liquid level would be the wrong picture for something
 * nobody pours.
 *
 * Sealed is unbroken foil rather than a full strip of ten. The two are the
 * same quantity and not the same state, and the row above the glyph offers
 * different things for each, so the picture has to tell them apart. It is the
 * pack's answer to the lyophilised cake in a sealed vial.
 */
export function PackGlyph({
  fraction,
  state,
  className,
}: {
  fraction: number;
  state: VialState;
  className?: string;
}) {
  const { empty, onOrder } = glyphTone(state);
  const left = empty || onOrder ? 0 : blisterDots(fraction, BLISTER_SLOTS);
  const capFill = empty || onOrder ? "var(--faint)" : "var(--tangerine)";
  const capOpacity = empty || onOrder ? 0.5 : 1;

  return (
    <svg viewBox={GLYPH_VB} className={className} role="img" aria-hidden="true" style={{ height: "100%" }}>
      {/* The card the foil is sealed onto */}
      <rect x={3} y={5} width={26} height={60} rx={3}
        fill={onOrder ? "none" : "var(--glass)"} stroke="var(--line)" strokeWidth={1.2} />
      <rect x={3} y={5} width={26} height={6} rx={3} fill={capFill} opacity={capOpacity} />
      <rect x={3} y={9} width={26} height={3} fill={onOrder ? "none" : "var(--glass)"} />

      {state === "sealed" ? (
        <>
          <rect x={6} y={15} width={20} height={46} rx={2} fill="var(--tangerine)" opacity={0.85} />
          <line x1={6} y1={30} x2={26} y2={30} stroke="var(--glass)" strokeWidth={1} />
          <line x1={6} y1={46} x2={26} y2={46} stroke="var(--glass)" strokeWidth={1} />
        </>
      ) : (
        Array.from({ length: BLISTER_SLOTS }, (_, i) => {
          const col = i % 2;
          const full = i >= BLISTER_SLOTS - left;
          return (
            <circle
              key={i}
              cx={11 + col * 10}
              cy={13 + ((i - col) / 2) * 11.5}
              r={3.9}
              fill={full ? "var(--tangerine)" : "none"}
              opacity={full ? 0.85 : 1}
              stroke={full ? "none" : "var(--line)"}
              strokeWidth={1.2}
            />
          );
        })
      )}
    </svg>
  );
}

/**
 * A nasal spray bottle, with the level of what is in it.
 *
 * A liquid in a container, like the vial, so it keeps the vial's level. What
 * it does not keep is the crimp cap: the pump stem and the finger flange are
 * the only parts of a spray bottle that read at this size, so they are what
 * the drawing spends its pixels on.
 */
export function SprayGlyph({
  fraction,
  state,
  className,
}: {
  fraction: number;
  state: VialState;
  className?: string;
}) {
  const f = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  const { empty, onOrder } = glyphTone(state);
  const bodyTop = 22;
  const bodyBottom = 62;
  const fluidH = (bodyBottom - bodyTop) * f;
  const pumpFill = empty || onOrder ? "var(--faint)" : "var(--tangerine)";
  const pumpOpacity = empty || onOrder ? 0.5 : 1;

  return (
    <svg viewBox={GLYPH_VB} className={className} role="img" aria-hidden="true" style={{ height: "100%" }}>
      {/* Pump stem and the flange two fingers press on */}
      <rect x={14.5} y={1} width={3} height={7} fill={pumpFill} opacity={pumpOpacity} />
      <rect x={6} y={8} width={20} height={3.6} rx={1.6} fill={pumpFill} opacity={pumpOpacity} />
      <rect x={12} y={11.6} width={8} height={4} fill="var(--line)" />
      <path d="M 9 15.5 L 23 15.5 Q 26 15.5 26 19 L 26 62 Q 26 65 23 65 L 9 65 Q 6 65 6 62 L 6 19 Q 6 15.5 9 15.5 Z"
        fill="var(--glass)" stroke="var(--line)" strokeWidth={1.2} />
      {onOrder || f <= 0.01 ? null : (
        <rect x={7.4} y={bodyBottom - fluidH + 1} width={17.2} height={fluidH}
          fill="var(--tangerine)" opacity={0.75} rx={1} />
      )}
    </svg>
  );
}

/**
 * Whichever of the three the row is holding.
 *
 * One call site, one decision, made from the container the row already knows
 * about. A vial glyph above a count of tablets was the kind of small lie that
 * makes a reader distrust the rest of the screen.
 */
export function ContainerGlyph({
  container,
  fraction,
  state,
  className,
}: {
  container: ContainerKind;
  fraction: number;
  state: VialState;
  className?: string;
}) {
  if (container === "pack") return <PackGlyph fraction={fraction} state={state} className={className} />;
  if (container === "spray") return <SprayGlyph fraction={fraction} state={state} className={className} />;
  return <VialGlyph fraction={fraction} state={state} className={className} />;
}
