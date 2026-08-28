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
  SectionLabel,
  TONE_BG,
  TONE_FG,
  type Tone,
} from "@/components/ui";
import { findPeptide, stockFor, useStore, useProfileData } from "@/lib/store";
import { curveFor, snapshot, type DoseEvent } from "@/lib/calc/pk";
import { protocolDosesPerWeek, dueStatus, scheduledDoseMcg } from "@/lib/calc/schedule";
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
import { assignColors, colorSubjects } from "@/lib/calc/palette";
import { hoursSince, timelinePhaseAt } from "@/lib/calc/phase";
import { BlendBreakdown } from "@/components/BlendBreakdown";
import {
  formatConcentration,
  formatDate,
  formatDose,
  formatDuration,
  formatHalfLife,
  formatWeekday,
  relativeTime,
} from "@/lib/format";
import { LogDoseSheet } from "@/components/LogDoseSheet";
import { WeightCard } from "@/components/WeightCard";
import { CheckInCard } from "@/components/CheckInCard";
import { StackWarnings } from "@/components/StackWarnings";
import { LabsCard } from "@/components/LabsCard";
import { HistoryWithoutPlan } from "@/components/HistoryWithoutPlan";
import { BackupNag } from "@/components/BackupNag";
import { INJECTION_SITES, ROUTE_LABEL, type DoseLog, type Protocol } from "@/lib/types";


/** Card accents, kept in step with the chart colours. */
const TRACK_TONES: Tone[] = ["mint", "grape", "tangerine", "sky", "rose", "leaf"];

const DAY = 86_400_000;

