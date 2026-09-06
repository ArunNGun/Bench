"use client";
import { useLang } from "@/lib/i18n";

import { useMemo } from "react";
import { TrendingUp } from "lucide-react";
import { Card, SectionLabel } from "./ui";
import type { Peptide, Protocol } from "@/lib/types";
import { describeAccumulation, project } from "@/lib/calc/project";
import { formatDuration, trim } from "@/lib/format";

/**
 * What a protocol will do, shown while it is still being decided.
 *
 * The chart is the least useful thing here. The numbers under it are the point:
 * how long until levels stop climbing, and how much higher they end up than the
 * first dose. Someone comparing 250 mg weekly against 125 mg twice weekly is
 * really asking about the swing between peak and trough, and that is a figure
 * no other tracker puts in front of them.
 *
 * Renders nothing without a modellable half-life, which is correct rather than
 * unfortunate: for trenbolone or boldenone there is no honest curve to draw.
 */
export function ProjectionPreview({
  protocol,
  peptide,
}: {
  protocol: Protocol;
  peptide: Peptide | undefined;
}) {
  const { t } = useLang();
  const projection = useMemo(() => {
    if (!peptide?.halfLifeHours) return null;
    return project({
      protocol,
      halfLifeHours: peptide.halfLifeHours,
      tmaxHours: peptide.tmaxHours,
    });
  }, [protocol, peptide]);

  if (!peptide) return null;

  if (!peptide.halfLifeHours) {
    return (
      <Card className="p-4">
        <SectionLabel>
          <span className="inline-flex items-center gap-1.5">
            <TrendingUp size={13} strokeWidth={2.6} /> Projection
          </span>
        </SectionLabel>
        <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--muted)]">
          No curve for {peptide.name}: its half-life has never been established in humans.
          {peptide.halfLifeNote ? ` ${peptide.halfLifeNote}` : ""}
        </p>
      </Card>
    );
  }

  if (!projection || projection.series.length < 2) return null;

  const { series, doseTimes, accumulation, hoursToSteady, swing } = projection;
  const from = series[0].t;
  const to = series[series.length - 1].t;
  const span = to - from || 1;
  const peak = Math.max(...series.map((s) => s.level), 1);

  const x = (t: number) => ((t - from) / span) * 100;
  const y = (level: number) => 100 - (level / peak) * 92;

  const path = series.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(2)} ${y(p.level).toFixed(2)}`).join(" ");
  const area = `${path} L100 100 L0 100 Z`;

  return (
    <Card className="p-4">
      <SectionLabel>
        <span className="inline-flex items-center gap-1.5">
          <TrendingUp size={13} strokeWidth={2.6} /> If you run this
        </span>
      </SectionLabel>

      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="mt-3 h-28 w-full"
        role="img"
        aria-label={`Projected levels for ${peptide.name} over ${Math.round(span / 86_400_000)} days`}
      >
        <defs>
          <linearGradient id="proj-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--mint)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--mint)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#proj-fill)" />
        <path
          d={path}
          fill="none"
          stroke="var(--mint)"
          strokeWidth="1.6"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
        {/* Where steady state is effectively reached. */}
        {hoursToSteady * 3_600_000 < span && (
          <line
            x1={x(from + hoursToSteady * 3_600_000)}
            y1="0"
            x2={x(from + hoursToSteady * 3_600_000)}
            y2="100"
            stroke="var(--faint)"
            strokeWidth="1"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {doseTimes.map((t) => (
          <line
            key={t}
            x1={x(t)}
            y1="97"
            x2={x(t)}
            y2="100"
            stroke="var(--mint)"
            strokeWidth="1.4"
            vectorEffect="non-scaling-stroke"
            opacity="0.7"
          />
        ))}
      </svg>

      <dl className="mt-3 grid grid-cols-3 gap-2">
        <Figure
          label="Levels settle"
          value={formatDuration(hoursToSteady)}
          hint="from the first dose"
        />
        <Figure
          label="Steady vs first"
          value={accumulation == null ? "n/a" : `${trim(accumulation, 1)}x`}
          hint="same dose, higher level"
        />
        <Figure
          label={t("projection_peak_trough")}
          value={swing == null ? "n/a" : `${trim(swing, 1)}x`}
          hint="between doses"
        />
      </dl>

      {describeAccumulation(accumulation) && (
        <p className="mt-2.5 text-[12.5px] leading-relaxed text-[var(--muted)]">
          {describeAccumulation(accumulation)}
        </p>
      )}

      <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--faint)]">
        A one-compartment model from the published half-life, on the schedule above. It shows the
        shape, not your blood. Absorption and clearance vary between people and the model does not
        know yours.
      </p>
    </Card>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[var(--r-inner)] bg-[var(--sunken)] px-2.5 py-2">
      <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--faint)]">
        {label}
      </dt>
      <dd className="tnum mt-0.5 text-[15px] font-extrabold leading-none text-[var(--ink)]">
        {value}
      </dd>
      <dd className="mt-0.5 text-[10.5px] text-[var(--faint)]">{hint}</dd>
    </div>
  );
}
