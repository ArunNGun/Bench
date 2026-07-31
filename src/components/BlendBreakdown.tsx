"use client";

import Link from "next/link";
import { Badge, type Tone } from "./ui";
import { decomposeDose, describeBlendDose, type ComponentDose } from "@/lib/calc/blend";
import type { Peptide } from "@/lib/types";
import { formatDose, formatHalfLife, percent } from "@/lib/format";

/**
 * What a blend dose actually delivers, component by component.
 *
 * A fixed ratio means you cannot move one component without moving the rest,
 * so the useful thing to show is not the blend total but each component's
 * amount set against the dose that component is normally used at alone.
 */
export function BlendBreakdown({
  blend,
  doseMcg,
  resolve,
  compact,
  dosesPerWeek,
}: {
  blend: Peptide;
  doseMcg: number;
  resolve: (id: string) => Peptide | undefined;
  compact?: boolean;
  /** Supplying the schedule compares weekly exposure rather than per dose. */
  dosesPerWeek?: number;
}) {
  const parts = decomposeDose(blend, doseMcg, resolve, dosesPerWeek);
  if (!parts.length) return null;

  const summary = describeBlendDose(parts);

  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {parts.map((p) => (
          <ComponentRow key={p.name} part={p} compact={compact} />
        ))}
      </ul>

      {summary && (
        <p className="text-[12px] leading-relaxed text-[var(--tangerine)]">{summary}</p>
      )}
    </div>
  );
}

const TONE: Record<ComponentDose["relativeToTypical"], Tone> = {
  within: "leaf",
  below: "neutral",
  above: "rose",
  unknown: "neutral",
};

const LABEL: Record<ComponentDose["relativeToTypical"], string> = {
  within: "in usual range",
  below: "below usual",
  above: "above usual",
  unknown: "no range known",
};

function ComponentRow({ part, compact }: { part: ComponentDose; compact?: boolean }) {
  const share = percent(part.fraction, 0);

  return (
    <li className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 rounded px-2 py-1.5 odd:bg-[var(--sunken)]/40">
      <span className="tnum w-20 shrink-0 font-mono text-[13.5px] text-[var(--tangerine)]">
        {formatDose(part.mcg)}
      </span>

      {part.peptideId ? (
        <Link
          href={`/library/${part.peptideId}`}
          className="text-[13.5px] text-[var(--ink)] hover:underline"
        >
          {part.name}
        </Link>
      ) : (
        <span className="text-[13.5px] text-[var(--ink)]">{part.name}</span>
      )}

      {part.fraction < 1 && (
        <span className="tnum font-mono text-[11.5px] text-[var(--faint)]">{share} of blend</span>
      )}

      <Badge tone={TONE[part.relativeToTypical]}>{LABEL[part.relativeToTypical]}</Badge>

      {/* The range itself, spelled out, "below usual" is useless without it. */}
      {part.comparedOn === "weekly" && part.weeklyMcg != null ? (
        <span className="w-full text-[11.5px] text-[var(--faint)] sm:w-auto">
          {formatDose(part.weeklyMcg)}/week vs {formatDose(part.typicalWeeklyLowMcg!)}, {formatDose(part.typicalWeeklyHighMcg!)}/week on its own
          {part.typicalFrequency ? ` (${part.typicalFrequency})` : ""}
        </span>
      ) : part.typicalLowMcg != null ? (
        <span className="w-full text-[11.5px] text-[var(--faint)] sm:w-auto">
          usually {formatDose(part.typicalLowMcg)}, {formatDose(part.typicalHighMcg!)} per dose
          {part.typicalFrequency ? `, ${part.typicalFrequency}` : ""}
        </span>
      ) : (
        <span className="w-full text-[11.5px] text-[var(--faint)] sm:w-auto">
          no standalone range documented
        </span>
      )}

      {!compact && (
        <span className="w-full text-[11.5px] text-[var(--faint)] sm:w-auto">
          {part.peptide?.halfLifeHours != null
            ? `half-life ${formatHalfLife(part.peptide.halfLifeHours)}`
            : "no published half-life"}
        </span>
      )}
    </li>
  );
}
