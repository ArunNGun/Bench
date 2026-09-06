"use client";

import { useEffect, useRef } from "react";
import { useStore, useProfileData, allPeptides } from "@/lib/store";
import { remindersFor } from "@/lib/calc/reminders";
import { getNotifyAdapter } from "@/lib/notify/adapter";
import { DEFAULT_REMINDERS } from "@/lib/types";

/**
 * Keeps the device's alarms in step with the plan.
 *
 * Mounted in the app frame rather than on the settings screen, for the same
 * reason the backup runner is: a reminder that only re-arms while you are
 * looking at Settings is a reminder for last week's plan.
 *
 * Cancel everything and re-arm from scratch, every time anything that could
 * move a dose changes. That is deliberately blunt. Plans change in ways that
 * move many doses at once, a phase boundary shifts, a protocol is paused, a
 * profile is switched, a dose is logged early, and reconciling alarm by alarm
 * is how a notification survives for a dose that no longer exists. Re-deriving
 * the whole set is cheap and cannot drift.
 *
 * Re-arming is throttled to the state actually changing, not to a timer. The
 * fortnight horizon means the set only needs refreshing when the app is opened
 * or the plan is edited, and both of those change the state this watches.
 */
export function ReminderRunner() {
  const hydrated = useStore((s) => s.hydrated);
  const settings = useStore((s) => s.settings);
  const customPeptides = useStore((s) => s.customPeptides);
  const { protocols, logs } = useProfileData();

  // What was last armed, so an unrelated render does not re-arm the phone.
  const lastRef = useRef<string>("");

  useEffect(() => {
    // Before hydration the store still holds EMPTY_DATA, and arming from that
    // would cancel every real alarm and put nothing back.
    if (!hydrated) return;

    const reminders = remindersFor({
      protocols,
      logs,
      peptides: allPeptides(customPeptides),
      settings: settings.reminders ?? DEFAULT_REMINDERS,
      nowMs: Date.now(),
    });

    const signature = reminders.map((r) => `${r.id}@${r.at}:${r.title}|${r.body}`).join(",");
    if (signature === lastRef.current) return;
    lastRef.current = signature;

    (async () => {
      const notifier = await getNotifyAdapter();
      if (!reminders.length) {
        await notifier.clear();
        return;
      }
      await notifier.arm(reminders);
    })();
  }, [hydrated, protocols, logs, customPeptides, settings.reminders]);

  return null;
}
