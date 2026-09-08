"use client";

import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { allPeptides, findPeptide, useProfileData, useStore } from "@/lib/store";
import { findMarker } from "@/lib/data/labs";
import { adherence, protocolDosesPerWeek, logsForProtocol, scheduledDoseMcg } from "@/lib/calc/schedule";
import { stackIssues } from "@/lib/calc/stack";
import { toDisplayWeight, weightChange } from "@/lib/calc/outcomes";
import { averages } from "@/lib/calc/checkins";
import { pctPlan } from "@/lib/calc/pct";
import { formatDate, formatDose, trim } from "@/lib/format";
import { CATEGORY_LABEL, FEELING_LABELS, ROUTE_LABEL } from "@/lib/types";
import { useLang } from "@/lib/i18n";

const DAY = 86_400_000;

/**
 * Something to hand a doctor.
 *
 * Printed by the browser rather than generated as a PDF. A PDF library is a
 * quarter of a megabyte to reproduce what every browser and every Android
 * WebView already does properly, including page breaks and the user's own
 * choice of paper size. Print to PDF and the result is a file; print to a
 * printer and it is paper. Either way no server is involved, which matters
 * because this page contains everything.
 *
 * Written to be read by someone who has never seen the app. Compound names are
 * given in full with the dose in milligrams, adherence is stated as a fraction
 * rather than a badge, and anything the app cannot compute honestly is left out
 * rather than estimated.
 */
