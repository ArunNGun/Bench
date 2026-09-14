"use client";
import { useLang } from "@/lib/i18n";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeftRight, Check } from "lucide-react";
import { Syringe } from "@/components/Syringe";
import { SyringePicker } from "@/components/SyringePicker";
import {
  Badge,
  Callout,
  Field,
  NumberInput,
  Card,
  SectionLabel,
  Segmented,
  Select,
  Stat,
  Rich,
} from "@/components/ui";
import {
  calculateDraw,
  capacityUnits,
  graduationMl,
  mgToMcg,
  MIN_RELIABLE_UNITS,
  mlPerUnit,
  suggestDiluents,
  SYRINGES,
  syringeById,
  type DrawWarning,
} from "@/lib/calc/reconstitution";
import { allPeptides, useStore } from "@/lib/store";
import { AddCompoundInline } from "@/components/AddCompoundInline";
import { formatConcentration, formatDose, formatMl, trim } from "@/lib/format";

type DoseUnit = "mcg" | "mg";

/**
 * The warning copy, rebuilt on each render because it is translated now.
 *
 * `t` comes in rather than being reached for, so this stays a plain function
 * of the language and not a second hook.
 */
function useWarningCopy(
  t: ReturnType<typeof useLang>["t"],
): Record<DrawWarning, { tone: "warn" | "danger"; title: string; body: string }> {
  return {
    "exceeds-barrel": {
      tone: "danger",
      title: t("calc_warn_wont_fit"),
      body: t("calc_body_exceeds_barrel"),
    },
    "below-graduation": {
      tone: "danger",
      title: t("calc_warn_below_mark"),
      body: t("calc_body_below_graduation"),
    },
    "off-graduation": {
      tone: "warn",
      title: t("calc_warn_between_marks"),
      body: t("calc_body_off_graduation"),
    },
    "low-volume": {
      tone: "warn",
      title: t("calc_warn_very_small"),
      body: t("calc_body_low_volume", { n: MIN_RELIABLE_UNITS }),
    },
    "exceeds-vial": {
      tone: "danger",
      title: t("calc_warn_too_much"),
      body: t("calc_body_exceeds_vial"),
      },
  };
}

