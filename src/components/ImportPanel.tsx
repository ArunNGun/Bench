"use client";
import { useLang } from "@/lib/i18n";

import { useRef, useState } from "react";
import { AlertTriangle, Droplet, FileUp, Upload } from "lucide-react";
import { Badge, Button, Callout, Card, Rich, SectionLabel, TONE_BG, TONE_FG } from "./ui";
import { allPeptides, useProfileData, useStore } from "@/lib/store";
import { ACCEPTED_EXTENSIONS, ImportError, readImportFile, type ReadResult } from "@/lib/import/pipeline";
import { describePlan, planIsEmpty, planSpan } from "@/lib/import/plan";
import { formatDate, formatDose } from "@/lib/format";
import { INJECTION_SITES, type AppData } from "@/lib/types";
import type { LabCandidate } from "@/lib/import/labreport";

/**
 * Bringing history in from another app.
 *
 * Deliberately two steps. The file is read and turned into a plan, the plan is
 * shown, and only then is anything written. Merging a year of someone's dose
 * history into the store that holds their real data is not a one-tap action, and
 * the preview is also where a misread column becomes obvious, a wrong date or a
 * dose off by a factor of a thousand is visible in the sample rows long before it
 * is visible in a chart.
 */
export function ImportPanel() {
  const { logs, measurements } = useProfileData();
  const custom = useStore((s) => s.customPeptides);
  const importHistory = useStore((s) => s.importHistory);
  const importData = useStore((s) => s.importData);
  const addLab = useStore((s) => s.addLab);

  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ReadResult | null>(null);
  const { t } = useLang();
  const [fileName, setFileName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Markers the user unticked in the lab preview. */
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [withDoses, setWithDoses] = useState(true);
  const [withWeights, setWithWeights] = useState(true);

  function reset() {
    setResult(null);
    setError(null);
    setFileName("");
    setSkipped(new Set());
  }

  async function choose(file: File) {
    setBusy(true);
    setError(null);
    setDone(null);
    setResult(null);
    setFileName(file.name);

    try {
      const read = await readImportFile(file, {
        peptides: allPeptides(custom),
        existingLogs: logs,
        existingMeasurements: measurements,
      });
      setWithDoses(true);
      setWithWeights(true);
      setResult(read);
    } catch (e) {
      setError(
        e instanceof ImportError
          ? e.message
          : t("import_unreadable"));
    } finally {
      setBusy(false);
    }
  }

  function apply() {
    if (!result) return;

    if (result.kind === "bench-export") {
      importData(result.data as AppData);
      setDone(
        t("import_restored", {
          doses: t("count_doses", { n: result.data.logs?.length ?? 0 }),
          protocols: t("count_protocols", { n: result.data.protocols?.length ?? 0 }),
        }));
      reset();
      return;
    }

    if (result.kind === "lab-report") {
      const at = result.report.collectedAt ?? Date.now();
      let written = 0;
      for (const c of result.report.candidates) {
        if (skipped.has(c.markerId)) continue;
        addLab({
          at,
          markerId: c.markerId,
          value: c.value,
          refLow: c.refLow,
          refHigh: c.refHigh,
          lab: result.report.lab,
        });
        written++;
      }
      const saved = t("import_saved_results", {
        results: t("count_results", { n: written }),
        date: formatDate(at),
      });
      setDone(
        result.report.collectedAt == null ? `${saved} ${t("import_no_date_used")}` : saved);
      reset();
      return;
    }

    const { plan } = result;
    const added = importHistory({
      logs: withDoses
        ? plan.doses.map((d) => ({
            peptideId: d.peptideId,
            at: d.at,
            doseMcg: d.doseMcg,
            route: "subcutaneous" as const,
            site: d.site,
            notes: d.notes,
          }))
        : [],
      measurements: withWeights
        ? plan.weights.map((w) => ({ at: w.at, weightKg: w.weightKg, source: "manual" as const }))
        : [],
    });

    setDone(
      t("import_imported", {
        doses: t("count_doses", { n: added.logs }),
        weights: t("count_weights", { n: added.measurements }),
      }));
    reset();
  }

  return (
    <Card className="space-y-4 p-4">
      <SectionLabel>{t("import_title")}</SectionLabel>

      <p className="text-[13px] leading-relaxed text-[var(--muted)]">
        {t("import_intro")}
      </p>

      {done && <Callout tone="info">{done}</Callout>}
      {error && <Callout tone="danger" title={t("import_could_not_read")}>{error}</Callout>}

      {!result && (
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="primary" onClick={() => fileRef.current?.click()} disabled={busy}>
            <FileUp size={15} /> {busy ? t("import_reading") : t("import_choose_file")}
          </Button>
          <span className="text-[12px] text-[var(--faint)]">
            {t("import_extensions")}
          </span>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) choose(f);
          e.target.value = "";
        }}
      />

      {result?.kind === "bench-export" && (
        <div className="space-y-3">
          <Callout tone="warn" title={t("import_own_export")}>
            <Rich
              text={t("import_own_export_body", {
                doses: t("count_doses", { n: result.data.logs?.length ?? 0 }),
                protocols: t("count_protocols", { n: result.data.protocols?.length ?? 0 }),
                current: t("count_doses", { n: logs.length }),
              })}
            />
          </Callout>
          <div className="flex flex-wrap gap-2.5">
            <Button variant="ghost" onClick={reset}>
              {t("cancel")}
            </Button>
            <Button variant="danger" onClick={apply}>
              {t("import_replace_everything")}
            </Button>
          </div>
        </div>
      )}

      {result?.kind === "lab-report" && (
        <LabPreview
          report={result.report}
          lineCount={result.lines.length}
          fileName={fileName}
          skipped={skipped}
          onToggle={(id) =>
            setSkipped((s) => {
              const next = new Set(s);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
          onCancel={reset}
          onApply={apply}
        />
      )}

      {result?.kind === "table" && (
        <Preview
          result={result}
          fileName={fileName}
          withDoses={withDoses}
          withWeights={withWeights}
          setWithDoses={setWithDoses}
          setWithWeights={setWithWeights}
          onCancel={reset}
          onApply={apply}
        />
      )}
    </Card>
  );
}

function Preview({
  result,
  fileName,
  withDoses,
  withWeights,
  setWithDoses,
  setWithWeights,
  onCancel,
  onApply,
}: {
  result: Extract<ReadResult, { kind: "table" }>;
  fileName: string;
  withDoses: boolean;
  withWeights: boolean;
  setWithDoses: (v: boolean) => void;
  setWithWeights: (v: boolean) => void;
  onCancel: () => void;
  onApply: () => void;
}) {
  const { t } = useLang();
  const { plan, profile, table } = result;
  const span = planSpan(plan);
  const nothing = planIsEmpty(plan);
  const selectedNothing = (!withDoses || !plan.doses.length) && (!withWeights || !plan.weights.length);

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="mint">{profile.name}</Badge>
        <span className="text-[12.5px] text-[var(--muted)]">
          {fileName} · {t("count_rows", { n: table.records.length })}
          {span
            ? ` · ${t("import_span", { from: formatDate(span.from), to: formatDate(span.to) })}`
            : ""}
        </span>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <Toggle
          on={withDoses}
          onChange={setWithDoses}
          count={plan.doses.length}
          title={t("import_new_doses", { n: plan.doses.length })}
          duplicates={plan.duplicateDoses}
        />
        <Toggle
          on={withWeights}
          onChange={setWithWeights}
          count={plan.weights.length}
          title={t("import_new_weights", { n: plan.weights.length })}
          duplicates={plan.duplicateWeights}
        />
      </div>

      {plan.doses.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11.5px] font-bold uppercase tracking-wide text-[var(--faint)]">
            {t("import_first_last")}
          </p>
          <ul className="space-y-1">
            {sample(plan.doses).map((d) => (
              <li
                key={`${d.at}-${d.sourceRow}`}
                className="flex flex-wrap items-baseline gap-x-2.5 rounded-[var(--r-inner)] bg-[var(--sunken)] px-2.5 py-2 text-[13px]"
              >
                <span className="font-bold text-[var(--ink)]">{formatDose(d.doseMcg)}</span>
                <span className="text-[var(--ink)]">{d.peptideName}</span>
                <span className="text-[var(--muted)]">
                  {formatDate(d.at)}{" "}
                  {new Date(d.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                {d.site && (
                  <span className="text-[var(--faint)]">
                    {INJECTION_SITES.find((s) => s.id === d.site)?.label}
                  </span>
                )}
                <span className="ml-auto text-[11px] text-[var(--faint)]">
                  {t("import_source_row", { n: d.sourceRow })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {plan.unresolved.length > 0 && (
        <div
          className="rounded-[var(--r-inner)] px-3.5 py-3 text-[12.5px] leading-relaxed"
          style={{ background: TONE_BG.tangerine, color: TONE_FG.tangerine }}
        >
          <p className="flex items-center gap-1.5 font-bold">
            <AlertTriangle size={14} strokeWidth={2.4} /> {t("import_not_in_library")}
          </p>
          <ul className="mt-1 space-y-0.5">
            {plan.unresolved.map((u) => (
              <li key={u.label}>
                <Rich
                  text={t("import_unresolved_row", {
                    label: u.label,
                    rows: t("count_rows", { n: u.rows.length }),
                    list: u.rows.slice(0, 6).join(", ") + (u.rows.length > 6 ? "…" : ""),
                  })}
                />
              </li>
            ))}
          </ul>
          <p className="mt-1.5 opacity-90">
            {t("import_add_compound")}
          </p>
        </div>
      )}

      {plan.problems.length > 0 && (
        <details className="rounded-[var(--r-inner)] bg-[var(--sunken)] px-3.5 py-3">
          <summary className="cursor-pointer text-[12.5px] font-bold text-[var(--ink)]">
            {t("import_rows_unreadable", {
              rows: t("count_rows", { n: plan.problems.length }),
            })}
          </summary>
          <ul className="mt-2 space-y-1 text-[12px] leading-relaxed text-[var(--muted)]">
            {plan.problems.slice(0, 20).map((p, i) => (
              <li key={i}>
                <strong>{t("import_row_label", { n: p.sourceRow })}</strong> {p.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      {nothing && (
        <Callout tone="info">
          {t("import_nothing_new")}
        </Callout>
      )}

      <div className="flex flex-wrap gap-2.5">
        <Button variant="ghost" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button variant="primary" onClick={onApply} disabled={nothing || selectedNothing}>
          <Upload size={15} /> {t("import_action", { what: describePlan(plan) })}
        </Button>
      </div>
    </div>
  );
}

/** The first two and last two, which is where a misread column shows up. */
function sample<T>(rows: T[]): T[] {
  if (rows.length <= 4) return rows;
  return [...rows.slice(0, 2), ...rows.slice(-2)];
}

function Toggle({
  on,
  onChange,
  count,
  title,
  duplicates,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  count: number;
  /** Already counted and translated, because the plural rule belongs to the language. */
  title: string;
  duplicates: number;
}) {
  const { t } = useLang();
  const disabled = count === 0;

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={on && !disabled}
      onClick={() => onChange(!on)}
      className="press flex items-center gap-3 rounded-[var(--r-inner)] p-3 text-left disabled:opacity-55"
      style={{
        background: on && !disabled ? TONE_BG.mint : "var(--sunken)",
        border: `1px solid ${on && !disabled ? "var(--mint)" : "var(--line)"}`,
      }}
    >
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] text-[12px] font-bold text-[var(--on-accent)]"
        style={{ background: on && !disabled ? "var(--mint)" : "var(--faint)" }}
      >
        {on && !disabled ? "✓" : ""}
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-bold text-[var(--ink)]">{title}</span>
        <span className="block text-[11.5px] text-[var(--muted)]">
          {duplicates > 0 ? t("import_dupes", { n: duplicates }) : t("import_none_skipped")}
        </span>
      </span>
    </button>
  );
}


/**
 * A lab report, before anything is written.
 *
 * Every row shows the line it was read from. That is the whole safeguard: the
 * user is checking the parse against the report rather than trusting a matcher
 * they cannot see, and a misread number is obvious next to its source in a way
 * it never is on a chart six months later.
 */
function LabPreview({
  report,
  lineCount,
  fileName,
  skipped,
  onToggle,
  onCancel,
  onApply,
}: {
  report: { candidates: LabCandidate[]; collectedAt: number | null; lab?: string };
  lineCount: number;
  fileName: string;
  skipped: Set<string>;
  onToggle: (markerId: string) => void;
  onCancel: () => void;
  onApply: () => void;
}) {
  const { t } = useLang();
  const keeping = report.candidates.filter((c) => !skipped.has(c.markerId));
  const suspect = report.candidates.filter((c) => c.confidence === "unit-mismatch");
  const markers = t("count_markers", { n: report.candidates.length });
  const when =
    report.collectedAt != null ? formatDate(report.collectedAt) : t("import_lab_today");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-[var(--ink)]">
          <Droplet size={14} strokeWidth={2.6} /> {t("import_lab_report")}
        </span>
        <span className="text-[12px] text-[var(--faint)]">
          {fileName} · {t("import_lines_read", { n: lineCount })}
        </span>
      </div>

      <p className="text-[12.5px] leading-relaxed text-[var(--muted)]">
        {report.lab
          ? t("import_lab_recognised_from", { markers, lab: report.lab, date: when })
          : t("import_lab_recognised", { markers, date: when })}{" "}
        {report.collectedAt == null ? `${t("import_lab_no_date")} ` : ""}
        {t("import_lab_check")}
      </p>

      {suspect.length > 0 && (
        <Callout tone="warn" title={t("import_units_title")}>
          {t("import_units_body", { markers: suspect.map((c) => c.markerName).join(", ") })}
        </Callout>
      )}

      <ul className="space-y-1.5">
        {report.candidates.map((c) => {
          const on = !skipped.has(c.markerId);
          const bad = c.confidence === "unit-mismatch";
          return (
            <li
              key={c.markerId}
              className="rounded-[var(--r-inner)] p-2.5"
              style={{ background: on ? "var(--sunken)" : "transparent", opacity: on ? 1 : 0.5 }}
            >
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => onToggle(c.markerId)}
                  className="mt-1 h-4 w-4 shrink-0 accent-[var(--mint)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[13px] font-bold text-[var(--ink)]">{c.markerName}</span>
                    <span className="tnum font-mono text-[13px] text-[var(--mint-ink)]">
                      {c.value} {c.unit ?? c.expectedUnit}
                    </span>
                    {c.refLow != null || c.refHigh != null ? (
                      <span className="text-[11.5px] text-[var(--faint)]">
                        {t("import_ref_range", {
                          low: c.refLow ?? "n/a",
                          high: c.refHigh ?? "n/a",
                        })}
                      </span>
                    ) : null}
                    {bad && <Badge tone="tangerine">{t("import_expects_unit", { unit: c.expectedUnit })}</Badge>}
                    {c.confidence === "loose" && <Badge>{t("import_matched_loosely")}</Badge>}
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-[11px] text-[var(--faint)]">
                    {c.source}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="flex gap-2.5">
        <Button variant="ghost" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button variant="primary" className="flex-1" disabled={!keeping.length} onClick={onApply}>
          {t("import_save_results", { results: t("count_results", { n: keeping.length }) })}
        </Button>
      </div>
    </div>
  );
}
