"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Flame, Plus, Sparkles, Syringe as SyringeIcon, Undo2 } from "lucide-react";
import { PkChart, type PkSeries } from "@/components/PkChart";
import { PkReadout } from "@/components/PkReadout";
import {
  Badge,
  Button,
  Callout,
  Card,
  IconChip,
  Meter,
  ProgressRing,
  Rich,
  SectionLabel,
  TONE_BG,
  TONE_FG,
  type Tone,
} from "@/components/ui";
import { findPeptide, stockFor, useStore, useProfileData } from "@/lib/store";
import {
  curveFor,
  isMeasuredInPeople,
  snapshot,
  type DoseEvent,
  type PhaseId,
} from "@/lib/calc/pk";
import { toDisplayWeight } from "@/lib/calc/outcomes";
import {
  dosesPerDoseDay,
  dueStatus,
  type DueLabel,
  endOfLocalDay,
  phaseSpanAt,
  logsForProtocol,
  protocolDosesPerWeek,
  scheduledDoseMcg,
  startOfLocalDay,
  unloggedDoseTimes,
} from "@/lib/calc/schedule";
import { daysOfSupplyForProtocol, vialConcentration } from "@/lib/calc/inventory";
import { suggestSite } from "@/lib/calc/sites";
import {
  currentStreak,
  recentDays,
  steadyStateProgress,
  todayProgress,
  weeklyExposure,
} from "@/lib/calc/progress";
import { decomposeDose, isBlend, modellableComponents } from "@/lib/calc/blend";
import { assignColors, colorSubjects, toneFor } from "@/lib/calc/palette";
import { hoursSince, timelinePhaseAt } from "@/lib/calc/phase";
import { BlendBreakdown } from "@/components/BlendBreakdown";
import {
  describeHalfLifeEstimate,
  formatConcentration,
  formatDate,
  formatDose,
  formatDosePerDay,
  formatDuration,
  formatHalfLife,
  formatTime,
  formatWeekday,
  relativeTime,
} from "@/lib/format";
import { LogDoseSheet } from "@/components/LogDoseSheet";
import { translate, useLang, useLangStore, type TranslationKey } from "@/lib/i18n";
import { WeightCard } from "@/components/WeightCard";
import { CheckInCard } from "@/components/CheckInCard";
import { StackWarnings } from "@/components/StackWarnings";
import { LabsCard } from "@/components/LabsCard";
import { HistoryWithoutPlan } from "@/components/HistoryWithoutPlan";
import { BackupNag } from "@/components/BackupNag";
import { DoseMarks } from "@/components/DoseMarks";
import {
  INJECTION_SITES,
  type DoseLog,
  type HalfLifeEstimate,
  type Protocol,
} from "@/lib/types";

const DAY = 86_400_000;

/** The calc layer names a state; the page is where it becomes a word. */
const DUE_KEY: Record<DueLabel, TranslationKey> = {
  paused: "due_paused",
  "due-now": "due_now",
  overdue: "due_overdue",
  none: "due_none",
  "due-today": "due_today",
  scheduled: "due_scheduled",
};

const CURVE_KEY: Record<PhaseId, TranslationKey> = {
  cleared: "curve_cleared",
  peak: "curve_peak",
  absorbing: "curve_absorbing",
  active: "curve_active",
  trailing: "curve_trailing",
};

const CURVE_DETAIL_KEY: Record<PhaseId, TranslationKey> = {
  cleared: "curve_cleared_detail",
  peak: "curve_peak_detail",
  absorbing: "curve_absorbing_detail",
  active: "curve_active_detail",
  trailing: "curve_trailing_detail",
};