export default function ReportPage() {
  const { t } = useLang();
  const hydrated = useStore((s) => s.hydrated);
  const { protocols, logs, labs, measurements, checkIns } = useProfileData();
  const profiles = useStore((s) => s.profiles);
  const activeId = useStore((s) => s.activeProfileId);
  const custom = useStore((s) => s.customPeptides);
  const weightUnit = useStore((s) => s.settings.weightUnit) ?? "kg";

  const [windowDays, setWindowDays] = useState(90);
  const now = Date.now();
  const since = now - windowDays * DAY;

  const profile = profiles.find((p) => p.id === activeId);
  const library = useMemo(() => allPeptides(custom), [custom]);

  const resolve = useMemo(() => {
    const byId = new Map(library.map((p) => [p.id, p]));
    return (id: string) => byId.get(id);
  }, [library]);

  const active = protocols.filter((p) => p.active);
  const issues = useMemo(
    () => stackIssues({ protocols, resolve, nowMs: now }),
    [protocols, resolve, now]);

  const recentLogs = useMemo(
    () => logs.filter((l) => l.at >= since).sort((a, b) => b.at - a.at),
    [logs, since]);

  const recentLabs = useMemo(
    () => labs.filter((l) => l.at >= since).sort((a, b) => b.at - a.at),
    [labs, since]);

  const weight = useMemo(() => weightChange(measurements, since), [measurements, since]);
  const feeling = useMemo(
    () => averages(checkIns.filter((c) => c.at >= since)),
    [checkIns, since]);

  const recovery = useMemo(() => pctPlan(logs, resolve, now), [logs, resolve, now]);

  if (!hydrated) {
    return <div className="py-20 text-center text-[14px] text-[var(--faint)]">{t("loading")}</div>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Controls, which the print stylesheet removes. */}
      <div className="no-print mb-6 flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="text-[24px] font-extrabold tracking-tight text-[var(--ink)]">
            {t("report_title")}
          </h1>
          <p className="mt-1 text-[13.5px] text-[var(--muted)]">{t("report_subtitle")}</p>
        </div>
        <select
          value={windowDays}
          onChange={(e) => setWindowDays(Number(e.target.value))}
          className="rounded-[var(--r-btn)] border border-[var(--line)] bg-[var(--card)] px-3 py-2 text-[13.5px] text-[var(--ink)]"
        >
          <option value={30}>{t("report_last_30")}</option>
          <option value={90}>{t("report_last_90")}</option>
          <option value={180}>{t("report_last_6_months")}</option>
          <option value={365}>{t("report_last_year")}</option>
        </select>
        <Button variant="primary" onClick={() => window.print()}>
          <Printer size={16} /> {t("report_print")}
        </Button>
      </div>

      <Card className="print-plain p-6 print:p-0">
        <header className="border-b border-[var(--line)] pb-4">
          <h2 className="text-[20px] font-extrabold tracking-tight text-[var(--ink)]">
            {t("report_heading")}
          </h2>
          <p className="mt-1 text-[13px] text-[var(--muted)]">
            {t("report_meta", {
              profile: profile?.name ?? t("report_profile"),
              from: formatDate(since),
              to: formatDate(now),
              printed: formatDate(now),
            })}
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-[var(--faint)]">
            {t("report_compiled")}
          </p>
        </header>

        <Section title={t("report_running")}>
          {active.length === 0 ? (
            <Empty>{t("report_nothing_active")}</Empty>
          ) : (
            <Table
              head={[
                t("report_col_compound"),
                t("report_col_class"),
                t("report_col_dose"),
                t("report_col_frequency"),
                t("report_col_since"),
                t("report_col_adherence"),
              ]}
              rows={active.map((p) => {
                const peptide = findPeptide(custom, p.peptideId);
                const a = adherence(p, logsForProtocol(p, logs), Math.max(p.startedAt, since), now);
                return [
                  peptide?.name ?? p.peptideId,
                  peptide ? CATEGORY_LABEL[peptide.category] : t("report_unknown"),
                  formatDose(scheduledDoseMcg(p, now)),
                  t("report_per_week", { n: trim(protocolDosesPerWeek(p, now), 2) }),
                  formatDate(p.startedAt),
                  a.expected > 0
                    ? t("report_taken_of", { taken: a.taken, expected: a.expected })
                    : t("report_na"),
                ];
              })}
            />
          )}
        </Section>

        {issues.length > 0 && (
          <Section title={t("report_interactions")}>
            <ul className="space-y-2">
              {issues.map((i, n) => (
                <li key={n} className="text-[12.5px] leading-relaxed">
                  <strong className="text-[var(--ink)]">{i.title}.</strong>{" "}
                  <span className="text-[var(--muted)]">{i.detail}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title={t("report_bloodwork")}>
          {recentLabs.length === 0 ? (
            <Empty>{t("report_no_labs")}</Empty>
          ) : (
            <Table
              head={[
                t("report_col_date"),
                t("report_col_marker"),
                t("report_col_result"),
                t("report_col_reference"),
                t("report_col_lab"),
              ]}
              rows={recentLabs.map((l) => {
                const marker = findMarker(l.markerId);
                return [
                  formatDate(l.at),
                  marker?.name ?? l.markerId,
                  `${l.value} ${marker?.unit ?? ""}`.trim(),
                  l.refLow != null || l.refHigh != null
                    ? t("report_range", { low: l.refLow ?? "", high: l.refHigh ?? "" }).trim()
                    : t("report_not_recorded"),
                  l.lab ?? t("report_not_recorded"),
                ];
              })}
            />
          )}
        </Section>

        <Section title={t("report_outcomes")}>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-3">
            <Pair
              label={t("report_weight_change")}
              value={
                weight
                  ? t("report_weight_value", {
                      delta: `${weight.deltaKg > 0 ? "+" : ""}${trim(toDisplayWeight(weight.deltaKg, weightUnit), 1)}`,
                      unit: weightUnit,
                      days: t("count_days", { n: windowDays }),
                    })
                  : t("report_not_recorded")
              }
            />
            <Pair label={t("report_doses_logged")} value={`${recentLogs.length}`} />
            <Pair
              label={t("report_days_rated")}
              value={`${checkIns.filter((c) => c.at >= since).length}`}
            />
          </dl>

          {feeling.some((f) => f.mean != null) && (
            <div className="mt-3">
              <p className="text-[12px] font-bold text-[var(--ink)]">
                {t("report_mean_rating")}
              </p>
              <dl className="mt-1.5 grid grid-cols-3 gap-x-6 gap-y-1 text-[12.5px] sm:grid-cols-6">
                {feeling.map((f) => (
                  <Pair
                    key={f.id}
                    label={f.label}
                    value={
                      f.mean == null
                        ? t("report_na")
                        : t("report_mean_value", { mean: trim(f.mean, 1), days: f.days })
                    }
                  />
                ))}
              </dl>
            </div>
          )}
        </Section>

        {recovery.compounds.length > 0 && (
          <Section title={t("report_suppression")}>
            <p className="text-[12.5px] leading-relaxed text-[var(--muted)]">
              {t("report_suppression_body", {
                compounds: t("count_compounds", { n: recovery.compounds.length }),
                list: recovery.compounds
                  .map((c) =>
                    t("report_last_dose_on", {
                      name: c.name,
                      date: formatDate(c.lastDoseAt),
                    }))
                  .join("; "),
              })}{" "}
              {recovery.blockedBy.length
                ? t("report_no_clearance", { names: recovery.blockedBy.join(", ") })
                : recovery.earliestStart != null
                  ? t("report_clears_around", { date: formatDate(recovery.earliestStart) })
                  : ""}
            </p>
          </Section>
        )}

        <Section title={t("report_dose_history")}>
          {recentLogs.length === 0 ? (
            <Empty>{t("report_no_doses")}</Empty>
          ) : (
            <>
              {/*
                One column rather than two, so the table still prints on a
                page. What was tapped on the log sheet used to appear in no
                report at all, which for a clinician is the one place it was
                worth appearing.
              */}
              <Table
                head={[
                  t("report_col_date"),
                  t("report_col_compound"),
                  t("report_col_dose"),
                  t("report_col_route"),
                  t("report_col_site"),
                  t("report_col_reported"),
                ]}
                rows={recentLogs.slice(0, 60).map((l) => [
                  formatDate(l.at),
                  findPeptide(custom, l.peptideId)?.name ?? l.peptideId,
                  l.skipped ? t("report_skipped") : formatDose(l.doseMcg),
                  ROUTE_LABEL[l.route],
                  l.site ?? t("report_not_recorded"),
                  [
                    l.feeling != null ? (FEELING_LABELS[l.feeling] ?? `${l.feeling}`) : null,
                    l.sideEffects?.length ? l.sideEffects.join(", ") : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || t("report_nothing_reported"),
                ])}
              />
              {recentLogs.length > 60 && (
                <p className="mt-2 text-[11.5px] text-[var(--faint)]">
                  {t("report_showing_recent", { total: recentLogs.length })}
                </p>
              )}
            </>
          )}
        </Section>

        <footer className="mt-6 border-t border-[var(--line)] pt-3 text-[11px] leading-relaxed text-[var(--faint)]">
          {t("report_footer")}
        </footer>
      </Card>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid pt-5">
      <h3 className="text-[13px] font-extrabold uppercase tracking-wide text-[var(--ink)]">
        {title}
      </h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[12.5px] text-[var(--faint)]">{children}</p>;
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-[var(--faint)]">{label}</dt>
      <dd className="font-semibold text-[var(--ink)]">{value}</dd>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                className="border-b border-[var(--line)] px-1.5 py-1 text-left font-bold text-[var(--muted)]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="break-inside-avoid">
              {r.map((cell, j) => (
                <td
                  key={j}
                  className="border-b border-[var(--line)] px-1.5 py-1 align-top text-[var(--ink)]"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
