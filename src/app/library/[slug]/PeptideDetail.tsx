"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Badge, Callout, Card, NumberInput, SectionLabel, Stat, type Tone } from "@/components/ui";
import { PkChart } from "@/components/PkChart";
import { YourHalfLife } from "@/components/YourHalfLife";
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
import {
  describeHalfLifeEstimate,
  ESTIMATE_KEY,
  formatDose,
  formatDuration,
  formatHalfLife,
  trim,
} from "@/lib/format";
import { useLang } from "@/lib/i18n";

const HOUR = 3_600_000;

const EVIDENCE_TONE: Record<EvidenceLevel, Tone> = {
  approved: "leaf",
  clinical: "sky",
  preliminary: "tangerine",
  preclinical: "tangerine",
  anecdotal: "rose",
};

export function PeptideDetail({ slug }: { slug: string }) {
  const { t } = useLang();
  const custom = useStore((s) => s.customPeptides);
  const p = findPeptide(custom, slug);

  /** Your own half-life for this compound, if you gave one. */
  const mine = useStore((s) => s.halfLifeOverrides)?.[p?.id ?? ""];

  // A single illustrative dose, so the curve shape is visible.
  const demo = useMemo(() => {
    const curve = p ? curveFor(p, mine) : null;
    if (!p || !curve) return null;
    const now = Date.now();
    const span = Math.min(curve.params.halfLifeHours * 5, 24 * 21);
    return {
      from: now,
      to: now + span * HOUR,
      basis: curve.basis,
      series: [
        {
          id: p.id,
          label: p.name,
          color: "var(--tangerine)",
          doses: [{ at: now, amountMcg: 1000 }],
          params: curve.params,
          referenceMcg: 1000,
          basis: curve.basis,
        },
      ],
    };
  }, [p, mine]);

  if (!p) {
    return (
      <div className="mx-auto max-w-2xl py-20 text-center">
        <p className="text-[15px] text-[var(--muted)]">{t("pep_not_found", { slug })}</p>
        <Link href="/library" className="mt-4 inline-block text-[14px] text-[var(--tangerine)] hover:underline">
          {t("pep_back_to_library")}
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
        <ArrowLeft size={14} /> {t("pep_library")}
      </Link>

      <header>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[26px] font-extrabold tracking-tight text-[var(--ink)]">{p.name}</h1>
          <Badge>{CATEGORY_LABEL[p.category]}</Badge>
        </div>
        {p.aka.length > 0 && (
          <p className="mt-1 text-[13px] text-[var(--faint)]">
            {t("pep_also_known", { names: p.aka.join(", ") })}
          </p>
        )}
        <p className="mt-2.5 text-[15px] leading-relaxed text-[var(--muted)]">{p.summary}</p>
      </header>

      {p.cautionBanner && (
        <Callout tone="danger" title={t("pep_read_first")}>
          {p.cautionBanner}
        </Callout>
      )}

      <Card className="p-4">
        <SectionLabel>{t("pep_how_it_works")}</SectionLabel>
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
          <SectionLabel className="mb-0">{t("pep_in_the_body")}</SectionLabel>
        </div>

        {p.halfLifeHours != null ? (
          <>
            <div className="grid grid-cols-2 gap-4 px-4 py-4 sm:grid-cols-4">
              <Stat label={t("pep_half_life")} value={formatHalfLife(p.halfLifeHours)} />
              {p.tmaxHours != null && (
                <Stat label={t("pep_time_to_peak")} value={formatDuration(p.tmaxHours)} tone="tangerine" />
              )}
              <Stat
                label={t("pep_ninety_gone")}
                value={formatDuration(hoursUntilFraction(0.1, p.halfLifeHours))}
                tone="sky"
              />
              {intervalHours > 0 && (
                <Stat
                  label={t("pep_builds_up")}
                  value={`${trim(accumulationRatio(intervalHours, p.halfLifeHours), 2)}×`}
                  hint={t("pep_steady_hint", {
                    duration: formatDuration(timeToSteadyState(p.halfLifeHours)),
                    frequency: p.doseRanges[0].frequency,
                  })}
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
              {t("pep_single_dose_note")}
            </p>
          </>
        ) : demo?.basis === "elsewhere" && p.halfLifeEstimate ? (
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
            <p
              className={`border-t border-[var(--line)] px-4 py-2.5 text-[11.5px] leading-relaxed ${
                p.halfLifeEstimate.evidence === "anecdotal"
                  ? "text-[var(--tangerine)]"
                  : "text-[var(--muted)]"
              }`}
            >
              <strong className="font-semibold">
                {t(ESTIMATE_KEY[p.halfLifeEstimate.evidence])}.
              </strong>{" "}
              {describeHalfLifeEstimate(p.halfLifeEstimate)}{" "}
              <a
                href={p.halfLifeEstimate.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-dotted"
              >
                {t("pep_check_yourself")}
              </a>
              . {t("pep_estimate_note")}
            </p>
          </>
        ) : demo?.basis === "yours" && mine ? (
          <>
            <div className="px-2 pb-2 pt-3">
              <PkChart
                series={demo.series}
                fromMs={demo.from}
                toMs={demo.to}
                nowMs={demo.from}
                animate={false}
              />
            </div>
            <p className="border-t border-[var(--line)] px-4 py-2.5 text-[11.5px] leading-relaxed text-[var(--tangerine)]">
              <strong className="font-semibold">{t("pep_your_figure")}</strong>{" "}
              {t("pep_your_figure_note", {
                hours: formatHalfLife(mine.hours),
                note: mine.note ? `, ${mine.note}` : "",
              })}
            </p>
          </>
        ) : (
          <div className="px-4 py-5">
            <p className="text-[14px] leading-relaxed text-[var(--muted)]">
              {t("pep_no_curve")}
            </p>
          </div>
        )}

        {/*
          Offered only where the library has nothing published for a person.
          Where it does, the published figure is the figure, and a text box
          beside it would be an invitation to overwrite a label with a rumour.
        */}
        {p.halfLifeHours == null && <YourHalfLife peptideId={p.id} name={p.name} />}

        {p.halfLifeNote && (
          <p className="border-t border-[var(--line)] px-4 py-3 text-[12.5px] leading-relaxed text-[var(--muted)]">
            {p.halfLifeNote}
          </p>
        )}
      </Card>

      {p.timeline && p.timeline.length > 0 && (
        <Card className="p-4">
          <SectionLabel>{t("pep_what_happens")}</SectionLabel>
          <ol className="space-y-3">
            {p.timeline.map((phase) => (
              <li key={phase.fromHours} className="flex gap-3">
                <span className="tnum w-24 shrink-0 pt-0.5 font-mono text-[12px] text-[var(--tangerine)]">
                  {formatDuration(phase.fromHours)}, {formatDuration(phase.toHours)}
                </span>
                <span className="flex-1 text-[13.5px] leading-relaxed text-[var(--muted)]">
                  {phase.label}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {/* Doses */}
      <Card className="p-4">
        <SectionLabel>{t("pep_doses")}</SectionLabel>
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
      {/*
        The map variable is not called t. It was, and it shadowed the t from
        useLang, so every translated string inside this block became a property
        of a titration.
      */}
      {p.titrations?.map((titration) => {
        const starts = titrationStepStartWeeks(titration.steps);
        return (
          <Card key={titration.id} className="p-4">
            <SectionLabel>{titration.name}</SectionLabel>
            <p className="mb-3 text-[12.5px] text-[var(--faint)]">
              {t("pep_titration_meta", {
                source: titration.source,
                weeks: t("count_weeks", { n: titrationTotalWeeks(titration.steps) }),
              })}
            </p>

            <ol className="space-y-1">
              {titration.steps.map((s, i) => (
                <li key={s.step} className="flex items-center gap-3 rounded px-2 py-2 odd:bg-[var(--sunken)]/40">
                  <span className="tnum w-20 shrink-0 font-mono text-[12px] text-[var(--faint)]">
                    {t("pep_week_abbrev", {
                      range: `${starts[i] + 1}${s.weeks > 1 ? `, ${starts[i] + s.weeks}` : ""}`,
                    })}
                  </span>
                  <span className="tnum w-24 shrink-0 font-mono text-[14px] text-[var(--tangerine)]">
                    {formatDose(s.doseMcg)}
                  </span>
                  <span className="min-w-0 flex-1 text-[12.5px] text-[var(--muted)]">
                    {s.note ?? t("count_weeks", { n: s.weeks })}
                  </span>
                </li>
              ))}
            </ol>

            {titration.note && (
              <p className="mt-3 border-t border-[var(--line)] pt-3 text-[12.5px] leading-relaxed text-[var(--muted)]">
                {titration.note}
              </p>
            )}
          </Card>
        );
      })}

      {isBlend(p) && <BlendPanel blend={p} custom={custom} />}

      {p.vialSizesMg.length > 0 && (
        <Card className="p-4">
          <SectionLabel>{t("pep_vial_sizes")}</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {p.vialSizesMg.map((mg) => (
              <Badge key={mg} tone="tangerine">
                {mg} mg
              </Badge>
            ))}
          </div>
          {p.reconstitutedDays && (
            <p className="mt-2.5 text-[12.5px] text-[var(--muted)]">
              {t("pep_reconstituted", {
                days: t("count_days", { n: p.reconstitutedDays }),
              })}
            </p>
          )}
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <SectionLabel>{t("pep_side_effects")}</SectionLabel>
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
          <SectionLabel>{t("pep_cautions")}</SectionLabel>
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
        <SectionLabel>{t("pep_status")}</SectionLabel>
        <p className="text-[13.5px] leading-relaxed text-[var(--muted)]">{p.status}</p>
      </Card>

      <Card className="p-4">
        <SectionLabel>{t("pep_sources")}</SectionLabel>
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
        {t("pep_disclaimer")}
      </p>
    </div>
  );
}


/**
 * A blend's composition plus a live split of any dose you type, so the
 * per-component amounts are answerable without arithmetic.
 */
function BlendPanel({ blend, custom }: { blend: Peptide; custom: Peptide[] }) {
  const { t } = useLang();
  const [doseMcg, setDoseMcg] = useState(() => {
    const r = blend.doseRanges[0];
    return r ? Math.round((r.lowMcg + r.highMcg) / 2) : 1000;
  });

  return (
    <Card className="space-y-4 p-4">
      <SectionLabel>{t("pep_whats_in_it")}</SectionLabel>

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
        <SectionLabel>{t("pep_dose_delivers")}</SectionLabel>
        <div className="mb-3 max-w-48">
          <NumberInput
            value={doseMcg}
            min={0}
            step={250}
            suffix="mcg"
            aria-label={t("pep_blend_dose")}
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
