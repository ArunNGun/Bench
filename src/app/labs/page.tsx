"use client";

import { useMemo, useState } from "react";
import { Droplet, Plus, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  EmptyState,
  Field,
  NumberInput,
  SectionLabel,
  Select,
  TextInput,
  TONE_BG,
  TONE_FG,
} from "@/components/ui";
import { findPeptide, useProfileData, useStore } from "@/lib/store";
import {
  labSeries,
  labTrend,
  latestResult,
  missingMarkerIds,
  trackedMarkerIds,
  verdictFor,
} from "@/lib/calc/labs";
import { findMarker, LAB_CATEGORY_LABEL, LAB_MARKERS } from "@/lib/data/labs";
import { formatDate, fromDateTimeLocal, toDateTimeLocal, trim } from "@/lib/format";
import type { LabMarker, LabResult } from "@/lib/types";

export default function LabsPage() {
  const hydrated = useStore((s) => s.hydrated);
  const { labs, protocols } = useProfileData();
  const custom = useStore((s) => s.customPeptides);
  const removeLab = useStore((s) => s.removeLab);

  const [adding, setAdding] = useState(false);

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

  const tracked = useMemo(() => trackedMarkerIds(labs), [labs]);
  const missing = useMemo(() => missingMarkerIds(labs, compounds), [labs, compounds]);

  if (!hydrated) {
    return <div className="py-20 text-center text-[14px] text-[var(--faint)]">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight text-[var(--ink)]">Bloodwork</h1>
          <p className="mt-1 text-[13.5px] text-[var(--muted)]">
            The markers worth following, against the dates you took things.
          </p>
        </div>
        {!adding && (
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus size={16} /> Add a result
          </Button>
        )}
      </header>

      {adding && <AddResult onDone={() => setAdding(false)} />}

      <Callout tone="info" title="On reference ranges">
        A “normal” range belongs to the laboratory that ran the sample. It shifts with the assay,
        your sex and your age, and it is printed on your report. So enter it alongside the value and the app
        compares against yours. The exceptions are HbA1c, fasting glucose and blood pressure, where the
        thresholds are set by the ADA and the AHA rather than the lab, and those are built in.
      </Callout>

      {missing.length > 0 && (
        <div
          className="flex items-start gap-2.5 rounded-[var(--r-inner)] px-3.5 py-3 text-[13px] leading-relaxed"
          style={{ background: TONE_BG.sky, color: TONE_FG.sky }}
        >
          <Droplet size={16} strokeWidth={2.4} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-bold">Worth checking for what you are running</p>
            <p className="mt-0.5 opacity-90">
              {missing.map((id) => findMarker(id)?.name ?? id).join(", ")}. Each of these is explained
              under its own heading below.
            </p>
          </div>
        </div>
      )}

      {!labs.length && !adding && (
        <EmptyState
          title="No results yet"
          icon={<Droplet size={22} />}
          action={
            <Button variant="primary" onClick={() => setAdding(true)}>
              Add your first result
            </Button>
          }
        >
          Blood results are the only way to tell whether a protocol is doing what you hoped rather
          than just changing the number on the scale.
        </EmptyState>
      )}

      {tracked.map((id) => {
        const marker = findMarker(id);
        if (!marker) return null;
        return (
          <MarkerHistory
            key={id}
            marker={marker}
            results={labs.filter((l) => l.markerId === id)}
            onRemove={removeLab}
          />
        );
      })}
    </div>
  );
}

