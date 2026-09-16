"use client";

import { useCallback, useEffect, useState } from "react";
import { LifeBuoy, Undo2, X } from "lucide-react";
import { Button, Callout, Card, SectionLabel } from "./ui";
import { clearRescue, readRescue, useStore } from "@/lib/store";
import { lostCount, recoverable, type Loss, type RecordKey, type Rescue } from "@/lib/calc/rescue";
import { formatDateTime } from "@/lib/format";
import { useLang, type PluralBase } from "@/lib/i18n";

/**
 * What each collection is called, in the reader's language.
 *
 * `Record<RecordKey, ...>` rather than a lookup with a fallback, so adding a
 * collection to `RECORD_KEYS` fails to compile until it has a name here. The
 * alternative is a screen that says "3" and leaves off the noun, on the one
 * occasion when being exact matters most.
 *
 * Five of these are families the app already had; the rest were added with
 * this. Each is a plural family rather than a noun with a number glued in
 * front, because Slovenian counts one steklenička, two steklenički, three
 * stekleničke and five stekleničk, and an app that says "5 steklenička" is an
 * app that was written in English.
 */
const LOSS_KEY: Record<RecordKey, PluralBase> = {
  profiles: "count_profiles",
  protocols: "count_protocols",
  logs: "count_doses",
  vials: "count_vials",
  measurements: "count_measurements",
  labs: "count_results",
  checkIns: "count_ratings",
  customPeptides: "count_compounds",
  orders: "count_orders",
  diluents: "count_bottles",
  compoundNotes: "count_notes",
};

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
  const { t } = useLang();
  const hydrated = useStore((s) => s.hydrated);
  const exportData = useStore((s) => s.exportData);
  const putRecordsBack = useStore((s) => s.putRecordsBack);

  const [rescue, setRescue] = useState<Rescue | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const describe = (l: Loss) => t(LOSS_KEY[l.key], { n: lostCount(l) });

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
        ? t("rescue_done", {
            // The pair is swapped because these are rows going back in rather
            // than rows that went, and the count is the difference either way.
            what: missing.map((l) => describe({ ...l, from: l.to, to: l.from })).join(", "),
          })
        : t("rescue_done_nothing"));
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
          <LifeBuoy size={13} strokeWidth={2.6} /> {t("rescue_title")}
        </span>
      </SectionLabel>

      <Callout tone="warn">
        {t("rescue_lost", {
          what: rescue.losses.map(describe).join(", "),
          when: formatDateTime(rescue.at),
        })}
      </Callout>

      <p className="text-[13px] leading-relaxed text-[var(--muted)]">
        {missing.length
          ? t("rescue_partial")
          : t("rescue_already")}
      </p>

      <div className="flex flex-wrap items-center gap-2.5">
        {missing.length > 0 && (
          <Button variant="primary" onClick={putBack}>
            <Undo2 size={15} /> {t("rescue_put_back")}
          </Button>
        )}
        <Button variant="ghost" onClick={dismiss}>
          <X size={15} /> {missing.length ? t("rescue_meant_to") : t("rescue_dismiss")}
        </Button>
      </div>

      {done && <p className="text-[13px] font-medium text-[var(--ink)]">{done}</p>}

      <p className="text-[12px] leading-relaxed text-[var(--faint)]">
        {t("rescue_footnote")}
      </p>
    </Card>
  );
}
