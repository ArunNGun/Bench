"use client";

import { Moon } from "lucide-react";
import { Textarea } from "./ui";
import { SYMPTOMS, SYMPTOM_SCALE_MAX, type SymptomId } from "@/lib/types";
import { trim } from "@/lib/format";

export type RatingDraft = Partial<Record<SymptomId, number>>;

/**
 * The scale, the note, and what the phone recorded that night.
 *
 * Lifted out of the card on Today when a day in the Log became editable too.
 * Two copies of a rating scale is exactly the kind of duplication that ends
 * with one screen offering five points and the other six, or with tapping a
 * value to clear it working in one place and not the other.
 *
 * Controlled, deliberately. The two callers differ in what saving means, one
 * closes a panel and the other closes a sheet and may delete instead, so the
 * draft belongs to them and this renders it.
 */
export function CheckInEditor({
  draft,
  onDraft,
  notes,
  onNotes,
  vitals,
  notePlaceholder = "Anything worth remembering about this day",
}: {
  draft: RatingDraft;
  onDraft: (next: RatingDraft) => void;
  notes: string;
  onNotes: (next: string) => void;
  /** Sleep and resting heart rate for the day, when the platform reported any. */
  vitals?: { sleepHours?: number; restingHrBpm?: number };
  notePlaceholder?: string;
}) {
  return (
    <div className="space-y-3">
      {SYMPTOMS.map((s) => (
        <div key={s.id}>
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] font-semibold text-[var(--ink)]">{s.label}</span>
            <span className="text-[11px] text-[var(--faint)]">
              {draft[s.id] ? `${s.low} to ${s.high}` : "not rated"}
            </span>
          </div>
          <div className="mt-1.5 flex gap-1.5">
            {Array.from({ length: SYMPTOM_SCALE_MAX }, (_, i) => i + 1).map((n) => {
              const on = draft[s.id] === n;
              return (
                <button
                  key={n}
                  type="button"
                  aria-label={`${s.label} ${n} of ${SYMPTOM_SCALE_MAX}`}
                  aria-pressed={on}
                  onClick={() => {
                    // Tapping the current value clears it, so a rating given by
                    // accident can be taken back rather than being stuck at
                    // whatever was pressed first.
                    const next = { ...draft };
                    if (next[s.id] === n) delete next[s.id];
                    else next[s.id] = n;
                    onDraft(next);
                  }}
                  className="press h-8 flex-1 rounded-[var(--r-btn)] text-[12px] font-bold"
                  style={{
                    background: on ? "var(--mint)" : "var(--sunken)",
                    color: on ? "var(--on-accent)" : "var(--muted)",
                  }}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {(vitals?.sleepHours != null || vitals?.restingHrBpm != null) && (
        <p className="flex items-center gap-1.5 text-[12px] text-[var(--muted)]">
          <Moon size={12} strokeWidth={2.4} />
          Your phone recorded
          {vitals.sleepHours != null ? ` ${trim(vitals.sleepHours, 1)} h asleep` : ""}
          {vitals.sleepHours != null && vitals.restingHrBpm != null ? " and" : ""}
          {vitals.restingHrBpm != null ? ` a resting pulse of ${Math.round(vitals.restingHrBpm)}` : ""}
          .
        </p>
      )}

      <Textarea
        value={notes}
        onChange={(e) => onNotes(e.target.value)}
        placeholder={notePlaceholder}
        className="text-[13px]"
      />
    </div>
  );
}

/** How many axes carry a rating, for the label on a save button. */
export const ratedCount = (draft: RatingDraft) => Object.keys(draft).length;