/** One marker: the latest value, the trend, and every result recorded. */
function MarkerHistory({
  marker,
  results,
  onRemove,
}: {
  marker: LabMarker;
  results: LabResult[];
  onRemove: (id: string) => void;
}) {
  const latest = latestResult(results, marker.id);
  const trend = labTrend(results, marker.id);
  const series = labSeries(results, marker.id);
  const verdict = latest ? verdictFor(marker, latest) : null;

  return (
    <Card className="space-y-3 p-4">
      <SectionLabel
        action={
          verdict && verdict.status !== "unknown" ? (
            <Badge tone={verdict.tone === "muted" ? "neutral" : verdict.tone}>{verdict.label}</Badge>
          ) : undefined
        }
      >
        {marker.name}
      </SectionLabel>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        {latest && (
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[28px] font-extrabold tracking-tight text-[var(--ink)]">
                {trim(latest.value, marker.decimals)}
              </span>
              <span className="text-[13px] font-medium text-[var(--faint)]">{marker.unit}</span>
            </div>
            <p className="text-[11.5px] text-[var(--faint)]">
              {formatDate(latest.at)}
              {latest.lab ? ` · ${latest.lab}` : ""}
            </p>
          </div>
        )}

        {trend && (
          <div>
            <p className="text-[15px] font-bold text-[var(--ink)]">
              {trend.delta > 0 ? "+" : "−"}
              {trim(Math.abs(trend.delta), marker.decimals)} {marker.unit}
            </p>
            <p className="text-[11.5px] text-[var(--faint)]">
              over {Math.round(trend.days)} days
              {trend.percent != null ? `, ${trim(Math.abs(trend.percent), 1)}%` : ""}
            </p>
          </div>
        )}
      </div>

      {series.length > 1 && <LabChart series={series} marker={marker} />}

      <p className="text-[12.5px] leading-relaxed text-[var(--muted)]">{marker.why}</p>

      {verdict?.basis && (
        <p className="text-[11.5px] text-[var(--faint)]">Judged against {verdict.basis}.</p>
      )}
      {verdict?.status === "unknown" && marker.rangeNote && (
        <p className="text-[11.5px] leading-relaxed text-[var(--faint)]">{marker.rangeNote}</p>
      )}

      <ul className="space-y-1">
        {[...results]
          .sort((a, b) => b.at - a.at)
          .map((r) => {
            const v = verdictFor(marker, r);
            return (
              <li
                key={r.id}
                className="flex items-center gap-2.5 rounded-[var(--r-inner)] px-2.5 py-2 text-[13px] hover:bg-[var(--sunken)]"
              >
                <span className="w-20 shrink-0 font-bold text-[var(--ink)]">
                  {trim(r.value, marker.decimals)}
                </span>
                <span className="w-24 shrink-0 text-[12px] text-[var(--muted)]">
                  {formatDate(r.at)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--faint)]">
                  {r.refLow != null || r.refHigh != null
                    ? `ref ${r.refLow ?? "n/a"} to ${r.refHigh ?? "n/a"}`
                    : v.status === "unknown"
                      ? "no range given"
                      : ""}
                  {r.notes ? ` · ${r.notes}` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(r.id)}
                  aria-label={`Delete ${marker.name} result from ${formatDate(r.at)}`}
                  className="press shrink-0 p-1 text-[var(--faint)] hover:text-[var(--rose)]"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            );
          })}
      </ul>
    </Card>
  );
}

const W = 640;
const H = 120;
const PAD = { l: 38, r: 8, t: 10, b: 18 };

function LabChart({
  series,
  marker,
}: {
  series: { at: number; value: number }[];
  marker: LabMarker;
}) {
  const from = series[0].at;
  const to = series[series.length - 1].at;
  const span = Math.max(1, to - from);

  const values = series.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(max === min ? Math.abs(max) * 0.1 || 1 : 0, (max - min) * 0.25);
  const lo = min - pad;
  const hi = max + pad;

  const x = (t: number) => PAD.l + ((t - from) / span) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);

  const line = series
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.at).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: "auto", display: "block" }}
      role="img"
      aria-label={`${marker.name} from ${trim(values[0], marker.decimals)} to ${trim(
        values[values.length - 1],
        marker.decimals)} ${marker.unit}`}
    >
      {[hi, (hi + lo) / 2, lo].map((v) => (
        <g key={v}>
          <line x1={PAD.l} y1={y(v)} x2={W - PAD.r} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
          <text x={2} y={y(v) + 3.5} fontSize={10} fill="var(--faint)">
            {trim(v, marker.decimals)}
          </text>
        </g>
      ))}

      <path
        d={line}
        fill="none"
        stroke="var(--sky)"
        strokeWidth={2.2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {series.map((p) => (
        <circle
          key={p.at}
          cx={x(p.at)}
          cy={y(p.value)}
          r={3}
          fill="var(--card)"
          stroke="var(--sky)"
          strokeWidth={2}
        />
      ))}
    </svg>
  );
}

