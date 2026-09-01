"use client";

import { useMemo } from "react";
import { SITE_DOTS, siteUsage } from "@/lib/calc/sites";
import type { DoseLog, InjectionSite } from "@/lib/types";
import { relativeTime } from "@/lib/format";

/**
 * Injection site rotation map using the same body figure as the landing page.
 *
 * The SVG body is taken directly from landing/visuals.tsx RotationArt, scaled
 * to a tighter viewBox so it fills the available space. Injection sites are
 * plotted as interactive dots shaded by recency: tangerine = recently used,
 * mint = suggested next, faint outline = rested/available.
 *
 * Where each dot goes is `SITE_DOTS` in calc/sites, next to the `BODY` bounds
 * it has to stay inside. They were here once, drifted out of step with the
 * figure below, and put the thigh dots on the shins. A test holds them now.
 */

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SiteMap({
  logs,
  selected,
  onSelect,
  restDays = 14,
  nowMs = Date.now(),
  className,
  allowed,
  multi,
  legend: showLegend = true,
}: {
  logs: Pick<DoseLog, "at" | "site" | "skipped">[];
  selected?: InjectionSite | "" | InjectionSite[];
  onSelect?: (site: InjectionSite) => void;
  restDays?: number;
  nowMs?: number;
  className?: string;
  allowed?: InjectionSite[] | null;
  multi?: boolean;
  legend?: boolean;
}) {
  const usage = useMemo(() => siteUsage(logs, nowMs, restDays), [logs, nowMs, restDays]);
  const byId = useMemo(() => new Map(usage.map((u) => [u.site, u])), [usage]);

  const allowedSet = useMemo(
    () => (allowed?.length ? new Set(allowed) : null),
    [allowed],
  );
  const selectedSet = useMemo(
    () => new Set(Array.isArray(selected) ? selected : selected ? [selected] : []),
    [selected],
  );

  const suggestion = useMemo(() => {
    if (multi) return null;
    const pool = allowedSet ? usage.filter((u) => allowedSet.has(u.site)) : usage;
    return (pool[0] ?? usage[0])?.site ?? null;
  }, [usage, allowedSet, multi]);

  return (
    <figure className={`m-0 ${className ?? ""}`}>
      <svg
        viewBox="0 0 200 240"
        role="group"
        aria-label="Injection site rotation map"
        style={{ width: "100%", height: "auto", maxWidth: 220, display: "block", margin: "0 auto" }}
      >
        {/* ── Body figure (same as landing RotationArt, scaled to 200-wide viewBox) ── */}
        {/* Head */}
        <circle
          cx="100" cy="22" r="15"
          fill="var(--sunken)"
          stroke="var(--line)"
          strokeWidth="1.5"
        />
        {/* Torso + arms + legs */}
        <path
          d="M100 40
             C 88 40 72 44 68 52
             L 62 82 L 72 85 L 74 62
             L 74 118
             C 74 128 76 136 78 162
             L 88 162 L 90 118 L 110 118 L 112 162
             L 122 162
             C 124 136 126 128 126 118
             L 126 62 L 128 85 L 138 82
             L 132 52
             C 128 44 112 40 100 40 Z"
          fill="var(--sunken)"
          stroke="var(--line)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* Left leg */}
        <path
          d="M78 162 C 76 178 76 200 78 230 L 88 230 C 90 200 90 178 90 162 Z"
          fill="var(--sunken)"
          stroke="var(--line)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* Right leg */}
        <path
          d="M110 162 C 110 178 110 200 112 230 L 122 230 C 124 200 124 178 122 162 Z"
          fill="var(--sunken)"
          stroke="var(--line)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* ── Injection site dots ── */}
        {SITE_DOTS.map((s) => {
          const u = byId.get(s.id);
          const rested = u?.rested ?? 1;
          const fill = 1 - rested;           // 0 = fully rested, 1 = just used
          const isSelected = selectedSet.has(s.id);
          const isSuggested = !isSelected && s.id === suggestion;
          const offPlan = !!allowedSet && !allowedSet.has(s.id);
          const interactive = !!onSelect;

          // Colour logic
          let dotFill: string;
          let dotStroke: string;
          const dotOpacity = offPlan ? 0.35 : 1;

          if (isSelected) {
            dotFill   = multi ? "none" : "var(--ink)";
            dotStroke = multi ? "var(--mint)" : "var(--ink)";
          } else if (isSuggested) {
            dotFill   = "none";
            dotStroke = "var(--mint)";
          } else {
            // Gradient: no usage → faint outline; heavy usage → tangerine fill
            dotFill   = fill > 0.05 ? "var(--tangerine)" : "var(--card)";
            dotStroke = fill > 0.05 ? "var(--tangerine)" : "var(--line)";
          }


          return (
            <g
              key={s.id}
              onClick={interactive ? () => onSelect!(s.id) : undefined}
              onKeyDown={
                interactive
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect!(s.id);
                      }
                    }
                  : undefined
              }
              tabIndex={interactive ? 0 : undefined}
              role={interactive ? "button" : undefined}
              aria-pressed={interactive ? isSelected : undefined}
              aria-label={`${u?.label ?? s.label}. ${
                u?.lastUsedAt ? `Last used ${relativeTime(u.lastUsedAt, nowMs)}` : "Never used"
              }${isSuggested ? ". Suggested next" : ""}${
                multi
                  ? isSelected
                    ? ". Pinned"
                    : ". Not pinned"
                  : offPlan
                    ? ". Off plan"
                    : ""
              }`}
              style={{ cursor: interactive ? "pointer" : "default", opacity: dotOpacity }}
            >
              {/* Pulse ring for suggested */}
              {isSuggested && (
                <circle
                  cx={s.cx} cy={s.cy} r={13}
                  fill="none"
                  stroke="var(--mint)"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                  opacity={0.6}
                />
              )}

              {/* Main dot */}
              <circle
                cx={s.cx}
                cy={s.cy}
                r={8}
                fill={isSelected && !multi ? dotFill : fill > 0.05 ? "var(--tangerine)" : "var(--card)"}
                fillOpacity={isSelected && !multi ? 1 : fill * 0.88}
                stroke={dotStroke}
                strokeWidth={isSelected || isSuggested ? 2.2 : 1.4}
              />

              {/* Checkmark on selected (single-select mode) */}
              {isSelected && !multi && (
                <path
                  d={`M${s.cx - 3.5} ${s.cy} l 2.5 3 l 5 -5.5`}
                  fill="none"
                  stroke="var(--canvas)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Pinned indicator (multi mode) */}
              {isSelected && multi && (
                <circle cx={s.cx} cy={s.cy} r={4} fill="var(--mint)" />
              )}

              {/* Use count badge */}
              {!isSelected && u && u.recentCount > 0 && (
                <text
                  x={s.cx}
                  y={s.cy + 3.5}
                  textAnchor="middle"
                  fontSize={8}
                  fontFamily="var(--font-mono)"
                  fill={fill > 0.5 ? "var(--canvas)" : "var(--muted)"}
                >
                  {u.recentCount}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {showLegend && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-[var(--faint)]">
          {multi ? (
            <>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full border-2 border-[var(--mint)]" />
                pinned
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full border border-[var(--line)]" />
                not pinned
              </span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--tangerine)]" />
                used recently
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full border border-[var(--line)]" />
                rested
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full border border-dashed border-[var(--mint)]" />
                suggested next
              </span>
              {allowedSet && (
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full border border-[var(--line)] opacity-35" />
                  off plan
                </span>
              )}
            </>
          )}
        </div>
      )}
    </figure>
  );
}
