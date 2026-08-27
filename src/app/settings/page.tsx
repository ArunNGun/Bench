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
  Select,
} from "@/components/ui";
import { useStore, useProfileData } from "@/lib/store";
import { SYRINGES } from "@/lib/calc/reconstitution";
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
import { CURRENCIES, DEFAULT_SETTINGS, INJECTION_SITES, PROFILE_TONES } from "@/lib/types";
import type { WeightUnit } from "@/lib/types";
import { AddFirstProfile, Avatar } from "@/components/ProfileSwitcher";
import { ImportPanel } from "@/components/ImportPanel";
import { SyncPanel } from "@/components/SyncPanel";
import { TONE_SOLID } from "@/components/ui";
import type { AppData } from "@/lib/types";
import { UpdateButton } from "@/components/UpdateButton";

export default function SettingsPage() {
  const hydrated = useStore((s) => s.hydrated);
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
    setMessage({ tone: "info", text: "Exported. Keep the file somewhere you control." });
  }

  /** CSV of the dose history, for a spreadsheet or to hand to a clinician. */
  function downloadCsv() {
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      "date",
      "time",
      "peptide",
      "dose_mcg",
      "dose_mg",
      "route",
      "site",
      "units",
      "syringe_scale",
      "volume_ml",
      "skipped",
      "notes",
    ];
    const rows = [...logs]
      .sort((a, b) => a.at - b.at)
      .map((l) => {
        const d = new Date(l.at);
        return [
          d.toLocaleDateString("en-CA"),
          d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          findPeptide(custom, l.peptideId)?.name ?? l.peptideId,
          l.doseMcg,
          l.doseMcg / 1000,
          l.route,
          INJECTION_SITES.find((s) => s.id === l.site)?.label ?? "",
          l.units ?? "",
          l.syringeScale ?? "",
          l.volumeMl ?? "",
          l.skipped ? "yes" : "no",
          l.notes ?? "",
        ].map(esc).join(",");
      });

    const blob = new Blob([[header.join(","), ...rows].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bench-doses-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ tone: "info", text: `Exported ${rows.length} doses as CSV.` });
  }

  if (!hydrated) {
    return <div className="py-20 text-center text-[14px] text-[var(--faint)]">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-[24px] font-extrabold tracking-tight text-[var(--ink)]">Settings</h1>
      </header>

      {message && <Callout tone={message.tone}>{message.text}</Callout>}

      <Profiles />

      <HealthConnect />

      <Backups />

      <ImportPanel />

      <SyncPanel />

      <Card className="space-y-4 p-4">
        <SectionLabel>Defaults</SectionLabel>

        <Field
          label="Usual syringe"
          hint="Used to prefill the calculator and the log sheet. You can always change it per dose."
        >
          <Select
            value={settings.defaultSyringeId ?? ""}
            onChange={(e) => updateSettings({ defaultSyringeId: e.target.value || undefined })}
          >
            <option value="">Ask each time</option>
            {SYRINGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Currency"
            hint={`Vial costs and per-dose prices show in this. Example: ${formatMoney(
              15000,
              settings.currency ?? DEFAULT_SETTINGS.currency)}`}
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

          <Field label="Weight in" hint="Stored in kilograms either way, so switching is safe.">
            <Select
              value={settings.weightUnit ?? DEFAULT_SETTINGS.weightUnit}
              onChange={(e) => updateSettings({ weightUnit: e.target.value as WeightUnit })}
            >
              <option value="kg">Kilograms</option>
              <option value="lb">Pounds</option>
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Warn about vial dates" hint="Days before the beyond-use date.">
            <NumberInput
              value={settings.budWarningDays}
              min={0}
              max={28}
              suffix="days"
              onChange={(e) => updateSettings({ budWarningDays: Number(e.target.value) })}
            />
          </Field>
          <Field label="Low stock at" hint="Doses remaining before a warning appears.">
            <NumberInput
              value={settings.lowStockDoses}
              min={0}
              max={60}
              suffix="doses"
              onChange={(e) => updateSettings({ lowStockDoses: Number(e.target.value) })}
            />
          </Field>
        </div>

        <Field
          label="Group identical vials on Stock"
          hint="Sealed vials of the same compound and strength share one row, with their doses and value added up. Open vials stay separate, because each has its own concentration and use-by date."
        >
          <Select
            value={settings.groupIdenticalVials ? "on" : "off"}
            onChange={(e) => updateSettings({ groupIdenticalVials: e.target.value === "on" })}
          >
            <option value="off">One row per vial</option>
            <option value="on">One row per compound and strength</option>
          </Select>
        </Field>
      </Card>

      <Card className="space-y-4 p-4">
        <SectionLabel>Your data</SectionLabel>
        <p className="text-[13.5px] leading-relaxed text-[var(--muted)]">
          Everything lives in this browser on this device. Unless you set up sync below, there is no
          account and no server, so nothing is uploaded and nothing is backed up for you. Clearing
          your browser data will erase it, export regularly if you want to keep it. The JSON file
          restores everything; the CSV is just the dose history, for a spreadsheet or to hand to a
          clinician.
        </p>

        <div className="flex flex-wrap gap-2.5">
          <Button onClick={download}>
            <Download size={15} /> Export to a file
          </Button>
          <Button onClick={downloadCsv} disabled={!logs.length}>
            <Sheet size={15} /> Doses as CSV
          </Button>
          <ButtonLink href="/report">
            <Printer size={15} /> Report for a clinician
          </ButtonLink>
        </div>
        <p className="text-[12.5px] text-[var(--muted)]">
          To bring data back in, your own export, or a file from another app, use{" "}
          <strong>Import from another app</strong> above.
        </p>

        <p className="text-[12.5px] text-[var(--faint)]">
          Currently holding {logs.length} dose{logs.length === 1 ? "" : "s"}, {protocols.length}{" "}
          protocol{protocols.length === 1 ? "" : "s"} and {vials.length} vial
          {vials.length === 1 ? "" : "s"}.
        </p>
      </Card>

      <Card className="space-y-3 border-[var(--rose)]/35 p-4">
        <SectionLabel>Erase everything</SectionLabel>
        <p className="text-[13.5px] leading-relaxed text-[var(--muted)]">
          Deletes every protocol, dose and vial on this device. There is no undo and no copy
          anywhere else, export first if there is any chance you want this back.
        </p>
        {confirmingReset ? (
          <div className="flex flex-wrap gap-2.5">
            <Button variant="ghost" onClick={() => setConfirmingReset(false)}>
              Keep my data
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                resetAll();
                setConfirmingReset(false);
                setMessage({ tone: "danger", text: "Everything has been erased." });
              }}
            >
              Yes, erase all {logs.length + protocols.length + vials.length} records
            </Button>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setConfirmingReset(true)}>
            Erase everything
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
              About Bench
            </Link>
          }
        >
          What this app is, and is not
        </SectionLabel>
        <div className="space-y-2.5 text-[13px] leading-relaxed text-[var(--muted)]">
          <p>
            This is a personal record-keeping tool. It is not medical advice, not a prescription, and
            not a recommendation to use any compound in it.
          </p>
          <p>
            The reconstitution arithmetic is exact and covered by tests. What it cannot verify is
            whether a vial contains what its label claims. Most compounds in the library are not
            approved medicines anywhere, and material sold for research use has no regulated
            identity, purity, sterility or endotoxin standard behind it.
          </p>
          <p>
            Dose figures are tagged by where they came from. An approved label and a community
            convention are both shown, but they are not the same kind of information and the app
            never presents them as though they were.
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
      <SectionLabel>Profiles</SectionLabel>
      <p className="text-[13px] leading-relaxed text-[var(--muted)]">
        Each profile keeps its own protocols, doses and stock. Nothing is shared between them, and
        a dose can only ever draw from the stock of the profile that logged it.
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
                  aria-label={`Name for ${p.name}`}
                  className="min-w-28 flex-1 rounded-[var(--r-btn)] border border-transparent bg-transparent px-2 py-1.5 text-[15px] font-semibold text-[var(--ink)] hover:border-[var(--line)] focus:border-[var(--mint)] focus:bg-[var(--card)] focus:outline-none"
                />

                {isActive ? (
                  <Badge tone={p.tone}>showing</Badge>
                ) : (
                  <Button variant="soft" onClick={() => switchProfile(p.id)} className="py-2 text-[13px]">
                    Switch to
                  </Button>
                )}

                {profiles.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setConfirming(confirming === p.id ? null : p.id)}
                    aria-label={`Delete ${p.name}`}
                    className="press p-2 text-[var(--faint)] hover:text-[var(--rose)]"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-3">
                <Field label="Body weight" className="w-36">
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
                      aria-label={`Colour ${tone}`}
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
                  {counts.protocols} protocol{counts.protocols === 1 ? "" : "s"} · {counts.doses}{" "}
                  dose{counts.doses === 1 ? "" : "s"}
                </p>
              </div>

              <p className="mt-1.5 text-[11.5px] text-[var(--faint)]">
                {p.weightKg
                  ? "Doses can be shown per kilogram for this profile."
                  : "Add a weight to see doses in mcg/kg."}
              </p>

              {confirming === p.id && (
                <div className="mt-3 rounded-[var(--r-inner)] bg-[var(--rose-soft)] p-3">
                  <p className="text-[13px] leading-relaxed" style={{ color: "var(--rose-ink)" }}>
                    Deleting {p.name} also deletes their {counts.protocols} protocol
                    {counts.protocols === 1 ? "" : "s"} and {counts.doses} logged dose
                    {counts.doses === 1 ? "" : "s"}. This cannot be undone.
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <Button variant="soft" onClick={() => setConfirming(null)}>
                      Keep
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => {
                        removeProfile(p.id);
                        setConfirming(null);
                      }}
                    >
                      Delete {p.name}
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
          `Saved ${outcome.name}${outcome.pruned ? `, and removed ${outcome.pruned} older one${outcome.pruned === 1 ? "" : "s"}` : ""}.`);
        await refresh();
      } else {
        setNote(outcome.reason ?? "Could not write the backup.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function restore(name: string) {
    setBusy(true);
    setNote(null);
    try {
      const text = await readBackup(name);
      if (!text) {
        setNote("Could not read that backup.");
        return;
      }
      const parsed = JSON.parse(text) as AppData;
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.logs)) {
        setNote("That file is not a Bench backup.");
        return;
      }
      importData(parsed);
      setNote(
        `Restored from ${name}: ${parsed.logs.length} doses, ${parsed.protocols?.length ?? 0} protocols, ${parsed.vials?.length ?? 0} vials.`);
    } catch {
      setNote("That backup could not be read as JSON.");
    } finally {
      setConfirming(null);
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4 p-4">
      <SectionLabel>Automatic backups</SectionLabel>

      <p className="text-[13px] leading-relaxed text-[var(--muted)]">
        Writes a full copy into <strong>Documents/Bench</strong> on this device, keeping the most
        recent few. Nothing leaves the phone. It is a second copy in a folder you can reach from a
        file manager rather than a cloud sync, so it survives clearing the app&apos;s data but not losing the
        device. Copy one somewhere else occasionally if that matters to you.
      </p>

      {available === false && (
        <Callout tone="info">
          A web page cannot write to a folder on its own, so this runs in the Android app. Use
          <strong> Export to a file</strong> below to save a copy from here.
        </Callout>
      )}

      {available && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Take one" hint="Every so often, at app start.">
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
                <option value="off">Never</option>
                <option value="6">Every 6 hours</option>
                <option value="24">Daily</option>
                <option value="168">Weekly</option>
              </Select>
            </Field>

            <Field label="Keep" hint="Oldest goes when full.">
              <NumberInput
                value={settings.backupKeep}
                min={1}
                max={50}
                suffix="copies"
                onChange={(e) =>
                  updateSettings({ backupKeep: Math.max(1, Number(e.target.value) || 1) })
                }
              />
            </Field>

            <Field label="Last backup">
              <div className="rounded-[var(--r-btn)] border border-[var(--line)] bg-[var(--sunken)] px-3.5 py-3 text-[14px] text-[var(--muted)]">
                {settings.lastBackupAt ? relativeTime(settings.lastBackupAt) : "Never"}
              </div>
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button variant="primary" onClick={backupNow} disabled={busy}>
              <HardDriveDownload size={15} /> {busy ? "Working…" : "Back up now"}
            </Button>
            <span className="text-[12.5px] text-[var(--muted)]">
              {files.length
                ? `${files.length} backup${files.length === 1 ? "" : "s"} in Documents/Bench.`
                : "No backups yet."}
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
                      <RotateCcw size={14} /> Restore
                    </Button>
                  </div>

                  {confirming === f.name && (
                    <div className="mt-2 rounded-[var(--r-inner)] bg-[var(--rose-soft)] p-3">
                      <p className="text-[13px] leading-relaxed" style={{ color: "var(--rose-ink)" }}>
                        Restoring replaces everything currently in the app with the contents of this
                        file. Anything logged since {formatDate(f.at)} will be gone. There is no undo,
                        so take a backup now first if you are unsure.
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        <Button variant="soft" onClick={() => setConfirming(null)}>
                          Keep what I have
                        </Button>
                        <Button variant="danger" disabled={busy} onClick={() => restore(f.name)}>
                          Replace everything with this
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
        setResult(
          "Access was not granted. Health Connect only offers the prompt a couple of times, after that it has to be switched on in its own settings.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function openHealthSettings() {
    (await getHealthAdapter()).openSettings();
  }

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
      setResult("Sync failed. Check Health Connect permissions and try again.");
    } finally {
      setBusy(false);
    }
  }

  const connected = state === "available";
  const askable = state === "permission-denied" || state === "not-installed";

  return (
    <Card className="space-y-4 p-4">
      <SectionLabel>Health Connect</SectionLabel>

      <p className="text-[13px] leading-relaxed text-[var(--muted)]">
        Reads weight from Android Health so a reading off your scale shows up here, and prefills the
        weight field with your most recent one. It is <strong>one-way</strong>: nothing this app holds
        is ever written back, and it only asks for read access, so nothing here can alter what your
        scale or Health Connect recorded. A reading you typed just before your scale synced is matched
        to it rather than duplicated.
      </p>

      <Callout tone={connected ? "info" : "warn"}>
        {state === "checking" ? "Checking…" : AVAILABILITY_MESSAGE[state]}
      </Callout>

      {askable && (
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="primary" onClick={connect} disabled={busy}>
            <Activity size={15} /> {busy ? "Waiting…" : "Allow reading weight"}
          </Button>
          <Button variant="ghost" onClick={openHealthSettings}>
            <ExternalLink size={15} /> Open Health Connect
          </Button>
        </div>
      )}

      {connected && (
        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="primary" onClick={sync} disabled={busy}>
            <RefreshCw size={15} className={busy ? "animate-spin" : undefined} />
            {busy ? "Syncing…" : "Sync now"}
          </Button>
          <Button variant="ghost" onClick={openHealthSettings}>
            <ExternalLink size={15} /> Open Health Connect
          </Button>
          <span className="text-[12.5px] text-[var(--muted)]">Read-only, nothing is sent back.</span>
        </div>
      )}

      {connected && (
        <p className="text-[12px] leading-relaxed text-[var(--faint)]">
          Health Connect will not hand back readings older than about 30 days, so a first sync brings
          in the last month rather than your whole history.
        </p>
      )}

      {result && <p className="text-[13px] font-medium text-[var(--ink)]">{result}</p>}
    </Card>
  );
}
