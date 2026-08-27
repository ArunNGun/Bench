"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  EmptyState,
  Field,
  NumberInput,
  Card,
  SectionLabel,
  Select,
  Stat,
  TextInput,
} from "@/components/ui";
import { VialGlyph } from "@/components/Syringe";
import { allPeptides, findPeptide, useStore, vialStatus, useProfileData } from "@/lib/store";
import { AddCompoundInline } from "@/components/AddCompoundInline";
import { MULTI_DOSE_VIAL_BUD_DAYS } from "@/lib/calc/reconstitution";
import { groupSealedVials, vialRemainingMcg, type VialGroup } from "@/lib/calc/inventory";
import { scheduledDoseMcg } from "@/lib/calc/schedule";
import { formatConcentration, formatDate, formatDose, trim } from "@/lib/format";
import { costPerVialInKit, formatMoney, remainingValue, totalSpend } from "@/lib/calc/cost";
import { DEFAULT_SETTINGS, type Vial } from "@/lib/types";

export default function StockPage() {
  const hydrated = useStore((s) => s.hydrated);
  const { protocols, vials } = useProfileData();
  const custom = useStore((s) => s.customPeptides);
  const addVial = useStore((s) => s.addVial);
  const updateVial = useStore((s) => s.updateVial);
  const removeVial = useStore((s) => s.removeVial);
  const reconstituteVial = useStore((s) => s.reconstituteVial);
  const settings = useStore((s) => s.settings);
  const currency = settings.currency ?? DEFAULT_SETTINGS.currency;

  const peptides = useMemo(() => allPeptides(custom), [custom]);
  const [adding, setAdding] = useState(false);
  const [reconstituting, setReconstituting] = useState<string | null>(null);

  const now = Date.now();
  const sealed = vials.filter((v) => v.state === "sealed");
  // Off unless asked for, so nobody's Stock page rearranges itself after an update.
  const grouping = settings.groupIdenticalVials === true;
  const sealedGroups = useMemo(() => groupSealedVials(sealed), [sealed]);
  const open = vials.filter((v) => v.state === "reconstituted");
  const done = vials.filter((v) => v.state === "finished" || v.state === "discarded");

  // Remaining mass, not label strength, a part-used vial is not a full one.
  const totalMg =
    [...sealed, ...open].reduce((s, v) => s + vialRemainingMcg(v), 0) / 1000;

  const spend = totalSpend(vials);
  const unusedValue = [...sealed, ...open].reduce((s, v) => s + (remainingValue(v) ?? 0), 0);

  /** The dose this peptide is actually being run at, for a per-vial count. */
  const doseFor = (peptideId: string) => {
    const p = protocols.find((x) => x.active && x.peptideId === peptideId);
    return p ? scheduledDoseMcg(p, now) : 0;
  };

  if (!hydrated) {
    return <div className="py-20 text-center text-[14px] text-[var(--faint)]">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight text-[var(--ink)]">Stock</h1>
          <p className="mt-1 text-[13.5px] text-[var(--muted)]">
            What is in the fridge and how long it has left.
          </p>
        </div>
        <Button variant="primary" onClick={() => setAdding(true)}>
          <Plus size={16} /> Add a vial
        </Button>
      </header>

      {vials.length > 0 && (
        <Card className="grid grid-cols-3 gap-4 p-4">
          <Stat label="Sealed" value={sealed.length} />
          <Stat label="Open" value={open.length} tone="tangerine" />
          <Stat label="Remaining" value={trim(totalMg, 2)} unit="mg" tone="sky" hint="Across every usable vial." />
        </Card>
      )}

      {vials.length > 0 && spend.pricedVials > 0 && (
        <Card className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3">
          <Stat
            label="Spent"
            value={formatMoney(spend.total, currency)}
            tone="grape"
            hint={`${spend.pricedVials} priced vial${spend.pricedVials === 1 ? "" : "s"}${spend.unpricedVials ? `, ${spend.unpricedVials} without a price` : ""}.`}
          />
          <Stat
            label="Still in vials"
            value={formatMoney(unusedValue, currency)}
            tone="mint"
            hint="Value of what you have not used yet."
          />
        </Card>
      )}

      {adding && (
        <AddVialForm
          peptides={peptides}
          currency={currency}
          onCancel={() => setAdding(false)}
          onSave={(v) => {
            addVial(v);
            setAdding(false);
          }}
        />
      )}

      {!vials.length && !adding && (
        <EmptyState
          title="Nothing in stock"
          action={
            <Button variant="primary" onClick={() => setAdding(true)}>
              Add a vial
            </Button>
          }
        >
          Track each vial from sealed through reconstitution to empty. Logging a dose against a vial
          draws it down automatically.
        </EmptyState>
      )}

      {open.length > 0 && (
        <section>
          <SectionLabel>Open</SectionLabel>
          <div className="space-y-2.5">
            {open.map((v) => (
              <VialRow
                key={v.id}
                vial={v}
                now={now}
                budWarningDays={settings.budWarningDays}
                doseMcg={doseFor(v.peptideId)}
                currency={currency}
                peptideName={findPeptide(custom, v.peptideId)?.name ?? v.peptideId}
                onRemove={() => removeVial(v.id)}
                onFinish={() => updateVial(v.id, { state: "finished" })}
              />
            ))}
          </div>
        </section>
      )}

      {sealed.length > 0 && (
        <section>
          <SectionLabel>Sealed</SectionLabel>
          <div className="space-y-2.5">
            {(grouping
              ? sealedGroups.map((g) => ({ vial: g.vials[0], group: g }))
              : sealed.map((v) => ({ vial: v, group: undefined as VialGroup | undefined }))
            ).map(({ vial: v, group }) => (
              <div key={group ? group.key : v.id}>
                <VialRow
                  vial={v}
                  group={group}
                  now={now}
                  budWarningDays={settings.budWarningDays}
                  doseMcg={doseFor(v.peptideId)}
                  currency={currency}
                  peptideName={findPeptide(custom, v.peptideId)?.name ?? v.peptideId}
                  onRemove={() => removeVial(v.id)}
                  onReconstitute={() => setReconstituting(v.id)}
                />
                {reconstituting === v.id && (
                  <ReconstituteForm
                    vial={v}
                    onCancel={() => setReconstituting(null)}
                    onSave={(ml, diluent) => {
                      reconstituteVial(v.id, ml, diluent);
                      setReconstituting(null);
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section>
          <SectionLabel>Finished</SectionLabel>
          <div className="space-y-1.5">
            {done.map((v) => (
              <Card key={v.id} className="flex items-center gap-3 p-2.5 opacity-55">
                <span className="text-[13px] text-[var(--muted)]">
                  {findPeptide(custom, v.peptideId)?.name ?? v.peptideId} · {v.strengthMg} mg
                </span>
                <button
                  type="button"
                  onClick={() => removeVial(v.id)}
                  aria-label="Delete vial record"
                  className="ml-auto p-1 text-[var(--faint)] hover:text-[var(--rose)]"
                >
                  <Trash2 size={14} />
                </button>
              </Card>
            ))}
          </div>
        </section>
      )}

      <Callout tone="info" title="About the 28-day date">
        The beyond-use date this app applies from first puncture is the CDC and USP limit on how long
        a multi-dose container may be used. It is an infection-control rule about the vial, not a
        statement that the peptide inside is still potent, chemical stability is a separate,
        compound-specific question that is undocumented for most research peptides.
      </Callout>
    </div>
  );
}

function VialRow({
  vial,
  group,
  now,
  peptideName,
  budWarningDays,
  doseMcg,
  currency,
  onRemove,
  onReconstitute,
  onFinish,
}: {
  vial: Vial;
  /**
   * Present when this row stands for several identical sealed vials. `vial` is
   * then the oldest of them, which is what the buttons act on, while the
   * figures below are the group's.
   */
  group?: VialGroup;
  now: number;
  peptideName: string;
  budWarningDays: number;
  doseMcg: number;
  currency: string;
  onRemove: () => void;
  onReconstitute?: () => void;
  onFinish?: () => void;
}) {
  const st = vialStatus(vial, now);
  const budSoon = st.daysToBud != null && st.daysToBud < budWarningDays;

  const many = (group?.count ?? 1) > 1;
  // One row, one set of numbers: either this vial's or the whole group's.
  const remainingMcg = group ? group.remainingMcg : st.remainingMcg;
  const rowCost = group ? group.cost : vial.cost;
  const rowCurrency = (group ? group.currency : vial.currency) ?? currency;
  const strengthMgTotal = group ? group.strengthMg * group.count : vial.strengthMg;

  return (
    <Card className={`flex items-start gap-3 p-3.5 ${st.expired ? "border-[var(--rose)]/45" : ""}`}>
      <div className="h-14 w-8 shrink-0">
        <VialGlyph fraction={st.fractionRemaining} state={vial.state} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14.5px] text-[var(--ink)]">{peptideName}</span>
          <span className="tnum font-mono text-[13px] text-[var(--muted)]">{vial.strengthMg} mg</span>
          {many && <Badge tone="sky">{group!.count} vials</Badge>}
          {st.expired && <Badge tone="rose">past date</Badge>}
          {!st.expired && budSoon && <Badge tone="tangerine">use soon</Badge>}
        </div>

        {vial.state === "reconstituted" && vial.diluentMl ? (
          <div className="mt-1 flex flex-wrap gap-x-3.5 gap-y-0.5 text-[12.5px] text-[var(--muted)]">
            <span className="tnum font-mono">
              {formatConcentration(st.concentrationMcgPerMl)}
            </span>
            <span className="tnum font-mono">{trim(st.remainingMl, 2)} mL left</span>
            {vial.budAt != null && (
              <span className={budSoon ? "text-[var(--rose)]" : ""}>
                use by {formatDate(vial.budAt)}
              </span>
            )}
          </div>
        ) : (
          <div className="mt-1 flex flex-wrap gap-x-3.5 text-[12.5px] text-[var(--muted)]">
            <span>Lyophilised, unopened</span>
            {many && <span className="tnum font-mono">{trim(strengthMgTotal, 2)} mg in total</span>}
            {/* The soonest date in the group, because that is the one that bites first. */}
            {(group ? group.expiresAt : vial.expiresAt) != null && (
              <span>
                {many ? "first expires" : "expires"}{" "}
                {formatDate((group ? group.expiresAt : vial.expiresAt)!)}
              </span>
            )}
          </div>
        )}

        {doseMcg > 0 && (
          <p className="mt-1 text-[12.5px]">
            <span className="tnum font-mono text-[var(--tangerine)]">
              {Math.floor(remainingMcg / doseMcg)}
            </span>{" "}
            <span className="text-[var(--muted)]">
              more {formatDose(doseMcg)} dose
              {Math.floor(remainingMcg / doseMcg) === 1 ? "" : "s"}{" "}
              {many ? "across these vials" : "in this vial"} · {formatDose(remainingMcg)} left
            </span>
          </p>
        )}

        {((!many && (vial.supplier || vial.cost != null)) || (many && rowCost != null)) && (
          <p className="mt-1 text-[12px] text-[var(--faint)]">
            {[
              // Suppliers can differ across a group, so only a single vial claims one.
              many ? null : vial.supplier,
              rowCost != null
                ? `${formatMoney(rowCost, rowCurrency)}${
                    many ? " in total" : ""
                  }${
                    doseMcg > 0
                      ? ` · ${formatMoney((rowCost / strengthMgTotal) * (doseMcg / 1000), rowCurrency)} a dose`
                      : ""
                  }`
                : null,
              // Named rather than folded in, so a total is never read as covering
              // vials that were never priced.
              many && group!.unpricedCount > 0
                ? `${group!.unpricedCount} without a price`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}

        <div className="mt-2.5 flex flex-wrap gap-2">
          {onReconstitute && (
            <Button onClick={onReconstitute} className="px-3 py-1.5 text-[13px]">
              Reconstitute{many ? " one" : ""}
            </Button>
          )}
          {onFinish && (
            <Button onClick={onFinish} variant="ghost" className="px-3 py-1.5 text-[13px]">
              Mark empty
            </Button>
          )}
          <Button
            onClick={onRemove}
            variant="ghost"
            className="px-3 py-1.5 text-[13px] text-[var(--rose)] hover:border-[var(--rose)]/40 hover:text-[var(--rose)]"
          >
            {/* Never the whole group. One click, one vial, the oldest of them. */}
            <Trash2 size={13} /> Delete{many ? " one" : ""}
          </Button>
        </div>
      </div>


    </Card>
  );
}

function AddVialForm({
  peptides,
  currency,
  onCancel,
  onSave,
}: {
  currency: string;
  peptides: ReturnType<typeof allPeptides>;
  onCancel: () => void;
  onSave: (v: Omit<Vial, "id" | "profileId">) => void;
}) {
  const [peptideId, setPeptideId] = useState(peptides[0]?.id ?? "");
  const [strengthMg, setStrengthMg] = useState(10);
  const [count, setCount] = useState(1);
  const [supplier, setSupplier] = useState("");
  const [cost, setCost] = useState<number | "">("");
  /**
   * Whether the price typed in is for one vial or for the box.
   *
   * Kits are sold as a box, ten vials for two hundred rather than twenty each,
   * and doing that division by hand before typing it in is the sort of small
   * friction that ends with the price left blank. A vial with no price is
   * treated as free by every figure downstream, which is worse than wrong.
   */
  const [pricedAs, setPricedAs] = useState<"vial" | "kit">("vial");

  const peptide = peptides.find((p) => p.id === peptideId);
  const addVial = useStore((s) => s.addVial);

  // Storage is always per vial, whichever way it was entered, so nothing
  // downstream has to know a kit was involved.
  const perVial =
    cost === ""
      ? undefined
      : pricedAs === "kit"
        ? (costPerVialInKit(Number(cost), count) ?? undefined)
        : Number(cost);

  return (
    <Card className="space-y-4 p-4">
      <SectionLabel>New vial</SectionLabel>

      <Field label="Peptide">
        <Select
          value={peptideId}
          onChange={(e) => {
            setPeptideId(e.target.value);
            const p = peptides.find((x) => x.id === e.target.value);
            if (p?.vialSizesMg.length) setStrengthMg(p.vialSizesMg[0]);
          }}
        >
          {peptides.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <AddCompoundInline
          onCreated={(p) => {
            setPeptideId(p.id);
            if (p.vialSizesMg.length) setStrengthMg(p.vialSizesMg[0]);
          }}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Strength"
          hint={peptide?.vialSizesMg.length ? `Common: ${peptide.vialSizesMg.join(", ")} mg` : undefined}
        >
          <NumberInput
            value={strengthMg}
            min={0}
            step={0.5}
            suffix="mg"
            onChange={(e) => setStrengthMg(Number(e.target.value))}
          />
        </Field>
        <Field label="How many">
          <NumberInput
            value={count}
            min={1}
            max={50}
            step={1}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </Field>
        <Field label="Source">
          <TextInput
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="Optional"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <Field
          label={pricedAs === "kit" ? "Cost for the whole kit" : "Cost per vial"}
          hint={
            perVial != null && strengthMg > 0
              ? // Always says both numbers, so the split is visible before it is
                // saved rather than discovered later on a vial row.
                `${formatMoney(perVial, currency)} a vial, ${formatMoney(perVial / strengthMg, currency)} per mg.` +
                (count > 1 ? ` ${formatMoney(perVial * count, currency)} for all ${count}.` : "")
              : "Optional. Lets the app work out what a dose costs you."
          }
        >
          <NumberInput
            value={cost}
            min={0}
            step={5}
            suffix={currency}
            placeholder=", "
            onChange={(e) => setCost(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </Field>

        <Field label="Priced as">
          <Select
            value={pricedAs}
            onChange={(e) => setPricedAs(e.target.value as "vial" | "kit")}
          >
            <option value="vial">Per vial</option>
            <option value="kit">{count > 1 ? `Kit of ${count}` : "Whole kit"}</option>
          </Select>
        </Field>
      </div>

      <div className="flex gap-2.5">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            const base: Omit<Vial, "id" | "profileId"> = {
              peptideId,
              strengthMg,
              state: "sealed",
              supplier: supplier.trim() || undefined,
              cost: perVial,
              currency: perVial == null ? undefined : currency,
              acquiredAt: Date.now(),
            };
            // The first one goes through the parent so the form can close;
            // any extras are added directly.
            for (let i = 1; i < count; i++) addVial(base);
            onSave(base);
          }}
          disabled={!peptideId || !(strengthMg > 0)}
        >
          Add {count > 1 ? `${count} vials` : "vial"}
        </Button>
      </div>
    </Card>
  );
}

function ReconstituteForm({
  vial,
  onCancel,
  onSave,
}: {
  vial: Vial;
  onCancel: () => void;
  onSave: (ml: number, diluent: Vial["diluent"]) => void;
}) {
  const [ml, setMl] = useState(2);
  const [diluent, setDiluent] = useState<NonNullable<Vial["diluent"]>>("bacteriostatic");
  const conc = ml > 0 ? vial.strengthMg / ml : 0;

  return (
    <Card className="mt-1.5 space-y-4 border-[var(--tangerine)]/35 p-4">
      <SectionLabel>Reconstitute</SectionLabel>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Water added" hint={`Makes ${trim(conc, 3)} mg/mL.`}>
          <NumberInput
            value={ml}
            min={0.1}
            step={0.25}
            suffix="mL"
            onChange={(e) => setMl(Number(e.target.value))}
          />
        </Field>
        <Field label="Diluent">
          <Select
            value={diluent}
            onChange={(e) => setDiluent(e.target.value as NonNullable<Vial["diluent"]>)}
          >
            <option value="bacteriostatic">Bacteriostatic water</option>
            <option value="sterile">Sterile water (single use)</option>
            <option value="saline">0.9% sodium chloride</option>
          </Select>
        </Field>
      </div>

      {diluent === "sterile" && (
        <Callout tone="warn">
          Sterile water has no preservative, so the vial is single-use and should be discarded after
          one withdrawal rather than kept as a multi-dose vial.
        </Callout>
      )}

      <p className="text-[12.5px] leading-relaxed text-[var(--faint)]">
        Run the water down the inside wall rather than spraying it onto the powder, and swirl rather
        than shake. Shaking creates an air, liquid interface that denatures and aggregates peptide.
        The beyond-use date will be set {MULTI_DOSE_VIAL_BUD_DAYS} days from now.
      </p>

      <div className="flex gap-2.5">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => onSave(ml, diluent)} disabled={!(ml > 0)}>
          Reconstitute
        </Button>
      </div>
    </Card>
  );
}
