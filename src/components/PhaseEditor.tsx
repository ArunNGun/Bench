"use client";

/**
 * Building a plan by weeks: bands that each hold a dose, and optionally a
 * frequency of their own, for a number of weeks.
 *
 * The component owns no protocol state. It is handed a phase list and reports a
 * new one, so the form above it stays the single place a protocol is assembled.
 */

import { Plus, Trash2 } from "lucide-react";
import { Button, NumberInput, Segmented, Select } from "@/components/ui";
import { TimesOfDay, describeSplit } from "@/components/TimesOfDay";
import { bandSchedule, scheduleTimes } from "@/lib/calc/schedule";
import { useLang } from "@/lib/i18n";
import { formatDose } from "@/lib/format";
import type { ProtocolPhase, Schedule, ScheduleKind } from "@/lib/types";

/** Indexed by `Date.getDay()`, so Sunday is first. Shared with the Plan page. */
const WEEKDAY_KEYS = [
  "weekday_sun",
  "weekday_mon",
  "weekday_tue",
  "weekday_wed",
  "weekday_thu",
  "weekday_fri",
  "weekday_sat",
] as const;

type Translate = ReturnType<typeof useLang>["t"];

/** Sentinel for "this band keeps the protocol's own frequency". */
const INHERIT = "inherit";

export type DoseUnit = "mcg" | "mg";

/**
 * The week each band starts and ends, 1-based and inclusive, for labels like
 * "weeks 4 to 6". The last band has no end, which is the point of it.
 */
export function bandWeekRange(phases: ProtocolPhase[], index: number) {
  let start = 1;
  for (let i = 0; i < index; i++) start += Math.max(0, phases[i].weeks);

  if (index === phases.length - 1) return { start, end: null as number | null };
  return { start, end: start + Math.max(0, phases[index].weeks) - 1 };
}

export function describeBandRange(t: Translate, phases: ProtocolPhase[], index: number) {
  const { start, end } = bandWeekRange(phases, index);
  if (end == null) return t("phase_week_onwards", { start });
  if (end === start) return t("phase_week_one", { start });
  return t("phase_week_range", { start, end });
}

function nextPhase(phases: ProtocolPhase[]): ProtocolPhase {
  const previous = phases[phases.length - 1];
  return {
    step: phases.length + 1,
    // Starting from the previous dose is nearly always closer than starting
    // from zero, and a ladder that repeats a dose is a legitimate thing to want.
    doseMcg: previous?.doseMcg ?? 500,
    weeks: previous?.weeks || 4,
  };
}

/** Renumber after an insert or a delete, so `step` stays 1, 2, 3. */
function renumber(phases: ProtocolPhase[]) {
  return phases.map((p, i) => ({ ...p, step: i + 1 }));
}

