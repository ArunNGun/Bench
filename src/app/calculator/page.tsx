"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeftRight, Check } from "lucide-react";
import { Syringe } from "@/components/Syringe";
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

const WARNING_COPY: Record<DrawWarning, { tone: "warn" | "danger"; title: string; body: string }> = {
  "exceeds-barrel": {
    tone: "danger",
    title: "This draw will not fit the barrel",
    body: "Use a larger syringe, split the dose across two injections, or reconstitute with less water to make it more concentrated.",
  },
  "below-graduation": {
    tone: "danger",
    title: "Smaller than the finest mark on this barrel",
    body: "There is no way to measure this accurately. Add more water to dilute it, or use a barrel with finer graduations.",
  },
  "off-graduation": {
    tone: "warn",
    title: "This lands between two marks",
    body: "You will have to settle on the nearest mark. The delivered dose below reflects that.",
  },
  "low-volume": {
    tone: "warn",
    title: "Very small draw",
    body: `Under about ${MIN_RELIABLE_UNITS} marks, reading error and the syringe's dead space start to rival the dose. Consider diluting further.`,
  },
  "exceeds-vial": {
    tone: "danger",
    title: "More liquid than the vial holds",
    body: "The dose needs more solution than you put in. Check the vial strength and water volume.",
  },
};

