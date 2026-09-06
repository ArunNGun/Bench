"use client";

import { useCallback, useEffect, useState } from "react";
import { LifeBuoy, Undo2, X } from "lucide-react";
import { Button, Callout, Card, SectionLabel } from "./ui";
import { clearRescue, readRescue, useStore } from "@/lib/store";
import { describeLoss, recoverable, type Rescue } from "@/lib/calc/rescue";
import { formatDateTime } from "@/lib/format";

/**
 * Says that records disappeared, and offers them back.
 *
 * This exists because twice a collection emptied itself and nobody found out
 * for days, both times by accident, and both times the data was only
 * recoverable because an export happened to be lying around. The app had no
 * opinion about a write that destroys records, so there was nothing to notice.
 *
 * Invisible unless there is something to say, which is almost always. A panel
 * that is usually empty is not clutter; a panel that cries wolf would be, which
 * is why the bar for keeping a copy at all is set high enough that ordinary
 * deleting never reaches it.
 */
export function RescueNotice() {
  const hydrated = useStore((s) => s.hydrated);
  const exportData = useStore((s) => s.exportData);
  const putRecordsBack = useStore((s) => s.putRecordsBack);

  const [rescue, setRescue] = useState<Rescue | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const look = useCallback(() => {
    readRescue().then(setRescue).catch(() => setRescue(null));
  }, []);

  useEffect(() => {
    if (hydrated) look();
  }, [hydrated, look]);

  if (!rescue?.losses.length) return null;

  // What is actually still missing, rather than what went at the time. A person
  // who has already put the rows back by importing a file should be told there
  // is nothing to do, not offered a button that would do nothing.
  const missing = recoverable(exportData(), rescue);

  async function putBack() {
    putRecordsBack(rescue!);
    await clearRescue();
    setDone(
      missing.length
        ? `Put back ${missing.map((l) => describeLoss({ ...l, from: l.to, to: l.from })).join(", ")}.`
        : "Nothing was missing any more.");
    setRescue(null);
  }

  async function dismiss() {
    await clearRescue();
    setRescue(null);
    setDone(null);
  }

  return (
    <Card className="space-y-4 border-[var(--tangerine)]/40 p-4">
      <SectionLabel>
        <span className="inline-flex items-center gap-1.5">
          <LifeBuoy size={13} strokeWidth={2.6} /> Something disappeared
        </span>
      </SectionLabel>

      <Callout tone="warn">
        {rescue.losses.map((l) => describeLoss(l)).join(", ")} went missing on{" "}
        {formatDateTime(rescue.at)}. A copy was kept at the moment it happened, so nothing is
        actually gone yet.
      </Callout>

      <p className="text-[13px] leading-relaxed text-[var(--muted)]">
        {missing.length
          ? "Putting them back adds only the rows that are still missing. Anything you have recorded since stays exactly as it is."
          : "They are already back, so there is nothing left to put back. This notice can go."}
      </p>

      <div className="flex flex-wrap items-center gap-2.5">
        {missing.length > 0 && (
          <Button variant="primary" onClick={putBack}>
            <Undo2 size={15} /> Put them back
          </Button>
        )}
        <Button variant="ghost" onClick={dismiss}>
          <X size={15} /> {missing.length ? "I meant to delete them" : "Dismiss"}
        </Button>
      </div>

      {done && <p className="text-[13px] font-medium text-[var(--ink)]">{done}</p>}

      <p className="text-[12px] leading-relaxed text-[var(--faint)]">
        Dismissing throws the copy away, so do that only if the loss was deliberate. If it was not,
        keep the copy and export a file first: this notice is the only place the rows still exist.
      </p>
    </Card>
  );
}
