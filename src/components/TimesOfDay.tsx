"use client";

/**
 * The times of day a dose day carries.
 *
 * One control, used by the protocol form and by every band inside it, because
 * a band that sets its own frequency has to be able to set its own times too.
 * It holds no schedule of its own: it is handed a list and reports a new one.
 *
 * The list is kept in the order it is typed rather than sorted on every
 * keystroke, which would move a field out from under the cursor. Order does not
 * matter to the maths, `scheduleTimes` sorts before anything is calculated.
 */

import { Plus, Trash2 } from "lucide-react";
import { formatDose } from "@/lib/format";

/** More than a few times a day is a different kind of protocol than this app models. */
const MAX_TIMES = 6;

/** What the split works out to, in words, or null when there is nothing to say. */
export function describeSplit(dailyMcg: number | undefined, times: string[]): string | null {
  const clean = times.filter(Boolean);
  if (clean.length < 2) return null;

  const each = dailyMcg != null && dailyMcg > 0 ? dailyMcg / clean.length : null;
  const when = [...clean].sort().join(" and ");

  return each == null
    ? `${clean.length} doses a day, at ${when}.`
    : `${formatDose(dailyMcg!)} a day, split into ${clean.length}: ${formatDose(each)} at ${when}.`;
}

export function TimesOfDay({
  times,
  onChange,
  dailyMcg,
  label = "Times of day",
  variant = "band",
}: {
  times: string[];
  onChange: (next: string[]) => void;
  /**
   * The dose for a whole dose day, so the control can say what each injection
   * comes to. Left out where the form does not know it yet.
   */
  dailyMcg?: number;
  label?: string;
  /** Headings sit differently inside a band than they do in the form. */
  variant?: "field" | "band";
}) {
  const split = describeSplit(dailyMcg, times);

  return (
    <div className={variant === "field" ? "space-y-1.5" : "space-y-2"}>
      <span
        className={
          variant === "field"
            ? "block text-[13px] font-semibold text-[var(--ink)]"
            : "block text-[11.5px] text-[var(--muted)]"
        }
      >
        {label}
      </span>

      <div className="flex flex-wrap items-center gap-2">
        {times.map((time, i) => (
          <div key={i} className="flex items-center gap-1">
            <input
              type="time"
              value={time}
              aria-label={times.length > 1 ? `Time ${i + 1} of ${times.length}` : label}
              onChange={(e) => onChange(times.map((t, x) => (x === i ? e.target.value : t)))}
              className="rounded border border-[var(--line)] bg-[var(--sunken)] px-3 py-2.5 text-[15px] text-[var(--ink)] focus:border-[var(--tangerine)] focus:outline-none"
            />
            {times.length > 1 && (
              <button
                type="button"
                aria-label={`Remove the ${time || "empty"} dose`}
                onClick={() => onChange(times.filter((_, x) => x !== i))}
                className="p-1 text-[var(--faint)] transition-colors hover:text-[var(--rose)]"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}

        {times.length < MAX_TIMES && (
          <button
            type="button"
            onClick={() => onChange([...times, ""])}
            className="inline-flex items-center gap-1 rounded border border-[var(--line)] px-2.5 py-2 text-[12.5px] text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
          >
            <Plus size={14} /> Add a time
          </button>
        )}
      </div>

      {/*
        The dose you type is the day's, so with two times it is not the number
        that ends up in the syringe. Saying so here, where both numbers are on
        screen at once, is the only place it cannot be missed.
      */}
      {split && <p className="text-[12px] text-[var(--faint)]">{split}</p>}
    </div>
  );
}