export function PhaseEditor({
  phases,
  onChange,
  unit,
  onUnitChange,
  protocolSchedule,
}: {
  phases: ProtocolPhase[];
  onChange: (next: ProtocolPhase[]) => void;
  unit: DoseUnit;
  onUnitChange: (u: DoseUnit) => void;
  /** Shown as the default so "same as protocol" means something concrete. */
  protocolSchedule: Schedule;
}) {
  const { t } = useLang();

  function patch(index: number, changes: Partial<ProtocolPhase>) {
    onChange(phases.map((p, i) => (i === index ? { ...p, ...changes } : p)));
  }

  function patchSchedule(index: number, changes: Partial<Schedule>) {
    const base = phases[index].schedule ?? { ...protocolSchedule };
    patch(index, { schedule: { ...base, ...changes } });
  }

  /**
   * A band always writes the whole list, a single time included.
   *
   * The protocol form collapses one time back to `timeOfDay` so that old
   * protocols keep the shape they had. A band cannot: it inherits anything it
   * does not name, so dropping the list is how it would say "follow the
   * protocol" rather than "once a day, at this hour".
   */
  function patchTimes(index: number, next: string[]) {
    const clean = [...new Set(next.map((t) => t.trim()).filter(Boolean))].sort();
    patchSchedule(index, {
      timeOfDay: clean[0] ?? "09:00",
      // Held as typed, blanks and all, so a time just added does not vanish
      // before it can be typed into. The maths ignores the blanks and the form
      // drops them on save.
      timesOfDay: next,
    });
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12.5px] text-[var(--muted)]">
          {t("phase_intro")}
        </p>
        <Segmented
          ariaLabel={t("phase_dose_unit")}
          options={[
            { value: "mcg", label: "mcg" },
            { value: "mg", label: "mg" },
          ]}
          value={unit}
          onChange={onUnitChange}
        />
      </div>

      {phases.map((phase, i) => {
        const isLast = i === phases.length - 1;
        const inherits = !phase.schedule;
        const kind: ScheduleKind | typeof INHERIT = inherits ? INHERIT : phase.schedule!.kind;
        // What the band comes to, which is the protocol's schedule with the
        // band's own answers laid over it.
        const effective = bandSchedule(protocolSchedule, phase.schedule);
        const inheritedTimes =
          protocolSchedule.kind === "as-needed" ? [] : scheduleTimes(protocolSchedule);
        const inheritedSplit = describeSplit(phase.doseMcg, inheritedTimes);

        return (
          <div
            key={i}
            className="space-y-2.5 rounded border border-[var(--line)] bg-[var(--sunken)]/40 p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] font-semibold text-[var(--ink)]">
                {describeBandRange(t, phases, i)}
              </span>
              {phases.length > 1 && (
                <button
                  type="button"
                  aria-label={t("phase_remove_band", { n: i + 1 })}
                  onClick={() => onChange(renumber(phases.filter((_, x) => x !== i)))}
                  className="p-1 text-[var(--faint)] transition-colors hover:text-[var(--rose)]"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[11.5px] text-[var(--muted)]">{t("plan_dose")}</span>
                <NumberInput
                  value={unit === "mg" ? phase.doseMcg / 1000 : phase.doseMcg}
                  min={0}
                  step={unit === "mg" ? 0.25 : 25}
                  suffix={unit}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    patch(i, { doseMcg: unit === "mg" ? n * 1000 : n });
                  }}
                />
              </label>

              {/*
                The last band runs on whatever its weeks say, so asking for a
                number there invites someone to set one and wonder why nothing
                happened. The heading above already reads "Week N onwards".
                The value is kept, and the field returns if a band is added
                after this one.
              */}
              {isLast ? (
                <div className="self-end pb-2.5 text-[12px] text-[var(--faint)]">
                  {t("phase_runs_on")}
                </div>
              ) : (
                <label className="block">
                  <span className="mb-1 block text-[11.5px] text-[var(--muted)]">{t("phase_weeks")}</span>
                  <NumberInput
                    value={phase.weeks}
                    min={1}
                    max={104}
                    step={1}
                    suffix={t("weeks")}
                    onChange={(e) => patch(i, { weeks: Math.max(1, Number(e.target.value)) })}
                  />
                </label>
              )}
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[11.5px] text-[var(--muted)]">{t("plan_how_often")}</span>
                <Select
                  value={kind}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === INHERIT) {
                      patch(i, { schedule: undefined });
                      return;
                    }
                    patchSchedule(i, { kind: v as ScheduleKind });
                  }}
                >
                  <option value={INHERIT}>{t("phase_same_as_protocol")}</option>
                  <option value="daily">{t("plan_daily")}</option>
                  <option value="interval-days">{t("plan_every_n_days_short")}</option>
                  <option value="days-of-week">{t("plan_set_days")}</option>
                  <option value="as-needed">{t("plan_as_needed")}</option>
                </Select>
              </label>

              {!inherits && phase.schedule!.kind === "interval-days" && (
                <label className="block">
                  <span className="mb-1 block text-[11.5px] text-[var(--muted)]">{t("plan_interval")}</span>
                  <NumberInput
                    value={phase.schedule!.intervalDays ?? 7}
                    min={1}
                    max={90}
                    step={1}
                    suffix={t("days")}
                    onChange={(e) =>
                      patchSchedule(i, { intervalDays: Math.max(1, Number(e.target.value)) })
                    }
                  />
                </label>
              )}
            </div>

            {/*
              Times belong to the band only when the band has taken its
              frequency into its own hands. A band that says "same as the
              protocol" is told what that works out to rather than given a
              second place to set it, since two editable copies of one fact is
              how they come to disagree.
            */}
            {!inherits && phase.schedule!.kind !== "as-needed" && (
              <TimesOfDay
                times={phase.schedule!.timesOfDay ?? scheduleTimes(effective)}
                onChange={(next) => patchTimes(i, next)}
                dailyMcg={phase.doseMcg}
              />
            )}

            {inherits && inheritedTimes.length > 0 && (
              <p className="text-[12px] text-[var(--faint)]">
                {inheritedSplit ?? `At ${inheritedTimes[0]}, same as the protocol.`}
              </p>
            )}

            {!inherits && phase.schedule!.kind === "days-of-week" && (
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAY_KEYS.map((key, dayIndex) => {
                  const on = (phase.schedule!.daysOfWeek ?? []).includes(dayIndex);
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        patchSchedule(i, {
                          daysOfWeek: on
                            ? (phase.schedule!.daysOfWeek ?? []).filter((x) => x !== dayIndex)
                            : [...(phase.schedule!.daysOfWeek ?? []), dayIndex].sort(),
                        })
                      }
                      className={`rounded px-2.5 py-1.5 text-[12px] transition-colors ${
                        on
                          ? "bg-[var(--tangerine)] font-medium text-[#12181a]"
                          : "border border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)]"
                      }`}
                    >
                      {t(key)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <div className="flex items-center justify-between gap-3">
        <Button onClick={() => onChange([...phases, nextPhase(phases)])}>
          <Plus size={15} /> {t("phase_add_band")}
        </Button>
        <span className="text-[12px] text-[var(--faint)]">
          {t("phase_bands_ending", {
            n: phases.length,
            dose: formatDose(phases[phases.length - 1]?.doseMcg ?? 0),
          })}
        </span>
      </div>
    </div>
  );
}
