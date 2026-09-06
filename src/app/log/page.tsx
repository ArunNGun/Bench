"use client";
import { useLang } from "@/lib/i18n";

import { useMemo, useState } from "react";
import { CalendarPlus, Pencil, Plus } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  EmptyState,
  Card,
  SectionLabel,
  Select,
  Stat,
  TONE_FG,
} from "@/components/ui";
import { LogDoseSheet } from "@/components/LogDoseSheet";
import { CheckInSheet } from "@/components/CheckInSheet";
import { SiteMap } from "@/components/SiteMap";
import { findPeptide, useStore, useProfileData } from "@/lib/store";
import { assignColors, colorSubjects, doseColor } from "@/lib/calc/palette";
import { adherence, logsForProtocol } from "@/lib/calc/schedule";
import { diaryDays, ratableDay } from "@/lib/calc/checkins";
import { overusedSites } from "@/lib/calc/sites";
import { formatDate, formatDose, formatDateTime, formatTime, percent, toDateInput, fromDateInput, trim } from "@/lib/format";
import { FEELING_TONE, lowestRatedTone, ratingTone } from "@/lib/calc/feeling";
import {
  FEELING_LABELS,
  INJECTION_SITES,
  SYMPTOMS,
  SYMPTOM_SCALE_MAX,
  type CheckIn,
} from "@/lib/types";

const DAY = 86_400_000;

/** The colour a day is marked with, from its worst rating that has a direction. */
function dayTone(checkIn: CheckIn) {
  return lowestRatedTone(
    SYMPTOMS.filter((s) => checkIn.ratings[s.id] != null).map((s) => ({
      rating: checkIn.ratings[s.id]!,
      higherIsBetter: s.higherIsBetter,
    })));
}

