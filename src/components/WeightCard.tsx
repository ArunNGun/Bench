"use client";
import { useLang } from "@/lib/i18n";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Activity, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { Button, Card, Field, NumberInput, SectionLabel, Stat } from "./ui";
import { useProfileData, useStore } from "@/lib/store";
import {
  fromDisplayWeight,
  toDisplayWeight,
  weightChange,
  weightSeries,
} from "@/lib/calc/outcomes";
import { formatDate, toDateTimeLocal, fromDateTimeLocal, trim } from "@/lib/format";
import { getHealthAdapter, type HealthAvailability } from "@/lib/health/adapter";
import { newestSample } from "@/lib/calc/healthsync";

const DAY = 86_400_000;

/**
 * How far back to look for a reading to prefill with. Health Connect will not
 * return anything older than roughly 30 days without a history permission this
 * app does not ask for, so a wider window would only be for show.
 */
const PREFILL_DAYS = 30;

/**
 * Weight over time, drawn against when doses were taken.
 *
 * The app otherwise only records what goes in. For a metabolic protocol this
 * is the outcome that matters, and putting the dose markers on the same axis
 * is what makes a titration step and the response to it legible together.
 */
const { t } = useLang();
  export function WeightCard({ nowMs }: { nowMs: number }) {
  const { measurements, logs } = useProfileData();
  const settings = useStore((s) => s.settings);
  const addMeasurement = useStore((s) => s.addMeasurement);

  const unit = settings.weightUnit ?? "kg";
  const toDisplay = (kg: number) => toDisplayWeight(kg, unit);

  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState<number | "">("");
  const [at, setAt] = useState(() => Date.now());

  /**
   * The Health Connect reading the form was filled from, while it is still
   * untouched. Holding it lets the reading be saved under the platform's own
   * record id, so syncing never pushes it back out as a duplicate of itself.
   * Editing either field clears it and the entry becomes your own.
   */
  const [prefilled, setPrefilled] = useState<{ externalId: string; at: number; kg: number } | null>(
    null);
  const [health, setHealth] = useState<HealthAvailability | "checking" | null>(null);

  /** Guards a slow read from overwriting something typed in the meantime. */
  const typedRef = useRef(false);
  const requestRef = useRef(0);

  const series = useMemo(() => weightSeries(measurements), [measurements]);
  const change = useMemo(() => weightChange(measurements), [measurements]);
  const change30 = useMemo(() => weightChange(measurements, nowMs - 30 * DAY), [measurements, nowMs]);
  const latestKg = series.length ? series[series.length - 1].kg : null;

  /** Open the form and on Android, fill it from the most recent scale reading. */
  async function open() {
    const token = ++requestRef.current;
    typedRef.current = false;
    setAt(Date.now());
    setValue("");
    setPrefilled(null);
    setAdding(true);
    setHealth("checking");

    const stale = () => requestRef.current !== token || typedRef.current;

    try {
      const adapter = await getHealthAdapter();
      const state = await adapter.availability();
      if (requestRef.current !== token) return;
      setHealth(state);
      if (state !== "available") return;

      const sample = newestSample(await adapter.readWeight(Date.now() - PREFILL_DAYS * DAY));
      if (stale() || !sample) return;

      setPrefilled({ externalId: sample.externalId, at: sample.at, kg: sample.weightKg });
      setAt(sample.at);
      setValue(Math.round(toDisplay(sample.weightKg) * 10) / 10);
    } catch {
      if (requestRef.current === token) setHealth("not-on-this-platform");
    }
  }

  function edited() {
    typedRef.current = true;
    // No longer the platform's reading, so it must not claim its record id.
    setPrefilled(null);
  }

  function save() {
    if (value === "" || !(Number(value) > 0)) return;

    if (prefilled && at === prefilled.at) {
      // Untouched: store the platform's exact value, not the rounded one shown.
      addMeasurement({
        at: prefilled.at,
        weightKg: prefilled.kg,
        source: "health-connect",
        externalId: prefilled.externalId,
      });
    } else {
      addMeasurement({
        at,
        weightKg: fromDisplayWeight(Number(value), unit),
      });
    }

    setValue("");
    setPrefilled(null);
    setAdding(false);
  }

  const losing = (change?.deltaKg ?? 0) < 0;

  return (
    <Card className="p-5">
      <SectionLabel
        action={
          !adding && (
            <button
              type="button"
              onClick={open}
              className="press flex items-center gap-1 rounded-[var(--r-pill)] bg-[var(--mint-soft)] px-2.5 py-1 text-[12px] font-bold text-[var(--mint-ink)]"
            >
              <Plus size={13} strokeWidth={2.6} /> Add
            </button>
          )
        }
      >
        Weight
      </SectionLabel>

      {adding && (
        <div className="mb-4 rounded-[var(--r-inner)] bg-[var(--sunken)] p-3">
          <div className="flex flex-wrap items-end gap-2.5">
            <Field label="Weight" className="w-32">
              <NumberInput
                autoFocus
                value={value}
                min={0}
                step={0.1}
                suffix={unit}
                placeholder={latestKg != null ? trim(toDisplay(latestKg), 1) : undefined}
                onChange={(e) => {
                  edited();
                  setValue(e.target.value === "" ? "" : Number(e.target.value));
                }}
                onKeyDown={(e) => e.key === "Enter" && save()}
              />
            </Field>
            <Field label="When" className="min-w-44 flex-1">
              <input
                type="datetime-local"
                value={toDateTimeLocal(at)}
                onChange={(e) => {
                  edited();
                  setAt(fromDateTimeLocal(e.target.value));
                }}
                className="w-full rounded-[var(--r-btn)] border border-[var(--line)] bg-[var(--card)] px-3.5 py-3 text-[15px] text-[var(--ink)] focus:border-[var(--mint)] focus:outline-none"
              />
            </Field>
            {/* Kept together so they do not straddle two rows on a phone. */}
            <div className="flex w-full gap-2.5 sm:w-auto">
              <Button variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={save}
                disabled={value === ""}
                className="flex-1 sm:flex-none"
              >
                Save
              </Button>
            </div>
          </div>

          <PrefillNote health={health} prefilled={prefilled} unit={unit} toDisplay={toDisplay} />
        </div>
      )}

      {series.length === 0 ? (
        <p className="py-4 text-center text-[13px] leading-relaxed text-[var(--muted)]">
          Nothing recorded yet. Add a weight and this becomes a trend line against your doses, which is the only way to see whether a protocol is doing anything.
        </p>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Stat
              label="Latest"
              value={trim(toDisplay(series[series.length - 1].kg), 1)}
              unit={unit}
            />
            {change && (
              <Stat
                label="Since you started"
                value={`${change.deltaKg > 0 ? "+" : ""}${trim(toDisplay(Math.abs(change.deltaKg)) * (change.deltaKg < 0 ? -1 : 1), 1)}`}
                unit={unit}
                tone={losing ? "leaf" : "tangerine"}
                icon={losing ? <TrendingDown size={13} /> : <TrendingUp size={13} />}
                hint={`${trim(Math.abs(change.deltaPercent), 1)}% over ${Math.round(change.days)} days.`}
              />
            )}
            {change30?.perWeekKg != null && (
              <Stat
                label="Rate, 30 days"
                value={`${change30.perWeekKg > 0 ? "+" : "−"}${trim(Math.abs(toDisplay(change30.perWeekKg)), 2)}`}
                unit={`${unit}/wk`}
                tone={change30.perWeekKg < 0 ? "leaf" : "tangerine"}
              />
            )}
          </div>

          <WeightChart
            series={series}
            doses={logs.filter((l) => !l.skipped).map((l) => l.at)}
            unit={unit}
            toDisplay={toDisplay}
            nowMs={nowMs}
          />
        </>
      )}
    </Card>
  );
}

