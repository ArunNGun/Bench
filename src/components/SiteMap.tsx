"use client";

import { useMemo } from "react";
import { siteUsage } from "@/lib/calc/sites";
import type { DoseLog, InjectionSite } from "@/lib/types";
import { relativeTime } from "@/lib/format";

/**
 * A torso seen from the front, with the ten injection sites as targets.
 *
 * Each target is shaded by how rested it is: filled amber means recently used,
 * hollow means rested. The point is to make "where haven't I been lately"
 * answerable at a glance, because lipohypertrophy makes absorption from an
 * overused site unpredictable.
 */

interface Target {
  id: InjectionSite;
  cx: number;
  cy: number;
  short: string;
}

const TARGETS: Target[] = [
  { id: "arm-l", cx: 26, cy: 62, short: "L arm" },
  { id: "arm-r", cx: 134, cy: 62, short: "R arm" },
  { id: "abdomen-ul", cx: 64, cy: 92, short: "Abd UL" },
  { id: "abdomen-um", cx: 80, cy: 92, short: "Abd UM" },
  { id: "abdomen-ur", cx: 96, cy: 92, short: "Abd UR" },
  { id: "abdomen-ll", cx: 64, cy: 118, short: "Abd LL" },
  { id: "abdomen-lm", cx: 80, cy: 118, short: "Abd LM" },
  { id: "abdomen-lr", cx: 96, cy: 118, short: "Abd LR" },
  { id: "glute-l", cx: 62, cy: 146, short: "L glute" },
  { id: "glute-r", cx: 98, cy: 146, short: "R glute" },
  { id: "thigh-l", cx: 60, cy: 190, short: "L thigh" },
  { id: "thigh-r", cx: 100, cy: 190, short: "R thigh" },
];

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
  /** Single-select value, or the whole pinned set when `multi` is on. */
  selected?: InjectionSite | "" | InjectionSite[];
  onSelect?: (site: InjectionSite) => void;
  restDays?: number;
  nowMs?: number;
  className?: string;
  /**
   * Sites this protocol pins. Anything outside the set is dimmed but still
   * selectable. You can always record where the injection actually went.
   */
  allowed?: InjectionSite[] | null;
  /** Toggle sites on and off instead of picking exactly one. */
  multi?: boolean;
  legend?: boolean;
}) {
  const usage = useMemo(() => siteUsage(logs, nowMs, restDays), [logs, nowMs, restDays]);
  const byId = useMemo(() => new Map(usage.map((u) => [u.site, u])), [usage]);

  const allowedSet = useMemo(
    () => (allowed?.length ? new Set(allowed) : null),
    [allowed]);
  const selectedSet = useMemo(
    () => new Set(Array.isArray(selected) ? selected : selected ? [selected] : []),
    [selected]);

  // Suggest within the pinned set when there is one.
  const suggestion = useMemo(() => {
    if (multi) return null;
    const within = allowedSet ? usage.filter((u) => allowedSet.has(u.site)) : usage;
    return (within[0] ?? usage[0])?.site ?? null;
  }, [usage, allowedSet, multi]);

  const legend = !showLegend ? null : (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-[var(--faint)]">
      {multi ? (
        <>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full border-2 border-[var(--leaf)]" />
            pinned
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full border border-[var(--line)]" />
            not used
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
            <span className="h-2.5 w-2.5 rounded-full border border-dashed border-[var(--leaf)]" />
            suggested next
          </span>
          {allowedSet && (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border border-dashed border-[var(--line)] opacity-40" />
              off plan
            </span>
          )}
        </>
      )}
    </div>
  );

  return (
    <figure className="m-0">
    <svg
      viewBox="0 0 160 222"
      className={className}
      role="group"
      aria-label="Injection site rotation map"
      style={{ width: "100%", height: "auto", maxWidth: 240, display: "block", margin: "0 auto" }}
    >
      {/* Body outline: schematic, just enough to orient the targets */}
      <g fill="none" stroke="var(--line)" strokeWidth={1.5} strokeLinejoin="round">
        <circle cx={80} cy={22} r={13} />
        <path d="M 62 40 Q 80 34 98 40 L 106 48 L 112 96 L 100 100 L 102 150 L 96 214 L 84 214 L 80 152 L 76 214 L 64 214 L 58 150 L 60 100 L 48 96 L 54 48 Z" />
        <path d="M 54 48 L 34 56 L 24 104" />
        <path d="M 106 48 L 126 56 L 136 104" />
      </g>

      {TARGETS.map((t) => {
        const u = byId.get(t.id);
        const rested = u?.rested ?? 1;
        // Fully rested reads as an empty outline; freshly used fills solid.
        const fill = 1 - rested;
        const isSelected = selectedSet.has(t.id);
        const isSuggested = !isSelected && t.id === suggestion;
        const interactive = !!onSelect;
        // Outside the pinned set: visible and still clickable, just quieter.
        const offPlan = !!allowedSet && !allowedSet.has(t.id);

        return (
          <g
            key={t.id}
            onClick={interactive ? () => onSelect!(t.id) : undefined}
            onKeyDown={
              interactive
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect!(t.id);
                    }
                  }
                : undefined
            }
            tabIndex={interactive ? 0 : undefined}
            role={interactive ? "button" : undefined}
            aria-pressed={interactive ? isSelected : undefined}
            aria-label={`${u?.label ?? t.id}. ${
              u?.lastUsedAt ? `Last used ${relativeTime(u.lastUsedAt, nowMs)}` : "Never used"
            }${isSuggested ? ". Suggested next" : ""}${
              multi ? (isSelected ? ". Pinned" : ". Not pinned") : offPlan ? ". Off plan" : ""
            }`}
            style={{ cursor: interactive ? "pointer" : "neutral", opacity: offPlan ? 0.4 : 1 }}
          >
            <circle
              cx={t.cx}
              cy={t.cy}
              r={9}
              fill="var(--tangerine)"
              fillOpacity={fill * 0.85}
              stroke={
                isSelected
                  ? multi
                    ? "var(--leaf)"
                    : "var(--ink)"
                  : isSuggested
                    ? "var(--leaf)"
                    : "var(--line)"
              }
              strokeWidth={isSelected || isSuggested ? 2.2 : 1.2}
              strokeDasharray={offPlan && !isSelected ? "2 2" : undefined}
            />
            {isSuggested && (
              <circle cx={t.cx} cy={t.cy} r={13} fill="none" stroke="var(--leaf)" strokeWidth={1} strokeDasharray="2 3" />
            )}
            {u && u.recentCount > 0 && (
              <text
                x={t.cx}
                y={t.cy + 3.5}
                textAnchor="middle"
                fontSize={9}
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
    {legend}
    </figure>
  );
}
