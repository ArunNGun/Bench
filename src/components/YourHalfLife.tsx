"use client";

/**
 * Your own half-life for a compound the library has no published figure for.
 *
 * The library refuses to ship a number nobody measured, which is right, and
 * leaves people who are running these compounds with no curve at all, which is
 * unhelpful. This is the way out that does not require the library to lie: the
 * figure is yours, it lives in your data and your backup, it reaches nobody
 * else, and everything it draws is labelled as coming from you.
 *
 * Deliberately never offered where a published human half-life exists. Letting
 * someone quietly overwrite an approved label with a forum number is the
 * failure this whole design is arranged to avoid, and the value of being able
 * to model KPV does not extend to being able to contradict a prescribing
 * label.
 */

import { useState } from "react";
import { Check, Pencil, Trash2 } from "lucide-react";
import { Button, NumberInput, TextInput } from "./ui";
import { useStore } from "@/lib/store";
import { formatDate, formatHalfLife } from "@/lib/format";

export function YourHalfLife({ peptideId, name }: { peptideId: string; name: string }) {
  const mine = useStore((s) => s.halfLifeOverrides)?.[peptideId];
  const setHalfLifeOverride = useStore((s) => s.setHalfLifeOverride);

  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState<number | "">(mine?.hours ?? "");
  const [note, setNote] = useState(mine?.note ?? "");

  function save() {
    if (hours === "" || !(Number(hours) > 0)) return;
    setHalfLifeOverride(peptideId, Number(hours), note.trim() || undefined);
    setOpen(false);
  }

  if (!open) {
    return (
      <div className="border-t border-[var(--line)] px-4 py-3">
        {mine ? (
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <span className="text-[var(--muted)]">
              Your figure: <strong className="text-[var(--ink)]">{formatHalfLife(mine.hours)}</strong>
              {mine.note ? `, ${mine.note}` : ""}
            </span>
            <span className="text-[var(--faint)]">set {formatDate(mine.setAt)}</span>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label={`Change your half-life for ${name}`}
              className="press ml-auto p-1 text-[var(--faint)] hover:text-[var(--ink)]"
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={() => setHalfLifeOverride(peptideId, null)}
              aria-label={`Remove your half-life for ${name}`}
              className="press p-1 text-[var(--faint)] hover:text-[var(--rose)]"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ) : (
          <Button variant="soft" onClick={() => setOpen(true)} className="px-2.5 py-1 text-[12px]">
            <Pencil size={13} /> Use your own half-life
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t border-[var(--line)] px-4 py-3">
      <p className="text-[12px] leading-relaxed text-[var(--muted)]">
        A curve drawn from this is yours, not the library&apos;s. It stays on this device, travels
        with your backups, and is marked as your figure everywhere it appears. If a published human
        half-life is ever added for {name}, that one takes over.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[12px] text-[var(--muted)]">Half-life, in hours</span>
          <NumberInput
            value={hours}
            min={0}
            step={0.5}
            onChange={(e) => setHours(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] text-[var(--muted)]">
            Where you got it, optional
          </span>
          <TextInput
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. vendor datasheet, a paper, a forum"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button variant="primary" onClick={save}>
          <Check size={14} /> Save my figure
        </Button>
      </div>
    </div>
  );
}
