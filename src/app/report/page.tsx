"use client";

import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { allPeptides, findPeptide, useProfileData, useStore } from "@/lib/store";
import { findMarker } from "@/lib/data/labs";
import { adherence, dosesPerWeek, logsForProtocol, scheduledDoseMcg } from "@/lib/calc/schedule";
import { stackIssues } from "@/lib/calc/stack";
import { weightChange } from "@/lib/calc/outcomes";
import { averages } from "@/lib/calc/checkins";
import { pctPlan } from "@/lib/calc/pct";
import { formatDate, formatDose, trim } from "@/lib/format";
import { CATEGORY_LABEL } from "@/lib/types";

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
  const hydrated = useStore((s) => s.hydrated);
  const { protocols, logs, labs, measurements, checkIns } = useProfileData();
  const profiles = useStore((s) => s.profiles);
  const activeId = useStore((s) => s.activeProfileId);
  const custom = useStore((s) => s.customPeptides);

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
    return <div className="py-20 text-center text-[14px] text-[var(--faint)]">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Controls, which the print stylesheet removes. */}
      <div className="no-print mb-6 flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="text-[24px] font-extrabold tracking-tight text-[var(--ink)]">
            Report for a clinician
          </h1>
          <p className="mt-1 text-[13.5px] text-[var(--muted)]">
            Everything below prints on paper or to a PDF. It never leaves the device either way.
          </p>
        </div>
        <select
          value={windowDays}
          onChange={(e) => setWindowDays(Number(e.target.value))}
          className="rounded-[var(--r-btn)] border border-[var(--line)] bg-[var(--card)] px-3 py-2 text-[13.5px] text-[var(--ink)]"
        >
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={180}>Last 6 months</option>
          <option value={365}>Last year</option>
        </select>
        <Button variant="primary" onClick={() => window.print()}>
          <Printer size={16} /> Print
        </Button>
      </div>

      <Card className="print-plain p-6 print:p-0">
        <header className="border-b border-[var(--line)] pb-4">
          <h2 className="text-[20px] font-extrabold tracking-tight text-[var(--ink)]">
            Self-administered compound record
          </h2>
          <p className="mt-1 text-[13px] text-[var(--muted)]">
            {profile?.name ?? "Profile"} · covering {formatDate(since)} to {formatDate(now)} ·
            printed {formatDate(now)}
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-[var(--faint)]">
            Compiled by the person named above from their own records, using a tracking app. It is a
            self-report, not a dispensing record, and doses are as entered rather than as verified.
          </p>
        </header>

        <Section title="Currently running">
          {active.length === 0 ? (
            <Empty>Nothing active.</Empty>
          ) : (
            <Table
              head={["Compound", "Class", "Dose", "Frequency", "Since", "Adherence"]}
              rows={active.map((p) => {
                const peptide = findPeptide(custom, p.peptideId);
                const a = adherence(p, logsForProtocol(p, logs), Math.max(p.startedAt, since), now);
                return [
                  peptide?.name ?? p.peptideId,
                  peptide ? CATEGORY_LABEL[peptide.category] : "unknown",
                  formatDose(scheduledDoseMcg(p, now)),
                  `${trim(dosesPerWeek(p.schedule), 2)} per week`,
                  formatDate(p.startedAt),
                  a.expected > 0 ? `${a.taken} of ${a.expected}` : "n/a",
                ];
              })}
            />
          )}
        </Section>

        {issues.length > 0 && (
          <Section title="Interactions flagged by the app">
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

        <Section title="Bloodwork">
          {recentLabs.length === 0 ? (
            <Empty>No results recorded in this period.</Empty>
          ) : (
            <Table
              head={["Date", "Marker", "Result", "Reference", "Lab"]}
              rows={recentLabs.map((l) => {
                const marker = findMarker(l.markerId);
                return [
                  formatDate(l.at),
                  marker?.name ?? l.markerId,
                  `${l.value} ${marker?.unit ?? ""}`.trim(),
                  l.refLow != null || l.refHigh != null
                    ? `${l.refLow ?? ""} to ${l.refHigh ?? ""}`.trim()
                    : "not recorded",
                  l.lab ?? "not recorded",
                ];
              })}
            />
          )}
        </Section>

        <Section title="Outcomes">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-3">
            <Pair
              label="Weight change"
              value={
                weight
                  ? `${weight.deltaKg > 0 ? "+" : ""}${trim(weight.deltaKg, 1)} kg over ${windowDays} days`
                  : "not recorded"
              }
            />
            <Pair label="Doses logged" value={`${recentLogs.length}`} />
            <Pair label="Days rated" value={`${checkIns.filter((c) => c.at >= since).length}`} />
          </dl>

          {feeling.some((f) => f.mean != null) && (
            <div className="mt-3">
              <p className="text-[12px] font-bold text-[var(--ink)]">
                Mean self-rating, 1 to 5, over the period
              </p>
              <dl className="mt-1.5 grid grid-cols-3 gap-x-6 gap-y-1 text-[12.5px] sm:grid-cols-6">
                {feeling.map((f) => (
                  <Pair
                    key={f.id}
                    label={f.label}
                    value={f.mean == null ? "n/a" : `${trim(f.mean, 1)} (${f.days} d)`}
                  />
                ))}
              </dl>
            </div>
          )}
        </Section>

        {recovery.compounds.length > 0 && (
          <Section title="Suppression">
            <p className="text-[12.5px] leading-relaxed text-[var(--muted)]">
              {recovery.compounds.length} compound
              {recovery.compounds.length === 1 ? "" : "s"} recorded that suppress endogenous
              testosterone production. Last doses:{" "}
              {recovery.compounds
                .map((c) => `${c.name} on ${formatDate(c.lastDoseAt)}`)
                .join("; ")}
              .{" "}
              {recovery.blockedBy.length
                ? `No clearance date can be given: ${recovery.blockedBy.join(" and ")} ${
                    recovery.blockedBy.length === 1 ? "has" : "have"
                  } no half-life established in humans.`
                : recovery.earliestStart != null
                  ? `On a five half-life basis, the last of it clears around ${formatDate(recovery.earliestStart)}.`
                  : ""}
            </p>
          </Section>
        )}

        <Section title="Dose history">
          {recentLogs.length === 0 ? (
            <Empty>No doses recorded in this period.</Empty>
          ) : (
            <>
              <Table
                head={["Date", "Compound", "Dose", "Route", "Site"]}
                rows={recentLogs.slice(0, 60).map((l) => [
                  formatDate(l.at),
                  findPeptide(custom, l.peptideId)?.name ?? l.peptideId,
                  l.skipped ? "skipped" : formatDose(l.doseMcg),
                  l.route,
                  l.site ?? "not recorded",
                ])}
              />
              {recentLogs.length > 60 && (
                <p className="mt-2 text-[11.5px] text-[var(--faint)]">
                  Showing the 60 most recent of {recentLogs.length}. The full history can be
                  exported as a CSV from Settings.
                </p>
              )}
            </>
          )}
        </Section>

        <footer className="mt-6 border-t border-[var(--line)] pt-3 text-[11px] leading-relaxed text-[var(--faint)]">
          Generated by Bench, an offline tracking app. Figures are calculated from self-entered
          records. Half-lives and dose ranges in the app come from prescribing labels and published
          trials; where no human pharmacokinetic data exists the app makes no estimate, and any such
          compound is named as unquantified above rather than given a figure.
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
