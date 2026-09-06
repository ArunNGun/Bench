"use client";
import { useLang } from "@/lib/i18n";

import { useMemo, useState } from "react";
import { Droplet, PackageCheck, Plus, SprayCan, Trash2 } from "lucide-react";
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
import { MULTI_DOSE_VIAL_BUD_DAYS, unitsToMl } from "@/lib/calc/reconstitution";
import { useSyringeScale } from "@/components/DoseMarks";
import {
  diluentAfterTopUp,
  groupSealedVials,
  marksFromVial,
  stockFor,
  supplyOutlook,
  vialConcentration,
  vialRemainingMcg,
  vialRemainingMl,
  type SupplyOutlook,
  type VialGroup,
} from "@/lib/calc/inventory";
import { dosesPerDoseDay, phaseSpanAt, scheduledDoseMcg } from "@/lib/calc/schedule";
import { bottleRemainingMl, bottleUsable, diluentStock, pickBottle, shelfOrder } from "@/lib/calc/diluent";
import {
  DEFAULT_ML_PER_SPRAY,
  MEASURE_A_PRESS,
  isSpray,
  mcgPerSpray,
  spraysRemaining,
  transferToSpray,
} from "@/lib/calc/spray";
import { converterUrl } from "@/lib/calc/converter";
import { formatConcentration, formatDate, formatDose, formatDosePerDay, trim } from "@/lib/format";
import {
  costPerVialInKit,
  formatMoney,
  formatTotals,
  remainingValue,
  shippingShare,
  sumByCurrency,
  totalSpend,
} from "@/lib/calc/cost";
import {
  CURRENCIES,
  DEFAULT_SETTINGS,
  type DiluentBottle,
  type DiluentKind,
  type Vial,
} from "@/lib/types";

