"use client";

/**
 * Choosing a barrel by looking at it.
 *
 * A dropdown of seven lines of text asks you to translate "0.3 mL U-100,
 * half-unit marks" into the object in your hand. The object is right there, so
 * the list may as well show the object.
 *
 * One card per row on a phone, two from `sm` up. That is not a taste decision.
 * Two of the seven barrels differ from another two only in how far apart their
 * marks are, and a card narrow enough to force the drawing to magnify cannot
 * show that difference at a glance. At one card per row the narrowest real
 * card is around 300px, where every barrel in the library draws in full. See
 * `src/lib/calc/barrel.ts`, which has the arithmetic and a test that holds the
 * layout to it.
 */

import { useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { barrelTicks } from "@/lib/calc/barrel";
import { capacityUnits, SYRINGES, syringeById, type SyringeSpec } from "@/lib/calc/reconstitution";

/*
 * The barrel width is given in the pixels it will really occupy, and the
 * viewBox is built from it, so the two are one to one and the spacing
 * judgement in `barrelTicks` is about what an eye can actually separate. A
 * fixed viewBox stretched to fit its container would make that judgement
 * meaningless, and it was wrong when this was first written: at a fixed 232
 * the 1 mL barrel with 1-unit marks magnified itself in a card 300px wide,
 * where it had room to draw in full.
 */
const CARD_BARREL = 260;
/** The thumbnail beside the closed Settings row, which is genuinely small. */
const ROW_BARREL = 120;

const BARREL_H = 38;
const ROD = 14;
const PAD_L = ROD + 10;
const NEEDLE = 16;

/*
 * Two pixels between marks. A real 1 mL U-100 barrel carries a hundred of them
 * and is dense in the hand as well, so this is the barrel being honest rather
 * than the drawing being careless. Below it the drawing magnifies instead.
 */
const MIN_SPACING = 2;

/** Millilitres, written the way a syringe is labelled. */
function mlLabel(ml: number) {
  return ml === Math.trunc(ml) ? `${ml}` : ml.toFixed(1);
}

/** What the marks on this barrel are worth, in the words on the box. */
export function marksLabel(spec: SyringeSpec) {
  if (spec.graduationUnits === 0.5) return "half-unit marks";
  if (spec.graduationUnits === 1) return "1-unit marks";
  return `${spec.graduationUnits}-unit marks`;
}

export function MiniSyringe({
  spec,
  widthPx = CARD_BARREL,
}: {
  spec: SyringeSpec;
  /** How wide the barrel will really be drawn, in CSS pixels. */
  widthPx?: number;
}) {
  const BARREL_W = widthPx;
  const { ticks, shownUnits, magnified } = barrelTicks(spec, BARREL_W, {
    allowMagnify: true,
    minSpacingPx: MIN_SPACING,
  });

  const barrelL = PAD_L;
  const barrelR = barrelL + BARREL_W;
  const midY = BARREL_H / 2 + 2;
  const totalW = barrelR + NEEDLE + 8;
  const totalH = BARREL_H + 4;

  return (
    <svg
      viewBox={`0 0 ${totalW} ${totalH}`}
      role="presentation"
      aria-hidden="true"
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      {/* Plunger rod and thumb flange, drawn fully home. */}
      <rect x={barrelL - 4 - ROD} y={midY - 2.5} width={ROD} height={5} fill="var(--line)" rx={1} />
      <rect x={barrelL - 9 - ROD} y={midY - 10} width={6} height={20} fill="var(--faint)" rx={1.2} />
      <rect x={barrelL - 4} y={0} width={4} height={BARREL_H + 2} fill="var(--faint)" rx={1.2} />

      <rect
        x={barrelL}
        y={2}
        width={BARREL_W}
        height={BARREL_H - 2}
        rx={2}
        fill="var(--glass)"
        stroke="var(--line)"
        strokeWidth={1.1}
      />

      {/* Zero sits at the needle end, as it does on the barrel itself. */}
      {ticks.map((t) => {
        const x = barrelR - t.fraction * BARREL_W;
        return (
          <g key={t.units}>
            <line
              x1={x}
              y1={4}
              x2={x}
              y2={t.major ? 15 : 9}
              stroke="var(--ink)"
              strokeWidth={t.major ? 1.1 : 0.6}
              opacity={t.major ? 0.8 : 0.32}
            />
            {t.major && t.units > 0 && (
              <text
                x={x}
                y={BARREL_H - 3}
                textAnchor="middle"
                fontSize={7}
                fontFamily="var(--font-mono)"
                fill="var(--muted)"
              >
                {t.units}
              </text>
            )}
          </g>
        );
      })}

      {/*
        Only reachable if this is ever rendered narrower than the picker's own
        layout, which a test forbids. It is here because a drawing that has
        quietly stopped showing the whole barrel has to say so on the drawing,
        not in a comment.
      */}
      {magnified && (
        <text x={barrelL + 2} y={BARREL_H - 3} fontSize={7} fill="var(--faint)">
          first {shownUnits} units
        </text>
      )}

      <path
        d={`M ${barrelR} ${midY - 4} L ${barrelR + 8} ${midY} L ${barrelR} ${midY + 4} Z`}
        fill="var(--faint)"
      />
      <line
        x1={barrelR + 8}
        y1={midY}
        x2={totalW - 2}
        y2={midY}
        stroke="var(--muted)"
        strokeWidth={1.4}
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The picker itself.
 *
 * `value` is a syringe id, or the empty string for "ask each time", which is an
 * existing setting and stays a real choice rather than being dropped because it
 * has no picture.
 */
export function SyringePicker({
  value,
  onChange,
  allowUnset = false,
  className,
}: {
  value: string;
  onChange: (id: string) => void;
  /** Offers "Ask each time" as the first option. */
  allowUnset?: boolean;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const options = allowUnset ? ["", ...SYRINGES.map((s) => s.id)] : SYRINGES.map((s) => s.id);

  /*
   * Arrow keys move between radios, which is what a radiogroup is expected to
   * do and what a grid of buttons does not do on its own. Only one card is in
   * the tab order, so the group is a single stop rather than eight.
   */
  function onKeyDown(e: React.KeyboardEvent) {
    const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
    const back = e.key === "ArrowLeft" || e.key === "ArrowUp";
    if (!forward && !back) return;

    e.preventDefault();
    const at = options.indexOf(value);
    const next = options[(at + (forward ? 1 : options.length - 1) + options.length) % options.length];
    onChange(next);
    boxRef.current?.querySelector<HTMLElement>(`[data-id="${next}"]`)?.focus();
  }

  return (
    <div
      ref={boxRef}
      role="radiogroup"
      aria-label="Syringe"
      onKeyDown={onKeyDown}
      className={cn("grid gap-2 sm:grid-cols-2", className)}
    >
      {allowUnset && (
        <Option
          id=""
          active={value === ""}
          onChange={onChange}
          title="Ask each time"
          detail="No default. The calculator and the log sheet start empty."
        />
      )}

      {SYRINGES.map((spec) => (
        <Option
          key={spec.id}
          id={spec.id}
          active={value === spec.id}
          onChange={onChange}
          title={`${mlLabel(spec.capacityMl)} mL`}
          detail={`${spec.scale === "U100" ? "U-100" : "U-40"}, ${capacityUnits(spec)} units, ${marksLabel(spec)}`}
          vet={spec.scale === "U40"}
          spec={spec}
        />
      ))}
    </div>
  );
}

/**
 * The picker folded down to one line, for Settings.
 *
 * Choosing your usual barrel is something you do once. Eight cards permanently
 * open in the Defaults card would make the most occasional setting on the page
 * the largest thing on it, so the closed state answers the only question that
 * matters day to day, which is what it is set to now, and shows the barrel
 * while it does.
 */
export function SyringeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const chosen = value ? syringeById(value) : undefined;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--r-inner)] bg-[var(--sunken)] px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-[var(--ink)]">
            {chosen ? `${mlLabel(chosen.capacityMl)} mL` : "Ask each time"}
            {chosen?.scale === "U40" && (
              <span className="ml-1.5 rounded-[var(--r-pill)] bg-[var(--rose-soft)] px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-[var(--rose)]">
                vet
              </span>
            )}
          </p>
          <p className="text-[11.5px] text-[var(--muted)]">
            {chosen
              ? `${chosen.scale === "U100" ? "U-100" : "U-40"}, ${capacityUnits(chosen)} units, ${marksLabel(chosen)}`
              : "No default. Chosen fresh each time."}
          </p>
        </div>

        {/*
          Small on purpose, and told so: the drawing decides what it can show
          from the width it is given. A barrel too fine for 120px magnifies and
          says which stretch it is showing rather than pretending to be whole.
        */}
        {chosen && (
          <div className="shrink-0" style={{ width: ROW_BARREL + PAD_L + NEEDLE + 8 }}>
            <MiniSyringe spec={chosen} widthPx={ROW_BARREL} />
          </div>
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="press flex items-center gap-1 rounded-[var(--r-btn)] border border-[var(--line)] px-2.5 py-1.5 text-[12.5px] font-medium text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
        >
          {open ? "Done" : "Change"}
          <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {open && (
        <SyringePicker
          value={value}
          onChange={onChange}
          allowUnset
          className="animate-pop"
        />
      )}
    </div>
  );
}

function Option({
  id,
  active,
  onChange,
  title,
  detail,
  vet,
  spec,
}: {
  id: string;
  active: boolean;
  onChange: (id: string) => void;
  title: string;
  detail: string;
  vet?: boolean;
  spec?: SyringeSpec;
}) {
  return (
    <button
      type="button"
      role="radio"
      data-id={id}
      aria-checked={active}
      tabIndex={active ? 0 : -1}
      onClick={() => onChange(id)}
      className={cn(
        "press flex flex-col gap-1.5 rounded-[var(--r-inner)] border px-3 py-2.5 text-left transition-colors",
        active
          ? "border-[var(--mint)] bg-[var(--mint-soft)]"
          : "border-[var(--line)] bg-[var(--sunken)] hover:border-[var(--faint)]")}
    >
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="text-[14px] font-bold text-[var(--ink)]">{title}</span>
        {/*
          A U-40 barrel next to a U-100 one is a 2.5x dosing error and the two
          look identical in the hand. The dropdown said so in the middle of a
          sentence; here it is a mark you cannot read past.
        */}
        {vet && (
          <span className="rounded-[var(--r-pill)] bg-[var(--rose-soft)] px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-[var(--rose)]">
            vet
          </span>
        )}
        {active && <Check size={14} className="ml-auto text-[var(--mint)]" />}
      </span>
      <span className="text-[11.5px] leading-snug text-[var(--muted)]">{detail}</span>
      {spec && <MiniSyringe spec={spec} />}
    </button>
  );
}
