"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  NumberInput,
  Card,
  SectionLabel,
  Segmented,
  Select,
  TextInput,
} from "@/components/ui";
import { PctPanel } from "@/components/PctPanel";
import { ProjectionPreview } from "@/components/ProjectionPreview";
import { allPeptides, findPeptide, useStore, useProfileData } from "@/lib/store";
import {
  endOfLocalDay,
  phaseSpanAt,
  protocolDoseTimesBetween,
  protocolDosesPerWeek,
  protocolNextDoseTime,
  protocolPhases,
  scheduledDoseMcg,
} from "@/lib/calc/schedule";
import { formatDose, formatDate, formatWeekday, formatTime, relativeTime, toDateInput, trim } from "@/lib/format";
import {
  INJECTION_SITES,
  type InjectionSite,
  type Protocol,
  type ProtocolPhase,
  type Schedule,
  type ScheduleKind,
  type TitrationStep,
} from "@/lib/types";
import { PhaseEditor, type DoseUnit } from "@/components/PhaseEditor";
import { SiteMap } from "@/components/SiteMap";
import { StackWarnings } from "@/components/StackWarnings";
import { AddCompoundInline } from "@/components/AddCompoundInline";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function PlanPage() {
  const hydrated = useStore((s) => s.hydrated);
  const { protocols } = useProfileData();
  const custom = useStore((s) => s.customPeptides);
  const addProtocol = useStore((s) => s.addProtocol);
  const updateProtocol = useStore((s) => s.updateProtocol);
  const removeProtocol = useStore((s) => s.removeProtocol);

  const [adding, setAdding] = useState(false);
  // Which protocol is open for editing, if any. One at a time, because the
  // form replaces the card it belongs to and two open forms would be a puzzle.
  const [editingId, setEditingId] = useState<string | null>(null);
  const now = Date.now();

  if (!hydrated) {
    return <div className="py-20 text-center text-[14px] text-[var(--faint)]">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight text-[var(--ink)]">Plan</h1>
          <p className="mt-1 text-[13.5px] text-[var(--muted)]">
            What you are running, at what dose, on what schedule.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setEditingId(null);
            setAdding(true);
          }}
        >
          <Plus size={16} /> New protocol
        </Button>
      </header>

      {adding && (
        <ProtocolForm
          onCancel={() => setAdding(false)}
          onSave={(p) => {
            addProtocol(p);
            setAdding(false);
          }}
        />
      )}

      {!protocols.length && !adding && (
        <EmptyState
          title="No protocols yet"
          action={
            <Button variant="primary" onClick={() => setAdding(true)}>
              Create one
            </Button>
          }
        >
          A protocol ties a peptide to a dose and a schedule. It drives what shows as due on the Now
          page and how your stock burns down.
        </EmptyState>
      )}

      <StackWarnings nowMs={now} />

      {protocols.some((p) => p.active) && <Upcoming />}

      {/* Below the schedule: this is about what happens after, not what runs now. */}
      <PctPanel nowMs={now} />

      <div className="space-y-2.5">
        {protocols.map((p) => {
          if (editingId === p.id) {
            return (
              <ProtocolForm
                key={p.id}
                initial={p}
                onCancel={() => setEditingId(null)}
                onSave={(patch) => {
                  updateProtocol(p.id, patch);
                  setEditingId(null);
                }}
              />
            );
          }

          const peptide = findPeptide(custom, p.peptideId);
          const target = scheduledDoseMcg(p, now);
          const next = p.active ? protocolNextDoseTime(p, now) : null;

          // One bar serves a published titration and a hand-built plan, because
          // by this point they are the same shape.
          const bands = protocolPhases(p);
          const current = bands ? phaseSpanAt(p, now) : null;
          // The frequency on show is the one in force now, which is not the
          // protocol's own once a phase overrides it.
          const showSchedule = current?.schedule ?? p.schedule;

          return (
            <Card key={p.id} className={`group p-4 ${p.active ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/library/${p.peptideId}`}
                      className="text-[15px] text-[var(--ink)] hover:underline"
                    >
                      {peptide?.name ?? p.peptideId}
                    </Link>
                    {!p.active && <Badge>paused</Badge>}
                    {bands && current && (
                      <Badge tone="sky">
                        {p.phases?.length ? "week band" : "step"} {current.index + 1} of{" "}
                        {bands.length}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-[13px] text-[var(--muted)]">{p.name}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
                    <span className="tnum font-mono text-[var(--tangerine)]">{formatDose(target)}</span>
                    <span className="text-[var(--muted)]">{describeSchedule(showSchedule)}</span>
                    <span className="text-[var(--faint)]">
                      {trim(protocolDosesPerWeek(p, now), 2)} per week
                    </span>
                    {next && (
                      <span className="text-[var(--muted)]">next {relativeTime(next, now)}</span>
                    )}
                  </div>
                  <p className="mt-1.5 text-[12px] text-[var(--faint)]">
                    Started {formatDate(p.startedAt)}
                    {p.sites?.length ? ` · rotating ${p.sites.length} sites` : ""}
                  </p>
                </div>

                <div className="flex gap-1.5">
                  <Button
                    onClick={() => {
                      setAdding(false);
                      setEditingId(p.id);
                    }}
                    className="px-2.5 py-2"
                    aria-label={`Edit ${p.name}`}
                  >
                    <Pencil size={15} />
                  </Button>
                  <Button
                    onClick={() => updateProtocol(p.id, { active: !p.active })}
                    className="px-2.5 py-2"
                    aria-label={p.active ? "Pause protocol" : "Resume protocol"}
                  >
                    {p.active ? <Pause size={15} /> : <Play size={15} />}
                  </Button>
                  <button
                    type="button"
                    onClick={() => removeProtocol(p.id)}
                    aria-label={`Delete ${p.name}`}
                    className="p-2 text-[var(--faint)] opacity-0 transition-opacity hover:text-[var(--rose)] focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {bands && bands.length > 0 && (
                <div className="mt-3.5 border-t border-[var(--line)] pt-3">
                  <div className="flex gap-1">
                    {bands.map((s, i) => (
                      <div
                        key={s.step}
                        title={describeBand(s, i === bands.length - 1)}
                        className={`h-1.5 flex-1 rounded-full ${
                          current && i <= current.index ? "bg-[var(--tangerine)]" : "bg-[var(--line)]"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="mt-2 text-[12px] text-[var(--faint)]">
                    {p.phases?.length
                      ? `Your own plan, ${bands.length} bands by week.`
                      : "Dose advances automatically with the plan."}
                  </p>
                </div>
              )}

              {/* A titration held at a fixed dose is a reference, not a plan,
                  so it is drawn only when nothing else is governing. */}
              {!bands && p.titration && p.titration.length > 0 && (
                <div className="mt-3.5 border-t border-[var(--line)] pt-3">
                  <p className="text-[12px] text-[var(--faint)]">
                    Fixed dose, the plan is shown for reference only.
                  </p>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/** Tooltip for one band of the plan bar. */
function describeBand(phase: ProtocolPhase, isLast: boolean) {
  const dose = formatDose(phase.doseMcg);
  const span = isLast
    ? "onwards"
    : `for ${phase.weeks} week${phase.weeks === 1 ? "" : "s"}`;
  const freq = phase.schedule ? `, ${describeSchedule(phase.schedule).toLowerCase()}` : "";
  return `${dose} ${span}${freq}`;
}

function describeSchedule(s: Schedule) {
  const base =
    s.kind === "daily"
      ? "Every day"
      : s.kind === "interval-days"
        ? s.intervalDays === 7
          ? "Weekly"
          : s.intervalDays === 1
            ? "Every day"
            : `Every ${s.intervalDays} days`
        : s.kind === "days-of-week"
          ? (s.daysOfWeek ?? []).map((d) => WEEKDAYS[d]).join(", ") || "No days chosen"
          : "As needed";
  const cycle =
    s.cycleWeeksOn && s.cycleWeeksOff
      ? `, ${s.cycleWeeksOn} on / ${s.cycleWeeksOff} off`
      : "";
  return base + cycle + (s.timeOfDay ? ` at ${s.timeOfDay}` : "");
}

/**
 * Marks titration steps that came from somewhere other than the current
 * peptide's published plans, an import for example. Selecting it means "leave
 * the steps as they are", which is the only honest option when there is no
 * plan to name them by.
 */
const EXISTING_TITRATION = "__existing__";

/** How a protocol decides its dose over time. */
type PlanMode = "fixed" | "titration" | "phases";

function sameSteps(a: TitrationStep[], b: TitrationStep[]) {
  return (
    a.length === b.length &&
    a.every((s, i) => s.step === b[i].step && s.doseMcg === b[i].doseMcg && s.weeks === b[i].weeks));
}

/**
 * Compared field by field rather than by JSON, because an absent key and a key
 * set to undefined are the same schedule but different strings.
 */
function sameSchedule(a: Schedule, b: Schedule) {
  return (
    a.kind === b.kind &&
    (a.intervalDays ?? null) === (b.intervalDays ?? null) &&
    (a.timeOfDay ?? null) === (b.timeOfDay ?? null) &&
    (a.cycleWeeksOn ?? null) === (b.cycleWeeksOn ?? null) &&
    (a.cycleWeeksOff ?? null) === (b.cycleWeeksOff ?? null) &&
    (a.daysOfWeek ?? []).join() === (b.daysOfWeek ?? []).join());
}

/** Steps are 1, 2, 3 on the way out, whatever adding and removing left behind. */
function renumberPhases(phases: ProtocolPhase[]) {
  return phases.map((p, i) => ({ ...p, step: i + 1 }));
}

/**
 * Phase lists are equal when their bands are. A band that only differs by an
 * absent versus an equivalent schedule counts as unchanged, so simply opening
 * the form and saving does not claim to have moved anything.
 */
function samePhases(a?: ProtocolPhase[], b?: ProtocolPhase[]) {
  if (!a?.length && !b?.length) return true;
  if (!a?.length || !b?.length) return false;
  if (a.length !== b.length) return false;

  return a.every((phase, i) => {
    const other = b[i];
    if (phase.doseMcg !== other.doseMcg || phase.weeks !== other.weeks) return false;
    if (!phase.schedule && !other.schedule) return true;
    if (!phase.schedule || !other.schedule) return false;
    return sameSchedule(phase.schedule, other.schedule);
  });
}

/**
 * Creates a protocol, or edits one that already exists.
 *
 * The two modes are the same form because they ask the same questions. Passing
 * `initial` seeds every field from the saved protocol and turns the save into a
 * patch. Fields the form does not ask about, `active` and `endedAt` and
 * `notes`, are carried through untouched, so editing a paused protocol does not
 * quietly restart it.
 */
function ProtocolForm({
  initial,
  onCancel,
  onSave,
}: {
  initial?: Protocol;
  onCancel: () => void;
  onSave: (p: Omit<Protocol, "id" | "profileId">) => void;
}) {
  const custom = useStore((s) => s.customPeptides);
  const peptides = useMemo(() => allPeptides(custom), [custom]);

  const [peptideId, setPeptideId] = useState(initial?.peptideId ?? peptides[0]?.id ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [doseMcg, setDoseMcg] = useState(initial?.doseMcg ?? 500);
  const [kind, setKind] = useState<ScheduleKind>(initial?.schedule.kind ?? "interval-days");
  const [intervalDays, setIntervalDays] = useState(initial?.schedule.intervalDays ?? 7);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(initial?.schedule.daysOfWeek ?? [1]);
  const [timeOfDay, setTimeOfDay] = useState(initial?.schedule.timeOfDay ?? "09:00");
  const [startedAt, setStartedAt] = useState(() => initial?.startedAt ?? Date.now());
  const [cycleOn, setCycleOn] = useState(initial?.schedule.cycleWeeksOn ?? 0);
  const [cycleOff, setCycleOff] = useState(initial?.schedule.cycleWeeksOff ?? 0);
  const [sites, setSites] = useState<InjectionSite[]>(initial?.sites ?? []);

  // How the dose is decided. Three mutually exclusive answers, so one control
  // rather than a set of switches that could contradict each other.
  const [planMode, setPlanMode] = useState<PlanMode>(() => {
    if (initial?.phases?.length) return "phases";
    if (initial?.titration?.length) return "titration";
    return "fixed";
  });
  const [phases, setPhases] = useState<ProtocolPhase[]>(
    () => initial?.phases ?? [{ step: 1, doseMcg: initial?.doseMcg ?? 500, weeks: 4 }]);
  const [doseUnit, setDoseUnit] = useState<DoseUnit>(() =>
    (initial?.phases ?? []).some((p) => p.doseMcg >= 1000) ? "mg" : "mcg");

  // A saved protocol stores the titration steps, not the id of the plan they
  // came from, so the plan has to be recognised by its contents.
  const [titrationId, setTitrationId] = useState(() => {
    if (!initial?.titration?.length) return "";
    const owner = peptides.find((x) => x.id === initial.peptideId);
    const match = owner?.titrations?.find((t) => sameSteps(t.steps, initial.titration!));
    return match ? match.id : EXISTING_TITRATION;
  });

  const peptide = peptides.find((p) => p.id === peptideId);
  const titration = peptide?.titrations?.find((t) => t.id === titrationId);

  const usingPhases = planMode === "phases";
  const keepingExisting =
    planMode === "titration" && titrationId === EXISTING_TITRATION && !!initial?.titration?.length;

  const titrationSteps =
    planMode !== "titration"
      ? undefined
      : titration
        ? titration.steps
        : keepingExisting
          ? initial!.titration
          : undefined;
  const titrationAutoAdvance = titration ? true : keepingExisting ? initial!.titrationAutoAdvance : false;

  // Phases and titrations both fix the starting dose, so the plain dose field
  // has nothing left to decide and says so rather than accepting a contradiction.
  const lockedDose = usingPhases ? phases[0]?.doseMcg : titrationSteps?.[0]?.doseMcg;

  // Route is not asked about, so an unchanged peptide keeps whatever the
  // protocol was saved with and a changed one takes the new default.
  const route =
    initial && peptideId === initial.peptideId
      ? initial.route
      : (peptide?.routes[0] ?? "subcutaneous");

  const schedule: Schedule = useMemo(
    () => ({
      kind,
      intervalDays: kind === "interval-days" ? intervalDays : undefined,
      daysOfWeek: kind === "days-of-week" ? daysOfWeek : undefined,
      timeOfDay: kind === "as-needed" ? undefined : timeOfDay,
      cycleWeeksOn: cycleOn || undefined,
      cycleWeeksOff: cycleOff || undefined,
    }),
    [kind, intervalDays, daysOfWeek, timeOfDay, cycleOn, cycleOff]);

  /**
   * True when a saved protocol's timing is being moved. Adherence and progress
   * count expected doses by replaying the current schedule over past dates, so
   * this is the one edit that reaches backwards.
   */
  const rewritesHistory =
    !!initial &&
    (!sameSchedule(schedule, initial.schedule) ||
      startedAt !== initial.startedAt ||
      !samePhases(usingPhases ? phases : undefined, initial.phases));

  /**
   * The protocol as currently described by the form, so the projection below
   * answers "what would this do" while the dose and interval are still being
   * chosen. That is when the answer is worth having.
   */
  const draft: Protocol = useMemo(
    () => ({
      id: initial?.id ?? "draft",
      profileId: initial?.profileId ?? "draft",
      peptideId,
      name: name.trim() || "draft",
      active: initial?.active ?? true,
      startedAt,
      doseMcg: lockedDose ?? doseMcg,
      route,
      schedule,
      titration: titrationSteps,
      titrationAutoAdvance,
      phases: usingPhases ? phases : undefined,
    }),
    [
      initial,
      peptideId,
      name,
      startedAt,
      lockedDose,
      doseMcg,
      route,
      schedule,
      usingPhases,
      phases,
      titrationSteps,
      titrationAutoAdvance,
    ]);

  function pick(id: string) {
    setPeptideId(id);
    setTitrationId("");
    const p = peptides.find((x) => x.id === id);
    const range = p?.doseRanges[0];
    if (range) {
      setDoseMcg(Math.round((range.lowMcg + range.highMcg) / 2));
      // Match the schedule to how the compound is actually dosed.
      if (range.perWeek >= 7) {
        setKind("daily");
      } else if (range.perWeek > 0) {
        setKind("interval-days");
        setIntervalDays(Math.max(1, Math.round(7 / range.perWeek)));
      }
    }
  }

  return (
    <Card className="space-y-4 p-4">
      <SectionLabel>{initial ? "Edit protocol" : "New protocol"}</SectionLabel>

      <Field label="Peptide">
        <Select value={peptideId} onChange={(e) => pick(e.target.value)}>
          {peptides.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <AddCompoundInline onCreated={(p) => pick(p.id)} />
      </Field>

      <Field
        label="How the dose is decided"
        hint={
          planMode === "phases"
            ? "Your own bands of weeks. Each one can carry its own frequency as well as its own dose."
            : planMode === "titration"
              ? "A published escalation for this compound."
              : "One dose, held for as long as the protocol runs."
        }
      >
        <Segmented
          ariaLabel="Dose plan"
          options={[
            { value: "fixed", label: "Fixed" },
            { value: "titration", label: "Titration" },
            { value: "phases", label: "By weeks" },
          ]}
          value={planMode}
          onChange={setPlanMode}
          className="w-full"
        />
      </Field>

      {planMode === "titration" &&
        ((peptide?.titrations && peptide.titrations.length > 0) || keepingExisting ? (
          <Field
            label="Titration plan"
            hint={titration?.note ?? "Steps the dose up over time."}
          >
            <Select value={titrationId} onChange={(e) => setTitrationId(e.target.value)}>
              <option value="">No titration, fixed dose</option>
              {keepingExisting && (
                <option value={EXISTING_TITRATION}>
                  Keep the existing steps ({initial!.titration!.length} of them)
                </option>
              )}
              {peptide?.titrations?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <p className="text-[12.5px] text-[var(--muted)]">
            No published titration exists for {peptide?.name ?? "this compound"}. Build your own
            with By weeks, or keep a fixed dose.
          </p>
        ))}

      {usingPhases && (
        <Field label="The plan, week by week">
          <PhaseEditor
            phases={phases}
            onChange={setPhases}
            unit={doseUnit}
            onUnitChange={setDoseUnit}
            protocolSchedule={schedule}
          />
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {/*
          With a week by week plan the dose is the first band's, so a second
          disabled box showing the same figure in a different unit is one place
          too many to read it from. The bands are directly above.
        */}
        {!usingPhases && (
          <Field
            label={lockedDose !== undefined ? "Starting dose" : "Dose"}
            hint={
              lockedDose !== undefined
                ? `Set by the plan: ${formatDose(lockedDose)}`
                : peptide?.doseRanges[0]
                  ? `Typical: ${formatDose(peptide.doseRanges[0].lowMcg)}, ${formatDose(peptide.doseRanges[0].highMcg)}`
                  : undefined
            }
          >
            <NumberInput
              value={lockedDose ?? doseMcg}
              min={0}
              step={25}
              suffix="mcg"
              disabled={lockedDose !== undefined}
              onChange={(e) => setDoseMcg(Number(e.target.value))}
            />
          </Field>
        )}

        <Field label="Start date">
          <input
            type="date"
            value={toDateInput(startedAt)}
            onChange={(e) => setStartedAt(new Date(e.target.value).getTime())}
            className="w-full rounded border border-[var(--line)] bg-[var(--sunken)] px-3 py-2.5 text-[15px] text-[var(--ink)] focus:border-[var(--tangerine)] focus:outline-none"
          />
        </Field>
      </div>

      <Field
        label="How often"
        hint={
          usingPhases
            ? "The default for bands that do not set their own."
            : undefined
        }
      >
        <Segmented
          ariaLabel="Schedule type"
          options={[
            { value: "daily", label: "Daily" },
            { value: "interval-days", label: "Every N days" },
            { value: "days-of-week", label: "Set days" },
            { value: "as-needed", label: "As needed" },
          ]}
          value={kind}
          onChange={setKind}
          className="w-full"
        />
      </Field>

      {kind === "interval-days" && (
        <Field label="Interval">
          <NumberInput
            value={intervalDays}
            min={1}
            max={90}
            step={1}
            suffix="days"
            onChange={(e) => setIntervalDays(Number(e.target.value))}
          />
        </Field>
      )}

      {kind === "days-of-week" && (
        <Field label="Days">
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d, i) => {
              const on = daysOfWeek.includes(i);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setDaysOfWeek((prev) =>
                      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].sort())
                  }
                  className={`rounded px-3 py-2 text-[13px] transition-colors ${
                    on
                      ? "bg-[var(--tangerine)] font-medium text-[#12181a]"
                      : "border border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </Field>
      )}

      {kind !== "as-needed" && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Time of day">
            <input
              type="time"
              value={timeOfDay}
              onChange={(e) => setTimeOfDay(e.target.value)}
              className="w-full rounded border border-[var(--line)] bg-[var(--sunken)] px-3 py-2.5 text-[15px] text-[var(--ink)] focus:border-[var(--tangerine)] focus:outline-none"
            />
          </Field>
          <Field label="Weeks on" hint="Leave at 0 to run continuously.">
            <NumberInput
              value={cycleOn}
              min={0}
              max={52}
              onChange={(e) => setCycleOn(Number(e.target.value))}
            />
          </Field>
          <Field label="Weeks off">
            <NumberInput
              value={cycleOff}
              min={0}
              max={52}
              onChange={(e) => setCycleOff(Number(e.target.value))}
            />
          </Field>
        </div>
      )}

      <Field
        label="Sites you will rotate through"
        hint={
          sites.length
            ? `${sites.length} pinned. Logging will suggest the longest-rested of these, and you can still pick another.`
            : "Optional. Pin a few and logging rotates through just those, leave empty to use all ten."
        }
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="sm:w-44 sm:shrink-0">
            <SiteMap
              logs={[]}
              multi
              selected={sites}
              onSelect={(s) =>
                setSites((prev) =>
                  prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])
              }
            />
          </div>
          <div className="flex flex-1 flex-wrap gap-1.5 self-center">
            {INJECTION_SITES.map((s) => {
              const on = sites.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setSites((prev) =>
                      prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id])
                  }
                  className={`rounded px-2.5 py-1.5 text-[12.5px] transition-colors ${
                    on
                      ? "border border-[var(--leaf)] bg-[var(--leaf)]/15 text-[var(--ink)]"
                      : "border border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
            {sites.length > 0 && (
              <button
                type="button"
                onClick={() => setSites([])}
                className="px-2 py-1.5 text-[12.5px] text-[var(--faint)] underline hover:text-[var(--ink)]"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </Field>

      <Field label="Name it" hint="Something you will recognise in a list.">
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={peptide ? `${peptide.name} protocol` : "Protocol name"}
        />
      </Field>

      <ProjectionPreview protocol={draft} peptide={peptide} />

      {rewritesHistory && (
        <p className="rounded border border-[var(--line)] bg-[var(--sunken)] px-3 py-2.5 text-[12.5px] leading-snug text-[var(--muted)]">
          <span className="text-[var(--ink)]">This changes the past as well as the future.</span>{" "}
          Adherence and progress count the doses this schedule expects, replayed over dates that
          have already been and gone, so moving the timing moves those figures too. Your logged
          doses are untouched.
        </p>
      )}

      <div className="flex gap-2.5">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!peptideId}
          onClick={() =>
            onSave({
              peptideId,
              name: name.trim() || `${peptide?.name ?? "New"} protocol`,
              active: initial?.active ?? true,
              endedAt: initial?.endedAt,
              startedAt,
              doseMcg: lockedDose ?? doseMcg,
              route,
              schedule,
              titration: titrationSteps,
              titrationAutoAdvance,
              phases: usingPhases ? renumberPhases(phases) : undefined,
              sites: sites.length ? sites : undefined,
              notes: initial?.notes,
            })
          }
        >
          {initial ? "Save changes" : "Create protocol"}
        </Button>
      </div>
    </Card>
  );
}


/**
 * The next fortnight of scheduled doses, merged across every active protocol
 * and grouped by day, so you can see a heavy day coming before it arrives.
 */
function Upcoming() {
  const { protocols } = useProfileData();
  const custom = useStore((s) => s.customPeptides);
  const now = Date.now();

  const days = useMemo(() => {
    const to = endOfLocalDay(now + 13 * 86_400_000);
    const rows = protocols
      .filter((p) => p.active)
      .flatMap((p) =>
        protocolDoseTimesBetween(p, now, to).map((at) => ({
          at,
          name: findPeptide(custom, p.peptideId)?.name ?? p.peptideId,
          doseMcg: scheduledDoseMcg(p, at),
        })))
      .sort((a, b) => a.at - b.at);

    const map = new Map<number, typeof rows>();
    for (const r of rows) {
      const d = new Date(r.at);
      d.setHours(0, 0, 0, 0);
      const key = d.getTime();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [protocols, custom, now]);

  if (!days.length) return null;

  return (
    <Card className="p-4">
      <SectionLabel>Next two weeks</SectionLabel>
      <ul className="space-y-1">
        {days.map(([day, rows]) => (
          <li key={day} className="flex gap-3 rounded px-2 py-2 odd:bg-[var(--sunken)]/40">
            <span className="w-20 shrink-0 pt-0.5 text-[12px] text-[var(--faint)]">
              {formatWeekday(day)} {formatDate(day)}
            </span>
            <div className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-1">
              {rows.map((r, i) => (
                <span key={i} className="text-[13px] text-[var(--muted)]">
                  <span className="tnum font-mono text-[var(--faint)]">{formatTime(r.at)}</span>{" "}
                  <span className="text-[var(--ink)]">{r.name}</span>{" "}
                  <span className="tnum font-mono text-[var(--tangerine)]">
                    {formatDose(r.doseMcg)}
                  </span>
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