function AddResult({ onDone }: { onDone: () => void }) {
  const addLab = useStore((s) => s.addLab);

  const [markerId, setMarkerId] = useState(LAB_MARKERS[0].id);
  const [value, setValue] = useState<number | "">("");
  const [refLow, setRefLow] = useState<number | "">("");
  const [refHigh, setRefHigh] = useState<number | "">("");
  const [at, setAt] = useState(() => Date.now());
  const [lab, setLab] = useState("");
  const [notes, setNotes] = useState("");

  const marker = findMarker(markerId);

  const grouped = useMemo(() => {
    const out = new Map<string, LabMarker[]>();
    for (const m of LAB_MARKERS) {
      const list = out.get(m.category) ?? [];
      list.push(m);
      out.set(m.category, list);
    }
    return [...out.entries()];
  }, []);

  function save() {
    if (value === "" || !Number.isFinite(Number(value))) return;
    addLab({
      at,
      markerId,
      value: Number(value),
      refLow: refLow === "" ? undefined : Number(refLow),
      refHigh: refHigh === "" ? undefined : Number(refHigh),
      lab: lab.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    onDone();
  }

  return (
    <Card className="space-y-4 p-4">
      <SectionLabel>Add a result</SectionLabel>

      <Field label="Marker">
        <Select value={markerId} onChange={(e) => setMarkerId(e.target.value)}>
          {grouped.map(([category, markers]) => (
            <optgroup key={category} label={LAB_CATEGORY_LABEL[category] ?? category}>
              {markers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.aka ? `, ${m.aka}` : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </Field>

      {marker && <p className="text-[12.5px] leading-relaxed text-[var(--muted)]">{marker.why}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Result" hint={marker ? `In ${marker.unit}.` : undefined}>
          <NumberInput
            autoFocus
            value={value}
            step={marker ? 1 / 10 ** marker.decimals : 0.1}
            suffix={marker?.unit}
            onChange={(e) => setValue(e.target.value === "" ? "" : Number(e.target.value))}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
        </Field>

        <Field label="When">
          <input
            type="datetime-local"
            value={toDateTimeLocal(at)}
            onChange={(e) => setAt(fromDateTimeLocal(e.target.value))}
            className="w-full rounded-[var(--r-btn)] border border-[var(--line)] bg-[var(--card)] px-3.5 py-3 text-[15px] text-[var(--ink)] focus:border-[var(--mint)] focus:outline-none"
          />
        </Field>
      </div>

      <div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your lab's low" hint="Optional.">
            <NumberInput
              value={refLow}
              step={marker ? 1 / 10 ** marker.decimals : 0.1}
              placeholder=", "
              onChange={(e) => setRefLow(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </Field>
          <Field label="Your lab's high" hint="Optional.">
            <NumberInput
              value={refHigh}
              step={marker ? 1 / 10 ** marker.decimals : 0.1}
              placeholder=", "
              onChange={(e) => setRefHigh(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </Field>
        </div>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--faint)]">
          {marker?.guideline
            ? `Optional here, ${marker.name} is judged against the ${marker.guideline.source} either way. Your lab's own interval takes precedence if you enter it.`
            : "Copy the reference interval from your report. Without it there is nothing meaningful to call this value in or out of."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Lab or panel" hint="Optional. Ranges differ between labs.">
          <TextInput value={lab} onChange={(e) => setLab(e.target.value)} placeholder="e.g. Thyrocare" />
        </Field>
        <Field label="Note" hint="Optional.">
          <TextInput
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. fasted 12 h"
          />
        </Field>
      </div>

      <div className="flex gap-2.5">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="primary" onClick={save} disabled={value === ""} className="flex-1 sm:flex-none">
          Save result
        </Button>
      </div>
    </Card>
  );
}
