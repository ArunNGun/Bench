"use client";

import Link from "next/link";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, HeartPulse, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Button, Card, SectionLabel } from "./ui";
import { CheckInEditor, ratedCount, type RatingDraft } from "./CheckInEditor";
import { useProfileData, useStore } from "@/lib/store";
import { SYMPTOMS } from "@/lib/types";
import { averages, checkInFor, isTrendworthy, shiftAround, streak } from "@/lib/calc/checkins";
import { startOfLocalDay } from "@/lib/calc/schedule";
import { trim } from "@/lib/format";
import { getHealthAdapter } from "@/lib/health/adapter";
import { dailyRestingHr, nightlySleep } from "@/lib/calc/healthsync";

/**
 * How today went, on the axes weight cannot speak to.
 *
 * Sits next to the weight card deliberately. Weight answers the question for a
 * GLP-1 and almost nothing else in this library, and someone running
 * testosterone or growth hormone is chasing things a scale has no opinion about.
 *
 * Rating is optional per axis. Leaving one blank records that you did not
 * notice, which is different from and more honest than a middling three.
 */
export function CheckInCard({ nowMs = Date.now() }: { nowMs?: number }) {
  const { checkIns, protocols, measurements } = useProfileData();
  const saveCheckIn = useStore((s) => s.saveCheckIn);
  const recordVitals = useStore((s) => s.recordVitals);

  const today = startOfLocalDay(nowMs);
  const existing = useMemo(() => checkInFor(checkIns, today), [checkIns, today]);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<RatingDraft>({});
  const [notes, setNotes] = useState("");

  const coverage = useMemo(() => streak(checkIns, nowMs), [checkIns, nowMs]);
  const means = useMemo(() => averages(checkIns.slice(0, 14)), [checkIns]);

  /**
   * Compared against the newest protocol's start, which is the change most
   * likely to explain a shift. Only shown once both sides have enough days
   * behind them to be worth reading.
   */
  const shifts = useMemo(() => {
    const newest = [...protocols].sort((a, b) => b.startedAt - a.startedAt)[0];
    if (!newest) return [];
    return shiftAround(checkIns, newest.startedAt, 28, nowMs).filter(isTrendworthy);
  }, [checkIns, protocols, nowMs]);

  /**
   * Pull sleep and resting heart rate once per mount.
   *
   * Once, not on a timer: this is context for a rating, not a live feed, and a
   * repeating native call would cost battery for numbers that change nightly.
   * The ref guards against React running the effect twice in development.
   * Every failure mode here is silent by design, since a device with no health
   * store, or with permission withheld for these two types specifically, is a
   * normal state and not something to interrupt anyone about.
   */
  const pulled = useRef(false);
  useEffect(() => {
    if (pulled.current) return;
    pulled.current = true;

    let cancelled = false;
    (async () => {
      const adapter = await getHealthAdapter();
      if ((await adapter.availability()) !== "available" || cancelled) return;

      const since = nowMs - 30 * 86_400_000;
      const [sleep, hr] = await Promise.all([
        adapter.readSleep(since),
        adapter.readRestingHr(since),
      ]);
      if (cancelled) return;

      const nights = nightlySleep(sleep, startOfLocalDay);
      const rates = dailyRestingHr(hr, startOfLocalDay);
      const byDay = new Map<number, { sleepHours?: number; restingHrBpm?: number }>();

      for (const n of nights) byDay.set(n.day, { sleepHours: n.hours });
      for (const r of rates) {
        byDay.set(r.day, { ...byDay.get(r.day), restingHrBpm: r.bpm });
      }
      for (const [day, vitals] of byDay) recordVitals(day, vitals);
    })().catch(() => {
      // Nothing to do and nothing worth saying.
    });

    return () => {
      cancelled = true;
    };
  }, [nowMs, recordVitals]);

  /** What the platform reported for the day being rated. */
  const vitals = useMemo(
    () => measurements.find((m) => m.externalId === `hc-vitals:${today}`),
    [measurements, today]);

  function begin() {
    setDraft(existing?.ratings ?? {});
    setNotes(existing?.notes ?? "");
    setOpen(true);
  }

  function save() {
    saveCheckIn(today, draft, notes.trim() || undefined);
    setOpen(false);
  }

  const rated = ratedCount(draft);

  return (
    <Card className="p-5">
      <SectionLabel
        action={
          !open && (
            <button
              type="button"
              onClick={begin}
              className="press flex items-center gap-1 rounded-[var(--r-pill)] bg-[var(--mint-soft)] px-2.5 py-1 text-[12px] font-bold text-[var(--mint-ink)]"
            >
              {existing ? <Check size={13} strokeWidth={2.8} /> : null}
              {existing ? "Rated" : "Rate today"}
            </button>
          )
        }
      >
        <span className="inline-flex items-center gap-1.5">
          <HeartPulse size={13} strokeWidth={2.6} /> How you feel
        </span>
      </SectionLabel>

      {open ? (
        <div className="mt-3 space-y-3">
          <CheckInEditor
            draft={draft}
            onDraft={setDraft}
            notes={notes}
            onNotes={setNotes}
            vitals={vitals}
            notePlaceholder="Anything worth remembering about today"
          />

          {/*
            Where it goes afterwards, said here rather than left to be
            discovered. Somebody wrote a note about a bad night, went looking
            for it the next week, and found no screen that showed it.
          */}
          <p className="text-[11.5px] text-[var(--faint)]">
            Saved days show up in the{" "}
            <Link href="/log" className="underline hover:text-[var(--ink)]">
              Log
            </Link>
            , beside the doses from that day.
          </p>

          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={save} className="flex-1">
              Save {rated > 0 ? `${rated} of ${SYMPTOMS.length}` : "blank"}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {means.map((m) => (
              <div key={m.id} className="rounded-[var(--r-inner)] bg-[var(--sunken)] px-2.5 py-2">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--faint)]">
                  {m.label}
                </p>
                <p className="tnum mt-0.5 text-[17px] font-extrabold leading-none text-[var(--ink)]">
                  {m.mean == null ? (
                    <span className="text-[13px] font-semibold text-[var(--faint)]">n/a</span>
                  ) : (
                    trim(m.mean, 1)
                  )}
                </p>
              </div>
            ))}
          </div>

          <p className="text-[12px] text-[var(--muted)]">
            {coverage.last30 === 0
              ? "Nothing rated yet. A week of these makes the rest of this page mean something."
              : `Average of the last 14 days. ${coverage.last30} of the last 30 days rated${
                  coverage.current > 1 ? `, ${coverage.current} in a row` : ""
                }.`}
          </p>

          {shifts.length > 0 && (
            <div className="rounded-[var(--r-inner)] bg-[var(--sunken)] p-3">
              <p className="text-[11.5px] font-bold text-[var(--ink)]">Since your newest protocol</p>
              <ul className="mt-1.5 space-y-1">
                {shifts.map((s) => {
                  const up = (s.delta ?? 0) > 0;
                  const flat = Math.abs(s.delta ?? 0) < 0.25;
                  // Appetite has no good direction, so it is reported without
                  // a colour that implies one.
                  const good = s.higherIsBetter == null ? null : up === s.higherIsBetter;
                  const tone = flat
                    ? "var(--faint)"
                    : good == null
                      ? "var(--muted)"
                      : good
                        ? "var(--leaf-ink)"
                        : "var(--tangerine-ink)";
                  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
                  return (
                    <li key={s.id} className="flex items-center gap-2 text-[12.5px]">
                      <Icon size={13} strokeWidth={2.6} style={{ color: tone }} />
                      <span className="text-[var(--muted)]">{s.label}</span>
                      <span className="tnum ml-auto font-bold" style={{ color: tone }}>
                        {trim(s.before ?? 0, 1)} to {trim(s.after ?? 0, 1)}
                      </span>
                      <span className="text-[11px] text-[var(--faint)]">
                        {s.daysBefore}d / {s.daysAfter}d
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
