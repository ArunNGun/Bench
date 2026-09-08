"use client";
import { useLang } from "@/lib/i18n";

import { useEffect, useMemo, useState } from "react";
import { BellRing, CalendarPlus } from "lucide-react";
import { Button, Callout, Card, Field, Rich, SectionLabel, Select } from "@/components/ui";
import { allPeptides, useProfileData, useStore } from "@/lib/store";
import { remindersFor } from "@/lib/calc/reminders";
import { buildCalendar, calendarEventCount, calendarFileName } from "@/lib/calc/ics";
import { getNotifyAdapter, NOTIFY_MESSAGE, type NotifyAvailability } from "@/lib/notify/adapter";
import { downloadText } from "@/lib/backup/download";
import { writeToDocuments } from "@/lib/backup/store";
import { DEFAULT_REMINDERS } from "@/lib/types";
import { formatDateTime } from "@/lib/format";

/** How far ahead the calendar file reaches. */
const CALENDAR_SPANS = [7, 14, 21, 30, 60, 90, 180] as const;

/**
 * How early the nudge comes.
 *
 * One list, used by the Android reminder and by the alarm written into each
 * calendar event, because it is one setting and offering different choices in
 * the two places would suggest otherwise.
 */
const LEAD_OPTIONS = [0, 15, 30, 60] as const;

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
  const { t } = useLang();

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
        setResult(t("reminders_permission_refused"));
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
        setResult(t("reminders_nothing_to_export"));
        return;
      }

      const path = await writeToDocuments(name, ics);
      if (path) {
        setResult(
          t("reminders_written_to", { doses: t("count_doses", { n: count }), path }));
        return;
      }

      downloadText(ics, name, "text/calendar;charset=utf-8");
      setResult(t("reminders_exported", { doses: t("count_doses", { n: count }), name }));
    } finally {
      setBusy(false);
    }
  }

  const next = armed[0];

  return (
    <Card className="space-y-4 p-4">
      <SectionLabel>{t("reminders_title")}</SectionLabel>

      <p className="text-[13px] leading-relaxed text-[var(--muted)]">
        <Rich text={t("reminders_intro")} />
      </p>

      <Callout tone={canSchedule ? "info" : "warn"}>
        {state === "checking" ? t("reminders_checking") : NOTIFY_MESSAGE[state]}
      </Callout>

      {askable && (
        <Button variant="primary" onClick={() => setEnabled(true, reminders.leadMinutes)} disabled={busy}>
          <BellRing size={15} /> {busy ? t("reminders_waiting") : t("reminders_allow")}
        </Button>
      )}

      {canSchedule && (
        <>
          <Field label={t("reminders_remind_me")} hint={t("reminders_remind_me_hint")}>
            <Select
              value={reminders.enabled ? String(reminders.leadMinutes) : "off"}
              onChange={(e) =>
                e.target.value === "off"
                  ? setEnabled(false, reminders.leadMinutes)
                  : setEnabled(true, Number(e.target.value))
              }
            >
              <option value="off">{t("reminders_never")}</option>
              {LEAD_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {t(`reminders_lead_${minutes}`)}
                </option>
              ))}
            </Select>
          </Field>

          {reminders.enabled && (
            <p className="text-[12.5px] text-[var(--muted)]">
              {next
                ? t("reminders_set", {
                    reminders: t("count_reminders", { n: armed.length }),
                    when: formatDateTime(next.at),
                  })
                : t("reminders_nothing_yet")}
            </p>
          )}
        </>
      )}

      {/*
        Outside the Android block on purpose. This setting governs what the
        calendar events say as much as what a notification says, and it was
        briefly hidden in a browser, which is the surface where naming the
        compound has the furthest to travel: an event title syncs to Google or
        Apple, a lock screen does not.
      */}
      <Field
        label={t("reminders_what_it_says")}
        hint={t("reminders_what_it_says_hint")}
      >
        <Select
          value={reminders.showCompound ? "named" : "discreet"}
          onChange={(e) =>
            updateSettings({
              reminders: { ...reminders, showCompound: e.target.value === "named" },
            })
          }
        >
          <option value="discreet">{t("reminders_say_minimal")}</option>
          <option value="named">{t("reminders_say_full")}</option>
        </Select>
      </Field>

      <div className="space-y-3 border-t border-[var(--line)] pt-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("reminders_send_calendar")} hint={t("reminders_send_calendar_hint")}>
            <Select
              value={String(reminders.calendarDays)}
              onChange={(e) =>
                updateSettings({
                  reminders: { ...reminders, calendarDays: Number(e.target.value) },
                })
              }
            >
              {CALENDAR_SPANS.map((days) => (
                <option key={days} value={days}>
                  {t(`reminders_span_${days}`)}
                </option>
              ))}
            </Select>
          </Field>

          {/*
            The same lead time, under the name it goes by here. On Android it is
            already set above and applies to both, so showing it twice would be
            two controls for one value.
          */}
          {!canSchedule && (
            <Field label={t("reminders_alarm_each")} hint={t("reminders_alarm_each_hint")}>
              <Select
                value={String(reminders.leadMinutes)}
                onChange={(e) =>
                  updateSettings({
                    reminders: { ...reminders, leadMinutes: Number(e.target.value) },
                  })
                }
              >
                {LEAD_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {t(`reminders_lead_${minutes}`)}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        <Button variant="primary" onClick={exportCalendar} disabled={busy}>
          <CalendarPlus size={15} /> {busy ? t("reminders_working") : t("reminders_export")}
        </Button>

        <p className="text-[12px] leading-relaxed text-[var(--faint)]">
          <Rich text={t("reminders_calendar_note")} />
          {reminders.showCompound && <> {t("reminders_named_warning")}</>}
        </p>
      </div>

      {result && <p className="text-[13px] font-medium text-[var(--ink)]">{result}</p>}
    </Card>
  );
}
