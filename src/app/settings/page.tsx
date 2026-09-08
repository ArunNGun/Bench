"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Download,
  ExternalLink,
  HardDriveDownload,
  Printer,
  RefreshCw,
  RotateCcw,
  Sheet,
  Trash2,
} from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Field,
  NumberInput,
  Card,
  SectionLabel,
  Rich,
  Select,
} from "@/components/ui";
import { useStore, useProfileData } from "@/lib/store";
import { findPeptide, useActiveProfile } from "@/lib/store";
import {
  AVAILABILITY_MESSAGE,
  getHealthAdapter,
  type HealthAvailability,
} from "@/lib/health/adapter";
import { describeSync, planPull, summarise } from "@/lib/calc/healthsync";
import { backupsAvailable, readBackup, readBackupList } from "@/lib/backup/store";
import { runBackup } from "@/lib/backup/run";
import { downloadJson, exportFileName } from "@/lib/backup/download";
import type { BackupFile } from "@/lib/backup/plan";
import { formatMoney } from "@/lib/calc/cost";
import { fromDisplayWeight, toDisplayWeight } from "@/lib/calc/outcomes";
import { formatDate, relativeTime, trim } from "@/lib/format";
import { CURRENCIES, DEFAULT_SETTINGS, PROFILE_TONES } from "@/lib/types";
import { doseCsv } from "@/lib/calc/dosecsv";
import type { WeightUnit } from "@/lib/types";
import { AddFirstProfile, Avatar } from "@/components/ProfileSwitcher";
import { ImportPanel } from "@/components/ImportPanel";
import { AccountCard } from "@/components/AccountCard";
import { AdminPanel } from "@/components/AdminPanel";
import { SyncPanel } from "@/components/SyncPanel";
import { RemindersPanel } from "@/components/RemindersPanel";
import { SyringeField } from "@/components/SyringePicker";
import { RescueNotice } from "@/components/RescueNotice";
import { TONE_SOLID } from "@/components/ui";
import type { AppData } from "@/lib/types";
import { UpdateButton } from "@/components/UpdateButton";
import { useLang } from "@/lib/i18n";

