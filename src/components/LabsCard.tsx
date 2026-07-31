"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, Droplet, TrendingDown, TrendingUp } from "lucide-react";
import { Badge, Card, SectionLabel, TONE_BG, TONE_FG } from "./ui";
import { findPeptide, useProfileData, useStore } from "@/lib/store";
import { latestResult, labTrend, missingMarkerIds, trackedMarkerIds, verdictFor } from "@/lib/calc/labs";
import { findMarker } from "@/lib/data/labs";
import { formatDate, trim } from "@/lib/format";

const SHOWN = 4;

/**
 * A glance at bloodwork, linking through to the full record.
 *
 * Only ever shows what has actually been measured, plus a nudge towards markers
 * that the compounds currently running make worth checking.
 */
export function LabsCard() {
  const { labs, protocols } = useProfileData();
  const custom = useStore((s) => s.customPeptides);

  const compounds = useMemo(
    () =>
      protocols
        .filter((p) => p.active)
        .map((p) => findPeptide(custom, p.peptideId))
        .filter((p): p is NonNullable<typeof p> => !!p)
        .map((p) => ({
          category: p.category,
          mechanismClass: p.mechanismClass,
          c17AlphaAlkylated: p.c17AlphaAlkylated,
        })),
    [protocols, custom]);

  const tracked = useMemo(() => trackedMarkerIds(labs).slice(0, SHOWN), [labs]);
  const missing = useMemo(() => missingMarkerIds(labs, compounds), [labs, compounds]);

  if (!labs.length && !missing.length) return null;

  return (
    <Card className="p-5">
      <SectionLabel
        action={
          <Link
            href="/labs"
            className="press flex items-center gap-1 rounded-[var(--r-pill)] bg-[var(--mint-soft)] px-2.5 py-1 text-[12px] font-bold text-[var(--mint-ink)]"
          >
            {labs.length ? "All results" : "Add results"} <ArrowRight size={13} strokeWidth={2.6} />
          </Link>
        }
      >
        Bloodwork
      </SectionLabel>

      {tracked.length > 0 && (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {tracked.map((id) => (
            <MarkerRow key={id} markerId={id} labs={labs} />
          ))}
        </div>
      )}

      {missing.length > 0 && (
        <div
          className="mt-3 flex items-start gap-2.5 rounded-[var(--r-inner)] px-3.5 py-3 text-[12.5px] leading-relaxed"
          style={{ background: TONE_BG.sky, color: TONE_FG.sky }}
        >
          <Droplet size={15} strokeWidth={2.4} className="mt-0.5 shrink-0" />
          <span>
            Worth checking for what you are running:{" "}
            <strong>{missing.map((id) => findMarker(id)?.name ?? id).join(", ")}</strong>.
          </span>
        </div>
      )}
    </Card>
  );
}

function MarkerRow({ markerId, labs }: { markerId: string; labs: Parameters<typeof latestResult>[0] }) {
  const marker = findMarker(markerId);
  const result = latestResult(labs, markerId);
  if (!marker || !result) return null;

  const verdict = verdictFor(marker, result);
  const trend = labTrend(labs, markerId);
  const falling = trend != null && trend.delta < 0;
  // For HDL a fall is the unwelcome direction; for everything else here a rise is.
  const good = trend == null ? null : marker.higherIsBetter ? !falling : falling;

  return (
    <div className="rounded-[var(--r-inner)] bg-[var(--sunken)] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[12.5px] font-semibold text-[var(--muted)]">{marker.name}</span>
        {verdict.status !== "unknown" && (
          <Badge tone={verdict.tone === "muted" ? "neutral" : verdict.tone}>{verdict.label}</Badge>
        )}
      </div>

      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-[20px] font-extrabold tracking-tight text-[var(--ink)]">
          {trim(result.value, marker.decimals)}
        </span>
        <span className="text-[12px] font-medium text-[var(--faint)]">{marker.unit}</span>
      </div>

      <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-[var(--faint)]">
        {trend && (
          <span
            className="inline-flex items-center gap-0.5 font-semibold"
            style={{ color: good ? "var(--leaf-ink)" : "var(--tangerine-ink)" }}
          >
            {falling ? <TrendingDown size={11} /> : <TrendingUp size={11} />}
            {trend.delta > 0 ? "+" : "−"}
            {trim(Math.abs(trend.delta), marker.decimals)}
          </span>
        )}
        <span>{formatDate(result.at)}</span>
      </div>
    </div>
  );
}