export default function NowPage() {
  const hydrated = useStore((s) => s.hydrated);
  const { protocols, logs, vials } = useProfileData();
  const custom = useStore((s) => s.customPeptides);
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
        concentration: Number.isFinite(conc) ? formatConcentration(conc) : "not reconstituted",
      };
    },
    [vials, custom]);
  const [logOpen, setLogOpen] = useState(false);
  const [logPeptideId, setLogPeptideId] = useState<string | undefined>();

  const active = useMemo(() => protocols.filter((p) => p.active), [protocols]);

  const tracks = useMemo(() => {
    return active.map((protocol, i) => {
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

      const curve = peptide ? curveFor(peptide) : null;

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
        curve && !curve.estimated ? snapshot(now, doses, curve.params, referenceMcg) : null;

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
        tone: TRACK_TONES[i % TRACK_TONES.length],
      };
    });
  }, [active, logs, vials, custom, now]);

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

  const series: PkSeries[] = useMemo(() => {
    const out: Omit<PkSeries, "color">[] = [];

    for (const t of tracks) {
      const parts = modellableComponents(t.blendParts);

      // Prefer per-component curves for a blend even when the blend itself
      // carries an aggregate half-life: two components with 177 h and 161 h
      // say more than one averaged 170 h line.
      if (parts.length) {
        for (const part of parts) {
          out.push({
            id: `${t.protocol.id}:${part.peptideId ?? part.name}`,
            label: `${part.name} · in ${t.peptide!.name}`,
            doses: t.doses.map((d) => ({ at: d.at, amountMcg: d.amountMcg * part.fraction })),
            params: {
              halfLifeHours: part.peptide!.halfLifeHours!,
              tmaxHours: part.peptide!.tmaxHours,
            },
            referenceMcg: part.mcg || 1,
          });
        }
        continue;
      }

      if (t.curve) {
        out.push({
          id: t.protocol.id,
          label: t.peptide!.name,
          doses: t.doses,
          params: t.curve.params,
          referenceMcg: t.referenceMcg,
          estimated: t.curve.estimated,
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
    for (const t of tracks) {
      for (const part of t.blendParts) {
        if (!part.peptide || !curveFor(part.peptide)) names.add(part.name);
      }
      if (!t.blendParts.length && t.peptide && !curveFor(t.peptide)) {
        names.add(t.peptide.name);
      }
    }
    return [...names];
  }, [tracks]);

  /**
   * The lines that are drawn from a measurement made elsewhere, and what that
   * measurement was. Stated on the card next to the chart rather than left for
   * the library page, since the person reading the curve is here.
   */
  const estimatedFrom = useMemo(() => {
    const out: { id: string; text: string }[] = [];
    for (const t of tracks) {
      const e = t.peptide?.halfLifeEstimate;
      if (!t.curve?.estimated || !e) continue;
      out.push({
        id: t.protocol.id,
        text: `${t.peptide!.name} is drawn from ${formatHalfLife(e.hours)} measured in ${
          e.species} given it ${ROUTE_LABEL[e.route].toLowerCase()}, from ${e.source}.`,
      });
    }
    return out;
  }, [tracks]);

  const needsAttention = tracks.filter(
    (t) => t.due.state === "overdue" || t.due.state === "due-now");
  const lowStock = tracks.filter(
    (t) => t.stock.dosesRemaining <= settings.lowStockDoses && t.targetMcg > 0);
  const expiringVials = vials.filter(
    (v) =>
      v.state === "reconstituted" &&
      v.budAt != null &&
      v.budAt - now < settings.budWarningDays * DAY);

  if (!hydrated) {
    return <div className="py-20 text-center text-[14px] text-[var(--faint)]">Loading your data…</div>;
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
            {lastQuickLog.name} logged, and taken off your stock.
          </span>
          <Button
            variant="ghost"
            onClick={() => {
              removeLog(lastQuickLog.id);
              setLastQuickLog(null);
            }}
          >
            <Undo2 size={15} /> Undo
          </Button>
          <Button variant="ghost" onClick={() => setLastQuickLog(null)}>
            Dismiss
          </Button>
        </Card>
      )}

      {needsAttention.length > 0 && (
        <div className="space-y-2.5">
          {needsAttention.map((t) => (
            <Card
              key={t.protocol.id}
              className={`flex flex-wrap items-center gap-3 p-3.5 ${
                t.due.state === "overdue" ? "border-[var(--rose)]/45" : "border-[var(--tangerine)]/45"
              }`}
            >
              <Badge tone={t.due.state === "overdue" ? "rose" : "tangerine"}>{t.due.label}</Badge>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] text-[var(--ink)]">
                  {t.peptide?.name ?? t.protocol.peptideId} · {formatDose(t.targetMcg)}
                </div>
                <div className="text-[12px] text-[var(--muted)]">
                  {t.due.at != null &&
                    (t.due.state === "overdue"
                      ? `Was due ${relativeTime(t.due.at, now)}`
                      : `Scheduled ${relativeTime(t.due.at, now)}`)}
                </div>
              </div>
              <div className="flex gap-1.5">
                <Button
                  variant="primary"
                  title={`Log ${formatDose(t.targetMcg)} now with the suggested site`}
                  onClick={() => {
                    const id = addLog({
                      peptideId: t.protocol.peptideId,
                      protocolId: t.protocol.id,
                      at: Date.now(),
                      doseMcg: t.targetMcg,
                      route: t.protocol.route,
                      // Rotate within the protocol's pinned sites, if it has any.
                      site: suggestSite(
                        logs.filter((l) => l.peptideId === t.protocol.peptideId),
                        Date.now(),
                        14,
                        t.protocol.sites),
                    });
                    setLastQuickLog({ id, name: t.peptide?.name ?? t.protocol.peptideId });
                  }}
                >
                  <Check size={15} /> Taken
                </Button>
                <Button
                  title="Open the full form"
                  onClick={() => {
                    setLogPeptideId(t.protocol.peptideId);
                    setLogOpen(true);
                  }}
                >
                  Details
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {series.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--line)] px-4 py-3">
            <SectionLabel className="mb-0">Circulating now</SectionLabel>
            <div className="ml-auto flex flex-wrap gap-x-3.5 gap-y-1">
              {series.map((s) => (
                <span key={s.id} className="flex items-center gap-1.5 text-[12px] text-[var(--muted)]">
                  {/* Hollow for an estimate, matching the dashed line it labels. */}
                  <span
                    className="h-2 w-2 rounded-full"
                    style={
                      s.estimated
                        ? { border: `1.5px solid ${s.color}` }
                        : { background: s.color }
                    }
                  />
                  {s.label}
                  {s.estimated && <span className="text-[var(--faint)]">estimated</span>}
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
            />
          </div>
          <PkReadout
            series={series}
            atMs={pickedMs ?? now}
            nowMs={now}
            describeVial={describeVial}
          />
          <p className="border-t border-[var(--line)] px-4 py-2.5 text-[11.5px] leading-relaxed text-[var(--faint)]">
            Relative levels, not concentrations. One normal dose peaks at 100%, so the line says how
            much is on board compared with a single dose, bioavailability is unpublished for most of
            these compounds, so a real ng/mL figure is not available. Triangles mark logged doses.
            Where a reading names a vial, that vial&apos;s strength is read as it stands today:
            adding diluent to an open vial rewrites the basis, so a dose drawn before a top up shows
            the strength the vial has now rather than the one that was in the syringe.
          </p>

          {estimatedFrom.length > 0 && (
            <p className="border-t border-[var(--line)] px-4 py-2.5 text-[11.5px] leading-relaxed text-[var(--muted)]">
              A dashed line is a shape, not a level. {estimatedFrom.map((e) => e.text).join(" ")} No
              percentage of peak, steady state or accumulation figure is shown for{" "}
              {estimatedFrom.length === 1 ? "it" : "them"}, because a half-life from another species
              or another route cannot support one.
            </p>
          )}

          {unplotted.length > 0 && (
            <p className="border-t border-[var(--line)] px-4 py-2.5 text-[11.5px] leading-relaxed text-[var(--muted)]">
              <strong className="font-semibold text-[var(--ink)]">
                {unplotted.join(", ")}
              </strong>{" "}
              {unplotted.length === 1 ? "is" : "are"} also on board but not plotted, no half-life
              has been published for {unplotted.length === 1 ? "it" : "them"}, so any curve would be
              invented. {unplotted.length === 1 ? "It is" : "They are"} listed under the protocol
              below.
            </p>
          )}
        </Card>
      )}

      <section>
        <SectionLabel>Active protocols</SectionLabel>
        <div className="space-y-2.5">
          {tracks.map((t) => (
            <Card key={t.protocol.id} className="p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <IconChip tone={t.tone} size={34}>
                      <SyringeIcon size={17} strokeWidth={2.2} />
                    </IconChip>
                    <Link
                      href={`/library/${t.protocol.peptideId}`}
                      className="text-[15px] text-[var(--ink)] hover:underline"
                    >
                      {t.peptide?.name ?? t.protocol.peptideId}
                    </Link>
                    {t.snap && (
                      <Badge tone={t.snap.phase.id === "cleared" ? "neutral" : "sky"}>
                        {t.snap.phase.label}
                      </Badge>
                    )}
                    {t.due.state === "scheduled" && t.due.at != null && (
                      <span className="text-[12px] text-[var(--faint)]">
                        next {relativeTime(t.due.at, now)}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[12.5px] text-[var(--muted)]">
                    {formatDose(t.targetMcg)} · {t.protocol.name}
                  </p>
                </div>

                <Button
                  onClick={() => {
                    setLogPeptideId(t.protocol.peptideId);
                    setLogOpen(true);
                  }}
                >
                  <Plus size={15} /> Log
                </Button>
              </div>

              {t.snap ? (
                <div className="mt-3.5">
                  <Meter value={Math.min(1, t.snap.level)} tone={t.tone} />
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12.5px]">
                    <span className="tnum font-semibold text-[var(--ink)]">
                      {t.snap.percentOfPeak.toFixed(0)}% of a single-dose peak
                    </span>
                    <span className="text-[var(--muted)]">{t.snap.phase.detail}</span>
                  </div>
                </div>
              ) : t.blendParts.length === 0 ? (
                <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--faint)]">
                  No published half-life for this compound, so no level can be estimated.{" "}
                  {t.peptide?.halfLifeNote}
                </p>
              ) : null}

              {/* A blend always breaks down, whether or not it also has an
                  aggregate curve, the components are the useful detail. */}
              {t.blendParts.length > 0 && (
                <div className="mt-3">
                  <p className="mb-2 text-[12px] text-[var(--muted)]">
                    One {formatDose(t.targetMcg)} dose delivers:
                  </p>
                  <BlendBreakdown
                    blend={t.peptide!}
                    doseMcg={t.targetMcg}
                    resolve={(id) => findPeptide(custom, id)}
                    dosesPerWeek={protocolDosesPerWeek(t.protocol, now)}
                  />
                </div>
              )}

              {t.phase && (
                <div
                  className="mt-3 rounded-[var(--r-inner)] p-3"
                  style={{ background: TONE_BG[t.tone] }}
                >
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} strokeWidth={2.4} style={{ color: TONE_FG[t.tone] }} />
                    <span className="text-[12px] font-bold" style={{ color: TONE_FG[t.tone] }}>
                      Right now · {formatDuration(hoursSince(t.lastLoggedAt, now) ?? 0)} since your
                      last dose
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed" style={{ color: TONE_FG[t.tone] }}>
                    {t.phase.label}
                  </p>
                  {t.phase.hoursToNext != null && (
                    <p className="mt-1 text-[11.5px] opacity-75" style={{ color: TONE_FG[t.tone] }}>
                      This phase shifts in about {formatDuration(t.phase.hoursToNext)}.
                    </p>
                  )}
                </div>
              )}

              <div className="mt-3.5 flex flex-wrap gap-x-6 gap-y-2 border-t border-[var(--line)] pt-3 text-[12px]">
                <span className="text-[var(--muted)]">
                  Last dose:{" "}
                  <span className="text-[var(--ink)]">
                    {t.lastLoggedAt ? relativeTime(t.lastLoggedAt, now) : "never"}
                  </span>
                  {t.lastLog?.site && (
                    <span className="text-[var(--ink)]">
                      {" · "}
                      {INJECTION_SITES.find((s) => s.id === t.lastLog!.site)?.label}
                    </span>
                  )}
                </span>
                <span className="text-[var(--muted)]">
                  Half-life:{" "}
                  <span className="text-[var(--ink)]">
                    {t.blendParts.length > 0
                      ? "per component"
                      : formatHalfLife(t.peptide?.halfLifeHours ?? null)}
                  </span>
                </span>
                <span
                  className={
                    t.stock.dosesRemaining <= settings.lowStockDoses
                      ? "text-[var(--rose)]"
                      : "text-[var(--muted)]"
                  }
                >
                  Stock:{" "}
                  <span className="tnum font-mono">
                    {t.stock.dosesRemaining} dose{t.stock.dosesRemaining === 1 ? "" : "s"}
                  </span>
                  {t.supplyDays != null && t.stock.dosesRemaining > 0 && (
                    <span className="text-[var(--faint)]">
                      {" "}
                      · about {formatDuration(t.supplyDays * 24)} left
                    </span>
                  )}
                </span>
                {t.stock.needsReconstitution && (
                  <Link href="/stock" className="text-[var(--tangerine)] hover:underline">
                    Record a reconstitution for syringe units
                  </Link>
                )}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <WeightCard nowMs={now} />

      <CheckInCard nowMs={now} />

      <LabsCard />

      <Insights tracks={tracks} logs={logs} now={now} />

      {(lowStock.length > 0 || expiringVials.length > 0) && (
        <section>
          <SectionLabel>Worth sorting out</SectionLabel>
          <div className="space-y-2.5">
            {lowStock.map((t) => (
              <Callout key={t.protocol.id} tone="warn">
                {t.peptide?.name} is down to{" "}
                <strong className="tnum text-[var(--ink)]">{t.stock.dosesRemaining}</strong> dose
                {t.stock.dosesRemaining === 1 ? "" : "s"} across {t.stock.openCount} open and{" "}
                {t.stock.sealedCount} sealed vial{t.stock.sealedCount === 1 ? "" : "s"}.{" "}
                <Link href="/stock" className="text-[var(--tangerine)] hover:underline">
                  Check stock
                </Link>
              </Callout>
            ))}
            {expiringVials.map((v) => {
              const days = Math.ceil((v.budAt! - now) / DAY);
              const p = findPeptide(custom, v.peptideId);
              return (
                <Callout key={v.id} tone={days <= 0 ? "danger" : "warn"}>
                  {p?.name ?? v.peptideId} {v.strengthMg} mg vial{" "}
                  {days <= 0
                    ? "is past its 28-day beyond-use date."
                    : `reaches its beyond-use date in ${days} day${days === 1 ? "" : "s"}.`}{" "}
                  That is a container-hygiene limit from first puncture, not a statement about
                  potency.
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
          label={`${today.taken} of ${today.expected} doses done today`}
        >
          {today.restDay ? (
            <span className="text-[11px] font-bold text-[var(--faint)]">rest</span>
          ) : (
            <>
              <span className="tnum text-[22px] font-extrabold leading-none text-[var(--ink)]">
                {today.taken}
              </span>
              <span className="tnum text-[11px] font-semibold text-[var(--faint)]">
                of {today.expected}
              </span>
            </>
          )}
        </ProgressRing>

        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-[var(--ink)]">
            {greeting(now)}
          </h1>
          <p className="mt-0.5 text-[13.5px] text-[var(--muted)]">
            {today.restDay
              ? "Nothing scheduled today."
              : today.complete
                ? "Everything logged for today."
                : `${today.expected - today.taken} left to log today.`}
          </p>

          {streak > 0 && (
            <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-[var(--r-pill)] bg-[var(--tangerine-soft)] px-2.5 py-1">
              <Flame size={14} strokeWidth={2.4} style={{ color: "var(--tangerine-ink)" }} />
              <span className="text-[12.5px] font-bold" style={{ color: "var(--tangerine-ink)" }}>
                {streak} day{streak === 1 ? "" : "s"} on track
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Seven dots, oldest to today. */}
      <div className="mt-5 flex items-end justify-between gap-1.5">
        {week.map((d) => (
          <div key={d.day} className="flex flex-1 flex-col items-center gap-1.5">
            <span
              className="h-9 w-full rounded-[8px]"
              style={{
                background: d.restDay
                  ? "var(--line)"
                  : d.complete
                    ? "var(--leaf)"
                    : d.taken > 0
                      ? "var(--tangerine)"
                      : "var(--line)",
                opacity: d.restDay ? 0.5 : 1,
              }}
              title={
                d.restDay
                  ? "Nothing scheduled"
                  : `${d.taken} of ${d.expected} logged`
              }
            />
            <span className="text-[10px] font-semibold text-[var(--faint)]">
              {formatWeekday(d.day).slice(0, 2)}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function greeting(now: number) {
  const h = new Date(now).getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
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
  const weeks = useMemo(() => weeklyExposure(logs, now, 8), [logs, now]);
  const anyExposure = weeks.some((w) => w.totalMcg > 0);
  if (!tracks.length || !anyExposure) return null;

  const peak = Math.max(...weeks.map((w) => w.totalMcg), 1);

  return (
    <section>
      <SectionLabel>Trends</SectionLabel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <h3 className="text-[14.5px] font-bold text-[var(--ink)]">Weekly exposure</h3>
            <span className="text-[12px] text-[var(--muted)]">last 8 weeks, all compounds</span>
          </div>
          <p className="mb-4 text-[12px] leading-relaxed text-[var(--muted)]">
            Total mass logged each week. A titration shows up as a staircase; a gap shows up as a
            gap.
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
                      title={`${formatDate(w.weekStart)}, ${formatDose(w.totalMcg)} across ${w.doses} dose${w.doses === 1 ? "" : "s"}`}
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
            This week:{" "}
            <strong className="tnum text-[var(--ink)]">
              {formatDose(weeks[weeks.length - 1].totalMcg)}
            </strong>{" "}
            across {weeks[weeks.length - 1].doses} dose
            {weeks[weeks.length - 1].doses === 1 ? "" : "s"}
          </p>
        </Card>

        <Card className="p-5">
          <h3 className="mb-1 text-[14.5px] font-bold text-[var(--ink)]">Building to steady state</h3>
          <p className="mb-4 text-[12px] leading-relaxed text-[var(--muted)]">
            Levels keep rising for about five half-lives after you start. Until then, today is not
            what a steady week will feel like.
          </p>

          <ul className="space-y-3.5">
            {tracks.map((t) => {
              const first = t.doses.length ? Math.min(...t.doses.map((d) => d.at)) : null;
              const ss = steadyStateProgress(t.peptide?.halfLifeHours ?? null, first, now);

              return (
                <li key={t.protocol.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="truncate text-[13.5px] font-semibold text-[var(--ink)]">
                      {t.peptide?.name ?? t.protocol.peptideId}
                    </span>
                    <span className="shrink-0 text-[12px] text-[var(--muted)]">
                      {ss == null
                        ? "no half-life"
                        : ss.fraction >= 1
                          ? "at steady state"
                          : `${formatDuration(ss.hoursNeeded - ss.hoursElapsed)} to go`}
                    </span>
                  </div>
                  <Meter value={ss?.fraction ?? 0} tone={ss ? t.tone : "neutral"} />
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </section>
  );
}
