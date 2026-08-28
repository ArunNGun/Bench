"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Badge, Callout, Card, NumberInput, SectionLabel, Stat, type Tone } from "@/components/ui";
import { PkChart } from "@/components/PkChart";
import { findPeptide, useStore } from "@/lib/store";
import { BlendBreakdown } from "@/components/BlendBreakdown";
import { isBlend } from "@/lib/calc/blend";
import { accumulationRatio, curveFor, hoursUntilFraction, timeToSteadyState } from "@/lib/calc/pk";
import { titrationStepStartWeeks, titrationTotalWeeks } from "@/lib/calc/schedule";
import {
  CATEGORY_LABEL,
  EVIDENCE_DETAIL,
  EVIDENCE_LABEL,
  ROUTE_LABEL,
  type EvidenceLevel,
  type Peptide,
} from "@/lib/types";
import { formatDose, formatDuration, formatHalfLife, trim } from "@/lib/format";

const HOUR = 3_600_000;

const EVIDENCE_TONE: Record<EvidenceLevel, Tone> = {
  approved: "leaf",
  clinical: "sky",
  preliminary: "tangerine",
  preclinical: "tangerine",
  anecdotal: "rose",
};

export function PeptideDetail({ slug }: { slug: string }) {
  const custom = useStore((s) => s.customPeptides);
  const p = findPeptide(custom, slug);

  // A single illustrative dose, so the curve shape is visible.
  const demo = useMemo(() => {
    const curve = p ? curveFor(p) : null;
    if (!p || !curve) return null;
    const now = Date.now();
    const span = Math.min(curve.params.halfLifeHours * 5, 24 * 21);
    return {
      from: now,
      to: now + span * HOUR,
      estimated: curve.estimated,
      series: [
        {
          id: p.id,
          label: p.name,
          color: "var(--tangerine)",
          doses: [{ at: now, amountMcg: 1000 }],
          params: curve.params,
          referenceMcg: 1000,
          estimated: curve.estimated,
        },
      ],
    };
  }, [p]);

  if (!p) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <p className="text-[15px] text-[var(--muted)]">No compound called “{slug}”.</p>
        <Link href="/library" className="mt-4 inline-block text-[14px] text-[var(--tangerine)] hover:underline">
          Back to the library
        </Link>
      </div>
    );
  }

  const weekly = p.doseRanges[0]?.perWeek ?? 0;
  const intervalHours = weekly > 0 ? (7 * 24) / weekly : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/library"
        className="inline-flex items-center gap-1.5 text-[13px] text-[var(--muted)] hover:text-[var(--ink)]"
      >
        <ArrowLeft size={14} /> Library
      </Link>

      <header>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[26px] font-extrabold tracking-tight text-[var(--ink)]">{p.name}</h1>
          <Badge>{CATEGORY_LABEL[p.category]}</Badge>
        </div>
        {p.aka.length > 0 && (
          <p className="mt-1 text-[13px] text-[var(--faint)]">Also known as {p.aka.join(", ")}</p>
        )}
        <p className="mt-2.5 text-[15px] leading-relaxed text-[var(--muted)]">{p.summary}</p>
      </header>

      {p.cautionBanner && (
        <Callout tone="danger" title="Read this first">
          {p.cautionBanner}
        </Callout>
      )}

      <Card className="p-4">
        <SectionLabel>How it works</SectionLabel>
        <p className="text-[14px] leading-relaxed text-[var(--muted)]">{p.mechanism}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {p.routes.map((r) => (
            <Badge key={r}>{ROUTE_LABEL[r]}</Badge>
          ))}
        </div>
      </Card>

      {/* Pharmacokinetics */}
      <Card className="overflow-hidden">
        <div className="border-b border-[var(--line)] px-4 py-3">
          <SectionLabel className="mb-0">In the body</SectionLabel>
        </div>

        {p.halfLifeHours != null ? (
          <>
            <div className="grid grid-cols-2 gap-4 px-4 py-4 sm:grid-cols-4">
              <Stat label="Half-life" value={formatHalfLife(p.halfLifeHours)} />
              {p.tmaxHours != null && (
                <Stat label="Time to peak" value={formatDuration(p.tmaxHours)} tone="tangerine" />
              )}
              <Stat
                label="90% gone after"
                value={formatDuration(hoursUntilFraction(0.1, p.halfLifeHours))}
                tone="sky"
              />
              {intervalHours > 0 && (
                <Stat
                  label="Builds up to"
                  value={`${trim(accumulationRatio(intervalHours, p.halfLifeHours), 2)}×`}
                  hint={`Steady state after about ${formatDuration(timeToSteadyState(p.halfLifeHours))} at ${p.doseRanges[0].frequency}.`}
                />
              )}
            </div>

            {demo && (
              <div className="px-2 pb-2">
                <PkChart
                  series={demo.series}
                  fromMs={demo.from}
                  toMs={demo.to}
                  nowMs={demo.from}
                  animate={false}
                />
              </div>
            )}

            <p className="border-t border-[var(--line)] px-4 py-2.5 text-[11.5px] leading-relaxed text-[var(--faint)]">
              Shape of a single dose, modelled as one compartment with first-order absorption. The
              peak is normalised to 100% because bioavailability and volume of distribution are not
              published for most of these compounds.
            </p>
          </>
        ) : demo?.estimated && p.halfLifeEstimate ? (
          <>
            {/*
              A shape without any of the figures. Every Stat above is a claim
              about a level in a person, and the only measurement here was made
              in another species or by another route, so the curve is drawn and
              nothing is counted from it.
            */}
            <div className="px-2 pb-2 pt-3">
              <PkChart
                series={demo.series}
                fromMs={demo.from}
                toMs={demo.to}
                nowMs={demo.from}
                animate={false}
              />
            </div>
            <p className="border-t border-[var(--line)] px-4 py-2.5 text-[11.5px] leading-relaxed text-[var(--muted)]">
              A dashed curve, from {formatHalfLife(p.halfLifeEstimate.hours)} measured in{" "}
              {p.halfLifeEstimate.species} given it{" "}
              {ROUTE_LABEL[p.halfLifeEstimate.route].toLowerCase()}, reported by{" "}
              <a
                href={p.halfLifeEstimate.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-dotted"
              >
                {p.halfLifeEstimate.source}
              </a>
              . No human figure has been published, so this shows how the shape behaves and not how
              much is in you. Nothing is calculated from it: no time to clear, no build-up, no
              steady state.
            </p>
          </>
        ) : (
          <div className="px-4 py-5">
            <p className="text-[14px] leading-relaxed text-[var(--muted)]">
              No plasma curve is shown for this compound.
            </p>
          </div>
        )}

        {p.halfLifeNote && (
          <p className="border-t border-[var(--line)] px-4 py-3 text-[12.5px] leading-relaxed text-[var(--muted)]">
            {p.halfLifeNote}
          </p>
        )}
      </Card>

      {p.timeline && p.timeline.length > 0 && (
        <Card className="p-4">
          <SectionLabel>What happens, and when</SectionLabel>
          <ol className="space-y-3">
            {p.timeline.map((t) => (
              <li key={t.fromHours} className="flex gap-3">
                <span className="tnum w-24 shrink-0 pt-0.5 font-mono text-[12px] text-[var(--tangerine)]">
                  {formatDuration(t.fromHours)}, {formatDuration(t.toHours)}
                </span>
                <span className="flex-1 text-[13.5px] leading-relaxed text-[var(--muted)]">
                  {t.label}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {/* Doses */}
      <Card className="p-4">
        <SectionLabel>Doses</SectionLabel>
        <div className="space-y-3">
          {p.doseRanges.map((d, i) => (
            <div key={i} className="rounded border border-[var(--line)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="tnum font-mono text-[15px] text-[var(--ink)]">
                  {d.lowMcg === d.highMcg
                    ? formatDose(d.lowMcg)
                    : `${formatDose(d.lowMcg)}, ${formatDose(d.highMcg)}`}
                </span>
                <span className="text-[13px] text-[var(--muted)]">{d.frequency}</span>
                <Badge tone={EVIDENCE_TONE[d.evidence]} title={EVIDENCE_DETAIL[d.evidence]}>
                  {EVIDENCE_LABEL[d.evidence]}
                </Badge>
              </div>
              {d.note && (
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--muted)]">{d.note}</p>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Titration */}
      {p.titrations?.map((t) => {
        const starts = titrationStepStartWeeks(t.steps);
        return (
          <Card key={t.id} className="p-4">
            <SectionLabel>{t.name}</SectionLabel>
            <p className="mb-3 text-[12.5px] text-[var(--faint)]">
              {t.source} · {titrationTotalWeeks(t.steps)} weeks total
            </p>

            <ol className="space-y-1">
              {t.steps.map((s, i) => (
                <li key={s.step} className="flex items-center gap-3 rounded px-2 py-2 odd:bg-[var(--sunken)]/40">
                  <span className="tnum w-20 shrink-0 font-mono text-[12px] text-[var(--faint)]">
                    wk {starts[i] + 1}
                    {s.weeks > 1 ? `, ${starts[i] + s.weeks}` : ""}
                  </span>
                  <span className="tnum w-24 shrink-0 font-mono text-[14px] text-[var(--tangerine)]">
                    {formatDose(s.doseMcg)}
                  </span>
                  <span className="min-w-0 flex-1 text-[12.5px] text-[var(--muted)]">
                    {s.note ?? `${s.weeks} week${s.weeks === 1 ? "" : "s"}`}
                  </span>
                </li>
              ))}
            </ol>

            {t.note && (
              <p className="mt-3 border-t border-[var(--line)] pt-3 text-[12.5px] leading-relaxed text-[var(--muted)]">
                {t.note}
              </p>
            )}
          </Card>
        );
      })}

      {isBlend(p) && <BlendPanel blend={p} custom={custom} />}

      {p.vialSizesMg.length > 0 && (
        <Card className="p-4">
          <SectionLabel>Vial sizes</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {p.vialSizesMg.map((mg) => (
              <Badge key={mg} tone="tangerine">
                {mg} mg
              </Badge>
            ))}
          </div>
          {p.reconstitutedDays && (
            <p className="mt-2.5 text-[12.5px] text-[var(--muted)]">
              Commonly treated as good for {p.reconstitutedDays} days refrigerated once
              reconstituted.
            </p>
          )}
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <SectionLabel>Side effects</SectionLabel>
          <ul className="space-y-2">
            {p.sideEffects.map((s, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-[var(--muted)]">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--faint)]" />
                {s}
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4">
          <SectionLabel>Cautions</SectionLabel>
          <ul className="space-y-2">
            {p.contraindications.map((s, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-[var(--muted)]">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--rose)]" />
                {s}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="p-4">
        <SectionLabel>Status</SectionLabel>
        <p className="text-[13.5px] leading-relaxed text-[var(--muted)]">{p.status}</p>
      </Card>

      <Card className="p-4">
        <SectionLabel>Sources</SectionLabel>
        <ul className="space-y-2">
          {p.citations.map((c) => (
            <li key={c.url}>
              <a
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-start gap-1.5 text-[13px] leading-relaxed text-[var(--sky)] hover:underline"
              >
                {c.label}
                <ExternalLink size={12} className="mt-1 shrink-0" />
              </a>
            </li>
          ))}
        </ul>
      </Card>

      <p className="pb-4 text-[12px] leading-relaxed text-[var(--faint)]">
        Reference information for personal record-keeping. Not medical advice, and not a
        recommendation to use any of these compounds.
      </p>
    </div>
  );
}


/**
 * A blend's composition plus a live split of any dose you type, so the
 * per-component amounts are answerable without arithmetic.
 */
function BlendPanel({ blend, custom }: { blend: Peptide; custom: Peptide[] }) {
  const [doseMcg, setDoseMcg] = useState(() => {
    const r = blend.doseRanges[0];
    return r ? Math.round((r.lowMcg + r.highMcg) / 2) : 1000;
  });

  return (
    <Card className="space-y-4 p-4">
      <SectionLabel>What is in it</SectionLabel>

      <ul className="space-y-1.5">
        {(blend.components ?? []).map((c) => (
          <li key={c.name} className="flex items-center gap-3 text-[14px]">
            <span className="tnum w-16 shrink-0 font-mono text-[var(--tangerine)]">
              {c.mgPerVial != null ? `${c.mgPerVial} mg` : "n/a"}
            </span>
            {c.peptideId ? (
              <Link href={`/library/${c.peptideId}`} className="text-[var(--ink)] hover:underline">
                {c.name}
              </Link>
            ) : (
              <span className="text-[var(--ink)]">{c.name}</span>
            )}
          </li>
        ))}
      </ul>

      <div className="border-t border-[var(--line)] pt-4">
        <SectionLabel>What a dose delivers</SectionLabel>
        <div className="mb-3 max-w-48">
          <NumberInput
            value={doseMcg}
            min={0}
            step={250}
            suffix="mcg"
            aria-label="Blend dose"
            onChange={(e) => setDoseMcg(Number(e.target.value))}
          />
        </div>
        <BlendBreakdown
          blend={blend}
          doseMcg={doseMcg}
          resolve={(id) => findPeptide(custom, id)}
        />
      </div>
    </Card>
  );
}
