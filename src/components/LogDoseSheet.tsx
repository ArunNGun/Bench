"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2, X } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Field,
  NumberInput,
  Card,
  Segmented,
  Select,
  Textarea,
  TONE_SOLID,
} from "./ui";
import Link from "next/link";
import { HelpNote } from "./HelpNote";
import { FEELING_TONE } from "@/lib/calc/feeling";
import { Syringe } from "./Syringe";
import { SiteMap } from "./SiteMap";
import { BlendBreakdown } from "./BlendBreakdown";
import { isBlend } from "@/lib/calc/blend";
import { allPeptides, findPeptide, useProfileData, useStore, vialStatus } from "@/lib/store";
import { AddCompoundInline } from "./AddCompoundInline";
import { pickVialForDose, stockFor, vialRemainingMcg, vialUsable } from "@/lib/calc/inventory";
import { suggestSite } from "@/lib/calc/sites";
import {
  calculateDraw,
  concentration,
  doseFromUnits,
  mcgPerUnitOfScale,
  mgToMcg,
  SYRINGES,
  syringeById,
  unitsFromDose,
  type SyringeScale,
} from "@/lib/calc/reconstitution";
import { protocolDosesPerWeek, scheduledDoseMcg } from "@/lib/calc/schedule";
import {
  COMMON_SIDE_EFFECTS,
  FEELING_LABELS,
  INJECTION_SITES,
  ROUTE_LABEL,
  type InjectionSite,
  type Protocol,
  type Route,
} from "@/lib/types";

import { formatDose, fromDateTimeLocal, toDateTimeLocal, trim } from "@/lib/format";

/**
 * Logging a dose. Opens as a bottom sheet on mobile and a centred panel on
 * desktop, because on a phone this gets used one-handed right after injecting.
 */
/**
 * An explicit "this dose belongs to no plan", as distinct from "nothing picked
 * yet". Without the distinction there is no way to record a one-off dose of a
 * compound you also have a protocol for.
 */
const NO_PROTOCOL = "none";