export default function CalculatorPage() {
  const custom = useStore((s) => s.customPeptides);
  const { t } = useLang();
  const WARNING_COPY = useWarningCopy(t);
  const peptides = useMemo(() => allPeptides(custom), [custom]);

  const [vialMg, setVialMg] = useState(10);
  const [diluentMl, setDiluentMl] = useState(2);
  const [dose, setDose] = useState(500);
  const [doseUnit, setDoseUnit] = useState<DoseUnit>("mcg");
  const [syringeId, setSyringeId] = useState("u100-0.5");
  const [peptideId, setPeptideId] = useState("");

  const syringe = syringeById(syringeId) ?? SYRINGES[2];
  const doseMcg = doseUnit === "mg" ? mgToMcg(dose) : dose;
  const vialMcg = mgToMcg(vialMg);

  const draw = useMemo(
    () => calculateDraw({ vialMcg, diluentMl, doseMcg, syringe }),
    [vialMcg, diluentMl, doseMcg, syringe]);

  const suggestions = useMemo(
    () => suggestDiluents(vialMcg, doseMcg, syringe).slice(0, 4),
    [vialMcg, doseMcg, syringe]);

  const valid = Number.isFinite(draw.volumeMl) && draw.volumeMl > 0;
  const otherScale = syringe.scale === "U100" ? "U40" : "U100";

  function applyPeptide(id: string) {
    setPeptideId(id);
    const p = peptides.find((x) => x.id === id);
    if (!p) return;
    if (p.vialSizesMg.length) setVialMg(p.vialSizesMg[0]);
    const range = p.doseRanges[0];
    if (range) {
      const mid = (range.lowMcg + range.highMcg) / 2;
      if (mid >= 1000) {
        setDoseUnit("mg");
        setDose(Number((mid / 1000).toFixed(3)));
      } else {
        setDoseUnit("mcg");
        setDose(Number(mid.toFixed(1)));
      }
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-[24px] font-extrabold tracking-tight text-[var(--ink)]">{t("calc_title")}</h1>
        <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-[var(--muted)]">
          {t("calc_intro")}
        </p>
      </header>

      {/* Scale choice comes first, because everything downstream depends on it. */}
      <Card className="p-4">
        <SectionLabel>{t("calc_which_syringe")}</SectionLabel>
        {/*
          Pictures rather than a list, because the question is literally which
          object is in your hand. The U-100 and U-40 groups the dropdown used
          are gone with it: every card names its own scale, and the barrel it
          draws is numbered 0 to 40 or 0 to 100 accordingly, which is the
          difference the groups existed to point at. The warning below is
          unchanged and is still where the 2.5x is spelled out.
        */}
        <SyringePicker value={syringeId} onChange={setSyringeId} className="mt-2" />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone={syringe.scale === "U40" ? "rose" : "sky"}>
            {t("calc_one_mark", { ml: trim(mlPerUnit(syringe.scale), 4) })}
          </Badge>
          <Badge>{t("calc_barrel_reads", { max: trim(capacityUnits(syringe), 1) })}</Badge>
          <Badge>{t("calc_marks_every", { step: trim(syringe.graduationUnits, 2) })}</Badge>
        </div>

        {syringe.note && (
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-[var(--faint)]">{syringe.note}</p>
        )}

        <Callout tone="warn" className="mt-3" title={t("calc_check_barrel")}>
          <Rich text={t("calc_barrel_warning")} />
        </Callout>
      </Card>

      {/* Inputs */}
      <Card className="p-4">
        <SectionLabel>{t("calc_vial_and_dose")}</SectionLabel>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("calc_peptide_optional")} hint={t("calc_peptide_hint")}>
            <Select value={peptideId} onChange={(e) => applyPeptide(e.target.value)}>
              <option value="">{t("calc_choose_prefill")}</option>
              {peptides.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <AddCompoundInline onCreated={(p) => applyPeptide(p.id)} />
          </Field>

          <Field label={t("calc_vial_strength")} htmlFor="vial">
            <NumberInput
              id="vial"
              value={vialMg}
              min={0}
              step={0.5}
              suffix="mg"
              onChange={(e) => setVialMg(Number(e.target.value))}
            />
          </Field>

          <Field label={t("calc_water_to_add")} htmlFor="water" hint={t("calc_water_hint")}>
            <NumberInput
              id="water"
              value={diluentMl}
              min={0}
              step={0.25}
              suffix="mL"
              onChange={(e) => setDiluentMl(Number(e.target.value))}
            />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Field label={t("calc_dose_you_want")} htmlFor="dose" className="min-w-40 flex-1">
            <NumberInput
              id="dose"
              value={dose}
              min={0}
              step={doseUnit === "mg" ? 0.25 : 25}
              suffix={doseUnit}
              onChange={(e) => setDose(Number(e.target.value))}
            />
          </Field>
          <Segmented
            ariaLabel={t("phase_dose_unit")}
            options={[
              { value: "mcg", label: "mcg" },
              { value: "mg", label: "mg" },
            ]}
            value={doseUnit}
            onChange={(u) => {
              // Keep the same physical dose when the unit changes.
              setDose(u === "mg" ? Number((doseMcg / 1000).toFixed(4)) : Number(doseMcg.toFixed(1)));
              setDoseUnit(u);
            }}
            className="mb-0.5"
          />
        </div>
      </Card>

      {/* The answer */}
      {valid ? (
        <Card className="overflow-hidden">
          <div className="border-b border-[var(--line)] bg-[var(--sunken)]/45 px-4 py-3">
            <SectionLabel className="mb-0">{t("calc_draw_to_here")}</SectionLabel>
          </div>

          <div className="px-3 pb-2 pt-5 sm:px-6">
            <Syringe
              spec={syringe}
              units={draw.unitsRounded}
              ghostUnits={draw.units}
              overCapacity={draw.warnings.includes("exceeds-barrel")}
            />
            {draw.warnings.includes("off-graduation") && (
              <p className="mt-1 text-center text-[11.5px] text-[var(--sky)]">
                {t("calc_dashed_line", { units: trim(draw.units, 2) })}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-5 border-t border-[var(--line)] px-4 py-5 sm:grid-cols-4 sm:px-6">
            <Stat
              label={t("calc_volume")}
              value={trim(draw.volumeRoundedMl, 3)}
              unit="mL"
              tone="tangerine"
              hint={t("calc_volume_hint")}
            />
            <Stat
              label={t("calc_scale_marks", { scale: syringe.scale === "U100" ? "U-100" : "U-40" })}
              value={trim(draw.unitsRounded, 2)}
              hint={t("calc_on_the_scale", { range: syringe.scale === "U100" ? "0 to 100" : "0 to 40" })}
            />
            <Stat
              label={t("calc_concentration")}
              value={formatConcentration(draw.concentrationMcgPerMl).split(" ")[0]}
              unit={formatConcentration(draw.concentrationMcgPerMl).split(" ")[1]}
              hint={t("calc_mcg_per_mark", { mcg: trim(draw.mcgPerGraduation, 2) })}
            />
            <Stat
              label={t("calc_doses_per_vial")}
              value={draw.dosesPerVial}
              tone="sky"
              hint={t("calc_at_each", { dose: formatDose(doseMcg) })}
            />
          </div>

          {draw.warnings.includes("off-graduation") && (
            <div className="border-t border-[var(--line)] px-4 py-3.5 sm:px-6">
              <p className="text-[13px] leading-relaxed text-[var(--muted)]">
                {t("calc_settling_on", { marks: trim(draw.unitsRounded, 2) })}{" "}
                <strong className="tnum font-mono text-[var(--ink)]">
                  {formatDose(draw.deliveredMcg)}
                </strong>,{" "}
                {draw.roundingErrorMcg > 0
                  ? t("calc_which_is_over")
                  : t("calc_which_is_under")}{" "}
                <strong className="tnum font-mono text-[var(--ink)]">
                  {formatDose(Math.abs(draw.roundingErrorMcg))}
                </strong>{" "}
                ({trim(Math.abs(draw.roundingErrorPercent), 1)}%).
              </p>
            </div>
          )}

          {/* Cross-scale reference, so the other barrel is never a guess. */}
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] px-4 py-3 text-[13px] sm:px-6">
            <ArrowLeftRight size={14} className="text-[var(--faint)]" />
            <span className="text-[var(--muted)]">
              {t("calc_same_volume_reads", { ml: formatMl(draw.volumeRoundedMl) })}
            </span>
            <strong className="tnum font-mono text-[var(--ink)]">
              {trim(draw.volumeRoundedMl * (otherScale === "U100" ? 100 : 40), 2)}
            </strong>
            <span className="text-[var(--muted)]">
              {t("calc_marks_on_barrel", { scale: otherScale === "U100" ? "U-100" : "U-40" })}
            </span>
          </div>
        </Card>
      ) : (
        <Card className="px-4 py-10 text-center text-[14px] text-[var(--muted)]">
          {t("calc_enter_to_see")}
        </Card>
      )}

      {/* Warnings */}
      {draw.warnings.length > 0 && (
        <div className="space-y-2.5">
          {draw.warnings.map((w) => (
            <Callout key={w} tone={WARNING_COPY[w].tone} title={WARNING_COPY[w].title}>
              {WARNING_COPY[w].body}
            </Callout>
          ))}
        </div>
      )}

      {/* Better dilutions */}
      {suggestions.length > 0 && (
        <Card className="p-4">
          <SectionLabel>{t("calc_cleaner_volumes")}</SectionLabel>
          <p className="mb-3 text-[13px] leading-relaxed text-[var(--muted)]">
            {t("calc_cleaner_desc")}
          </p>
          <ul className="space-y-1.5">
            {suggestions.map((s) => {
              const active = Math.abs(s.diluentMl - diluentMl) < 1e-9;
              return (
                <li key={s.diluentMl}>
                  <button
                    type="button"
                    onClick={() => setDiluentMl(s.diluentMl)}
                    className={`flex w-full items-center gap-3 rounded border px-3 py-2.5 text-left transition-colors ${
                      active
                        ? "border-[var(--tangerine)]/50 bg-[var(--tangerine)]/[0.07]"
                        : "border-[var(--line)] hover:border-[var(--faint)]"
                    }`}
                  >
                    <span className="tnum w-16 shrink-0 font-mono text-[14px] text-[var(--ink)]">
                      {trim(s.diluentMl, 2)} mL
                    </span>
                    <span className="tnum shrink-0 font-mono text-[14px] text-[var(--tangerine)]">
                      {t("calc_marks_count", { n: trim(s.units, 2) })}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--faint)]">
                      {trim(s.concentrationMgPerMl, 3)} mg/mL ·{" "}
                      {t("calc_mcg_per_mark_value", { n: trim(s.mcgPerGraduation, 2) })}
                    </span>
                    {s.landsOnMark && (
                      <Check size={15} className="shrink-0 text-[var(--leaf)]" aria-label={t("calc_lands_on_mark")} />
                    )}
                    {active && <Badge tone="tangerine">{t("calc_current")}</Badge>}
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Reference */}
      <Card className="p-4">
        <SectionLabel>{t("calc_how_worked_out")}</SectionLabel>
        <div className="space-y-2.5 font-mono text-[12.5px] leading-relaxed text-[var(--muted)]">
          <p>
            concentration = {vialMg} mg ÷ {trim(diluentMl, 2)} mL ={" "}
            <span className="text-[var(--ink)]">{trim(draw.concentrationMgPerMl, 4)} mg/mL</span>
          </p>
          <p>
            volume = {formatDose(doseMcg)} ÷ {trim(draw.concentrationMgPerMl, 4)} mg/mL ={" "}
            <span className="text-[var(--ink)]">{trim(draw.volumeMl, 4)} mL</span>
          </p>
          <p>
            {t("calc_marks_formula", {
              volume: trim(draw.volumeMl, 4),
              per: trim(graduationMl(syringe), 4),
            })}{" "}
            <span className="text-[var(--ink)]">{trim(draw.volumeMl / graduationMl(syringe), 2)}</span>
          </p>
        </div>
        <p className="mt-3.5 border-t border-[var(--line)] pt-3 text-[12.5px] leading-relaxed text-[var(--faint)]">
          {t("calc_displacement_note")}
        </p>
      </Card>

      <Card className="border-[var(--rose)]/35 p-4">
        <div className="flex gap-2.5">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[var(--rose)]" />
          <p className="text-[12.5px] leading-relaxed text-[var(--muted)]">
            {t("calc_disclaimer")}
          </p>
        </div>
      </Card>
    </div>
  );
}