export default function LogPage() {
  const hydrated = useStore((s) => s.hydrated);
  const { t } = useLang();
  const { protocols, logs, checkIns } = useProfileData();
  const custom = useStore((s) => s.customPeptides);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | undefined>();
  const [filter, setFilter] = useState("");
  /** The day whose rating is being edited, or null when the sheet is shut. */
  const [ratingDay, setRatingDay] = useState<number | null>(null);

  const now = Date.now();
  const shown = useMemo(
    () => (filter ? logs.filter((l) => l.peptideId === filter) : logs),
    [logs, filter]);

  const overused = useMemo(() => overusedSites(shown, now), [shown, now]);

  const peptideIds = useMemo(() => [...new Set(logs.map((l) => l.peptideId))], [logs]);

  /**
   * The same colours as the chart on Today and the plan on Plan.
   *
   * Built from the active protocols, which is what those two screens colour,
   * so a compound is one colour wherever it appears. The Log is history and
   * reaches back further than any of them: a dose taken before a protocol
   * existed, or after it was deleted, simply gets no colour. That is the point
   * rather than a gap, since a colour here is a claim that this is the same
   * compound as the mint line on Today.
   */
  const palette = useMemo(
    () => assignColors(colorSubjects(protocols.filter((p) => p.active), (id) => findPeptide(custom, id), now)),
    [protocols, custom, now]);

  const stats = useMemo(() => {
    const thirtyDays = logs.filter((l) => l.at > now - 30 * DAY);
    const rates = protocols
      .filter((p) => p.active)
      .map((p) =>
        adherence(
          p,
          logsForProtocol(p, logs),
          Math.max(p.startedAt, now - 30 * DAY),
          now));
    const expected = rates.reduce((s, r) => s + r.expected, 0);
    const taken = rates.reduce((s, r) => s + r.taken, 0);
    return {
      recent: thirtyDays.filter((l) => !l.skipped).length,
      skipped: thirtyDays.filter((l) => l.skipped).length,
      adherenceRate: expected > 0 ? taken / expected : null,
    };
  }, [logs, protocols, now]);

  /*
   * A day at a time: what was taken, and how the day went.
   *
   * The rating and its note belong here rather than on a screen of their own.
   * Someone asking which night the side effects were is asking a question
   * about a day, and the answer is more use beside the doses of that day than
   * away from them.
   *
   * Filtering by compound leaves them out on purpose. A check-in belongs to a
   * day and not to a compound, so repeating every one of them under a filtered
   * list would be padding rather than an answer.
   */
  const grouped = useMemo(
    () => diaryDays(shown, filter ? [] : checkIns),
    [shown, checkIns, filter]);

  if (!hydrated) {
    return <div className="py-20 text-center text-[14px] text-[var(--faint)]">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight text-[var(--ink)]">{t("log_title")}</h1>
          <p className="mt-1 text-[13.5px] text-[var(--muted)]">Every dose, and how each day went.</p>
        </div>
        <Button variant="primary" onClick={() => { setEditId(undefined); setOpen(true); }}>
          <Plus size={16} /> {t("log_new_dose")}
        </Button>
      </header>

      {logs.length > 0 && (
        <Card className="grid grid-cols-3 gap-4 p-4">
          <Stat label="Doses, 30 days" value={stats.recent} />
          <Stat label="Skipped" value={stats.skipped} tone={stats.skipped > 0 ? "rose" : "neutral"} />
          <Stat
            label="Adherence"
            value={stats.adherenceRate == null ? "n/a" : percent(stats.adherenceRate)}
            tone={
              stats.adherenceRate == null
                ? "neutral"
                : stats.adherenceRate >= 0.9
                  ? "leaf"
                  : stats.adherenceRate >= 0.7
                    ? "tangerine"
                    : "rose"
            }
            hint="Scheduled doses logged in the last 30 days."
          />
        </Card>
      )}

      {logs.some((l) => l.site) && (
        <Card className="p-4">
          <SectionLabel>{t("log_site_rotation")}</SectionLabel>
          <SiteMap logs={shown} nowMs={now} />
          {overused.length > 0 && (
            <Callout tone="warn" className="mt-3">
              {overused.map((s) => s.label).join(", ")}{" "}
              {overused.length === 1 ? "has" : "have"} taken {overused[0].recentCount}+ injections in
              the last two weeks. Repeatedly hitting one spot builds up firm tissue that absorbs
              erratically, so the same dose stops delivering the same exposure, give these a rest.
            </Callout>
          )}
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {peptideIds.length > 1 && (
          <Select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter by peptide"
            className="flex-1"
          >
            <option value="">All peptides</option>
            {peptideIds.map((id) => (
              <option key={id} value={id}>
                {findPeptide(custom, id)?.name ?? id}
              </option>
            ))}
          </Select>
        )}

        {/*
          A day with no dose and no rating is not in the list, so there is
          nothing to tap. Filling in the gaps instead was the other option and
          would have buried anyone injecting weekly under six blank rows a week.
          A date field reaches any day and costs one line.

          Bounded at today by the input and again by the store, because `max` on
          a date field is a hint to a picker and not a rule about what can be
          typed.
        */}
        <label className="ml-auto flex items-center gap-2 text-[12.5px] text-[var(--muted)]">
          <CalendarPlus size={15} className="shrink-0" />
          <span className="whitespace-nowrap">Rate another day</span>
          <input
            type="date"
            max={toDateInput(now)}
            value=""
            onChange={(e) => {
              // Cleared rather than picked. `fromDateInput` answers "now" for
              // anything it cannot read, which would open today's sheet on a
              // field being emptied.
              if (!e.target.value) return;
              const day = ratableDay(fromDateInput(e.target.value), now);
              if (day != null) setRatingDay(day);
            }}
            aria-label="Rate a day by date"
            className="rounded-[var(--r-btn)] border border-[var(--line)] bg-[var(--card)] px-2.5 py-1.5 text-[13px] text-[var(--ink)]"
          />
        </label>
      </div>

      {!grouped.length ? (
        <EmptyState
          title={t("log_no_logs")}
          action={
            <Button variant="primary" onClick={() => { setEditId(undefined); setOpen(true); }}>
              Log your first dose
            </Button>
          }
        >
          Logged doses drive the plasma curves on the Now page and the adherence figure above.
        </EmptyState>
      ) : (
        <div className="space-y-5">
          {grouped.map(({ day, entries, checkIn }) => {
            /*
              The worst rating of the day, on the edge of the row. "Which night
              was it" is then answered by looking rather than by reading, which
              is the complaint this whole section exists to answer.
            */
            const tone = checkIn ? dayTone(checkIn) : null;

            return (
            <section key={day}>
              <SectionLabel>
                {day === startOfToday() ? "Today" : formatDate(day)}
              </SectionLabel>
              <div className="space-y-1.5">
                {entries.map((l) => {
                  const p = findPeptide(custom, l.peptideId);
                  const color = doseColor(palette, l);
                  const siteLabel = INJECTION_SITES.find((s) => s.id === l.site)?.label;
                  return (
                    <Card
                      key={l.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Edit dose logged ${formatDateTime(l.at)}`}
                      onClick={() => {
                        setEditId(l.id);
                        setOpen(true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setEditId(l.id);
                          setOpen(true);
                        }
                      }}
                      className="press flex cursor-pointer items-start gap-3 p-3 hover:shadow-[var(--shadow-md)]"
                    >
                      <span className="tnum w-14 shrink-0 pt-0.5 font-mono text-[12.5px] text-[var(--faint)]">
                        {formatTime(l.at)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="flex items-center gap-1.5">
                            {color && (
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ background: color }}
                              />
                            )}
                            <span
                              className="text-[14px] font-medium"
                              style={color ? { color } : { color: "var(--ink)" }}
                            >
                              {p?.name ?? l.peptideId}
                            </span>
                          </span>
                          {l.skipped ? (
                            <Badge tone="rose">skipped</Badge>
                          ) : (
                            /*
                              Neutral, not tangerine. Tangerine is one of the six
                              compound colours, so an amount painted with it sat
                              next to a compound wearing the same colour for a
                              different reason. The colour says which compound,
                              the figure says how much, the same division the
                              plan on Plan settled on.
                            */
                            <span className="tnum font-mono text-[13.5px] text-[var(--ink)]">
                              {formatDose(l.doseMcg)}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-[var(--muted)]">
                          {l.units != null && !l.skipped && (
                            <span className="tnum font-mono">
                              {trim(l.units, 2)} marks
                              {l.syringeScale === "U40" ? " (U-40)" : ""}
                            </span>
                          )}
                          {siteLabel && (
                            <span className="font-medium text-[var(--ink)]">{siteLabel}</span>
                          )}
                        </div>
                        {/*
                          What was tapped, not only what was typed.

                          The log sheet offers a row of common side effects and
                          a feeling rating, stored them faithfully, and showed
                          them nowhere afterwards. That is worse than not
                          offering them: someone recording nausea by tapping it
                          reasonably believes they have recorded it.
                        */}
                        {(l.feeling != null || l.sideEffects?.length) && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {l.feeling != null && (
                              <Badge tone={FEELING_TONE[l.feeling] ?? "neutral"}>
                                {FEELING_LABELS[l.feeling] ?? `Feeling ${l.feeling}`}
                              </Badge>
                            )}
                            {l.sideEffects?.map((effect) => (
                              <Badge key={effect} tone="neutral">
                                {effect}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {l.notes && (
                          <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--muted)]">
                            {l.notes}
                          </p>
                        )}
                      </div>

                    </Card>
                  );
                })}

                {/*
                  How the day went, under what was taken that day.

                  Quieter than a dose: this is not a record of something that
                  entered the body, and a row that shouted would make the log
                  harder to read for the sake of a line of text. Loud enough to
                  find, which is the whole complaint it answers.
                */}
                {checkIn ? (
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`Edit how ${formatDate(day)} went`}
                    onClick={() => setRatingDay(day)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setRatingDay(day);
                      }
                    }}
                    className="press group cursor-pointer rounded-[var(--r-inner)] border border-dashed border-[var(--line)] px-3 py-2.5 hover:border-[var(--faint)]"
                    style={tone ? { borderLeft: `3px solid ${TONE_FG[tone]}` } : undefined}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11.5px] font-semibold uppercase tracking-wide text-[var(--faint)]">
                        How the day went
                      </span>
                      {SYMPTOMS.filter((s) => checkIn.ratings[s.id] != null).map((s) => (
                        <Badge key={s.id} tone={ratingTone(checkIn.ratings[s.id]!, s.higherIsBetter)}>
                          {s.label} {checkIn.ratings[s.id]}/{SYMPTOM_SCALE_MAX}
                        </Badge>
                      ))}
                      <Pencil
                        size={12}
                        strokeWidth={2.4}
                        className="ml-auto text-[var(--faint)] group-hover:text-[var(--muted)]"
                      />
                    </div>
                    {checkIn.notes && (
                      <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--ink)]">
                        {checkIn.notes}
                      </p>
                    )}
                  </div>
                ) : (
                  /*
                    A day with doses and no rating. Quiet enough to ignore while
                    reading the log, and there because the alternative is asking
                    someone to remember that a day can be rated at all once it is
                    no longer today.
                  */
                  <button
                    type="button"
                    onClick={() => setRatingDay(day)}
                    className="press w-full rounded-[var(--r-inner)] border border-dashed border-[var(--line)] px-3 py-2 text-left text-[12px] text-[var(--faint)] hover:border-[var(--faint)] hover:text-[var(--muted)]"
                  >
                    Rate how this day went
                  </button>
                )}
              </div>
            </section>
            );
          })}
        </div>
      )}

      <CheckInSheet dayMs={ratingDay} onClose={() => setRatingDay(null)} />

      <LogDoseSheet
        open={open}
        editId={editId}
        onClose={() => {
          setOpen(false);
          setEditId(undefined);
        }}
      />
    </div>
  );
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
