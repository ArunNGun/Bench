"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Pause, Play, Plus, Trash2 } from "lucide-react";
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
  dosesPerWeek,
  doseTimesBetween,
  endOfLocalDay,
  nextDoseTime,
  scheduledDoseMcg,
  titrationStepAt,
} from "@/lib/calc/schedule";
import { formatDose, formatDate, formatWeekday, formatTime, relativeTime, toDateInput, trim } from "@/lib/format";
import { INJECTION_SITES, type InjectionSite, type Protocol, type Schedule, type ScheduleKind } from "@/lib/types";
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
        <Button variant="primary" onClick={() => setAdding(true)}>
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
          const peptide = findPeptide(custom, p.peptideId);
          const target = scheduledDoseMcg(p, now);
          const next = p.active ? nextDoseTime(p.schedule, p.startedAt, now, p.endedAt) : null;
          const step = p.titration?.length ? titrationStepAt(p.titration, p.startedAt, now) : null;

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
                    {step && (
                      <Badge tone="sky">
                        step {step.index + 1} of {p.titration!.length}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-[13px] text-[var(--muted)]">{p.name}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
                    <span className="tnum font-mono text-[var(--tangerine)]">{formatDose(target)}</span>
                    <span className="text-[var(--muted)]">{describeSchedule(p.schedule)}</span>
                    <span className="text-[var(--faint)]">
                      {trim(dosesPerWeek(p.schedule), 2)} per week
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

              {p.titration && p.titration.length > 0 && (
                <div className="mt-3.5 border-t border-[var(--line)] pt-3">
                  <div className="flex gap-1">
                    {p.titration.map((s, i) => (
                      <div
                        key={s.step}
                        title={`${formatDose(s.doseMcg)} for ${s.weeks} week${s.weeks === 1 ? "" : "s"}`}
                        className={`h-1.5 flex-1 rounded-full ${
                          step && i <= step.index ? "bg-[var(--tangerine)]" : "bg-[var(--line)]"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="mt-2 text-[12px] text-[var(--faint)]">
                    {p.titrationAutoAdvance
                      ? "Dose advances automatically with the plan."
                      : "Fixed dose, the plan is shown for reference only."}
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

function ProtocolForm({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: (p: Omit<Protocol, "id" | "profileId">) => void;
}) {
  const custom = useStore((s) => s.customPeptides);
  const peptides = useMemo(() => allPeptides(custom), [custom]);

  const [peptideId, setPeptideId] = useState(peptides[0]?.id ?? "");
  const [name, setName] = useState("");
  const [doseMcg, setDoseMcg] = useState(500);
  const [kind, setKind] = useState<ScheduleKind>("interval-days");
  const [intervalDays, setIntervalDays] = useState(7);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1]);
  const [timeOfDay, setTimeOfDay] = useState("09:00");
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [cycleOn, setCycleOn] = useState(0);
  const [cycleOff, setCycleOff] = useState(0);
  const [titrationId, setTitrationId] = useState("");
  const [sites, setSites] = useState<InjectionSite[]>([]);

  const peptide = peptides.find((p) => p.id === peptideId);
  const titration = peptide?.titrations?.find((t) => t.id === titrationId);

  /**
   * The protocol as currently described by the form, so the projection below
   * answers "what would this do" while the dose and interval are still being
   * chosen. That is when the answer is worth having.
   */
  const draft: Protocol = useMemo(
    () => ({
      id: "draft",
      profileId: "draft",
      peptideId,
      name: name.trim() || "draft",
      active: true,
      startedAt,
      doseMcg: titration ? titration.steps[0].doseMcg : doseMcg,
      route: peptide?.routes[0] ?? "subcutaneous",
      schedule: {
        kind,
        intervalDays: kind === "interval-days" ? intervalDays : undefined,
        daysOfWeek: kind === "days-of-week" ? daysOfWeek : undefined,
        timeOfDay: kind === "as-needed" ? undefined : timeOfDay,
        cycleWeeksOn: cycleOn || undefined,
        cycleWeeksOff: cycleOff || undefined,
      },
      titration: titration?.steps,
      titrationAutoAdvance: !!titration,
    }),
    [
      peptideId,
      name,
      startedAt,
      titration,
      doseMcg,
      peptide,
      kind,
      intervalDays,
      daysOfWeek,
      timeOfDay,
      cycleOn,
      cycleOff,
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
      <SectionLabel>New protocol</SectionLabel>

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

      {peptide?.titrations && peptide.titrations.length > 0 && (
        <Field
          label="Titration plan"
          hint={titration?.note ?? "Optional. Steps the dose up over time."}
        >
          <Select value={titrationId} onChange={(e) => setTitrationId(e.target.value)}>
            <option value="">No titration, fixed dose</option>
            {peptide.titrations.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={titration ? "Starting dose" : "Dose"}
          hint={
            titration
              ? `Set by the plan: ${formatDose(titration.steps[0].doseMcg)}`
              : peptide?.doseRanges[0]
                ? `Typical: ${formatDose(peptide.doseRanges[0].lowMcg)}, ${formatDose(peptide.doseRanges[0].highMcg)}`
                : undefined
          }
        >
          <NumberInput
            value={titration ? titration.steps[0].doseMcg : doseMcg}
            min={0}
            step={25}
            suffix="mcg"
            disabled={!!titration}
            onChange={(e) => setDoseMcg(Number(e.target.value))}
          />
        </Field>

        <Field label="Start date">
          <input
            type="date"
            value={toDateInput(startedAt)}
            onChange={(e) => setStartedAt(new Date(e.target.value).getTime())}
            className="w-full rounded border border-[var(--line)] bg-[var(--sunken)] px-3 py-2.5 text-[15px] text-[var(--ink)] focus:border-[var(--tangerine)] focus:outline-none"
          />
        </Field>
      </div>

      <Field label="How often">
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
              active: true,
              startedAt,
              doseMcg: titration ? titration.steps[0].doseMcg : doseMcg,
              route: peptide?.routes[0] ?? "subcutaneous",
              schedule: {
                kind,
                intervalDays: kind === "interval-days" ? intervalDays : undefined,
                daysOfWeek: kind === "days-of-week" ? daysOfWeek : undefined,
                timeOfDay: kind === "as-needed" ? undefined : timeOfDay,
                cycleWeeksOn: cycleOn || undefined,
                cycleWeeksOff: cycleOff || undefined,
              },
              titration: titration?.steps,
              titrationAutoAdvance: !!titration,
              sites: sites.length ? sites : undefined,
            })
          }
        >
          Create protocol
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
        doseTimesBetween(p.schedule, p.startedAt, now, to, p.endedAt).map((at) => ({
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