export function LogDoseSheet({
  open,
  onClose,
  defaultPeptideId,
  editId,
}: {
  open: boolean;
  onClose: () => void;
  defaultPeptideId?: string;
  /** Editing an existing dose rather than recording a new one. */
  editId?: string;
}) {
  const custom = useStore((s) => s.customPeptides);
  const { protocols, vials, logs } = useProfileData();
  const settings = useStore((s) => s.settings);
  const addLog = useStore((s) => s.addLog);
  const updateLog = useStore((s) => s.updateLog);
  const removeLog = useStore((s) => s.removeLog);
  const editing = editId ? logs.find((l) => l.id === editId) : undefined;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [feeling, setFeeling] = useState<number | undefined>();
  const [effects, setEffects] = useState<string[]>([]);

  const peptides = useMemo(() => allPeptides(custom), [custom]);

  /**
   * Fill the form from a protocol: its dose, its route, a vial that can supply
   * it and the site it is due to rotate to.
   *
   * Shared by both directions of the pair of dropdowns, so picking a protocol
   * and picking a peptide that happens to have one cannot drift apart.
   */
  function applyProtocol(proto: Protocol | undefined, forPeptideId: string, atMs: number) {
    const dose = proto ? scheduledDoseMcg(proto, atMs) : 0;
    setDoseMcg(dose);
    setRoute(proto?.route ?? "subcutaneous");
    setVialId(pickVialForDose(vials, forPeptideId, dose, atMs)?.id ?? "");
    setSiteOverride(false);
    setSite(suggestSite(logs.filter((l) => l.peptideId === forPeptideId), atMs, 14, proto?.sites));
  }

  /** Selecting a compound, from the dropdown or straight after creating one. */
  function choosePeptide(id: string) {
    setPeptideId(id);
    // A protocol for a different compound cannot survive the change, so the
    // pick falls back to this peptide's own protocol or to none at all.
    const proto = protocols.find((p) => p.active && p.peptideId === id);
    setProtocolId(proto?.id ?? NO_PROTOCOL);
    applyProtocol(proto, id, at);
  }

  /**
   * Selecting a protocol, which is the short way in: the compound and the dose
   * both follow from it, so the peptide dropdown never has to be visited.
   */
  function chooseProtocol(id: string) {
    setProtocolId(id);
    if (id === NO_PROTOCOL) return;

    const proto = protocols.find((p) => p.id === id);
    if (!proto) return;

    setPeptideId(proto.peptideId);
    applyProtocol(proto, proto.peptideId, at);
  }

  const [peptideId, setPeptideId] = useState(defaultPeptideId ?? peptides[0]?.id ?? "");
  const [doseMcg, setDoseMcg] = useState(0);
  const [at, setAt] = useState(() => Date.now());
  const [site, setSite] = useState<InjectionSite | "">("");
  const [route, setRoute] = useState<Route>("subcutaneous");
  const [vialId, setVialId] = useState("");
  const [syringeId, setSyringeId] = useState(settings.defaultSyringeId ?? "u100-0.5");
  const [units, setUnits] = useState(0);
  const [notes, setNotes] = useState("");
  const [skipped, setSkipped] = useState(false);
  /** Whether the dose field is showing mg or mcg. Internally always mcg. */
  const [doseUnit, setDoseUnit] = useState<"mcg" | "mg">("mcg");
  // Lets the pinned set be bypassed when the shot actually went elsewhere.
  const [siteOverride, setSiteOverride] = useState(false);
  const [protocolId, setProtocolId] = useState(NO_PROTOCOL);

  const peptide = findPeptide(custom, peptideId);

  /**
   * Every running protocol, across all compounds, because the point of this
   * dropdown is to reach a dose without deciding on the peptide first. More
   * than one protocol can run the same peptide on different schedules, and
   * they appear separately for exactly that reason.
   */
  const activeProtocols = useMemo(
    () => protocols.filter((p) => p.active),
    [protocols]);

  /**
   * Explicit rather than inferred. An empty pick used to fall through to the
   * first protocol for the peptide, which left no way to record a dose taken
   * outside any plan.
   */
  const protocol = protocolId === NO_PROTOCOL
    ? undefined
    : protocols.find((p) => p.id === protocolId);
  const syringe = syringeById(syringeId) ?? SYRINGES[2];

  // Sites pinned to this protocol, if any were chosen when it was set up.
  // Memoised so the identity is stable across renders, it feeds hook deps.
  const pinned = useMemo(() => protocol?.sites ?? [], [protocol?.sites]);
  const siteChoices = useMemo(
    () =>
      pinned.length && !siteOverride
        ? INJECTION_SITES.filter((s) => pinned.includes(s.id))
        : INJECTION_SITES,
    [pinned, siteOverride]);

  const peptideLogs = useMemo(
    () => logs.filter((l) => l.peptideId === peptideId),
    [logs, peptideId]);

  // Every vial that could supply this dose, open or still sealed. Restricting
  // this to reconstituted vials is what stopped stock from moving.
  const usableVials = useMemo(
    () => vials.filter((v) => v.peptideId === peptideId && vialUsable(v, Date.now())),
    [vials, peptideId]);

  // Reset the form each time it opens, prefilled from the protocol.
  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);

    // Editing loads the recorded values verbatim rather than the protocol's.
    if (editing) {
      setPeptideId(editing.peptideId);
      setProtocolId(editing.protocolId ?? NO_PROTOCOL);
      setDoseMcg(editing.doseMcg);
      setAt(editing.at);
      setRoute(editing.route);
      setSite(editing.site ?? "");
      setVialId(editing.vialId ?? "");
      setNotes(editing.notes ?? "");
      setSkipped(!!editing.skipped);
      setFeeling(editing.feeling);
      setEffects(editing.sideEffects ?? []);
      setSiteOverride(true);
      if (editing.syringeScale) {
        const spec = SYRINGES.find((s) => s.scale === editing.syringeScale);
        if (spec) setSyringeId(spec.id);
      }
      return;
    }

    const id = defaultPeptideId ?? peptides[0]?.id ?? "";
    setPeptideId(id);
    setAt(Date.now());
    setNotes("");
    setSkipped(false);
    setSite("");
    setSiteOverride(false);
    const proto = protocols.find((p) => p.active && p.peptideId === id);
    setProtocolId(proto?.id ?? NO_PROTOCOL);
    // Suggests the site used least recently, so rotation happens by default.
    applyProtocol(proto, id, Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultPeptideId, editId]);

  // If a pinned set is in force and the current pick falls outside it, treat
  // that as an override rather than silently logging the wrong site.
  useEffect(() => {
    if (!open || siteOverride || !pinned.length || !site) return;
    if (!pinned.includes(site)) setSiteOverride(true);
  }, [open, site, pinned, siteOverride]);

  const vial = vials.find((v) => v.id === vialId);

  // What the stock looks like once this dose is taken. This is the number the
  // user actually wants: how many more of these are left.
  const stock = stockFor(vials, peptideId, doseMcg, at);
  const willDeplete = !skipped && !!vialId && doseMcg > 0;
  const dosesAfter = Math.max(0, stock.dosesRemaining - (willDeplete ? 1 : 0));
  const vialLeftAfter = vial
    ? Math.max(0, vialRemainingMcg(vial) - (willDeplete ? doseMcg : 0))
    : 0;
  const vialDosesAfter = doseMcg > 0 ? Math.floor(vialLeftAfter / doseMcg) : 0;

  // Marks only mean something once the vial has a concentration.
  const concMcgPerMl =
    vial && vial.diluentMl ? concentration(mgToMcg(vial.strengthMg), vial.diluentMl) : NaN;
  const canConvert = Number.isFinite(concMcgPerMl) && concMcgPerMl > 0;

  /** Dose is the source of truth; the barrel reading follows it. */
  function setDoseAndUnits(mcg: number) {
    setDoseMcg(mcg);
    setUnits(canConvert ? unitsFromDose(mcg, concMcgPerMl, syringe.scale) : 0);
  }

  /** ...and the reverse, for when a reading is taken off the barrel. */
  function setUnitsAndDose(u: number) {
    setUnits(u);
    // Round to a hundredth of a microgram, a raw float here reads as noise.
    if (canConvert) setDoseMcg(Number(doseFromUnits(u, concMcgPerMl, syringe.scale).toFixed(2)));
  }

  /** Switching barrel keeps the dose fixed and re-reads the units. */
  function setScale(next: SyringeScale) {
    const spec =
      SYRINGES.find((s) => s.scale === next && s.capacityMl === syringe.capacityMl) ??
      SYRINGES.find((s) => s.scale === next)!;
    setSyringeId(spec.id);
    setUnits(canConvert ? unitsFromDose(doseMcg, concMcgPerMl, next) : 0);
  }

  // Recompute the reading whenever the vial or barrel changes under the dose.
  useEffect(() => {
    if (!open) return;
    setUnits(canConvert ? unitsFromDose(doseMcg, concMcgPerMl, syringe.scale) : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vialId, syringeId, concMcgPerMl]);

  const draw =
    vial && vial.diluentMl
      ? calculateDraw({
          vialMcg: mgToMcg(vial.strengthMg),
          diluentMl: vial.diluentMl,
          doseMcg,
          syringe,
        })
      : null;

  if (!open) return null;

  function save() {
    if (!peptideId || (!skipped && !(doseMcg > 0))) return;

    if (editing) {
      updateLog(editing.id, {
        peptideId,
        protocolId: protocol?.id,
        at,
        doseMcg,
        route,
        site: site || undefined,
        vialId: vialId || undefined,
        volumeMl: draw?.volumeRoundedMl,
        units: draw?.unitsRounded,
        syringeScale: draw ? syringe.scale : undefined,
        skipped: skipped || undefined,
        notes: notes.trim() || undefined,
        feeling,
        sideEffects: effects.length ? effects : undefined,
      });
      onClose();
      return;
    }

    addLog({
      peptideId,
      protocolId: protocol?.id,
      at,
      doseMcg,
      route,
      site: site || undefined,
      vialId: vialId || undefined,
      volumeMl: draw?.volumeRoundedMl,
      units: draw?.unitsRounded,
      syringeScale: draw ? syringe.scale : undefined,
      skipped: skipped || undefined,
      notes: notes.trim() || undefined,
      feeling,
      sideEffects: effects.length ? effects : undefined,
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-[2px] sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <Card
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-b-none sm:rounded"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Log a dose"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--line)] bg-[var(--card)] px-4 py-3">
          <h2 className="text-[16px] font-bold text-[var(--ink)]">
            {editing ? "Edit dose" : "Log a dose"}
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
          {/*
            The protocol comes first because it answers the compound and the
            dose together, which is what someone recording a planned dose
            already knows. The peptide dropdown stays below it, still free, for
            the dose that belongs to no plan.
          */}
          {(activeProtocols.length > 0 || protocol) && (
            <Field
              label="Protocol"
              hint={
                protocol
                  ? "Sets the compound, the dose and the site to rotate to."
                  : "Recording this dose outside any plan."
              }
            >
              <Select value={protocolId} onChange={(e) => chooseProtocol(e.target.value)}>
                <option value={NO_PROTOCOL}>No protocol, a one-off dose</option>
                {activeProtocols.map((p) => (
                  <option key={p.id} value={p.id}>
                    {findPeptide(custom, p.peptideId)?.name ?? p.peptideId}, {p.name},{" "}
                    {formatDose(scheduledDoseMcg(p, at))}
                  </option>
                ))}
                {/*
                  Editing an old dose can point at a protocol that has since
                  been paused or deleted. Listing it keeps the dropdown honest
                  about what the log actually says.
                */}
                {protocol && !protocol.active && (
                  <option value={protocol.id}>
                    {findPeptide(custom, protocol.peptideId)?.name ?? protocol.peptideId},{" "}
                    {protocol.name}, no longer running
                  </option>
                )}
              </Select>
            </Field>
          )}

          <Field label="Peptide">
            <Select value={peptideId} onChange={(e) => choosePeptide(e.target.value)}>
              {peptides.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <AddCompoundInline onCreated={(p) => choosePeptide(p.id)} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Dose"
              hint={
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {protocol && (
                    <span>{`Protocol calls for ${formatDose(scheduledDoseMcg(protocol, at))}.`}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setDoseUnit((u) => (u === "mcg" ? "mg" : "mcg"))}
                    className="rounded-full border border-[var(--line)] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-[var(--muted)] hover:border-[var(--tangerine)] hover:text-[var(--tangerine)] transition-colors"
                    aria-label={`Switch dose entry to ${doseUnit === "mcg" ? "mg" : "mcg"}`}
                  >
                    {doseUnit === "mcg" ? "switch to mg" : "switch to mcg"}
                  </button>
                </span>
              }
            >
              <NumberInput
                value={doseUnit === "mg" ? Number((doseMcg / 1000).toFixed(4)) : doseMcg}
                min={0}
                step={doseUnit === "mg" ? 0.025 : 25}
                suffix={doseUnit}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  setDoseAndUnits(doseUnit === "mg" ? raw * 1000 : raw);
                }}
                disabled={skipped}
              />
            </Field>

            <Field
              label="Syringe units"
              hint={
                canConvert
                  ? `1 unit = ${trim(mcgPerUnitOfScale(concMcgPerMl, syringe.scale), 2)} mcg at this vial's strength. One printed mark on this barrel is ${syringe.graduationUnits} unit${syringe.graduationUnits === 1 ? "" : "s"}.`
                  : "Reconstitute the vial to convert between units and dose."
              }
            >
              <NumberInput
                value={canConvert ? Number(units.toFixed(2)) : ""}
                min={0}
                step={0.5}
                suffix="units"
                placeholder={canConvert ? undefined : "n/a"}
                disabled={skipped || !canConvert}
                onChange={(e) => setUnitsAndDose(Number(e.target.value))}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Barrel"
              hint={
                syringe.scale === "U40"
                  ? "Veterinary scale, one unit is 0.025 mL."
                  : "Standard insulin scale, one unit is 0.01 mL."
              }
            >
              <Segmented
                ariaLabel="Syringe scale"
                className="w-full"
                options={[
                  { value: "U100", label: "U-100", hint: "100 units to 1 mL" },
                  { value: "U40", label: "U-40", hint: "40 units to 1 mL, 2.5x the volume per unit" },
                ]}
                value={syringe.scale}
                onChange={(v) => setScale(v as SyringeScale)}
              />
            </Field>

            <Field label="When">
              <input
                type="datetime-local"
                value={toDateTimeLocal(at)}
                onChange={(e) => setAt(fromDateTimeLocal(e.target.value))}
                className="w-full rounded border border-[var(--line)] bg-[var(--sunken)] px-3 py-2.5 text-[15px] text-[var(--ink)] focus:border-[var(--tangerine)] focus:outline-none"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Route">
              <Select value={route} onChange={(e) => setRoute(e.target.value as Route)}>
                {(peptide?.routes ?? (["subcutaneous"] as Route[])).map((r) => (
                  <option key={r} value={r}>
                    {ROUTE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Site"
              hint={
                pinned.length && !siteOverride
                  ? `Rotating through the ${pinned.length} sites pinned to this protocol.`
                  : "Green ring marks the longest-rested spot."
              }
            >
              <Select value={site} onChange={(e) => setSite(e.target.value as InjectionSite)}>
                <option value="">Not recorded</option>
                {siteChoices.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div>
            <SiteMap
              logs={peptideLogs}
              selected={site}
              onSelect={(s) => {
                // Tapping a site outside the plan is a deliberate override.
                if (pinned.length && !pinned.includes(s)) setSiteOverride(true);
                setSite(s);
              }}
              allowed={siteOverride ? null : pinned}
              nowMs={at}
            />
            {pinned.length > 0 && (
              <div className="mt-2 text-center">
                <button
                  type="button"
                  onClick={() => setSiteOverride((v) => !v)}
                  className="text-[12px] text-[var(--sky)] underline underline-offset-2 hover:text-[var(--ink)]"
                >
                  {siteOverride
                    ? "Back to this protocol's sites"
                    : "Injected somewhere else? Use any site"}
                </button>
              </div>
            )}
          </div>

          {usableVials.length > 0 ? (
            <Field
              label="Drawn from"
              hint="This dose comes off the chosen vial. Set it to “Not recorded” to log without touching stock."
            >
              <Select value={vialId} onChange={(e) => setVialId(e.target.value)}>
                <option value="">Not recorded, leave stock alone</option>
                {usableVials.map((v) => {
                  const st = vialStatus(v);
                  const left =
                    v.state === "reconstituted" && v.diluentMl
                      ? `${trim(st.remainingMl, 2)} mL left`
                      : "sealed";
                  return (
                    <option key={v.id} value={v.id}>
                      {v.strengthMg} mg · {left} · {formatDose(st.remainingMcg)} remaining
                    </option>
                  );
                })}
              </Select>
            </Field>
          ) : (
            <Callout tone="warn">
              No vial of this peptide is in stock, so this dose will be logged without drawing
              anything down. Add one under Stock to keep the count accurate.
            </Callout>
          )}

          {vialId && doseMcg > 0 && !skipped && (
            <div className="rounded border border-[var(--line)] bg-[var(--sunken)]/45 px-3 py-2.5">
              <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                <span className="tnum font-mono text-[17px] text-[var(--tangerine)]">
                  {vialDosesAfter}
                </span>
                <span className="text-[var(--muted)]">
                  more {formatDose(doseMcg)} dose{vialDosesAfter === 1 ? "" : "s"} left in this vial
                  after logging
                </span>
              </div>
              <p className="mt-1 text-[12px] text-[var(--faint)]">
                {formatDose(vialLeftAfter)} remaining in the vial ·{" "}
                <span className="tnum font-mono">{dosesAfter}</span> across all your stock
              </p>
            </div>
          )}

          {draw && (
            <div className="rounded border border-[var(--line)] bg-[var(--sunken)]/45 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tone="tangerine">
                  {trim(draw.unitsRounded, 2)} units · {trim(draw.volumeRoundedMl, 3)} mL
                </Badge>
                <Badge>{syringe.scale === "U100" ? "U-100" : "U-40"}</Badge>
                <Select
                  value={syringeId}
                  onChange={(e) => setSyringeId(e.target.value)}
                  className="ml-auto w-auto py-1 text-[12px]"
                  aria-label="Syringe"
                >
                  {SYRINGES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </div>
              <Syringe spec={syringe} units={draw.unitsRounded} ghostUnits={draw.units} />
            </div>
          )}

          {peptide && isBlend(peptide) && doseMcg > 0 && !skipped && (
            <div className="rounded border border-[var(--line)] bg-[var(--sunken)]/45 p-3">
              <p className="mb-2 text-[12px] text-[var(--muted)]">This dose delivers:</p>
              <BlendBreakdown
                blend={peptide}
                doseMcg={doseMcg}
                resolve={(id) => findPeptide(custom, id)}
                dosesPerWeek={protocol ? protocolDosesPerWeek(protocol, at) : undefined}
                compact
              />
            </div>
          )}

          {!skipped && (
            <div className="space-y-3 rounded-[var(--r-inner)] bg-[var(--sunken)] p-3">
              <div>
                <p className="mb-2 text-[13px] font-semibold text-[var(--ink)]">How do you feel?</p>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => {
                    const on = feeling === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        aria-pressed={on}
                        aria-label={FEELING_LABELS[n]}
                        onClick={() => setFeeling(on ? undefined : n)}
                        className="press flex-1 rounded-[var(--r-btn)] py-2 text-[12px] font-semibold transition-colors"
                        style={{
                          background: on ? TONE_SOLID[FEELING_TONE[n]] : "var(--card)",
                          color: on ? "#fff" : "var(--muted)",
                          border: `1px solid ${on ? "transparent" : "var(--line)"}`,
                        }}
                      >
                        {FEELING_LABELS[n]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[13px] font-semibold text-[var(--ink)]">
                  Anything to note?{" "}
                  <span className="font-normal text-[var(--faint)]">optional</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_SIDE_EFFECTS.map((e) => {
                    const on = effects.includes(e);
                    return (
                      <button
                        key={e}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setEffects((prev) =>
                            prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e])
                        }
                        className="press rounded-[var(--r-pill)] px-2.5 py-1.5 text-[12px] font-medium transition-colors"
                        style={{
                          background: on ? "var(--rose-soft)" : "var(--card)",
                          color: on ? "var(--rose-ink)" : "var(--muted)",
                          border: `1px solid ${on ? "transparent" : "var(--line)"}`,
                        }}
                      >
                        {e}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <Field label="Notes">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How it went, any side effects…"
            />
          </Field>

          {/*
            Asked for because the phrase is not self-explanatory, and it is
            not: a skip is a record rather than the absence of one, which is
            the opposite of what "skipped" suggests.

            Short on purpose. The full account belongs on the About page, which
            this links to. Two sentences is what fits before the note becomes
            the thing you have to scroll past to reach Save.
          */}
          <HelpNote
            label="A skipped dose"
            control={
              <label className="flex items-center gap-2.5 text-[13.5px] text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={skipped}
                  onChange={(e) => setSkipped(e.target.checked)}
                  className="h-4 w-4 accent-[var(--tangerine)]"
                />
                Record this as a skipped dose
              </label>
            }
          >
            <p>
              It is a record, not a gap. The app can tell a dose you decided against from one nobody
              ever logged, and your adherence figure counts them separately.
            </p>
            <p>
              Nothing is drawn from a vial and no drug is modelled in your body, so the curve and the
              projection are untouched.
            </p>
            <Link
              href="/about#skipped"
              className="block font-semibold text-[var(--mint-ink)] underline decoration-dotted"
            >
              What else it affects
            </Link>
          </HelpNote>
        </div>

        <div className="sticky bottom-0 space-y-2.5 border-t border-[var(--line)] bg-[var(--card)] px-4 py-3">
          {confirmDelete && editing && (
            <Callout tone="danger">
              Deleting this dose puts {formatDose(editing.doseMcg)} back into its vial.
            </Callout>
          )}

          <div className="flex gap-2.5">
            {editing && (
              <Button
                variant="danger"
                onClick={() => {
                  if (!confirmDelete) return setConfirmDelete(true);
                  removeLog(editing.id);
                  onClose();
                }}
              >
                <Trash2 size={15} />
                {confirmDelete ? "Confirm" : ""}
              </Button>
            )}
            <Button variant="ghost" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button variant="primary" onClick={save} className="flex-[2]" disabled={!peptideId}>
              {editing ? "Save changes" : skipped ? "Record skip" : "Save dose"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