export default function SettingsPage() {
  const hydrated = useStore((s) => s.hydrated);
  const { t } = useLang();
  const { protocols, logs, vials } = useProfileData();
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const exportData = useStore((s) => s.exportData);
  const resetAll = useStore((s) => s.resetAll);
  const custom = useStore((s) => s.customPeptides);

  const [message, setMessage] = useState<{ tone: "info" | "danger"; text: string } | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  function download() {
    downloadJson(exportData(), exportFileName());
    // Recording this is what lets the backup reminder go quiet, without it the
    // app cannot tell an exported history from an unprotected one.
    updateSettings({ lastBackupAt: Date.now() });
    setMessage({ tone: "info", text: t("settings_exported_note") });
  }

  /** CSV of the dose history, for a spreadsheet or to hand to a clinician. */
  function downloadCsv() {
    const { rows, text } = doseCsv(logs, (id) => findPeptide(custom, id)?.name ?? id);

    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bench-doses-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ tone: "info", text: t("settings_exported_csv", { n: rows.length }) });
  }

  if (!hydrated) {
    return <div className="py-20 text-center text-[14px] text-[var(--faint)]">{t("loading")}</div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-[24px] font-extrabold tracking-tight text-[var(--ink)]">{t("settings_title")}</h1>
      </header>

      {message && <Callout tone={message.tone}>{message.text}</Callout>}

      {/*
        First, and above everything else on the page. If records have gone
        missing, that is the most important thing this screen has to say.
      */}
      <RescueNotice />

      <Profiles />

      <RemindersPanel />

      <HealthConnect />

      <Backups />

      <ImportPanel />

      <AccountCard />

      <SyncPanel />

      <AdminPanel />

      <Card className="space-y-4 p-4">
        <SectionLabel>{t("settings_defaults")}</SectionLabel>

        <Field
          label={t("settings_usual_syringe")}
          hint={t("settings_usual_syringe_hint")}
        >
          <SyringeField
            value={settings.defaultSyringeId ?? ""}
            onChange={(id) => updateSettings({ defaultSyringeId: id || undefined })}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("settings_currency")}
            hint={t("settings_currency_hint", {
              example: formatMoney(15000, settings.currency ?? DEFAULT_SETTINGS.currency),
            })}
          >
            <Select
              value={settings.currency ?? DEFAULT_SETTINGS.currency}
              onChange={(e) => updateSettings({ currency: e.target.value })}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t("settings_weight_in")} hint={t("settings_weight_hint")}>
            <Select
              value={settings.weightUnit ?? DEFAULT_SETTINGS.weightUnit}
              onChange={(e) => updateSettings({ weightUnit: e.target.value as WeightUnit })}
            >
              <option value="kg">{t("settings_kilograms")}</option>
              <option value="lb">{t("settings_pounds")}</option>
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("settings_warn_vial_dates")} hint={t("settings_warn_vial_hint")}>
            <NumberInput
              value={settings.budWarningDays}
              min={0}
              max={28}
              suffix={t("days")}
              onChange={(e) => updateSettings({ budWarningDays: Number(e.target.value) })}
            />
          </Field>
          <Field label={t("settings_low_stock_at")} hint={t("settings_low_stock_hint")}>
            <NumberInput
              value={settings.lowStockDoses}
              min={0}
              max={60}
              suffix={t("settings_doses_suffix")}
              onChange={(e) => updateSettings({ lowStockDoses: Number(e.target.value) })}
            />
          </Field>
        </div>

        <Field
          label={t("settings_group_vials")}
          hint={t("settings_group_vials_desc")}
        >
          <Select
            value={settings.groupIdenticalVials ? "on" : "off"}
            onChange={(e) => updateSettings({ groupIdenticalVials: e.target.value === "on" })}
          >
            <option value="off">{t("settings_one_row_vial")}</option>
            <option value="on">{t("settings_one_row_compound")}</option>
          </Select>
        </Field>
      </Card>

      <Card className="space-y-4 p-4">
        <SectionLabel>{t("settings_your_data")}</SectionLabel>
        <p className="text-[13.5px] leading-relaxed text-[var(--muted)]">
          {t("settings_data_note")}
        </p>
        <p className="text-[13px] leading-relaxed text-[var(--faint)]">
          {t("settings_backup_button_note")}
        </p>

        <div className="flex flex-wrap gap-2.5">
          <Button onClick={download}>
            <Download size={15} /> {t("settings_export_file")}
          </Button>
          <Button onClick={downloadCsv} disabled={!logs.length}>
            <Sheet size={15} /> {t("settings_doses_csv")}
          </Button>
          <ButtonLink href="/report">
            <Printer size={15} /> {t("settings_report_clinician")}
          </ButtonLink>
        </div>
        <p className="text-[12.5px] text-[var(--muted)]">
          <Rich text={t("settings_bring_data_back")} />
        </p>

        <p className="text-[12.5px] text-[var(--faint)]">
          {t("settings_currently_holding", {
            doses: t("count_doses", { n: logs.length }),
            protocols: t("count_protocols", { n: protocols.length }),
            vials: t("count_vials", { n: vials.length }),
          })}
        </p>
      </Card>

      <Card className="space-y-3 border-[var(--rose)]/35 p-4">
        <SectionLabel>{t("settings_erase")}</SectionLabel>
        <p className="text-[13.5px] leading-relaxed text-[var(--muted)]">
          {t("settings_erase_desc")}
        </p>
        {confirmingReset ? (
          <div className="flex flex-wrap gap-2.5">
            <Button variant="ghost" onClick={() => setConfirmingReset(false)}>
              {t("settings_keep_my_data")}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                resetAll();
                setConfirmingReset(false);
                setMessage({ tone: "danger", text: t("settings_erased") });
              }}
            >
              {t("settings_erase_confirm", { n: logs.length + protocols.length + vials.length })}
            </Button>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setConfirmingReset(true)}>
            {t("settings_erase")}
          </Button>
        )}
      </Card>

      <UpdateButton />

      <Card className="space-y-3 p-4">
        <SectionLabel
          action={
            <Link
              href="/about"
              className="press rounded-[var(--r-pill)] bg-[var(--sunken)] px-2.5 py-1 text-[12px] font-bold text-[var(--ink)]"
            >
              {t("about_title")}
            </Link>
          }
        >
          {t("settings_what_it_is")}
        </SectionLabel>
        <div className="space-y-2.5 text-[13px] leading-relaxed text-[var(--muted)]">
          <p>
            {t("settings_about_1")}
          </p>
          <p>
            {t("settings_about_2")}
          </p>
          <p>
            {t("settings_about_3")}
          </p>
        </div>
      </Card>
    </div>
  );
}


