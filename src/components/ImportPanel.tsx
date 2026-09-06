"use client";
import { useLang } from "@/lib/i18n";

import { useRef, useState } from "react";
import { AlertTriangle, Droplet, FileUp, Upload } from "lucide-react";
import { Badge, Button, Callout, Card, SectionLabel, TONE_BG, TONE_FG } from "./ui";
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
          : "That file could not be read. CSV, TSV, JSON, .xlsx and a lab report PDF are supported.");
    } finally {
      setBusy(false);
    }
  }

  function apply() {
    if (!result) return;

    if (result.kind === "bench-export") {
      importData(result.data as AppData);
      setDone(
        `Restored from your own export: ${result.data.logs?.length ?? 0} doses, ${result.data.protocols?.length ?? 0} protocols.`);
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
      setDone(
        `Saved ${written} result${written === 1 ? "" : "s"} dated ${formatDate(at)}.${
          result.report.collectedAt == null
            ? " No collection date was found in the file, so today's date was used. Edit it on the Bloodwork page if that is wrong."
            : ""
        }`);
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
      `Imported ${added.logs} dose${added.logs === 1 ? "" : "s"} and ${added.measurements} weight${
        added.measurements === 1 ? "" : "s"
      }. Nothing was taken off your stock. These are historical records.`);
    reset();
  }

  return (
    <Card className="space-y-4 p-4">
      <SectionLabel>{t("import_title")}</SectionLabel>

      <p className="text-[13px] leading-relaxed text-[var(--muted)]">
Reads a CSV, TSV, JSON or .xlsx export from another tracker and merges the doses and
        weights into this profile. A lab report PDF is read here too, straight on this device:
        nothing is uploaded anywhere.
        Shotsy is recognised by name; anything else is read from its column headers, so a spreadsheet
        with a date, what you took and a dose will work. Nothing is written until you have seen what it
        found, and re-importing the same file later only adds what is new.
      </p>

      {done && <Callout tone="info">{done}</Callout>}
      {error && <Callout tone="danger" title="Could not read that file">{error}</Callout>}

      {!result && (
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="primary" onClick={() => fileRef.current?.click()} disabled={busy}>
            <FileUp size={15} /> {busy ? "Reading…" : "Choose a file"}
          </Button>
          <span className="text-[12px] text-[var(--faint)]">
            .csv .tsv .json .xlsx .pdf, the old .xls needs re-saving first
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
          <Callout tone="warn" title="This is one of your own exports">
            It contains everything, protocols, stock, settings and profiles, so importing it
            <strong> {t("import_replaces")}</strong> what is in the app rather than merging. {result.data.logs?.length ?? 0}{" "}
            doses and {result.data.protocols?.length ?? 0} protocols would take the place of your
            current {logs.length}.
          </Callout>
          <div className="flex flex-wrap gap-2.5">
            <Button variant="ghost" onClick={reset}>
              Cancel
            </Button>
            <Button variant="danger" onClick={apply}>
              Replace everything with this file
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
  const { plan, profile, table } = result;
  const span = planSpan(plan);
  const nothing = planIsEmpty(plan);
  const selectedNothing = (!withDoses || !plan.doses.length) && (!withWeights || !plan.weights.length);

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="mint">{profile.name}</Badge>
        <span className="text-[12.5px] text-[var(--muted)]">
          {fileName} · {table.records.length} row{table.records.length === 1 ? "" : "s"}
          {span ? ` · ${formatDate(span.from)} to ${formatDate(span.to)}` : ""}
        </span>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <Toggle
          on={withDoses}
          onChange={setWithDoses}
          count={plan.doses.length}
          label={`dose${plan.doses.length === 1 ? "" : "s"}`}
          duplicates={plan.duplicateDoses}
        />
        <Toggle
          on={withWeights}
          onChange={setWithWeights}
          count={plan.weights.length}
          label={`weight${plan.weights.length === 1 ? "" : "s"}`}
          duplicates={plan.duplicateWeights}
        />
      </div>

      {plan.doses.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11.5px] font-bold uppercase tracking-wide text-[var(--faint)]">
            First and last, to check it read them correctly
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
                <span className="ml-auto text-[11px] text-[var(--faint)]">row {d.sourceRow}</span>
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
            <AlertTriangle size={14} strokeWidth={2.4} /> Not in the library, so these are skipped
          </p>
          <ul className="mt-1 space-y-0.5">
            {plan.unresolved.map((u) => (
              <li key={u.label}>
                <strong>{u.label}</strong>, {u.rows.length} row{u.rows.length === 1 ? "" : "s"} (
                {u.rows.slice(0, 6).join(", ")}
                {u.rows.length > 6 ? "…" : ""})
              </li>
            ))}
          </ul>
          <p className="mt-1.5 opacity-90">
            Add a compound with that name under Library to bring these in.
          </p>
        </div>
      )}

      {plan.problems.length > 0 && (
        <details className="rounded-[var(--r-inner)] bg-[var(--sunken)] px-3.5 py-3">
          <summary className="cursor-pointer text-[12.5px] font-bold text-[var(--ink)]">
            {plan.problems.length} row{plan.problems.length === 1 ? "" : "s"} could not be read
          </summary>
          <ul className="mt-2 space-y-1 text-[12px] leading-relaxed text-[var(--muted)]">
            {plan.problems.slice(0, 20).map((p, i) => (
              <li key={i}>
                <strong>Row {p.sourceRow}:</strong> {p.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      {nothing && (
        <Callout tone="info">
          Nothing new here, everything in this file is already recorded. Importing the same export
          again is safe and does nothing.
        </Callout>
      )}

      <div className="flex flex-wrap gap-2.5">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onApply} disabled={nothing || selectedNothing}>
          <Upload size={15} /> Import {describePlan(plan)}
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
  label,
  duplicates,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  count: number;
  label: string;
  duplicates: number;
}) {
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
        <span className="block text-[14px] font-bold text-[var(--ink)]">
          {count} new {label}
        </span>
        <span className="block text-[11.5px] text-[var(--muted)]">
          {duplicates > 0 ? `${duplicates} already recorded, skipped` : "nothing skipped"}
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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-[var(--ink)]">
          <Droplet size={14} strokeWidth={2.6} /> Lab report
        </span>
        <span className="text-[12px] text-[var(--faint)]">
          {fileName} · {lineCount} lines read
        </span>
      </div>

      <p className="text-[12.5px] leading-relaxed text-[var(--muted)]">
        {report.candidates.length} marker{report.candidates.length === 1 ? "" : "s"} recognised
        {report.lab ? ` from ${report.lab}` : ""}, dated{" "}
        {report.collectedAt != null ? formatDate(report.collectedAt) : "today"}
        {report.collectedAt == null ? ", since no collection date was found" : ""}. Check each
        against the line it came from before saving.
      </p>

      {suspect.length > 0 && (
        <Callout tone="warn" title="Units that do not match">
          {suspect.map((c) => c.markerName).join(", ")} came back in a unit the app does not chart
          in. Nothing is converted on a guess, because charting one unit as another produces a trend
          that is wrong rather than merely imprecise. Untick these and enter them by hand, or
          convert them yourself first.
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
                        ref {c.refLow ?? "n/a"} to {c.refHigh ?? "n/a"}
                      </span>
                    ) : null}
                    {bad && <Badge tone="tangerine">expects {c.expectedUnit}</Badge>}
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
          Cancel
        </Button>
        <Button variant="primary" className="flex-1" disabled={!keeping.length} onClick={onApply}>
          Save {keeping.length} result{keeping.length === 1 ? "" : "s"}
        </Button>
      </div>
    </div>
  );
}
