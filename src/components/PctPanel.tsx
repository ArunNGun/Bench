"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, ChevronDown, ExternalLink, TriangleAlert } from "lucide-react";
import { Badge, Callout, Card, SectionLabel } from "./ui";
import { allPeptides, useProfileData, useStore } from "@/lib/store";
import { pctPlan, remainingFraction, retestAfter, PCT_TEMPLATES, CLEARED_FRACTION } from "@/lib/calc/pct";
import { formatDate, formatDuration } from "@/lib/format";
import { useLang } from "@/lib/i18n";

const DAY = 86_400_000;

/**
 * When suppressive compounds clear, and what recovery protocols look like.
 *
 * Hidden entirely until something suppressive has actually been logged. Nobody
 * running only peptides needs a panel about restarting their axis, and showing
 * it anyway would read as a suggestion.
 */
export function PctPanel({ nowMs = Date.now() }: { nowMs?: number }) {
  const { t } = useLang();
  const { logs } = useProfileData();
  const custom = useStore((s) => s.customPeptides);
  const library = useMemo(() => allPeptides(custom), [custom]);
  const resolve = useMemo(() => {
    const byId = new Map(library.map((p) => [p.id, p]));
    return (id: string) => byId.get(id);
  }, [library]);

  const plan = useMemo(() => pctPlan(logs, resolve, nowMs), [logs, resolve, nowMs]);
  const [openTemplate, setOpenTemplate] = useState<string | null>(null);

  if (!plan.compounds.length) return null;

  return (
    <Card className="space-y-4 p-5">
      <SectionLabel
        action={
          plan.clear ? (
            <Badge tone="leaf">{t("pct_cleared_badge")}</Badge>
          ) : plan.blockedBy.length ? (
            <Badge tone="tangerine">{t("pct_not_computable_badge")}</Badge>
          ) : (
            <Badge tone="grape">{t("pct_still_clearing_badge")}</Badge>
          )
        }
      >
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock size={13} strokeWidth={2.6} /> {t("pct_recovery_timing")}
        </span>
      </SectionLabel>

      {/* What is still in there */}
      <div className="space-y-2">
        {plan.compounds.map((c) => {
          const left = remainingFraction(c, nowMs);
          return (
            <div key={c.peptideId} className="rounded-[var(--r-inner)] bg-[var(--sunken)] p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/library/${c.peptideId}`}
                  className="text-[13.5px] font-bold text-[var(--ink)] hover:underline"
                >
                  {c.name}
                </Link>
                <span className="text-[11.5px] text-[var(--faint)]">
                  {t("pct_last_dose", { date: formatDate(c.lastDoseAt) })}
                </span>
              </div>

              {c.clearedAt == null ? (
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--tangerine-ink)]">
                  {c.unknownReason}
                </p>
              ) : (
                <>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, Math.max(2, (left ?? 0) * 100))}%`,
                        background: "var(--grape)",
                      }}
                    />
                  </div>
                  <p className="mt-1.5 text-[12px] text-[var(--muted)]">
                    {c.clearedAt <= nowMs
                      ? t("pct_cleared_line")
                      : t("pct_left_line", {
                          percent: Math.round((left ?? 0) * 100),
                          date: formatDate(c.clearedAt),
                          duration: formatDuration((c.clearedAt - nowMs) / 3_600_000),
                        })}
                  </p>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* The answer, or an honest refusal to give one */}
      {plan.blockedBy.length > 0 ? (
        <Callout tone="warn" title={t("pct_no_date_title")}>
          <span className="inline-flex items-start gap-1.5">
            <TriangleAlert size={13} strokeWidth={2.6} className="mt-0.5 shrink-0" />
            <span>{t("pct_no_date_body", { names: plan.blockedBy.join(", ") })}</span>
          </span>
        </Callout>
      ) : plan.earliestStart != null ? (
        <div
          className="rounded-[var(--r-inner)] p-3.5"
          style={{ background: "var(--sky-soft)", color: "var(--sky-ink)" }}
        >
          <p className="text-[13.5px] font-bold">
            {plan.clear
              ? t("pct_androgen_cleared")
              : t("pct_earliest_start", { date: formatDate(plan.earliestStart) })}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed">
            {t("pct_five_half_lives", { percent: Math.round(CLEARED_FRACTION * 100) })}
          </p>
        </div>
      ) : null}

      {/* Templates */}
      <div>
        <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--faint)]">
          {t("pct_published")}
        </p>
        <div className="mt-2 space-y-2">
          {/* Not called t: that shadows the t from useLang. */}
          {PCT_TEMPLATES.map((template) => {
            const open = openTemplate === template.id;
            const ends =
              plan.earliestStart != null
                ? plan.earliestStart + template.weeks.length * 7 * DAY
                : null;
            return (
              <div key={template.id} className="rounded-[var(--r-inner)] bg-[var(--sunken)] p-3">
                <button
                  type="button"
                  onClick={() => setOpenTemplate(open ? null : template.id)}
                  aria-expanded={open}
                  className="press flex w-full items-center gap-2 text-left"
                >
                  <span className="text-[13.5px] font-bold text-[var(--ink)]">{template.name}</span>
                  <span className="ml-auto text-[11.5px] text-[var(--faint)]">
                    {t("count_weeks", { n: template.weeks.length })}
                  </span>
                  <ChevronDown
                    size={14}
                    className={`shrink-0 text-[var(--faint)] transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </button>
                <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--muted)]">
                  {template.summary}
                </p>

                {open && (
                  <div className="mt-2.5 space-y-2">
                    <ol className="space-y-1">
                      {template.weeks.map((w) => (
                        <li key={w.week} className="flex gap-2.5 text-[12.5px]">
                          <span className="w-12 shrink-0 font-mono font-bold text-[var(--faint)]">
                            {t("pep_week_abbrev", { range: w.week })}
                          </span>
                          <span className="text-[var(--ink)]">{w.detail}</span>
                        </li>
                      ))}
                    </ol>
                    {ends != null && (
                      <p className="text-[12px] text-[var(--muted)]">
                        {t("pct_ends_around", {
                          ends: formatDate(ends),
                          retest: formatDate(retestAfter(ends)),
                        })}
                      </p>
                    )}
                    <p className="text-[11.5px] leading-relaxed text-[var(--faint)]">
                      {template.source}{" "}
                      <a
                        href={template.citationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 underline decoration-dotted"
                      >
                        {t("pct_source")} <ExternalLink size={10} />
                      </a>
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[11.5px] leading-relaxed text-[var(--faint)]">
        {t("pct_footer")}
      </p>
    </Card>
  );
}