/**
 * Profile management. A profile is a person: their own protocols, doses and
 * stock, plus the body weight that lets the app work in mcg/kg.
 */
function Profiles() {
  const { t } = useLang();
  const profiles = useStore((s) => s.profiles);
  const active = useActiveProfile();
  const updateProfile = useStore((s) => s.updateProfile);
  const removeProfile = useStore((s) => s.removeProfile);
  const switchProfile = useStore((s) => s.switchProfile);
  const protocols = useStore((s) => s.protocols);
  const logs = useStore((s) => s.logs);
  const [confirming, setConfirming] = useState<string | null>(null);

  // The field above this panel decides the unit. Reading it here is what was
  // missing: the input was hard-wired to kilograms and ignored the setting.
  const unit = useStore((s) => s.settings.weightUnit) ?? DEFAULT_SETTINGS.weightUnit;

  return (
    <Card className="space-y-4 p-4">
      <SectionLabel>{t("settings_profiles")}</SectionLabel>
      <p className="text-[13px] leading-relaxed text-[var(--muted)]">
        {t("settings_profiles_note")}
      </p>

      <div className="space-y-2.5">
        {profiles.map((p) => {
          const isActive = p.id === active.id;
          const counts = {
            protocols: protocols.filter((x) => x.profileId === p.id).length,
            doses: logs.filter((x) => x.profileId === p.id).length,
          };

          return (
            <div
              key={p.id}
              className="rounded-[var(--r-inner)] p-3"
              style={{
                background: isActive ? "var(--sunken)" : "transparent",
                border: `1px solid ${isActive ? TONE_SOLID[p.tone] : "var(--line)"}`,
              }}
            >
              <div className="flex flex-wrap items-center gap-3">
                <Avatar profile={p} size={36} />

                <input
                  value={p.name}
                  onChange={(e) => updateProfile(p.id, { name: e.target.value })}
                  aria-label={t("settings_name_for", { name: p.name })}
                  className="min-w-28 flex-1 rounded-[var(--r-btn)] border border-transparent bg-transparent px-2 py-1.5 text-[15px] font-semibold text-[var(--ink)] hover:border-[var(--line)] focus:border-[var(--mint)] focus:bg-[var(--card)] focus:outline-none"
                />

                {isActive ? (
                  <Badge tone={p.tone}>{t("settings_showing")}</Badge>
                ) : (
                  <Button variant="soft" onClick={() => switchProfile(p.id)} className="py-2 text-[13px]">
                    {t("settings_switch_to")}
                  </Button>
                )}

                {profiles.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setConfirming(confirming === p.id ? null : p.id)}
                    aria-label={t("plan_delete_named", { name: p.name })}
                    className="press p-2 text-[var(--faint)] hover:text-[var(--rose)]"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-3">
                <Field label={t("settings_body_weight")} className="w-36">
                  <NumberInput
                    // Rounded on the way out so that converting back and forth
                    // between the two units cannot leave 79.99999999 in the box
                    // while someone is still typing.
                    value={p.weightKg == null ? "" : trim(toDisplayWeight(p.weightKg, unit), 1)}
                    min={0}
                    step={unit === "lb" ? 1 : 0.5}
                    suffix={unit}
                    placeholder=", "
                    onChange={(e) =>
                      updateProfile(p.id, {
                        weightKg:
                          e.target.value === ""
                            ? undefined
                            : fromDisplayWeight(Number(e.target.value), unit),
                      })
                    }
                  />
                </Field>

                <div className="flex gap-1.5 pb-1">
                  {PROFILE_TONES.map((tone) => (
                    <button
                      key={tone}
                      type="button"
                      aria-label={t("settings_colour", { tone })}
                      aria-pressed={p.tone === tone}
                      onClick={() => updateProfile(p.id, { tone })}
                      className="press h-6 w-6 rounded-[var(--r-pill)]"
                      style={{
                        background: TONE_SOLID[tone],
                        outline: p.tone === tone ? "2px solid var(--ink)" : "none",
                        outlineOffset: 2,
                      }}
                    />
                  ))}
                </div>

                <p className="ml-auto pb-2 text-[12px] text-[var(--muted)]">
                  {t("count_protocols", { n: counts.protocols })} ·{" "}
                  {t("count_doses", { n: counts.doses })}
                </p>
              </div>

              <p className="mt-1.5 text-[11.5px] text-[var(--faint)]">
                {p.weightKg
                  ? t("settings_weight_set")
                  : t("settings_weight_unset")}
              </p>

              {confirming === p.id && (
                <div className="mt-3 rounded-[var(--r-inner)] bg-[var(--rose-soft)] p-3">
                  <p className="text-[13px] leading-relaxed" style={{ color: "var(--rose-ink)" }}>
                    {t("settings_delete_profile_confirm", {
                      name: p.name,
                      protocols: t("count_protocols", { n: counts.protocols }),
                      doses: t("count_doses", { n: counts.doses }),
                    })}
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <Button variant="soft" onClick={() => setConfirming(null)}>
                      {t("keep")}
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => {
                        removeProfile(p.id);
                        setConfirming(null);
                      }}
                    >
                      {t("plan_delete_named", { name: p.name })}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AddFirstProfile />
    </Card>
  );
}


/**
 * Automatic backups.
 *
 * The gap this closes: everything lives in IndexedDB on one device, so clearing
 * app storage or losing the phone erases the lot, and the only safeguard was
 * remembering to press Export. This writes the same file on a schedule, keeps a
 * few, and can restore any of them.
 */
function Backups() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const exportData = useStore((s) => s.exportData);
  const importData = useStore((s) => s.importData);

  const [available, setAvailable] = useState<boolean | null>(null);
  const [files, setFiles] = useState<BackupFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const refresh = async () => setFiles(await readBackupList());

  useEffect(() => {
    const ok = backupsAvailable();
    setAvailable(ok);
    if (ok) refresh();
  }, []);

  async function backupNow() {
    setBusy(true);
    setNote(null);
    try {
      const outcome = await runBackup(exportData(), Date.now(), settings.backupKeep);
      if (outcome.ok) {
        updateSettings({ lastBackupAt: Date.now() });
        setNote(
          outcome.pruned
            ? t("settings_backup_saved", { name: outcome.name ?? "", n: outcome.pruned })
            : t("settings_backup_written", { name: outcome.name ?? "" }));
        await refresh();
      } else {
        setNote(outcome.reason ?? t("settings_backup_write_failed"));
      }
    } finally {
      setBusy(false);
    }
  }

  const { t } = useLang(); // backup section
  async function restore(name: string) {
    setBusy(true);
    setNote(null);
    try {
      const text = await readBackup(name);
      if (!text) {
        setNote(t("settings_backup_read_failed"));
        return;
      }
      const parsed = JSON.parse(text) as AppData;
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.logs)) {
        setNote(t("settings_backup_not_bench"));
        return;
      }
      importData(parsed);
      setNote(
        t("settings_restored_from", {
          name,
          doses: t("count_doses", { n: parsed.logs.length }),
          protocols: t("count_protocols", { n: parsed.protocols?.length ?? 0 }),
          vials: t("count_vials", { n: parsed.vials?.length ?? 0 }),
        }));
    } catch {
      setNote(t("settings_backup_unreadable"));
    } finally {
      setConfirming(null);
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4 p-4">
      <SectionLabel>{t("settings_backups")}</SectionLabel>

      <p className="text-[13px] leading-relaxed text-[var(--muted)]">
        <Rich text={t("settings_backups_desc")} />
      </p>

      {available === false && (
        <Callout tone="info">
          <Rich text={t("settings_backups_web", { export: t("settings_export_file") })} />
        </Callout>
      )}

      {available && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t("settings_take_one")} hint={t("settings_take_one_hint")}>
              <Select
                value={settings.backupEnabled ? String(settings.backupIntervalHours) : "off"}
                onChange={(e) =>
                  e.target.value === "off"
                    ? updateSettings({ backupEnabled: false })
                    : updateSettings({
                        backupEnabled: true,
                        backupIntervalHours: Number(e.target.value),
                      })
                }
              >
                <option value="off">{t("reminders_never")}</option>
                <option value="6">{t("settings_every_6h")}</option>
                <option value="24">{t("plan_daily")}</option>
                <option value="168">{t("plan_weekly")}</option>
              </Select>
            </Field>

            <Field label={t("keep")} hint={t("settings_keep_hint")}>
              <NumberInput
                value={settings.backupKeep}
                min={1}
                max={50}
                suffix={t("settings_copies")}
                onChange={(e) =>
                  updateSettings({ backupKeep: Math.max(1, Number(e.target.value) || 1) })
                }
              />
            </Field>

            <Field label={t("settings_last_backup")}>
              <div className="rounded-[var(--r-btn)] border border-[var(--line)] bg-[var(--sunken)] px-3.5 py-3 text-[14px] text-[var(--muted)]">
                {settings.lastBackupAt ? relativeTime(settings.lastBackupAt) : "Never"}
              </div>
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button variant="primary" onClick={backupNow} disabled={busy}>
              <HardDriveDownload size={15} /> {busy ? t("settings_working") : t("settings_back_up_now")}
            </Button>
            <span className="text-[12.5px] text-[var(--muted)]">
              {files.length
                ? t("settings_backups_count", { n: files.length })
                : t("settings_no_backups")}
            </span>
          </div>

          {note && <p className="text-[13px] font-medium text-[var(--ink)]">{note}</p>}

          {files.length > 0 && (
            <ul className="space-y-1">
              {files.map((f) => (
                <li key={f.name} className="rounded-[var(--r-inner)] px-2.5 py-2 hover:bg-[var(--sunken)]">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="min-w-0 flex-1 text-[13px] text-[var(--ink)]">
                      {formatDate(f.at)}{" "}
                      <span className="text-[var(--faint)]">
                        {new Date(f.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {f.size != null ? ` · ${Math.max(1, Math.round(f.size / 1024))} KB` : ""}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      onClick={() => setConfirming(confirming === f.name ? null : f.name)}
                      className="py-2 text-[13px]"
                    >
                      <RotateCcw size={14} /> {t("settings_restore")}
                    </Button>
                  </div>

                  {confirming === f.name && (
                    <div className="mt-2 rounded-[var(--r-inner)] bg-[var(--rose-soft)] p-3">
                      <p className="text-[13px] leading-relaxed" style={{ color: "var(--rose-ink)" }}>
                        {t("settings_restore_confirm", { date: formatDate(f.at) })}
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        <Button variant="soft" onClick={() => setConfirming(null)}>
                          {t("settings_keep_what_i_have")}
                        </Button>
                        <Button variant="danger" disabled={busy} onClick={() => restore(f.name)}>
                          {t("settings_replace_all")}
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

/**
 * Health Connect status and manual sync.
 *
 * In a browser this can only report that the feature lives in the Android
 * build, Health Connect has no web API, so there is nothing to connect to
 * here. Saying that plainly beats a button that silently does nothing.
 */
function HealthConnect() {
  const { measurements } = useProfileData();
  const addMeasurement = useStore((s) => s.addMeasurement);
  const updateMeasurement = useStore((s) => s.updateMeasurement);

  const [state, setState] = useState<HealthAvailability | "checking">("checking");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const check = () =>
    getHealthAdapter()
      .then((a) => a.availability())
      .then(setState)
      .catch(() => setState("not-on-this-platform"));

  useEffect(() => {
    check();
  }, []);

  /** Ask Health Connect for weight access, then re-read where we stand. */
  async function connect() {
    setBusy(true);
    setResult(null);
    try {
      const adapter = await getHealthAdapter();
      const ok = await adapter.requestPermissions();
      await check();
      if (!ok) {
        setResult(t("settings_health_denied"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function openHealthSettings() {
    (await getHealthAdapter()).openSettings();
  }

  const { t } = useLang(); // health section
  async function sync() {
    setBusy(true);
    setResult(null);
    try {
      const adapter = await getHealthAdapter();

      // Only look back as far as the newest reading already stored.
      const newest = measurements.reduce((max, m) => Math.max(max, m.at), 0);
      const since = newest || Date.now() - 365 * 86_400_000;

      const plan = planPull(measurements, await adapter.readWeight(since));
      for (const s of plan.toAdd) {
        addMeasurement({ at: s.at, weightKg: s.weightKg, source: "health-connect", externalId: s.externalId });
      }
      for (const l of plan.toLink) updateMeasurement(l.id, { externalId: l.externalId });

      setResult(describeSync(summarise(plan)));
    } catch {
      setResult(t("settings_health_failed"));
    } finally {
      setBusy(false);
    }
  }

  const connected = state === "available";
  const askable = state === "permission-denied" || state === "not-installed";

  return (
    <Card className="space-y-4 p-4">
      <SectionLabel>{t("settings_health_connect")}</SectionLabel>

      <p className="text-[13px] leading-relaxed text-[var(--muted)]">
        <Rich text={t("settings_health_desc")} />
      </p>

      <Callout tone={connected ? "info" : "warn"}>
        {state === "checking" ? t("settings_checking") : AVAILABILITY_MESSAGE[state]}
      </Callout>

      {askable && (
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="primary" onClick={connect} disabled={busy}>
            <Activity size={15} /> {busy ? t("settings_waiting") : t("settings_allow_weight")}
          </Button>
          <Button variant="ghost" onClick={openHealthSettings}>
            <ExternalLink size={15} /> {t("settings_open_health_connect")}
          </Button>
        </div>
      )}

      {connected && (
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="primary" onClick={sync} disabled={busy}>
            <RefreshCw size={15} className={busy ? "animate-spin" : undefined} />
            {busy ? t("settings_syncing") : t("settings_sync_now")}
          </Button>
          <Button variant="ghost" onClick={openHealthSettings}>
            <ExternalLink size={15} /> {t("settings_open_health_connect")}
          </Button>
          <span className="text-[12.5px] text-[var(--muted)]">{t("settings_read_only")}</span>
        </div>
      )}

      {connected && (
        <p className="text-[12px] leading-relaxed text-[var(--faint)]">
          {t("settings_health_30_days")}
        </p>
      )}

      {result && <p className="text-[13px] font-medium text-[var(--ink)]">{result}</p>}
    </Card>
  );
}