export default function NowPage() {
  const hydrated = useStore((s) => s.hydrated);
  const { t } = useLang();
  const lang = useLangStore((s) => s.lang);
  const { protocols, logs, vials, measurements } = useProfileData();
  const custom = useStore((s) => s.customPeptides);
  const overrides = useStore((s) => s.halfLifeOverrides);
  const settings = useStore((s) => s.settings);
  const addLog = useStore((s) => s.addLog);
  const removeLog = useStore((s) => s.removeLog);

  // Lets a one-tap log be undone without hunting through the Log page.
  const [lastQuickLog, setLastQuickLog] = useState<{ id: string; name: string } | null>(null);

  // A ticking clock, so "due in 3 hours" stays honest without a refresh.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  /**
   * The moment the chart is being asked about, or null for none.
   *
   * Null rather than "now" so that letting go of the chart returns the
   * readout to the present instead of leaving it stuck wherever the pointer
   * happened to stop.
   */
  const [pickedMs, setPickedMs] = useState<number | null>(null);

  /**
   * Names the vial behind a dose, for the chart readout.
   *
   * Lives here rather than in the chart because components render and do not
   * read the store. Returns null rather than a guess when the vial has since
   * been deleted, or when the dose was logged without one, which is true of
   * anything recorded before vials were tracked at all.
   *
   * The strength reported is the vial's basis as it stands today. Topping one
   * up with more diluent rewrites that basis, so a dose drawn before a top up
   * reads at the concentration the vial has now, not the one it had in the
   * syringe. The note under the chart says so.
   */
  const describeVial = useCallback(
    (vialId: string) => {
      const vial = vials.find((v) => v.id === vialId);
      if (!vial) return null;

      const conc = vialConcentration(vial);
      const name = findPeptide(custom, vial.peptideId)?.name ?? vial.peptideId;
      return {
        label: `${name} vial`,
        concentration: Number.isFinite(conc)
          ? formatConcentration(conc)
          : translate(lang, "now_not_reconstituted"),
      };
    },
    [vials, custom, lang]);
  const [logOpen, setLogOpen] = useState(false);
  const [logPeptideId, setLogPeptideId] = useState<string | undefined>();
  /** `${protocolId}:${scheduledAt}` of a later dose whose Taken button is asking. */
  const [confirmEarly, setConfirmEarly] = useState<string | null>(null);

  const active = useMemo(() => protocols.filter((p) => p.active), [protocols]);

  /**
   * One colour per line, and per protocol, agreed with the Plan screen.
   *
   * Built from every active protocol rather than only the ones that can be
   * drawn: a compound with no half-life still appears in a plan, and if it took
   * no colour here the two screens would count differently from the first one
   * you owned.
   */
  const palette = useMemo(
    () => assignColors(colorSubjects(active, (id) => findPeptide(custom, id), now)),
    [active, custom, now]);

  const tracks = useMemo(() => {
    return active.map((protocol) => {
      const peptide = findPeptide(custom, protocol.peptideId);
      const protocolLogs = logs.filter(
        (l) => !l.skipped && (l.protocolId === protocol.id || l.peptideId === protocol.peptideId));
      const doses: DoseEvent[] = protocolLogs.map((l) => ({
        at: l.at,
        amountMcg: l.doseMcg,
        vialId: l.vialId,
      }));
      const lastLog = protocolLogs.length
        ? protocolLogs.reduce((a, b) => (b.at > a.at ? b : a))
        : null;
      const lastLoggedAt = lastLog?.at ?? null;

      const targetMcg = scheduledDoseMcg(protocol, now);
      const due = dueStatus(protocol, now, { lastLoggedAt });
      const stock = stockFor(vials, protocol.peptideId, targetMcg, now);

      /**
       * What "100% of a single-dose peak" is measured against.
       *
       * The curve is built from doses that were actually logged, so the
       * yardstick has to come from the same place. Using the scheduled dose
       * mixed the plan with reality: editing a running protocol from 2 mg down
       * to 1 mg doubled the reading overnight, because every logged 2 mg dose
       * was suddenly being compared against a 1 mg reference, and nothing in
       * the body had changed at all. Falls back to the plan only when there is
       * nothing logged to measure against.
       */
      const referenceMcg = lastLog?.doseMcg || targetMcg || 1;

      // A blend is not one compound, split it so each component can be
      // modelled on its own half-life instead of the whole thing going dark.
      const blendParts =
        peptide && isBlend(peptide)
          ? decomposeDose(
              peptide,
              targetMcg,
              (id) => findPeptide(custom, id),
              protocolDosesPerWeek(protocol, now))
          : [];

      const curve = peptide ? curveFor(peptide, overrides?.[peptide.id]) : null;

      /**
       * The reading, withheld from an estimated curve on purpose.
       *
       * A snapshot is a set of claims about a level: what percentage of a peak
       * is on board, which phase that puts you in, how long until it clears. A
       * curve fitted to four hours measured in dogs given it intravenously
       * cannot support any of that about a person injecting it under the skin.
       * The shape is worth drawing and the numbers are not worth stating, so
       * the card shows nothing rather than something precise and unfounded.
       */
      const snap =
        curve && isMeasuredInPeople(curve.basis)
          ? snapshot(now, doses, curve.params, referenceMcg)
          : null;

      return {
        protocol,
        peptide,
        doses,
        targetMcg,
        referenceMcg,
        due,
        stock,
        snap,
        blendParts,
        curve,
        lastLog,
        lastLoggedAt,
        // What the compound is doing right now, in words.
        phase: peptide ? timelinePhaseAt(peptide, hoursSince(lastLoggedAt, now) ?? -1) : null,
        supplyDays: daysOfSupplyForProtocol(stock, protocol, now),
        // Injections a dose day holds, for the screens that describe the plan
        // rather than the next dose.
        perDay: dosesPerDoseDay(phaseSpanAt(protocol, now)?.schedule ?? protocol.schedule),
        color: palette.byProtocol.get(protocol.id),
        // The card accent is the compound's colour, not a sixth name counted
        // out separately. Counting separately is what let a chip and its own
        // line disagree as soon as a blend took two colours.
        tone: (toneFor(palette.byProtocol.get(protocol.id)) ?? "neutral") as Tone,
      };
    });
  }, [active, logs, vials, custom, overrides, palette, now]);

  const series: PkSeries[] = useMemo(() => {
    const out: Omit<PkSeries, "color">[] = [];

    for (const track of tracks) {
      const parts = modellableComponents(track.blendParts);

      // Prefer per-component curves for a blend even when the blend itself
      // carries an aggregate half-life: two components with 177 h and 161 h
      // say more than one averaged 170 h line.
      if (parts.length) {
        for (const part of parts) {
          out.push({
            id: `${track.protocol.id}:${part.peptideId ?? part.name}`,
            label: `${part.name} · in ${track.peptide!.name}`,
            doses: track.doses.map((d) => ({ at: d.at, amountMcg: d.amountMcg * part.fraction })),
            params: {
              halfLifeHours: part.peptide!.halfLifeHours!,
              tmaxHours: part.peptide!.tmaxHours,
            },
            referenceMcg: part.mcg || 1,
          });
        }
        continue;
      }

      if (track.curve) {
        out.push({
          id: track.protocol.id,
          label: track.peptide!.name,
          doses: track.doses,
          params: track.curve.params,
          referenceMcg: track.referenceMcg,
          basis: track.curve.basis,
        });
      }
    }

    /*
     * Coloured from the shared assignment rather than by position here, so the
     * plan on the other screen names the same compound in the same colour. A
     * line whose key is missing cannot happen, since the assignment is built
     * from the same tracks, but a visible fallback beats an invisible line.
     */
    return out.map((s) => ({ ...s, color: palette.byKey.get(s.id) ?? "var(--faint)" }));
  }, [tracks, palette]);

  /**
   * Components that are genuinely in you but cannot be drawn, because no
   * half-life has ever been published for them. Naming them stops the chart
   * looking like it forgot half the blend.
   */
  const unplotted = useMemo(() => {
    const names = new Set<string>();
    for (const track of tracks) {
      for (const part of track.blendParts) {
        if (!part.peptide || !curveFor(part.peptide, overrides?.[part.peptide.id])) {
          names.add(part.name);
        }
      }
      if (!track.blendParts.length && track.peptide && !track.curve) {
        names.add(track.peptide.name);
      }
    }
    return [...names];
  }, [tracks, overrides]);

  /**
   * The lines that are drawn from a measurement made elsewhere, and what that
   * measurement was. Stated on the card next to the chart rather than left for
   * the library page, since the person reading the curve is here.
   */
  const estimatedFrom = useMemo(() => {
    const out: { id: string; text: string; evidence: HalfLifeEstimate["evidence"] }[] = [];
    for (const track of tracks) {
      const e = track.peptide?.halfLifeEstimate;
      if (!track.curve || isMeasuredInPeople(track.curve.basis)) continue;

      if (track.curve.basis === "yours") {
        const mine = overrides?.[track.peptide!.id];
        if (!mine) continue;
        out.push({
          id: track.protocol.id,
          text: translate(lang, "now_drawn_from_yours", {
            name: track.peptide!.name,
            hours: formatHalfLife(mine.hours),
            note: mine.note ? ` (${mine.note})` : "",
          }),
          evidence: "anecdotal" as const,
        });
        continue;
      }

      if (!e) continue;
      out.push({
        id: track.protocol.id,
        text: translate(lang, "now_estimate_line", {
          name: track.peptide!.name,
          detail: describeHalfLifeEstimate(e),
        }),
        evidence: e.evidence,
      });
    }
    return out;
  }, [tracks, overrides, lang]);

  const needsAttention = tracks.filter(
    (track) => track.due.state === "overdue" || track.due.state === "due-now");

  /**
   * The rest of today, in order.
   *
   * Built from the day's remaining scheduled times rather than from `due`,
   * which knows only the next dose per protocol. A compound taken morning and
   * evening has an evening dose whether or not the morning one is still
   * outstanding, and that is exactly the morning this was written on.
   *
   * A dose already shown above is left out rather than listed twice: as its
   * hour arrives it stops appearing here and appears there, which is the same
   * row moving up the page rather than two rows disagreeing.
   */
  const laterToday = useMemo(() => {
    const end = endOfLocalDay(now);
    const shownAbove = new Set(
      tracks
        .filter((track) => track.due.state === "overdue" || track.due.state === "due-now")
        .map((track) => `${track.protocol.id}:${track.due.at}`));

    return tracks
      .flatMap((track) =>
        unloggedDoseTimes(track.protocol, logsForProtocol(track.protocol, logs), now, end)
          .filter((at) => !shownAbove.has(`${track.protocol.id}:${at}`))
          .map((at) => ({ track, at })))
      .sort((a, b) => a.at - b.at);
  }, [tracks, logs, now]);
  const lowStock = tracks.filter(
    (track) => track.stock.dosesRemaining <= settings.lowStockDoses && track.targetMcg > 0);
  const expiringVials = vials.filter(
    (v) =>
      v.state === "reconstituted" &&
      v.budAt != null &&
      v.budAt - now < settings.budWarningDays * DAY);

  if (!hydrated) {
    return <div className="py-20 text-center text-[14px] text-[var(--faint)]">{t("now_loading")}</div>;
  }

  if (!protocols.length) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <TodayCard protocols={protocols} logs={logs} now={now} />
        <BackupNag />
        <HistoryWithoutPlan nowMs={now} />
        <WeightCard nowMs={now} />
        <CheckInCard nowMs={now} />
        <LabsCard />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <TodayCard protocols={protocols} logs={logs} now={now} />


      <BackupNag />

      <StackWarnings nowMs={now} compact />

      {lastQuickLog && (
        <Card className="flex flex-wrap items-center gap-3 border-[var(--leaf)]/45 p-3">
          <Check size={16} className="text-[var(--leaf)]" />
          <span className="flex-1 text-[13.5px] text-[var(--ink)]">
            {t("now_quick_logged_note", { name: lastQuickLog.name })}
          </span>
          <Button
            variant="ghost"
            onClick={() => {
              removeLog(lastQuickLog.id);
              setLastQuickLog(null);
            }}
          >
            <Undo2 size={15} /> {t("now_undo")}
          </Button>
          <Button variant="ghost" onClick={() => setLastQuickLog(null)}>
            {t("dismiss")}
          </Button>
        </Card>
      )}

      {needsAttention.length > 0 && (
        <div className="space-y-2.5">
          {needsAttention.map((track) => (
            <Card
              key={track.protocol.id}
              className={`flex flex-wrap items-center gap-3 p-3.5 ${
                track.due.state === "overdue" ? "border-[var(--rose)]/45" : "border-[var(--tangerine)]/45"
              }`}
            >
              <Badge tone={track.due.state === "overdue" ? "rose" : "tangerine"}>{t(DUE_KEY[track.due.label])}</Badge>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-[14px]">
                  {track.color && (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: track.color }}
                    />
                  )}
                  <span className="truncate font-medium" style={{ color: track.color ?? "var(--ink)" }}>
                    {track.peptide?.name ?? track.protocol.peptideId}
                  </span>
                  <span className="tnum font-mono text-[13px] text-[var(--ink)]">
                    {formatDose(track.targetMcg)}
                  </span>
                  <DoseMarks
                    peptideId={track.protocol.peptideId}
                    doseMcg={track.targetMcg}
                    nowMs={now}
                    route={track.protocol.route}
                    className="text-[12px] text-[var(--faint)]"
                  />
                </div>
                <div className="text-[12px] text-[var(--muted)]">
                  {track.due.at != null &&
                    (track.due.state === "overdue"
                      ? t("now_was_due", { when: relativeTime(track.due.at, now) })
                      : t("now_scheduled_at", { when: relativeTime(track.due.at, now) }))}
                </div>
              </div>
              <div className="flex gap-1.5">
                <Button
                  variant="primary"
                  title={t("now_log_with_site", { dose: formatDose(track.targetMcg) })}
                  onClick={() => {
                    const id = addLog({
                      peptideId: track.protocol.peptideId,
                      protocolId: track.protocol.id,
                      at: Date.now(),
                      doseMcg: track.targetMcg,
                      route: track.protocol.route,
                      // Rotate within the protocol's pinned sites, if it has any.
                      site: suggestSite(
                        logs.filter((l) => l.peptideId === track.protocol.peptideId),
                        Date.now(),
                        14,
                        track.protocol.sites),
                    });
                    setLastQuickLog({ id, name: track.peptide?.name ?? track.protocol.peptideId });
                  }}
                >
                  <Check size={15} /> {t("now_logged")}
                </Button>
                <Button
                  title={t("now_open_full_form")}
                  onClick={() => {
                    setLogPeptideId(track.protocol.peptideId);
                    setLogOpen(true);
                  }}
                >
                  {t("now_details")}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/*
        The rest of the day, quieter than the band above on purpose. Same
        rows, one step earlier in their life, so the eye reads down the page
        in the order the day happens.
      */}
      {laterToday.length > 0 && (
        <div>
          <SectionLabel>{t("now_later_today")}</SectionLabel>
          <div className="divide-y divide-[var(--line)] rounded-[var(--r-card)] border border-[var(--line)]">
            {laterToday.map(({ track, at }) => {
              const key = `${track.protocol.id}:${at}`;
              const asking = confirmEarly === key;

              return (
                <div key={key} className="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
                  <span className="tnum w-12 shrink-0 font-mono text-[12.5px] text-[var(--faint)]">
                    {formatTime(at)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5 text-[13.5px]">
                      {track.color && (
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: track.color }}
                        />
                      )}
                      <span className="font-medium" style={{ color: track.color ?? "var(--ink)" }}>
                        {track.peptide?.name ?? track.protocol.peptideId}
                      </span>
                      <span className="tnum font-mono text-[12.5px] text-[var(--ink)]">
                        {formatDose(track.targetMcg)}
                      </span>
                      <DoseMarks
                        peptideId={track.protocol.peptideId}
                        doseMcg={track.targetMcg}
                        nowMs={now}
                        route={track.protocol.route}
                        className="text-[12px] text-[var(--faint)]"
                      />
                    </span>
                    {/*
                      Logging a dose hours before its time is nearly always a
                      misread row rather than an early injection, and it is not
                      a harmless mistake: it takes the dose off the vial, moves
                      the curve, and leaves the real dose looking taken. So the
                      button asks, and says which dose it is asking about.
                    */}
                    {asking && (
                      <p className="mt-0.5 text-[12px] text-[var(--muted)]">
                        {t("now_not_due_until", { time: formatTime(at), when: relativeTime(at, now) })}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    {asking ? (
                      <>
                        <Button
                          variant="primary"
                          onClick={() => {
                            const id = addLog({
                              peptideId: track.protocol.peptideId,
                              protocolId: track.protocol.id,
                              at: Date.now(),
                              doseMcg: track.targetMcg,
                              route: track.protocol.route,
                              site: suggestSite(
                                logs.filter((l) => l.peptideId === track.protocol.peptideId),
                                Date.now(),
                                14,
                                track.protocol.sites),
                            });
                            setConfirmEarly(null);
                            setLastQuickLog({
                              id,
                              name: track.peptide?.name ?? track.protocol.peptideId,
                            });
                          }}
                        >
                          <Check size={15} /> {t("now_yes_log_it")}
                        </Button>
                        <Button
                          title={t("now_open_full_form")}
                          onClick={() => {
                            setConfirmEarly(null);
                            setLogPeptideId(track.protocol.peptideId);
                            setLogOpen(true);
                          }}
                        >
                          {t("now_details")}
                        </Button>
                        <Button variant="ghost" onClick={() => setConfirmEarly(null)}>
                          {t("cancel")}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          title={t("now_log_ahead_title", { time: formatTime(at) })}
                          onClick={() => setConfirmEarly(key)}
                        >
                          <Check size={15} /> {t("now_logged")}
                        </Button>
                        <Button
                          title={t("now_open_full_form")}
                          onClick={() => {
                            setLogPeptideId(track.protocol.peptideId);
                            setLogOpen(true);
                          }}
                        >
                          {t("now_details")}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {series.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--line)] px-4 py-3">
            <SectionLabel className="mb-0">{t("now_circulating")}</SectionLabel>
            <div className="ml-auto flex flex-wrap gap-x-3.5 gap-y-1">
              {series.map((s) => (
                <span key={s.id} className="flex items-center gap-1.5 text-[12px] text-[var(--muted)]">
                  {/* Hollow for an estimate, matching the dashed line it labels. */}
                  <span
                    className="h-2 w-2 rounded-full"
                    style={
                      s.basis && s.basis !== "published"
                        ? { border: `1.5px solid ${s.color}` }
                        : { background: s.color }
                    }
                  />
                  {s.label}
                  {s.basis === "elsewhere" && (
                    <span className="text-[var(--faint)]">{t("now_estimated")}</span>
                  )}
                  {s.basis === "yours" && <span className="text-[var(--faint)]">{t("now_your_figure")}</span>}
                </span>
              ))}
            </div>
          </div>
          <div className="px-2 pb-2 pt-3">
            <PkChart
              series={series}
              fromMs={now - 14 * DAY}
              toMs={now + 7 * DAY}
              nowMs={now}
              pickedMs={pickedMs}
              onPick={setPickedMs}
              weightEntries={
                settings.plotWeightOnChart
                  ? measurements
                      .filter((m) => m.weightKg != null)
                      .map((m) => {
                        const unit = settings.weightUnit ?? "kg";
                        const val = toDisplayWeight(m.weightKg!, unit);
                        const label = `${Math.round(val * 10) / 10}${unit}`;
                        return { at: m.at, weightKg: m.weightKg!, displayLabel: label };
                      })
                  : undefined
              }
            />
          </div>
          <PkReadout
            series={series}
            atMs={pickedMs ?? now}
            nowMs={now}
            describeVial={describeVial}
          />
          <p className="border-t border-[var(--line)] px-4 py-2.5 text-[11.5px] leading-relaxed text-[var(--faint)]">
            {t("now_curve_note")}
          </p>

          {estimatedFrom.length > 0 && (
            <p className="border-t border-[var(--line)] px-4 py-2.5 text-[11.5px] leading-relaxed text-[var(--muted)]">
              {t("now_dashed_line")}{" "}
              {estimatedFrom.map((e) => (
                <span
                  key={e.id}
                  className={
                    e.evidence === "anecdotal" ? "text-[var(--tangerine)]" : undefined
                  }
                >
                  {e.text}{" "}
                </span>
              ))}
              {t("now_no_pk_figures", { n: estimatedFrom.length })}
            </p>
          )}

          {unplotted.length > 0 && (
            <p className="border-t border-[var(--line)] px-4 py-2.5 text-[11.5px] leading-relaxed text-[var(--muted)]">
              <strong className="font-semibold text-[var(--ink)]">
                {unplotted.join(", ")}
              </strong>{" "}
              {t("now_unplotted", { n: unplotted.length })}
            </p>
          )}
        </Card>
      )}

      <section>
        <SectionLabel>{t("now_active_protocols")}</SectionLabel>
        <div className="space-y-2.5">
          {tracks.map((track) => {
            /*
              Only when the curve is actually drawn from it. A compound with a
              published figure is never offered an override, so basis is the
              honest test rather than the presence of a stored number.
            */
            const yourHalfLife =
              track.curve?.basis === "yours"
                ? (overrides?.[track.protocol.peptideId]?.hours ?? null)
                : null;

            return (
            <Card key={track.protocol.id} className="p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <IconChip tone={track.tone} size={34}>
                      <SyringeIcon size={17} strokeWidth={2.2} />
                    </IconChip>
                    <Link
                      href={`/library/${track.protocol.peptideId}`}
                      className="text-[15px] text-[var(--ink)] hover:underline"
                    >
                      {track.peptide?.name ?? track.protocol.peptideId}
                    </Link>
                    {track.snap && (
                      <Badge tone={track.snap.phase === "cleared" ? "neutral" : "sky"}>
                        {t(CURVE_KEY[track.snap.phase])}
                      </Badge>
                    )}
                    {/*
                      "Due today" used to say nothing here, because with one
                      dose a day it was a state you passed through in the four
                      hours before it. A compound taken twice sits in it for
                      most of the day, and a card that shows nothing reads as a
                      card with nothing to do.
                    */}
                    {(track.due.state === "scheduled" || track.due.state === "upcoming") &&
                      track.due.at != null && (
                        <span className="text-[12px] text-[var(--faint)]">
                          {t("now_next_at", { when: relativeTime(track.due.at, now) })}
                        </span>
                      )}
                  </div>
                  {/*
                    This card is the protocol, not the next injection, so it
                    names the amount and how many of them a day holds. The rows
                    above, which are each about one dose, stay plain.
                  */}
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[12.5px] text-[var(--muted)]">
                    <span>{formatDosePerDay(track.targetMcg, track.perDay)}</span>
                    <DoseMarks
                      peptideId={track.protocol.peptideId}
                      doseMcg={track.targetMcg}
                      nowMs={now}
                      route={track.protocol.route}
                      className="text-[12px] text-[var(--faint)]"
                    />
                    <span>· {track.protocol.name}</span>
                  </p>
                </div>

                <Button
                  onClick={() => {
                    setLogPeptideId(track.protocol.peptideId);
                    setLogOpen(true);
                  }}
                >
                  <Plus size={15} /> {t("now_log_short")}
                </Button>
              </div>

              {track.snap ? (
                <div className="mt-3.5">
                  <Meter value={Math.min(1, track.snap.level)} tone={track.tone} />
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12.5px]">
                    <span className="tnum font-semibold text-[var(--ink)]">
                      {t("now_percent_of_peak", { pct: track.snap.percentOfPeak.toFixed(0) })}
                    </span>
                    <span className="text-[var(--muted)]">{t(CURVE_DETAIL_KEY[track.snap.phase])}</span>
                  </div>
                </div>
              ) : track.blendParts.length === 0 ? (
                <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--faint)]">
                  {t("now_no_half_life")}{" "}
                  {track.peptide?.halfLifeNote}
                </p>
              ) : null}

              {/* A blend always breaks down, whether or not it also has an
                  aggregate curve, the components are the useful detail. */}
              {track.blendParts.length > 0 && (
                <div className="mt-3">
                  <p className="mb-2 text-[12px] text-[var(--muted)]">
                    {t("now_one_dose_delivers", { dose: formatDose(track.targetMcg) })}
                  </p>
                  <BlendBreakdown
                    blend={track.peptide!}
                    doseMcg={track.targetMcg}
                    resolve={(id) => findPeptide(custom, id)}
                    dosesPerWeek={protocolDosesPerWeek(track.protocol, now)}
                  />
                </div>
              )}

              {track.phase && (
                <div
                  className="mt-3 rounded-[var(--r-inner)] p-3"
                  style={{ background: TONE_BG[track.tone] }}
                >
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} strokeWidth={2.4} style={{ color: TONE_FG[track.tone] }} />
                    <span className="text-[12px] font-bold" style={{ color: TONE_FG[track.tone] }}>
                      {t("now_right_now_since", {
                        since: formatDuration(hoursSince(track.lastLoggedAt, now) ?? 0),
                      })}
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed" style={{ color: TONE_FG[track.tone] }}>
                    {track.phase.label}
                  </p>
                  {track.phase.hoursToNext != null && (
                    <p className="mt-1 text-[11.5px] opacity-75" style={{ color: TONE_FG[track.tone] }}>
                      {t("now_phase_shifts", { in: formatDuration(track.phase.hoursToNext) })}
                    </p>
                  )}
                </div>
              )}

              <div className="mt-3.5 flex flex-wrap gap-x-6 gap-y-2 border-t border-[var(--line)] pt-3 text-[12px]">
                <span className="text-[var(--muted)]">
                  {t("now_last_dose")}{" "}
                  <span className="text-[var(--ink)]">
                    {track.lastLoggedAt ? relativeTime(track.lastLoggedAt, now) : t("now_never")}
                  </span>
                  {track.lastLog?.site && (
                    <span className="text-[var(--ink)]">
                      {" · "}
                      {INJECTION_SITES.find((s) => s.id === track.lastLog!.site)?.label}
                    </span>
                  )}
                </span>
                <span className="text-[var(--muted)]">
                  {t("library_half_life")}{" "}
                  <span className="text-[var(--ink)]">
                    {/*
                      Your own figure when the curve is drawn from it. This
                      read the library's number, which for a compound you
                      entered a half-life for is null, so the same card said
                      Not established and then drew a curve from thirty
                      minutes you had typed in.
                    */}
                    {track.blendParts.length > 0
                      ? t("now_per_component")
                      : yourHalfLife != null
                        ? t("now_half_life_yours", {
                            hours: formatHalfLife(yourHalfLife),
                            marker: t("now_your_figure"),
                          })
                        : formatHalfLife(track.peptide?.halfLifeHours ?? null)}
                  </span>
                </span>
                <span
                  className={
                    track.stock.dosesRemaining <= settings.lowStockDoses
                      ? "text-[var(--rose)]"
                      : "text-[var(--muted)]"
                  }
                >
                  {t("now_stock_label")}{" "}
                  {/*
                    A shelf with eleven doses on it says eleven, and says what
                    is wrong with them. Zero was true of what can go in a
                    syringe and false about what is in the fridge, and the
                    reader comparing this with the Stock page saw only the
                    contradiction.

                    The count comes from the same rounding, so it is the number
                    that would be here if the date passed tomorrow instead.
                  */}
                  <span className="tnum font-mono">
                    {t("count_doses", {
                      n:
                        track.stock.dosesRemaining === 0 && track.stock.dosesExpired > 0
                          ? track.stock.dosesExpired
                          : track.stock.dosesRemaining,
                    })}
                  </span>
                  {track.stock.dosesRemaining === 0 && track.stock.dosesExpired > 0 && (
                    <span className="text-[var(--rose)]"> · {t("now_stock_past_date")}</span>
                  )}
                  {track.supplyDays != null && track.stock.dosesRemaining > 0 && (
                    <span className="text-[var(--faint)]">
                      {" "}
                      {t("now_about_left", { duration: formatDuration(track.supplyDays * 24) })}
                    </span>
                  )}
                </span>
                {track.stock.needsReconstitution && (
                  <Link href="/stock" className="text-[var(--tangerine)] hover:underline">
                    {t("now_record_reconstitution")}
                  </Link>
                )}
              </div>
            </Card>
            );
          })}
        </div>
      </section>

      <WeightCard nowMs={now} />

      <CheckInCard nowMs={now} />

      <LabsCard />

      <Insights tracks={tracks} logs={logs} now={now} />

      {(lowStock.length > 0 || expiringVials.length > 0) && (
        <section>
          <SectionLabel>{t("now_worth_sorting")}</SectionLabel>
          <div className="space-y-2.5">
            {lowStock.map((track) => (
              <Callout key={track.protocol.id} tone="warn">
                <Rich
                  text={t("now_low_stock", {
                    name: track.peptide?.name ?? "",
                    doses: t("count_doses", { n: track.stock.dosesRemaining }),
                    open: track.stock.openCount,
                    sealed: t("count_vials", { n: track.stock.sealedCount }),
                  })}
                />{" "}
                <Link href="/stock" className="text-[var(--tangerine)] hover:underline">
                  {t("now_check_stock")}
                </Link>
              </Callout>
            ))}
            {expiringVials.map((v) => {
              const days = Math.ceil((v.budAt! - now) / DAY);
              const p = findPeptide(custom, v.peptideId);
              return (
                <Callout key={v.id} tone={days <= 0 ? "danger" : "warn"}>
                  {t("now_vial_named", { name: p?.name ?? v.peptideId, mg: v.strengthMg })}{" "}
                  {days <= 0
                    ? t("now_vial_past_bud")
                    : t("now_vial_bud_in", { n: days })}{" "}
                  {t("now_bud_is_hygiene")}
                </Callout>
              );
            })}
          </div>
        </section>
      )}

      <LogDoseSheet
        open={logOpen}
        onClose={() => setLogOpen(false)}
        defaultPeptideId={logPeptideId}
      />
    </div>
  );
}

/**
 * The day at a glance: how many of today's doses are done, the run of complete
 * days behind it, and the week in seven dots.
 */
function TodayCard({
  protocols,
  logs,
  now,
}: {
  protocols: Protocol[];
  logs: DoseLog[];
  now: number;
}) {
  const { t } = useLang();
  const today = todayProgress(protocols, logs, now);
  const streak = currentStreak(protocols, logs, now);
  const week = recentDays(protocols, logs, now, 7);

  const tone: Tone = today.complete ? "leaf" : today.taken > 0 ? "mint" : "neutral";

  return (
    <Card className="overflow-hidden p-5">
      <div className="flex items-center gap-5">
        <ProgressRing
          value={today.fraction}
          size={84}
          stroke={9}
          tone={tone}
          label={t("now_done_today", { taken: today.taken, expected: today.expected })}
        >
          {today.restDay ? (
            <span className="text-[11px] font-bold text-[var(--faint)]">{t("now_rest")}</span>
          ) : (
            <>
              <span className="tnum text-[22px] font-extrabold leading-none text-[var(--ink)]">
                {today.taken}
              </span>
              <span className="tnum text-[11px] font-semibold text-[var(--faint)]">
                {t("plan_of")} {today.expected}
              </span>
            </>
          )}
        </ProgressRing>

        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-[var(--ink)]">
            {greeting(now, t)}
          </h1>
          <p className="mt-0.5 text-[13.5px] text-[var(--muted)]">
            {today.restDay
              ? t("now_nothing_scheduled")
              : today.complete
                ? t("now_all_logged")
                : t("now_left_to_log", { n: today.expected - today.taken })}
          </p>

          {streak > 0 && (
            <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-[var(--r-pill)] bg-[var(--tangerine-soft)] px-2.5 py-1">
              <Flame size={14} strokeWidth={2.4} style={{ color: "var(--tangerine-ink)" }} />
              <span className="text-[12.5px] font-bold" style={{ color: "var(--tangerine-ink)" }}>
                {t("now_streak_days", { n: streak })}
              </span>
            </div>
          )}
        </div>
      </div>

      {/*
        Seven days, oldest to today.

        Today is drawn differently on purpose. Orange means a day that ended
        with doses missing, and until midnight today is not that day: it is a
        day in progress, and colouring it as a miss at nine in the morning
        reads as a telling off for something you have all day to do. So today
        fills from the bottom as it goes, in the same green a finished day
        wears, and reaches that green by being finished rather than by being
        recoloured.
      */}
      <div className="mt-5 flex items-end justify-between gap-1.5">
        {week.map((d) => {
          const isToday = d.day === startOfLocalDay(now);
          const filled = d.restDay ? 0 : Math.round(d.fraction * 100);

          return (
            <div key={d.day} className="flex flex-1 flex-col items-center gap-1.5">
              <span
                className="relative h-9 w-full overflow-hidden rounded-[8px]"
                style={{
                  background: d.restDay
                    ? "var(--line)"
                    : isToday || d.complete
                      ? "var(--line)"
                      : d.taken > 0
                        ? "var(--tangerine)"
                        : "var(--line)",
                  opacity: d.restDay ? 0.5 : 1,
                  boxShadow: isToday ? "inset 0 0 0 1.5px var(--faint)" : undefined,
                }}
                title={
                  d.restDay
                    ? t("now_nothing_scheduled_day")
                    : isToday
                      ? t("now_day_partial", { taken: d.taken, expected: d.expected })
                      : t("now_day_logged", { taken: d.taken, expected: d.expected })
                }
              >
                {(isToday || d.complete) && !d.restDay && filled > 0 && (
                  <span
                    className="absolute inset-x-0 bottom-0 block"
                    style={{ height: `${filled}%`, background: "var(--leaf)" }}
                  />
                )}
              </span>
              <span
                className={`text-[10px] font-semibold ${
                  isToday ? "text-[var(--ink)]" : "text-[var(--faint)]"
                }`}
              >
                {formatWeekday(d.day).slice(0, 2)}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/*
 * Takes t rather than reading the store. It is a plain function outside the
 * component, which is exactly why it stayed English through the whole
 * translation run: a scan for text in JSX and in attributes never looks at
 * what a helper returns.
 */
function greeting(now: number, t: (key: TranslationKey) => string) {
  const h = new Date(now).getHours();
  if (h < 12) return t("greeting_morning");
  if (h < 18) return t("greeting_afternoon");
  return t("greeting_evening");
}


/**
 * Two questions the dose list cannot answer: is my exposure going up or down
 * week to week, and have my levels finished building yet.
 */
function Insights({
  tracks,
  logs,
  now,
}: {
  tracks: {
    protocol: Protocol;
    peptide?: { name: string; halfLifeHours: number | null };
    tone: Tone;
    doses: { at: number }[];
  }[];
  logs: DoseLog[];
  now: number;
}) {
  const { t } = useLang();
  const weeks = useMemo(() => weeklyExposure(logs, now, 8), [logs, now]);
  const anyExposure = weeks.some((w) => w.totalMcg > 0);
  if (!tracks.length || !anyExposure) return null;

  const peak = Math.max(...weeks.map((w) => w.totalMcg), 1);

  return (
    <section>
      <SectionLabel>{t("now_trends")}</SectionLabel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <h3 className="text-[14.5px] font-bold text-[var(--ink)]">{t("now_weekly_exposure")}</h3>
            <span className="text-[12px] text-[var(--muted)]">{t("now_last_8_weeks")}</span>
          </div>
          <p className="mb-4 text-[12px] leading-relaxed text-[var(--muted)]">
            {t("now_weekly_desc")}
          </p>

          <div className="flex h-28 items-end gap-1.5">
            {weeks.map((w, i) => {
              const h = (w.totalMcg / peak) * 100;
              const isNow = i === weeks.length - 1;
              return (
                <div key={w.weekStart} className="group flex flex-1 flex-col items-center gap-1.5">
                  <div className="flex h-full w-full items-end">
                    <div
                      className="w-full rounded-[6px] transition-all"
                      style={{
                        height: `${Math.max(w.totalMcg > 0 ? 6 : 2, h)}%`,
                        background: isNow ? "var(--mint)" : "var(--mint-soft)",
                      }}
                      title={t("now_week_tooltip", { date: formatDate(w.weekStart), total: formatDose(w.totalMcg), doses: t("count_doses", { n: w.doses }) })}
                    />
                  </div>
                  {/* Day of month, not a locale-split string, "29 Jul" and
                      "Jul 29" split differently and one of them was wrong. */}
                  <span className="text-[9.5px] font-semibold text-[var(--faint)]">
                    {new Date(w.weekStart).getDate()}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="mt-3 border-t border-[var(--line)] pt-3 text-[12.5px] text-[var(--muted)]">
            {t("now_this_week")}{" "}
            <strong className="tnum text-[var(--ink)]">
              {formatDose(weeks[weeks.length - 1].totalMcg)}
            </strong>{" "}
            {t("now_across_doses", { doses: t("count_doses", { n: weeks[weeks.length - 1].doses }) })}
          </p>
        </Card>

        <Card className="p-5">
          <h3 className="mb-1 text-[14.5px] font-bold text-[var(--ink)]">{t("now_building_steady")}</h3>
          <p className="mb-4 text-[12px] leading-relaxed text-[var(--muted)]">
            {t("now_steady_desc")}
          </p>

          <ul className="space-y-3.5">
            {tracks.map((track) => {
              const first = track.doses.length ? Math.min(...track.doses.map((d) => d.at)) : null;
              const ss = steadyStateProgress(track.peptide?.halfLifeHours ?? null, first, now);

              return (
                <li key={track.protocol.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="truncate text-[13.5px] font-semibold text-[var(--ink)]">
                      {track.peptide?.name ?? track.protocol.peptideId}
                    </span>
                    <span className="shrink-0 text-[12px] text-[var(--muted)]">
                      {ss == null
                        ? t("library_no_half_life")
                        : ss.fraction >= 1
                          ? t("now_at_steady")
                          : t("now_to_go", {
                              duration: formatDuration(ss.hoursNeeded - ss.hoursElapsed),
                            })}
                    </span>
                  </div>
                  <Meter value={ss?.fraction ?? 0} tone={ss ? track.tone : "neutral"} />
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </section>
  );
}
