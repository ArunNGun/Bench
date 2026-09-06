"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, ChevronDown, ExternalLink, TriangleAlert } from "lucide-react";
import { Badge, Callout, Card, SectionLabel } from "./ui";
import { allPeptides, useProfileData, useStore } from "@/lib/store";
import { pctPlan, remainingFraction, retestAfter, PCT_TEMPLATES, CLEARED_FRACTION } from "@/lib/calc/pct";
import { formatDate, formatDuration } from "@/lib/format";

const DAY = 86_400_000;

/**
 * When suppressive compounds clear, and what recovery protocols look like.
 *
 * Hidden entirely until something suppressive has actually been logged. Nobody
 * running only peptides needs a panel about restarting their axis, and showing
 * it anyway would read as a suggestion.
 */
export function PctPanel({ nowMs = Date.now() }: { nowMs?: number }) {
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
            <Badge tone="leaf">cleared</Badge>
          ) : plan.blockedBy.length ? (
            <Badge tone="tangerine">not computable</Badge>
          ) : (
            <Badge tone="grape">still clearing</Badge>
          )
        }
      >
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock size={13} strokeWidth={2.6} /> Recovery timing
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
                  last dose {formatDate(c.lastDoseAt)}
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
                      ? "Cleared."
                      : `About ${Math.round((left ?? 0) * 100)}% of the last dose left. Clear around ${formatDate(
                          c.clearedAt)}, in ${formatDuration((c.clearedAt - nowMs) / 3_600_000)}.`}
                  </p>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* The answer, or an honest refusal to give one */}
      {plan.blockedBy.length > 0 ? (
        <Callout tone="warn" title="No date can be given">
          <span className="inline-flex items-start gap-1.5">
            <TriangleAlert size={13} strokeWidth={2.6} className="mt-0.5 shrink-0" />
            <span>
              {plan.blockedBy.join(" and ")} {plan.blockedBy.length === 1 ? "has" : "have"} no
              half-life established in humans, so there is no honest clearance date for
              {plan.blockedBy.length === 1 ? " it" : " them"}. The real answer is later than the
              other compounds here suggest, by an unknown amount. Other tools will print a number
              anyway. This one will not.
            </span>
          </span>
        </Callout>
      ) : plan.earliestStart != null ? (
        <div
          className="rounded-[var(--r-inner)] p-3.5"
          style={{ background: "var(--sky-soft)", color: "var(--sky-ink)" }}
        >
          <p className="text-[13.5px] font-bold">
            {plan.clear
              ? "Androgen has cleared"
              : `Earliest sensible start: ${formatDate(plan.earliestStart)}`}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed">
            Taken as five half-lives from the last dose, which leaves about{" "}
            {Math.round(CLEARED_FRACTION * 100)}% behind. That is the usual pharmacological
            convention for cleared, not a physiological threshold. Starting earlier means a SERM
            spends the protocol competing with androgen that is still arriving.
          </p>
        </div>
      ) : null}

      {/* Templates */}
      <div>
        <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--faint)]">
          Published protocols
        </p>
        <div className="mt-2 space-y-2">
          {PCT_TEMPLATES.map((t) => {
            const open = openTemplate === t.id;
            const ends =
              plan.earliestStart != null
                ? plan.earliestStart + t.weeks.length * 7 * DAY
                : null;
            return (
              <div key={t.id} className="rounded-[var(--r-inner)] bg-[var(--sunken)] p-3">
                <button
                  type="button"
                  onClick={() => setOpenTemplate(open ? null : t.id)}
                  aria-expanded={open}
                  className="press flex w-full items-center gap-2 text-left"
                >
                  <span className="text-[13.5px] font-bold text-[var(--ink)]">{t.name}</span>
                  <span className="ml-auto text-[11.5px] text-[var(--faint)]">
                    {t.weeks.length} weeks
                  </span>
                  <ChevronDown
                    size={14}
                    className={`shrink-0 text-[var(--faint)] transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </button>
                <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--muted)]">{t.summary}</p>

                {open && (
                  <div className="mt-2.5 space-y-2">
                    <ol className="space-y-1">
                      {t.weeks.map((w) => (
                        <li key={w.week} className="flex gap-2.5 text-[12.5px]">
                          <span className="w-12 shrink-0 font-mono font-bold text-[var(--faint)]">
                            wk {w.week}
                          </span>
                          <span className="text-[var(--ink)]">{w.detail}</span>
                        </li>
                      ))}
                    </ol>
                    {ends != null && (
                      <p className="text-[12px] text-[var(--muted)]">
                        Started at the earliest date above, this ends around {formatDate(ends)}.
                        Retest no sooner than {formatDate(retestAfter(ends))}: a SERM raises
                        testosterone while it is still present, so bloods taken during it measure
                        the drug, not the recovery.
                      </p>
                    )}
                    <p className="text-[11.5px] leading-relaxed text-[var(--faint)]">
                      {t.source}{" "}
                      <a
                        href={t.citationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 underline decoration-dotted"
                      >
                        Source <ExternalLink size={10} />
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
        None of these is an approved treatment for suppression caused by anabolic steroids, and
        none of it is advice to run one. What the app can tell you is when the androgen will be
        gone. Whether to take anything at that point is a question for a doctor who can test you.
      </p>
    </Card>
  );
}