/**
 * Where the number in the field came from, or why nothing was filled in.
 *
 * Silent on the web build: Health Connect is Android-only, so there is nothing
 * to fix there and saying so on every visit would just be noise.
 */
function PrefillNote({
  health,
  prefilled,
  unit,
  toDisplay,
}: {
  health: HealthAvailability | "checking" | null;
  prefilled: { at: number; kg: number } | null;
  unit: string;
  toDisplay: (kg: number) => number;
}) {
  const base = "mt-2.5 flex items-start gap-1.5 text-[12px] leading-relaxed";

  if (prefilled) {
    const when = new Date(prefilled.at);
    return (
      <p className={base} style={{ color: "var(--mint-ink)" }}>
        <Activity size={13} className="mt-0.5 shrink-0" />
        <span>
          Filled in from Health Connect, {trim(toDisplay(prefilled.kg), 1)} {unit} on{" "}
          {formatDate(prefilled.at)} at{" "}
          {when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Change either field
          if that is not what you want.
        </span>
      </p>
    );
  }

  if (health === "checking") {
    return <p className={`${base} text-[var(--faint)]`}>{t("weight_health_connect")}</p>;
  }

  if (health === "available") {
    return (
      <p className={`${base} text-[var(--faint)]`}>
        Health Connect has no weight from the last {PREFILL_DAYS} days, so there was nothing to fill
        in.
      </p>
    );
  }

  if (health === "permission-denied" || health === "not-installed") {
    return (
      <p className={`${base} text-[var(--muted)]`}>
        <span>
          Weigh in on a connected scale and this fills itself in.{" "}
          <Link href="/settings" className="font-semibold underline decoration-dotted">
            Set up Health Connect
          </Link>
          .
        </span>
      </p>
    );
  }

  return null;
}

const W = 640;
const H = 150;
const PAD = { l: 34, r: 6, t: 10, b: 20 };

function WeightChart({
  series,
  doses,
  unit,
  toDisplay,
  nowMs,
}: {
  series: { at: number; kg: number }[];
  doses: number[];
  unit: string;
  toDisplay: (kg: number) => number;
  nowMs: number;
}) {
  const from = series[0].at;
  const to = Math.max(series[series.length - 1].at, nowMs);
  const span = Math.max(1, to - from);

  const values = series.map((p) => toDisplay(p.kg));
  const min = Math.min(...values);
  const max = Math.max(...values);
  // Pad the range so a flat line does not sit on the axis.
  const pad = Math.max(0.5, (max - min) * 0.25);
  const lo = min - pad;
  const hi = max + pad;

  const x = (t: number) => PAD.l + ((t - from) / span) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);

  const line = series
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.at).toFixed(1)} ${y(toDisplay(p.kg)).toFixed(1)}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: "auto", display: "block" }}
      role="img"
      aria-label={`Weight from ${trim(values[0], 1)} to ${trim(values[values.length - 1], 1)} ${unit}`}
    >
      {/* Dose markers, so the trend can be read against what was taken. */}
      {doses
        .filter((d) => d >= from && d <= to)
        .map((d, i) => (
          <line
            key={i}
            x1={x(d)}
            y1={PAD.t}
            x2={x(d)}
            y2={H - PAD.b}
            stroke="var(--mint)"
            strokeWidth={1}
            opacity={0.16}
          />
        ))}

      {[hi, (hi + lo) / 2, lo].map((v) => (
        <g key={v}>
          <line
            x1={PAD.l}
            y1={y(v)}
            x2={W - PAD.r}
            y2={y(v)}
            stroke="var(--line)"
            strokeWidth={1}
          />
          <text x={2} y={y(v) + 3.5} fontSize={10} fill="var(--faint)">
            {trim(v, 1)}
          </text>
        </g>
      ))}

      <path d={line} fill="none" stroke="var(--grape)" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />

      {series.map((p) => (
        <circle
          key={p.at}
          cx={x(p.at)}
          cy={y(toDisplay(p.kg))}
          r={3}
          fill="var(--card)"
          stroke="var(--grape)"
          strokeWidth={2}
        />
      ))}

      <text x={PAD.l} y={H - 5} fontSize={10} fill="var(--faint)">
        {formatDate(from)}
      </text>
      <text x={W - PAD.r} y={H - 5} fontSize={10} fill="var(--faint)" textAnchor="end">
        {formatDate(to)}
      </text>
    </svg>
  );
}