export default function CalculatorPage() {
  const custom = useStore((s) => s.customPeptides);
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
        <h1 className="text-[24px] font-extrabold tracking-tight text-[var(--ink)]">Reconstitution calculator</h1>
        <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-[var(--muted)]">
          Work out how much water to add and how far to draw the plunger. The syringe below is drawn
          to the real proportions of the barrel you pick, so you can hold yours against the screen.
        </p>
      </header>

      {/* Scale choice comes first, because everything downstream depends on it. */}
      <Card className="p-4">
        <SectionLabel>Which syringe are you holding?</SectionLabel>
        <Select
          value={syringeId}
          onChange={(e) => setSyringeId(e.target.value)}
          aria-label="Syringe type"
        >
          <optgroup label="U-100, 100 marks to 1 mL">
            {SYRINGES.filter((s) => s.scale === "U100").map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="U-40, 40 marks to 1 mL (veterinary)">
            {SYRINGES.filter((s) => s.scale === "U40").map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </optgroup>
        </Select>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone={syringe.scale === "U40" ? "rose" : "sky"}>
            1 mark = {trim(mlPerUnit(syringe.scale), 4)} mL
          </Badge>
          <Badge>barrel reads 0 to {trim(capacityUnits(syringe), 1)}</Badge>
          <Badge>marks every {trim(syringe.graduationUnits, 2)}</Badge>
        </div>

        {syringe.note && (
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-[var(--faint)]">{syringe.note}</p>
        )}

        <Callout tone="warn" className="mt-3" title="Check the barrel before you trust a number">
          A U-40 barrel numbered 0 to 40 and a U-100 barrel numbered 0 to 100 look similar, but one mark is{" "}
          <strong className="text-[var(--ink)]">0.025 mL</strong> on U-40 against{" "}
          <strong className="text-[var(--ink)]">0.01 mL</strong> on U-100. Reading a U-40 barrel as
          though it were U-100 delivers <strong className="text-[var(--ink)]">2.5 times</strong> the
          intended dose. There is no such thing as a 0.4 mL U-100 syringe, so a &ldquo;40 unit
          syringe&rdquo; is most likely the 1 mL veterinary U-40 barrel.
        </Callout>
      </Card>

      {/* Inputs */}
      <Card className="p-4">
        <SectionLabel>The vial and the dose</SectionLabel>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Peptide (optional)" hint="Fills in a typical vial size and dose.">
            <Select value={peptideId} onChange={(e) => applyPeptide(e.target.value)}>
              <option value="">Choose to prefill…</option>
              {peptides.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <AddCompoundInline onCreated={(p) => applyPeptide(p.id)} />
          </Field>

          <Field label="Vial strength" htmlFor="vial">
            <NumberInput
              id="vial"
              value={vialMg}
              min={0}
              step={0.5}
              suffix="mg"
              onChange={(e) => setVialMg(Number(e.target.value))}
            />
          </Field>

          <Field label="Water added" htmlFor="water" hint="Bacteriostatic water for a multi-dose vial.">
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
          <Field label="Dose you want" htmlFor="dose" className="min-w-40 flex-1">
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
            ariaLabel="Dose unit"
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
            <SectionLabel className="mb-0">Draw to here</SectionLabel>
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
                Dashed line marks the exact figure of {trim(draw.units, 2)}; the fill shows the mark
                you can actually hit.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-5 border-t border-[var(--line)] px-4 py-5 sm:grid-cols-4 sm:px-6">
            <Stat
              label="Volume"
              value={trim(draw.volumeRoundedMl, 3)}
              unit="mL"
              tone="tangerine"
              hint="The primary answer."
            />
            <Stat
              label={syringe.scale === "U100" ? "U-100 marks" : "U-40 marks"}
              value={trim(draw.unitsRounded, 2)}
              hint={`On the ${syringe.scale === "U100" ? "0 to 100" : "0 to 40"} scale.`}
            />
            <Stat
              label="Concentration"
              value={formatConcentration(draw.concentrationMcgPerMl).split(" ")[0]}
              unit={formatConcentration(draw.concentrationMcgPerMl).split(" ")[1]}
              hint={`${trim(draw.mcgPerUnit, 2)} mcg per mark.`}
            />
            <Stat
              label="Doses per vial"
              value={draw.dosesPerVial}
              tone="sky"
              hint={`At ${formatDose(doseMcg)} each.`}
            />
          </div>

          {draw.warnings.includes("off-graduation") && (
            <div className="border-t border-[var(--line)] px-4 py-3.5 sm:px-6">
              <p className="text-[13px] leading-relaxed text-[var(--muted)]">
                Settling on {trim(draw.unitsRounded, 2)} marks actually delivers{" "}
                <strong className="tnum font-mono text-[var(--ink)]">
                  {formatDose(draw.deliveredMcg)}
                </strong>, which is {draw.roundingErrorMcg > 0 ? "over" : "under"} your target by{" "}
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
              The same {formatMl(draw.volumeRoundedMl)} reads as
            </span>
            <strong className="tnum font-mono text-[var(--ink)]">
              {trim(draw.volumeRoundedMl * (otherScale === "U100" ? 100 : 40), 2)}
            </strong>
            <span className="text-[var(--muted)]">
              marks on a {otherScale === "U100" ? "U-100" : "U-40"} barrel.
            </span>
          </div>
        </Card>
      ) : (
        <Card className="px-4 py-10 text-center text-[14px] text-[var(--muted)]">
          Enter a vial strength, a water volume and a dose to see the draw.
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
          <SectionLabel>Water volumes that read more cleanly</SectionLabel>
          <p className="mb-3 text-[13px] leading-relaxed text-[var(--muted)]">
            Same vial, same dose, different amount of water. A draw that lands exactly on a printed
            mark is one you can repeat accurately every time.
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
                      {trim(s.units, 2)} marks
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--faint)]">
                      {trim(s.concentrationMgPerMl, 3)} mg/mL · {trim(s.mcgPerUnit, 2)} mcg per mark
                    </span>
                    {s.landsOnMark && (
                      <Check size={15} className="shrink-0 text-[var(--leaf)]" aria-label="Lands on a mark" />
                    )}
                    {active && <Badge tone="tangerine">current</Badge>}
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Reference */}
      <Card className="p-4">
        <SectionLabel>How this is worked out</SectionLabel>
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
            marks = {trim(draw.volumeMl, 4)} mL ÷ {trim(graduationMl(syringe), 4)} mL per mark ={" "}
            <span className="text-[var(--ink)]">{trim(draw.volumeMl / graduationMl(syringe), 2)}</span>
          </p>
        </div>
        <p className="mt-3.5 border-t border-[var(--line)] pt-3 text-[12.5px] leading-relaxed text-[var(--faint)]">
          The lyophilised powder itself displaces roughly 0.7 microlitres per milligram, so a 10 mg
          vial shifts a 2 mL reconstitution by about 0.35%, well under the finest mark on any
          barrel. It is ignored here, as it is in clinical practice.
        </p>
      </Card>

      <Card className="border-[var(--rose)]/35 p-4">
        <div className="flex gap-2.5">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[var(--rose)]" />
          <p className="text-[12.5px] leading-relaxed text-[var(--muted)]">
            The arithmetic here is exact and tested. What it cannot check is whether the vial holds
            what the label says, unregulated material has no verified identity, purity or sterility,
            and correct maths on an unverified product does not make it safe. Nothing in this app is
            medical advice.
          </p>
        </div>
      </Card>
    </div>
  );
}