export default function StockPage() {
  const hydrated = useStore((s) => s.hydrated);
  const { t } = useLang();
  const { protocols, vials, orders, diluents } = useProfileData();
  const custom = useStore((s) => s.customPeptides);
  const addOrder = useStore((s) => s.addOrder);
  const updateVial = useStore((s) => s.updateVial);
  const removeVial = useStore((s) => s.removeVial);
  const reconstituteVial = useStore((s) => s.reconstituteVial);
  const topUpVial = useStore((s) => s.topUpVial);
  const transferSpray = useStore((s) => s.transferToSpray);
  const settings = useStore((s) => s.settings);
  const currency = settings.currency ?? DEFAULT_SETTINGS.currency;

  const peptides = useMemo(() => allPeptides(custom), [custom]);
  const [adding, setAdding] = useState(false);
  const [reconstituting, setReconstituting] = useState<string | null>(null);
  const [toppingUp, setToppingUp] = useState<string | null>(null);
  /** Which vial is being emptied into a nasal spray bottle. */
  const [transferring, setTransferring] = useState<string | null>(null);

  const now = Date.now();
  /*
   * Paid for and not here. Kept out of every stock figure on purpose: the app
   * must never say there are three weeks left when half of that is with a
   * courier. It does count towards Spent, because the money has gone.
   */
  const onOrder = vials.filter((v) => v.state === "on-order");
  const sealed = vials.filter((v) => v.state === "sealed");
  // Off unless asked for, so nobody's Stock page rearranges itself after an update.
  const grouping = settings.groupIdenticalVials === true;
  const sealedGroups = useMemo(() => groupSealedVials(sealed), [sealed]);
  const open = vials.filter((v) => v.state === "reconstituted");
  const done = vials.filter((v) => v.state === "finished" || v.state === "discarded");

  // Remaining mass, not label strength, a part-used vial is not a full one.
  const totalMg =
    [...sealed, ...open].reduce((s, v) => s + vialRemainingMcg(v), 0) / 1000;

  /*
   * Both figures are per currency. A vial carries its own, so a shelf can hold
   * one bought in euros and one in dollars, and the old totals added them and
   * printed the result in whichever currency the settings happened to name.
   */
  const spend = totalSpend(vials, currency, orders);
  const unusedValue = sumByCurrency([...sealed, ...open], remainingValue, currency);
  const hasShipping = spend.shippingByCurrency.length > 0;

  /**
   * A vial's share of its order's postage.
   *
   * Passed down rather than read inside the row, because a component that
   * reaches into the store for the whole inventory to answer a question about
   * one line is a component that recomputes on every unrelated change.
   */
  const shippingOf = (v: Vial) => shippingShare(v, vials, orders);

  /** The dose this peptide is actually being run at, for a per-vial count. */
  const doseFor = (peptideId: string) => {
    const p = protocols.find((x) => x.active && x.peptideId === peptideId);
    return p ? scheduledDoseMcg(p, now) : 0;
  };

  /** How many of those a dose day holds, so a count of doses can be read as days. */
  const timesPerDayFor = (peptideId: string) => {
    const p = protocols.find((x) => x.active && x.peptideId === peptideId);
    if (!p) return 1;
    return dosesPerDoseDay(phaseSpanAt(p, now)?.schedule ?? p.schedule);
  };

  /**
   * When the stock of a compound runs out, spent against its actual plan.
   *
   * Per compound rather than per vial, and the same answer on every row of that
   * compound, because that is the truth: a protocol draws from whichever vial
   * `pickVialForDose` reaches for, so "how long does this one vial last" is a
   * question about an order of use that does not exist. One shelf, one date.
   *
   * Memoised per compound because the walk is a loop over scheduled doses and
   * the Sealed section can hold a dozen rows of the same thing.
   */
  const outlookFor = useMemo(() => {
    const cache = new Map<string, SupplyOutlook>();
    return (peptideId: string): SupplyOutlook => {
      const hit = cache.get(peptideId);
      if (hit) return hit;

      const p = protocols.find((x) => x.active && x.peptideId === peptideId);
      const out: SupplyOutlook = p
        ? supplyOutlook(stockFor(vials, peptideId, scheduledDoseMcg(p, now), now), p, now)
        : { kind: "unknown" };

      cache.set(peptideId, out);
      return out;
    };
  }, [protocols, vials, now]);

  if (!hydrated) {
    return <div className="py-20 text-center text-[14px] text-[var(--faint)]">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight text-[var(--ink)]">{t("stock_title")}</h1>
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
            value={formatTotals(spend.byCurrency)}
            tone="grape"
            hint={`${spend.pricedVials} priced vial${spend.pricedVials === 1 ? "" : "s"}${spend.unpricedVials ? `, ${spend.unpricedVials} without a price` : ""}.${spend.mixed ? " Kept apart by currency rather than added together." : ""}`}
          />
          <Stat
            label="Still in vials"
            value={formatTotals(unusedValue)}
            tone="mint"
            hint="Value of what you have not used yet."
          />
          {hasShipping && (
            <Stat
              label="Shipping"
              value={formatTotals(spend.shippingByCurrency)}
              tone="sky"
              hint={`Across ${spend.shippingByCurrency.reduce((n, c) => n + c.vials, 0)} order${
                spend.shippingByCurrency.reduce((n, c) => n + c.vials, 0) === 1 ? "" : "s"
              }. Counted in what each vial really cost.`}
            />
          )}
        </Card>
      )}

      {adding && (
        <AddVialForm
          peptides={peptides}
          currency={currency}
          onCancel={() => setAdding(false)}
          onSave={(vialsToAdd, shipping) => {
            addOrder(vialsToAdd, shipping);
            setAdding(false);
          }}
        />
      )}

      <DiluentShelf />

      {!vials.length && !adding && (
        <EmptyState
          title={t("stock_no_vials")}
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

      {onOrder.length > 0 && (
        <section>
          <SectionLabel>{t("stock_on_order")}</SectionLabel>
          <div className="space-y-2.5">
            {onOrder.map((v) => (
              <VialRow
                key={v.id}
                vial={v}
                now={now}
                budWarningDays={settings.budWarningDays}
                doseMcg={doseFor(v.peptideId)}
                timesPerDay={timesPerDayFor(v.peptideId)}
                outlook={outlookFor(v.peptideId)}
                shippingOf={shippingOf}
                currency={currency}
                peptideName={findPeptide(custom, v.peptideId)?.name ?? v.peptideId}
                onRemove={() => removeVial(v.id)}
                onArrived={() =>
                  // Arriving makes it an ordinary sealed vial, and dates it from
                  // the day it turned up rather than the day it was ordered.
                  updateVial(v.id, { state: "sealed", acquiredAt: Date.now() })
                }
              />
            ))}
          </div>
        </section>
      )}

      {open.length > 0 && (
        <section>
          <SectionLabel>{t("stock_open")}</SectionLabel>
          <div className="space-y-2.5">
            {open.map((v) => (
              <div key={v.id}>
                <VialRow
                  vial={v}
                  now={now}
                  budWarningDays={settings.budWarningDays}
                  doseMcg={doseFor(v.peptideId)}
                  timesPerDay={timesPerDayFor(v.peptideId)}
                  outlook={outlookFor(v.peptideId)}
                  shippingOf={shippingOf}
                  currency={currency}
                  peptideName={findPeptide(custom, v.peptideId)?.name ?? v.peptideId}
                  onRemove={() => removeVial(v.id)}
                  onTopUp={() => setToppingUp(v.id)}
                  onTransfer={isSpray(v) ? undefined : () => setTransferring(v.id)}
                  onFinish={() => updateVial(v.id, { state: "finished" })}
                />
                {transferring === v.id && (
                  <TransferToSprayForm
                    vial={v}
                    bottles={diluents}
                    onCancel={() => setTransferring(null)}
                    onSave={(addedMl, mlPerSpray, diluent, fromBottleId) => {
                      transferSpray(v.id, { addedMl, mlPerSpray, diluent, fromBottleId });
                      setTransferring(null);
                    }}
                  />
                )}
                {toppingUp === v.id && (
                  <TopUpForm
                    vial={v}
                    bottles={diluents}
                    onCancel={() => setToppingUp(null)}
                    onSave={(addedMl, fromBottleId) => {
                      topUpVial(v.id, addedMl, fromBottleId);
                      setToppingUp(null);
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {sealed.length > 0 && (
        <section>
          <SectionLabel>{t("stock_sealed")}</SectionLabel>
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
                  timesPerDay={timesPerDayFor(v.peptideId)}
                  outlook={outlookFor(v.peptideId)}
                  shippingOf={shippingOf}
                  currency={currency}
                  peptideName={findPeptide(custom, v.peptideId)?.name ?? v.peptideId}
                  onRemove={() => removeVial(v.id)}
                  onReconstitute={() => setReconstituting(v.id)}
                />
                {reconstituting === v.id && (
                  <ReconstituteForm
                    vial={v}
                    bottles={diluents}
                    onCancel={() => setReconstituting(null)}
                    onSave={(ml, diluent, fromBottleId) => {
                      reconstituteVial(v.id, ml, diluent, undefined, fromBottleId);
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
          <SectionLabel>{t("stock_finished")}</SectionLabel>
          <div className="space-y-1.5">
            {done.map((v) => (
              <Card key={v.id} className="flex items-center gap-3 p-2.5 opacity-55">
                <span className="text-[13px] text-[var(--muted)]">
                  {findPeptide(custom, v.peptideId)?.name ?? v.peptideId} · {v.strengthMg} mg
                </span>
                <button
                  type="button"
                  onClick={() => removeVial(v.id)}
                  aria-label={t("stock_delete_vial")}
                  className="ml-auto p-1 text-[var(--faint)] hover:text-[var(--rose)]"
                >
                  <Trash2 size={14} />
                </button>
              </Card>
            ))}
          </div>
        </section>
      )}

      <Callout tone="info" title={t("stock_28_day_note")}>
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
  timesPerDay,
  outlook,
  currency,
  shippingOf,
  onRemove,
  onReconstitute,
  onArrived,
  onTopUp,
  onTransfer,
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
  /** Injections a dose day holds, so a count of doses can be read as days. */
  timesPerDay: number;
  /**
   * When the whole stock of this compound runs out. Shared by every row of the
   * same compound on purpose; see the comment on `outlookFor`.
   */
  outlook: SupplyOutlook;
  currency: string;
  /** This vial's share of its order's postage, or zero. */
  shippingOf: (v: Vial) => number;
  onRemove: () => void;
  onReconstitute?: () => void;
  /** Only for a vial on order. Turns it into an ordinary sealed one. */
  onArrived?: () => void;
  /** Only ever passed for an open vial, since there is nothing to dilute before that. */
  onTopUp?: () => void;
  /** Only for a made-up vial, and never for a bottle that is already a spray. */
  onTransfer?: () => void;
  onFinish?: () => void;
}) {
  const st = vialStatus(vial, now);
  const budSoon = st.daysToBud != null && st.daysToBud < budWarningDays;
  const scale = useSyringeScale();
  const spray = isSpray(vial);
  // Marks are a reading off a barrel, and a nasal dose never meets one.
  const marks = !spray && doseMcg > 0 ? marksFromVial(vial, doseMcg, scale) : null;
  const perPress = spray ? mcgPerSpray(vial) : 0;

  const many = (group?.count ?? 1) > 1;
  // One row, one set of numbers: either this vial's or the whole group's.
  const remainingMcg = group ? group.remainingMcg : st.remainingMcg;
  const rowCost = group ? group.cost : vial.cost;
  const rowCurrency = (group ? group.currency : vial.currency) ?? currency;
  /*
   * Postage, shared. Shown beside the price rather than added into it, because
   * two identical vials bought in different orders would otherwise appear to
   * have cost different amounts with nothing on the page to say why. The cost
   * per dose does include it, since that is the figure the request was about.
   */
  const rowShipping = group
    ? group.vials.reduce((sum, v) => sum + shippingOf(v), 0)
    : shippingOf(vial);
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
          {spray && <Badge tone="grape">nasal spray</Badge>}
          {many && <Badge tone="sky">{group!.count} vials</Badge>}
          {st.expired && <Badge tone="rose">past date</Badge>}
          {!st.expired && budSoon && <Badge tone="tangerine">use soon</Badge>}
        </div>

        {vial.state === "on-order" ? (
          <div className="mt-1 flex flex-wrap gap-x-3.5 text-[12.5px] text-[var(--muted)]">
            <span>Not here yet</span>
            {vial.acquiredAt != null && <span>ordered {formatDate(vial.acquiredAt)}</span>}
          </div>
        ) : vial.state === "reconstituted" && vial.diluentMl ? (
          <div className="mt-1 flex flex-wrap gap-x-3.5 gap-y-0.5 text-[12.5px] text-[var(--muted)]">
            <span className="tnum font-mono">
              {formatConcentration(st.concentrationMcgPerMl)}
            </span>
            <span className="tnum font-mono">{trim(st.remainingMl, 2)} mL left</span>
            {/*
              What this vial reads on the barrel, for the dose it is being run
              at. Per vial rather than through the picker: this row is about
              one vial, and two vials of the same compound made up differently
              give different marks for the same dose.
            */}
            {marks != null && (
              <span
                className="tnum font-mono"
                title={`${trim(marks, 2)} marks on a ${
                  scale === "U40" ? "U-40" : "U-100"
                } barrel, ${trim(unitsToMl(marks, scale), 3)} mL`}
              >
                {trim(marks, 2)} marks per {formatDose(doseMcg)}
              </span>
            )}
            {spray && perPress > 0 && (
              <span className="tnum font-mono">{formatDose(perPress)} a press</span>
            )}
            {/*
              About, and the word is doing work. The last millilitre cannot be
              lifted by the pump and priming costs some of it, none of which is
              knowable from here, so this reads high and says so.
            */}
            {spray && <span>about {spraysRemaining(vial)} presses left</span>}
            {/*
              A spray carries no use-by date, deliberately, so the only clock it
              has is the day it was filled. See calc/spray.ts.
            */}
            {spray && vial.reconstitutedAt != null && (
              <span>filled {formatDate(vial.reconstitutedAt)}</span>
            )}
            {!spray && vial.budAt != null && (
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

        {doseMcg > 0 && vial.state !== "on-order" && (
          <p className="mt-1 text-[12.5px]">
            <span className="tnum font-mono text-[var(--tangerine)]">
              {Math.floor(remainingMcg / doseMcg)}
            </span>{" "}
            {/*
              The count is injections, which is what actually comes out of a
              vial, and on a plan taken twice a day that is half as many days.
              Naming the rhythm beside the amount is what lets the reader do
              that division; without it, "250 mcg doses" contradicts a plan
              they entered as 500.
            */}
            <span className="text-[var(--muted)]">
              more dose
              {Math.floor(remainingMcg / doseMcg) === 1 ? "" : "s"} of{" "}
              {formatDosePerDay(doseMcg, timesPerDay)}{" "}
              {many ? "across these vials" : "in this vial"} · {formatDose(remainingMcg)} left
            </span>
          </p>
        )}

        {/*
          The date the shelf empties, not this vial.

          A date rather than "42 days left" because the duration invites the
          reader to work out whether it covers the rest of the plan, and the
          answer changes every morning. The date is the same fact tomorrow, and
          reordering is a decision about a date.

          Deliberately says nothing about the use-by date above it. That is a
          separate fact about this vial, already shown, and folding the two into
          one number would hide which of them was doing the talking.
        */}
        {outlook.kind === "runs-out" && (
          <p className="mt-0.5 text-[12px] text-[var(--faint)]">
            At this plan, stock runs out{" "}
            <span className="text-[var(--muted)]">{formatDate(outlook.at)}</span>
          </p>
        )}
        {outlook.kind === "beyond-horizon" && (
          <p className="mt-0.5 text-[12px] text-[var(--faint)]">Over a year of stock at this plan</p>
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
                    rowShipping > 0 ? ` + ${formatMoney(rowShipping, rowCurrency)} shipping` : ""
                  }${
                    doseMcg > 0
                      ? ` · ${formatMoney(
                          ((rowCost + rowShipping) / strengthMgTotal) * (doseMcg / 1000),
                          rowCurrency)} a dose`
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
          {onArrived && (
            <Button variant="primary" onClick={onArrived} className="px-3 py-1.5 text-[13px]">
              <PackageCheck size={13} /> It arrived
            </Button>
          )}
          {onReconstitute && (
            <Button onClick={onReconstitute} className="px-3 py-1.5 text-[13px]">
              Reconstitute{many ? " one" : ""}
            </Button>
          )}
          {onTopUp && (
            <Button onClick={onTopUp} className="px-3 py-1.5 text-[13px]">
              <Droplet size={13} /> Add diluent
            </Button>
          )}
          {onTransfer && (
            <Button onClick={onTransfer} className="px-3 py-1.5 text-[13px]">
              <SprayCan size={13} /> To a nasal spray
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
  onSave: (
    vials: Omit<Vial, "id" | "profileId">[],
    shipping: { cost: number; currency: string } | null) => void;
}) {
  const { t } = useLang();
  const [peptideId, setPeptideId] = useState(peptides[0]?.id ?? "");
  const [strengthMg, setStrengthMg] = useState(10);
  const [count, setCount] = useState(1);
  /**
   * Postage for the whole order, not for each vial.
   *
   * Sixty dollars of shipping on a single kit changes what that kit actually
   * cost, and typing it into every vial by hand is the work this removes.
   */
  const [shipping, setShipping] = useState<number | "">("");
  /**
   * What you actually paid in, which is not always what the app reports in.
   *
   * Without this the vial silently took the app's currency, so a purchase in
   * euros was recorded as the same number of rupees. The field that made the
   * totals wrong was the one that was never offered.
   */
  const [payCurrency, setPayCurrency] = useState(currency);
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

  /**
   * Whether this is in the fridge or still on its way.
   *
   * Recorded at the point of ordering rather than on arrival, because the
   * reason to record it early is to stop buying the same thing twice, and that
   * is a decision made while it is in transit.
   */
  const [arrived, setArrived] = useState(true);

  const peptide = peptides.find((p) => p.id === peptideId);

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
      <SectionLabel>{t("stock_new_vial")}</SectionLabel>

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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        <Field
          label="Where is it"
          hint={
            arrived
              ? undefined
              : "Counts towards what you have spent, and towards nothing else until it lands."
          }
        >
          <Select value={arrived ? "here" : "ordered"} onChange={(e) => setArrived(e.target.value === "here")}>
            <option value="here">In the fridge</option>
            <option value="ordered">On order</option>
          </Select>
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

      {/*
        Offered only when the price is in a currency other than the one every
        total is shown in, since that is the only moment a conversion is worth
        doing. Automatic rates were declined: they would need a network call on
        every open, and this app makes exactly one in its life.
      */}
      <Field label="Paid in" hint="Kept with the vial, so totals never add unlike currencies.">
        <Select value={payCurrency} onChange={(e) => setPayCurrency(e.target.value)}>
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} · {c.label}
            </option>
          ))}
        </Select>
      </Field>

      {/*
        Offered only when what you paid in differs from what the app reports in,
        since that is the only moment a conversion is worth doing. Fetched rates
        were declined for a reason worth keeping: the app makes exactly one
        network request in its life, and a link is not a request.
      */}
      {cost !== "" && Number(cost) > 0 && payCurrency !== currency && (
        <p className="text-[12px] leading-relaxed text-[var(--muted)]">
          <a
            href={converterUrl(Number(cost), payCurrency, currency) ?? "#"}
            target="_blank"
            // No referrer: the converter needs the amount to answer, and has no
            // business knowing which app sent it.
            rel="noopener noreferrer"
            className="underline decoration-dotted"
          >
            Convert {formatMoney(Number(cost), payCurrency)} to {currency}
          </a>
          , if you would rather record it in {currency}. Whichever you choose is
          stored as typed and never looked up again.
        </p>
      )}

      <Field
        label="Shipping for this order"
        hint={
          shipping === "" || !(Number(shipping) > 0)
            ? "Optional. Shared across the vials added here, and included in what each one really cost."
            : `${formatMoney(Number(shipping) / Math.max(1, count), currency)} per vial, across ${count} ${count === 1 ? "vial" : "vials"}.`
        }
      >
        <NumberInput
          value={shipping}
          min={0}
          step={0.01}
          onChange={(e) => setShipping(e.target.value === "" ? "" : Number(e.target.value))}
        />
      </Field>

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
              state: arrived ? "sealed" : "on-order",
              supplier: supplier.trim() || undefined,
              cost: perVial,
              currency: perVial == null ? undefined : payCurrency,
              acquiredAt: Date.now(),
            };
            /*
             * All of them in one call, because an order is exactly the set of
             * vials that arrived together and that is only knowable here. Added
             * one at a time they would be indistinguishable afterwards, and
             * there would be nothing to share the postage across.
             */
            onSave(
              Array.from({ length: Math.max(1, count) }, () => base),
              shipping === "" || !(Number(shipping) > 0)
                ? null
                : { cost: Number(shipping), currency: payCurrency });
          }}
          disabled={!peptideId || !(strengthMg > 0)}
        >
          {arrived ? "Add" : "Add on order"} {count > 1 ? `${count} vials` : "vial"}
        </Button>
      </div>
    </Card>
  );
}

/**
 * One name per diluent, and every screen uses it.
 *
 * Three forms named the same thing three ways: a reconstitution offered "0.9%
 * sodium chloride", a transfer offered "Sterile saline 0.9%", and the shelf
 * called it something else again. Somebody went looking for saline in a list
 * that had it and could not see it, which is what a synonym costs.
 */
const DILUENT_LABEL: Record<DiluentKind, string> = {
  bacteriostatic: "Bacteriostatic water",
  sterile: "Sterile water (single use)",
  saline: "Saline 0.9% (sodium chloride)",
  oil: "Carrier oil",
};

/** The kinds a vial or a bottle can actually be made up with. Oil is not one. */
const DILUENT_CHOICES: DiluentKind[] = ["bacteriostatic", "sterile", "saline"];

function ReconstituteForm({
  vial,
  bottles,
  onCancel,
  onSave,
}: {
  vial: Vial;
  /** Water on the shelf. Empty for anyone who does not track it. */
  bottles: DiluentBottle[];
  onCancel: () => void;
  onSave: (ml: number, diluent: Vial["diluent"], fromBottleId?: string) => void;
}) {
  const { t } = useLang();
  const [ml, setMl] = useState(2);
  const [diluent, setDiluent] = useState<NonNullable<Vial["diluent"]>>("bacteriostatic");
  const conc = ml > 0 ? vial.strengthMg / ml : 0;

  const now = Date.now();
  const available = shelfOrder(bottles.filter((b) => b.kind === diluent && bottleUsable(b, now)), now);

  /**
   * Which bottle the water came from.
   *
   * Asked for only when there is something to ask about. Requiring it outright
   * would have stopped every existing user from making up a vial on the day
   * this shipped, since nobody had a bottle recorded, and a feature that blocks
   * the app's central action to collect bookkeeping is worse than no feature.
   *
   * "" means not from tracked stock, which stays available even when bottles
   * exist: a bottle you never entered should not stop you.
   */
  const suggested = pickBottle(bottles, diluent, ml, now)?.id ?? "";
  const [bottleId, setBottleId] = useState(suggested);
  const chosen = available.find((b) => b.id === bottleId) ?? null;
  const short = chosen != null && bottleRemainingMl(chosen) < ml - 1e-9;

  return (
    <Card className="mt-1.5 space-y-4 border-[var(--tangerine)]/35 p-4">
      <SectionLabel>{t("stock_reconstitute")}</SectionLabel>

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
            {DILUENT_CHOICES.map((k) => (
              <option key={k} value={k}>
                {DILUENT_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {available.length > 0 && (
        <Field
          label="From which bottle"
          hint={
            chosen
              ? `${trim(bottleRemainingMl(chosen), 2)} mL left in it before this.`
              : "Recorded as not coming from tracked stock, so no bottle is drawn down."
          }
        >
          <Select value={bottleId} onChange={(e) => setBottleId(e.target.value)}>
            {available.map((b) => (
              <option key={b.id} value={b.id}>
                {trim(b.volumeMl, 2)} mL bottle · {trim(bottleRemainingMl(b), 2)} mL left
                {b.state === "sealed" ? " · sealed" : ""}
              </option>
            ))}
            <option value="">Not from tracked stock</option>
          </Select>
        </Field>
      )}

      {short && (
        <Callout tone="warn">
          That bottle holds {trim(bottleRemainingMl(chosen!), 2)} mL and you are drawing {trim(ml, 2)}{" "}
          mL. It will be recorded as empty, and the rest came from somewhere this app cannot see.
        </Callout>
      )}

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
        <Button
          variant="primary"
          onClick={() => onSave(ml, diluent, bottleId || undefined)}
          disabled={!(ml > 0)}
        >
          Reconstitute
        </Button>
      </div>
    </Card>
  );
}

/**
 * Adding more solvent to a vial that is already open.
 *
 * Reconstituting too concentrated is a mistake you discover at the injection
 * site, and the fix is to add more water. Until now the app had no way to
 * record that, so from the moment it happened every figure it showed was wrong.
 *
 * Shows the before and after concentration rather than only the result, because
 * the reason someone is here is that the first number was too high and the
 * question they are answering is how far it has come down.
 */
/**
 * Empty a made-up vial into a nasal spray bottle.
 *
 * The one step the app had no model for. Everything about a bottle afterwards
 * is a mass in a volume, which is a vial, so the only thing this form has to
 * get right is the arithmetic of the transfer and the volume one press gives.
 */
function TransferToSprayForm({
  vial,
  bottles,
  onCancel,
  onSave,
}: {
  vial: Vial;
  bottles: DiluentBottle[];
  onCancel: () => void;
  onSave: (addedMl: number, mlPerSpray: number, diluent: DiluentKind, fromBottleId?: string) => void;
}) {
  const { t } = useLang();
  const [addedMl, setAddedMl] = useState(4);
  const [perSpray, setPerSpray] = useState(DEFAULT_ML_PER_SPRAY);
  /*
   * Saline rather than bacteriostatic water, and not as a default that can be
   * changed away lightly. The preservative in bacteriostatic water stings a
   * nose, which is why the person who asked for this specified 0.9% NaCl.
   */
  const [kind, setKind] = useState<DiluentKind>("saline");

  const now = Date.now();
  const available = shelfOrder(bottles.filter((b) => b.kind === kind && bottleUsable(b, now)), now);
  const [bottleId, setBottleId] = useState(pickBottle(bottles, "saline", 4, now)?.id ?? "");
  const chosen = available.find((b) => b.id === bottleId) ?? null;

  const plan = transferToSpray(vial, {
    addedMl,
    mlPerSpray: perSpray,
    diluent: kind,
    atMs: now,
  });
  const perPress = plan ? mcgPerSpray(plan.bottle) : 0;

  return (
    <Card className="mt-1.5 space-y-4 border-[var(--grape)]/35 p-4">
      <SectionLabel>{t("stock_transfer_spray")}</SectionLabel>

      <p className="text-[12.5px] leading-relaxed text-[var(--muted)]">
        The whole contents go into the bottle and the vial is finished. What it cost goes with it,
        so the purchase is still counted once.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Saline added"
          hint={
            plan
              ? `${trim(plan.bottle.diluentMl ?? 0, 2)} mL in the bottle, at ${formatConcentration(
                  vialConcentration(plan.bottle))}.`
              : "There is nothing left in this vial to pour."
          }
        >
          <NumberInput
            value={addedMl}
            min={0}
            step={0.5}
            suffix="mL"
            onChange={(e) => setAddedMl(Number(e.target.value))}
          />
        </Field>

        <Field
          label="One press delivers"
          hint={perPress > 0 ? `${formatDose(perPress)} a press.` : MEASURE_A_PRESS}
        >
          <NumberInput
            value={perSpray}
            min={0.01}
            step={0.01}
            suffix="mL"
            onChange={(e) => setPerSpray(Number(e.target.value))}
          />
        </Field>
      </div>

      <p className="text-[12px] leading-relaxed text-[var(--faint)]">{MEASURE_A_PRESS}</p>

      <Field label="What went in">
        <Select value={kind} onChange={(e) => setKind(e.target.value as DiluentKind)}>
          {/* Saline first, because a nose does not take the preservative in
              bacteriostatic water. */}
          {(["saline", "sterile", "bacteriostatic"] as DiluentKind[]).map((k) => (
            <option key={k} value={k}>
              {DILUENT_LABEL[k]}
            </option>
          ))}
        </Select>
      </Field>

      {available.length > 0 && (
        <Field
          label="From which ampoule"
          hint={
            chosen
              ? `${trim(bottleRemainingMl(chosen), 2)} mL left in it before this.`
              : "Recorded as not coming from tracked stock, so nothing is drawn down."
          }
        >
          <Select value={bottleId} onChange={(e) => setBottleId(e.target.value)}>
            {available.map((b) => (
              <option key={b.id} value={b.id}>
                {trim(b.volumeMl, 2)} mL · {trim(bottleRemainingMl(b), 2)} mL left
                {b.state === "sealed" ? " · sealed" : ""}
              </option>
            ))}
            <option value="">Not from tracked stock</option>
          </Select>
        </Field>
      )}

      <p className="text-[12px] leading-relaxed text-[var(--faint)]">
        No use-by date is set. The twenty-eight days used for a punctured vial comes from a
        convention that says nothing about a preservative-free solution in a pump, and how long
        yours lasts depends on whether it lives in a pocket or a fridge. The day it was filled is
        recorded and the judgement is yours.
      </p>

      <div className="flex gap-2.5">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={() => onSave(addedMl, perSpray, kind, bottleId || undefined)}
          disabled={!plan}
        >
          Fill the bottle
        </Button>
      </div>
    </Card>
  );
}

function TopUpForm({
  vial,
  bottles,
  onCancel,
  onSave,
}: {
  vial: Vial;
  bottles: DiluentBottle[];
  onCancel: () => void;
  onSave: (addedMl: number, fromBottleId?: string) => void;
}) {
  const { t } = useLang();
  const [ml, setMl] = useState(0.5);

  /*
   * The same question reconstitution asks, because it is the same water. Asking
   * it in one place and not the other let the shelf drift by exactly the amount
   * people top up with.
   */
  const now = Date.now();
  const kind = vial.diluent ?? "bacteriostatic";
  const available = bottles.filter((b) => b.kind === kind && bottleUsable(b, now));
  const [bottleId, setBottleId] = useState(pickBottle(bottles, kind, ml, now)?.id ?? "");
  const chosen = available.find((b) => b.id === bottleId) ?? null;

  const before = vialConcentration(vial);
  const nextDiluentMl = diluentAfterTopUp(vial, ml);
  const after =
    nextDiluentMl == null
      ? null
      : vialConcentration({ strengthMg: vial.strengthMg, diluentMl: nextDiluentMl });

  return (
    <Card className="mt-1.5 space-y-4 border-[var(--sky)]/35 p-4">
      <SectionLabel>{t("stock_add_diluent")}</SectionLabel>

      <Field
        label="Water added"
        hint={
          after != null
            ? `${formatConcentration(before)} becomes ${formatConcentration(after)}, with ${trim(
                vialRemainingMl({ ...vial, diluentMl: nextDiluentMl! }),
                2)} mL in the vial.`
            : "How much you are adding now, not the total."
        }
      >
        <NumberInput
          value={ml}
          min={0.05}
          step={0.25}
          suffix="mL"
          onChange={(e) => setMl(Number(e.target.value))}
        />
      </Field>

      <p className="text-[12.5px] leading-relaxed text-[var(--faint)]">
        Worked out from what is still in the vial rather than from the label, so a part-used vial
        comes out right. The mass does not change and neither does the use-by date, which runs from
        the first puncture rather than from this.
      </p>

      {available.length > 0 && (
        <Field
          label="From which bottle"
          hint={
            chosen
              ? `${trim(bottleRemainingMl(chosen), 2)} mL left in it before this.`
              : "Recorded as not coming from tracked stock, so no bottle is drawn down."
          }
        >
          <Select value={bottleId} onChange={(e) => setBottleId(e.target.value)}>
            {available.map((b) => (
              <option key={b.id} value={b.id}>
                {trim(b.volumeMl, 2)} mL bottle · {trim(bottleRemainingMl(b), 2)} mL left
                {b.state === "sealed" ? " · sealed" : ""}
              </option>
            ))}
            <option value="">Not from tracked stock</option>
          </Select>
        </Field>
      )}

      <div className="flex gap-2.5">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={() => onSave(ml, bottleId || undefined)}
          disabled={after == null}
        >
          Add {trim(ml, 2)} mL
        </Button>
      </div>
    </Card>
  );
}

/**
 * Water, on its own shelf.
 *
 * Separate from the vials above rather than mixed in, for the same reason it is
 * a separate type: everything in that list is a mass with a dose count and a
 * date it runs out, and a bottle of water is none of those. Putting it in the
 * same list would invite the same arithmetic.
 */
function DiluentShelf() {
  const { diluents } = useProfileData();
  const addDiluent = useStore((s) => s.addDiluent);
  const updateDiluent = useStore((s) => s.updateDiluent);
  const removeDiluent = useStore((s) => s.removeDiluent);
  const openDiluent = useStore((s) => s.openDiluent);
  const drawDiluent = useStore((s) => s.drawDiluent);

  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<DiluentKind>("bacteriostatic");
  const [volumeMl, setVolumeMl] = useState(30);
  const [count, setCount] = useState(1);
  /** Which bottle is having water written off, and how much. */
  const [usingId, setUsingId] = useState<string | null>(null);
  const [usedMl, setUsedMl] = useState(1);

  const now = Date.now();
  // Ordered the way the app itself would reach for them, so the bottle at the
  // top of the shelf is the one reconstituting will suggest.
  const live = shelfOrder(
    diluents.filter((b) => b.state !== "finished" && b.state !== "discarded"),
    now);
  const stock = diluentStock(diluents, "bacteriostatic", now);

  if (!live.length && !adding) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <SectionLabel className="mb-0.5">Water and diluents</SectionLabel>
          <p className="text-[12.5px] text-[var(--muted)]">
            Optional. Track bottles here and reconstituting will draw from one.
          </p>
        </div>
        <Button variant="soft" onClick={() => setAdding(true)}>
          <Plus size={15} /> Add a bottle
        </Button>
      </Card>
    );
  }

  return (
    <section>
      <SectionLabel
        action={
          !adding && (
            <Button variant="soft" onClick={() => setAdding(true)} className="px-2.5 py-1 text-[12px]">
              <Plus size={13} /> Add a bottle
            </Button>
          )
        }
      >
        Water and diluents
      </SectionLabel>

      {stock.remainingMl > 0 && (
        <p className="mb-2 text-[12.5px] text-[var(--muted)]">
          {trim(stock.remainingMl, 1)} mL of bacteriostatic water across {stock.bottles}{" "}
          {stock.bottles === 1 ? "bottle" : "bottles"}.
        </p>
      )}

      {adding && (
        <Card className="mb-2.5 space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="What">
              <Select value={kind} onChange={(e) => setKind(e.target.value as DiluentKind)}>
                {(Object.keys(DILUENT_LABEL) as DiluentKind[]).map((k) => (
                  <option key={k} value={k}>
                    {DILUENT_LABEL[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Bottle size">
              <NumberInput
                value={volumeMl}
                min={1}
                step={1}
                suffix="mL"
                onChange={(e) => setVolumeMl(Number(e.target.value))}
              />
            </Field>
            <Field label="How many">
              <NumberInput
                value={count}
                min={1}
                step={1}
                onChange={(e) => setCount(Number(e.target.value))}
              />
            </Field>
          </div>

          <div className="flex gap-2.5">
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!(volumeMl > 0)}
              onClick={() => {
                for (let i = 0; i < Math.max(1, count); i++) {
                  addDiluent({ kind, volumeMl, state: "sealed" });
                }
                setAdding(false);
              }}
            >
              Add {count > 1 ? `${count} bottles` : "bottle"}
            </Button>
          </div>
        </Card>
      )}

      <div className="space-y-1.5">
        {live.map((b) => {
          const left = bottleRemainingMl(b);
          return (
            <Card key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
              <span className="text-[13.5px] text-[var(--ink)]">{DILUENT_LABEL[b.kind]}</span>
              <Badge tone={b.state === "sealed" ? "neutral" : "tangerine"}>{b.state}</Badge>
              <span className="tnum font-mono text-[13px] text-[var(--muted)]">
                {trim(left, 1)} of {trim(b.volumeMl, 1)} mL
              </span>
              {bottleUsable(b, now) ? null : <Badge tone="rose">unusable</Badge>}

              <div className="ml-auto flex items-center gap-1">
                {b.state === "sealed" && (
                  <Button
                    variant="soft"
                    className="px-2.5 py-1 text-[12px]"
                    onClick={() => openDiluent(b.id)}
                  >
                    Open
                  </Button>
                )}
                {b.state !== "discarded" && bottleRemainingMl(b) > 0 && (
                  <Button
                    variant="soft"
                    className="px-2.5 py-1 text-[12px]"
                    onClick={() => {
                      setUsingId(usingId === b.id ? null : b.id);
                      setUsedMl(1);
                    }}
                  >
                    Used elsewhere
                  </Button>
                )}
                {b.state !== "discarded" && (
                  <Button
                    variant="soft"
                    className="px-2.5 py-1 text-[12px]"
                    onClick={() => updateDiluent(b.id, { state: "discarded" })}
                  >
                    Discard
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => removeDiluent(b.id)}
                  aria-label="Remove bottle"
                  className="press p-1 text-[var(--faint)] hover:text-[var(--rose)]"
                >
                  <Trash2 size={15} />
                </button>
              </div>

              {/*
                Water goes into things this app does not track, and without a way
                to say so the shelf slowly claims more than the fridge holds.
                Deliberately one-way: this takes water out, and there is no
                field for putting an arbitrary amount back, because that would
                be a way to make the figure say anything at all.
              */}
              {usingId === b.id && (
                <div className="mt-2 flex w-full flex-wrap items-end gap-2.5">
                  <label className="flex-1">
                    <span className="mb-1 block text-[12px] text-[var(--muted)]">
                      Used for something not tracked here
                    </span>
                    <NumberInput
                      value={usedMl}
                      min={0}
                      step={0.5}
                      suffix="mL"
                      onChange={(e) => setUsedMl(Number(e.target.value))}
                    />
                  </label>
                  <Button variant="ghost" onClick={() => setUsingId(null)}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    disabled={!(usedMl > 0)}
                    onClick={() => {
                      drawDiluent(b.id, Math.min(usedMl, left));
                      setUsingId(null);
                    }}
                  >
                    Take out {trim(Math.min(usedMl, left), 2)} mL
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}
