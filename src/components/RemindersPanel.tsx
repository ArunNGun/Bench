"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, CalendarPlus } from "lucide-react";
import { Button, Callout, Card, Field, SectionLabel, Select } from "@/components/ui";
import { allPeptides, useProfileData, useStore } from "@/lib/store";
import { remindersFor } from "@/lib/calc/reminders";
import { buildCalendar, calendarEventCount, calendarFileName } from "@/lib/calc/ics";
import { getNotifyAdapter, NOTIFY_MESSAGE, type NotifyAvailability } from "@/lib/notify/adapter";
import { downloadText } from "@/lib/backup/download";
import { writeToDocuments } from "@/lib/backup/store";
import { DEFAULT_REMINDERS } from "@/lib/types";
import { formatDateTime } from "@/lib/format";

/**
 * Reminders, and the calendar export that stands in for them on the web.
 *
 * Two controls and one honest paragraph about why they behave differently
 * depending on where the app is running. The temptation is to show one switch
 * everywhere and let it fail quietly in a browser; a switch that does nothing
 * is worse than no switch, so the browser is told plainly what it cannot do and
 * offered the thing it can.
 */
export function RemindersPanel() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const customPeptides = useStore((s) => s.customPeptides);
  const { protocols, logs } = useProfileData();

  const reminders = settings.reminders ?? DEFAULT_REMINDERS;

  const [state, setState] = useState<NotifyAvailability | "checking">("checking");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const check = () =>
    getNotifyAdapter()
      .then((n) => n.availability())
      .then(setState)
      .catch(() => setState("not-on-this-platform"));

  useEffect(() => {
    check();
  }, []);

  const peptides = useMemo(() => allPeptides(customPeptides), [customPeptides]);

  /** What is armed right now, so the panel can say more than "on". */
  const armed = useMemo(
    () =>
      remindersFor({
        protocols,
        logs,
        peptides,
        settings: reminders,
        nowMs: Date.now(),
      }),
    [protocols, logs, peptides, reminders]);

  const canSchedule = state === "available";
  const askable = state === "permission-denied";

  /** Turning it on is the moment to ask, and the only moment. */
  async function setEnabled(enabled: boolean, leadMinutes: number) {
    setResult(null);

    if (!enabled) {
      updateSettings({ reminders: { ...reminders, enabled: false } });
      (await getNotifyAdapter()).clear();
      return;
    }

    setBusy(true);
    try {
      const notifier = await getNotifyAdapter();
      const ok = (await notifier.availability()) === "available" || (await notifier.requestPermission());
      await check();

      if (!ok) {
        setResult(
          "Android did not grant permission to show notifications, so nothing was scheduled.");
        return;
      }
      updateSettings({ reminders: { ...reminders, enabled: true, leadMinutes } });
    } finally {
      setBusy(false);
    }
  }

  async function exportCalendar() {
    setBusy(true);
    setResult(null);
    try {
      const ics = buildCalendar({ protocols, peptides, settings: reminders, nowMs: Date.now() });
      const count = calendarEventCount(ics);
      const name = calendarFileName();

      if (!count) {
        setResult("Nothing to export. There are no scheduled doses in that window.");
        return;
      }

      const path = await writeToDocuments(name, ics);
      if (path) {
        setResult(`${count} doses written to ${path}. Open it to add them to your calendar.`);
        return;
      }

      downloadText(ics, name, "text/calendar;charset=utf-8");
      setResult(`${count} doses exported. Import ${name} into your calendar.`);
    } finally {
      setBusy(false);
    }
  }

  const next = armed[0];

  return (
    <Card className="space-y-4 p-4">
      <SectionLabel>Dose reminders</SectionLabel>

      <p className="text-[13px] leading-relaxed text-[var(--muted)]">
        A reminder at the hour a dose is due. Scheduled by the phone itself, so it works with the app
        closed and with no connection, and <strong>nothing is sent anywhere</strong>. A dose you log
        early cancels its own reminder, so the phone does not ask for something already in the leg.
      </p>

      <Callout tone={canSchedule ? "info" : "warn"}>
        {state === "checking" ? "Checking…" : NOTIFY_MESSAGE[state]}
      </Callout>

      {askable && (
        <Button variant="primary" onClick={() => setEnabled(true, reminders.leadMinutes)} disabled={busy}>
          <BellRing size={15} /> {busy ? "Waiting…" : "Allow notifications"}
        </Button>
      )}

      {canSchedule && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Remind me" hint="At the dose time, or a little before it.">
              <Select
                value={reminders.enabled ? String(reminders.leadMinutes) : "off"}
                onChange={(e) =>
                  e.target.value === "off"
                    ? setEnabled(false, reminders.leadMinutes)
                    : setEnabled(true, Number(e.target.value))
                }
              >
                <option value="off">Never</option>
                <option value="0">At the dose time</option>
                <option value="15">15 minutes before</option>
                <option value="30">30 minutes before</option>
                <option value="60">An hour before</option>
              </Select>
            </Field>

            <Field
              label="On the lock screen"
              hint="Whoever is next to you can read a notification too."
            >
              <Select
                value={reminders.showCompound ? "named" : "discreet"}
                onChange={(e) =>
                  updateSettings({
                    reminders: { ...reminders, showCompound: e.target.value === "named" },
                  })
                }
              >
                <option value="discreet">Say only that a dose is due</option>
                <option value="named">Name the compound and dose</option>
              </Select>
            </Field>
          </div>

          {reminders.enabled && (
            <p className="text-[12.5px] text-[var(--muted)]">
              {next
                ? `${armed.length} reminder${armed.length === 1 ? "" : "s"} set, next ${formatDateTime(next.at)}.`
                : "Nothing to remind you about yet. Add a protocol with a schedule."}
            </p>
          )}
        </>
      )}

      <div className="space-y-3 border-t border-[var(--line)] pt-4">
        <Field
          label="Send my doses to a calendar"
          hint="Covers the next few months. Re-export after changing a plan."
        >
          <Select
            value={String(reminders.calendarDays)}
            onChange={(e) =>
              updateSettings({
                reminders: { ...reminders, calendarDays: Number(e.target.value) },
              })
            }
          >
            <option value="30">The next month</option>
            <option value="90">The next three months</option>
            <option value="180">The next six months</option>
          </Select>
        </Field>

        <Button variant="primary" onClick={exportCalendar} disabled={busy}>
          <CalendarPlus size={15} /> {busy ? "Working…" : "Export doses to calendar"}
        </Button>

        <p className="text-[12px] leading-relaxed text-[var(--faint)]">
          Each dose becomes an event with its own alarm, so your calendar does the reminding. Import
          it into a <strong>calendar of its own</strong> rather than your main one: changing a plan
          means exporting again, and a separate calendar can be emptied in one go instead of hunting
          for events one by one.
          {reminders.showCompound && (
            <>
              {" "}
              You have chosen to name the compound. A calendar that syncs to Google or Apple carries
              that name to them, which nothing else in this app does. Switch the setting above back to
              discreet if that matters.
            </>
          )}
        </p>
      </div>

      {result && <p className="text-[13px] font-medium text-[var(--ink)]">{result}</p>}
    </Card>
  );
}
