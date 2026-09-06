"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2, X } from "lucide-react";
import { Button, Callout, Card, useBackdropDismiss } from "./ui";
import { CheckInEditor, ratedCount, type RatingDraft } from "./CheckInEditor";
import { useProfileData, useStore } from "@/lib/store";
import { checkInFor, ratableDay } from "@/lib/calc/checkins";
import { SYMPTOMS } from "@/lib/types";
import { formatDate } from "@/lib/format";

/**
 * Correct, fill in or remove one day's rating.
 *
 * Opened from the Log, where the day is already on screen. Until this existed a
 * rating was final the moment it was saved: a typo stayed, a day rated while
 * trying the feature out stayed, and a day missed stayed missed. Nothing in the
 * store had to change for it, `saveCheckIn` has always upserted on the day and
 * `removeCheckIn` has always been there, unused by any screen.
 *
 * Deleting asks first. It is the only action here that cannot be undone by
 * doing it again, and the request that prompted this asked for the prompt by
 * name.
 */
export function CheckInSheet({
  dayMs,
  onClose,
}: {
  /** Local midnight of the day being rated. Null when the sheet is closed. */
  dayMs: number | null;
  onClose: () => void;
}) {
  const { checkIns, measurements } = useProfileData();
  const saveCheckIn = useStore((s) => s.saveCheckIn);
  const removeCheckIn = useStore((s) => s.removeCheckIn);

  const existing = useMemo(
    () => (dayMs == null ? undefined : checkInFor(checkIns, dayMs)),
    [checkIns, dayMs]);

  const [draft, setDraft] = useState<RatingDraft>({});
  const [notes, setNotes] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Refill whenever the sheet opens on a different day, so yesterday's draft
  // never appears under today's date.
  useEffect(() => {
    setDraft(existing?.ratings ?? {});
    setNotes(existing?.notes ?? "");
    setConfirmingDelete(false);
  }, [dayMs, existing]);

  /** What the platform reported for that day, if anything. */
  const vitals = useMemo(
    () => measurements.find((m) => m.externalId === `hc-vitals:${dayMs}`),
    [measurements, dayMs]);

  // Above the early return, because it holds a ref and a hook that only runs
  // sometimes is a hook that changes order between renders.
  const dismiss = useBackdropDismiss(onClose);

  if (dayMs == null) return null;

  // Belt and braces with the store, which refuses the same day. A screen that
  // offers a button leading to a silent no-op is its own kind of bug.
  const allowed = ratableDay(dayMs) != null;
  const rated = ratedCount(draft);

  function save() {
    if (dayMs == null || !allowed) return;
    saveCheckIn(dayMs, draft, notes.trim() || undefined);
    onClose();
  }

  function remove() {
    if (existing) removeCheckIn(existing.id);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-[2px] sm:items-center"
      {...dismiss}
    >
      {/*
        No stopPropagation here any more. The backdrop now asks whether the
        press both started and ended on itself, which a click inside this card
        never does, so a second mechanism for the same job would only be
        somewhere else to look when it goes wrong.
      */}
      <Card
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-b-none sm:rounded"
        role="dialog"
        aria-modal="true"
        aria-label={`How ${formatDate(dayMs)} went`}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--line)] bg-[var(--card)] px-4 py-3">
          <h2 className="text-[16px] font-bold text-[var(--ink)]">
            How {formatDate(dayMs)} went
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto text-[var(--muted)] hover:text-[var(--ink)]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {!allowed && (
            <Callout tone="warn">
              That day has not happened yet. A rating is a report of a day you
              lived through, so there is nothing to record for it.
            </Callout>
          )}

          <CheckInEditor
            draft={draft}
            onDraft={setDraft}
            notes={notes}
            onNotes={setNotes}
            vitals={vitals}
          />

          {confirmingDelete ? (
            <div className="space-y-2.5 rounded-[var(--r-inner)] border border-[var(--rose)]/40 p-3">
              <p className="text-[13px] leading-relaxed text-[var(--ink)]">
                Delete this day&apos;s rating and its note? The doses logged that day are
                not touched, and this cannot be undone.
              </p>
              <div className="flex items-center gap-2">
                <Button variant="danger" onClick={remove} className="flex-1">
                  <Trash2 size={15} /> Delete it
                </Button>
                <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
                  Keep it
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="primary" onClick={save} disabled={!allowed} className="flex-1">
                Save {rated > 0 ? `${rated} of ${SYMPTOMS.length}` : "blank"}
              </Button>
              {existing && (
                <Button
                  variant="ghost"
                  onClick={() => setConfirmingDelete(true)}
                  aria-label="Delete this day's rating"
                >
                  <Trash2 size={15} />
                </Button>
              )}
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
