"use client";

/**
 * What the curve says at one moment, in words.
 *
 * Sits under the chart rather than floating over it. A panel that follows the
 * pointer covers the line it is describing, and inside a card that scrolls it
 * gets clipped at the edge, which is a fact about the ancestor and not
 * something offsets can fix. Below the chart it is always fully visible, on a
 * phone as much as on a desktop.
 *
 * Always rendered, never appearing and disappearing. A readout that pops into
 * existence on hover pushes the page around under the pointer that summoned
 * it, so this holds its height and only changes what it says: the current
 * moment until the chart is asked about another one.
 */

import { breakdownAt, type LevelBreakdown } from "@/lib/calc/pk";
import type { PkSeries } from "./PkChart";
import { formatDate, formatDose, formatTime, percent } from "@/lib/format";

export interface VialNote {
  /** How to name the vial, for example "GHK-Cu, opened Aug 12". */
  label: string;
  /** Its strength in solution now, already formatted. */
  concentration: string;
}

export function PkReadout({
  series,
  atMs,
  nowMs,
  /**
   * Names the vial a dose came from. Supplied by the page, because the chart
   * has no business reading the store, and returns null where the dose has no
   * vial recorded, which is most of the older ones.
   */
  describeVial,
}: {
  series: PkSeries[];
  atMs: number;
  nowMs: number;
  describeVial?: (vialId: string) => VialNote | null;
}) {
  const isNow = Math.abs(atMs - nowMs) < 60_000;

  const rows = series
    .map((s) => ({ series: s, breakdown: breakdownAt(atMs, s.doses, s.params, s.referenceMcg) }))
    .filter((r) => r.breakdown.total > 0.005)
    .sort((a, b) => b.breakdown.total - a.breakdown.total);

  return (
    <div className="border-t border-[var(--line)] px-4 py-3">
      <p className="mb-2 flex items-baseline gap-2 text-[12px]">
        <span className="font-semibold text-[var(--ink)]">
          {formatDate(atMs)}, {formatTime(atMs)}
        </span>
        <span className="text-[var(--faint)]">
          {isNow ? "now" : atMs > nowMs ? "projected" : "past"}
        </span>
        <span className="ml-auto text-[11px] text-[var(--faint)]">
          Touch or hover the chart to read another moment
        </span>
      </p>

      {rows.length === 0 ? (
        <p className="text-[12.5px] text-[var(--muted)]">Nothing circulating at this point.</p>
      ) : (
        <div className="space-y-2.5">
          {rows.map(({ series: s, breakdown }) => (
            <Row key={s.id} series={s} breakdown={breakdown} describeVial={describeVial} />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  series,
  breakdown,
  describeVial,
}: {
  series: PkSeries;
  breakdown: LevelBreakdown;
  describeVial?: (vialId: string) => VialNote | null;
}) {
  return (
    <div>
      <p className="flex items-baseline gap-2 text-[12.5px]">
        <span
          className="h-2 w-2 shrink-0 translate-y-[1px] rounded-full"
          style={{ background: series.color }}
        />
        <span className="font-semibold text-[var(--ink)]">{series.label}</span>
        <span className="ml-auto font-mono text-[12.5px] text-[var(--ink)]">
          {percent(breakdown.total)}
        </span>
        <span className="text-[11px] text-[var(--faint)]">of one dose</span>
      </p>

      {/*
        Which injections that figure is made of. Superposition is what makes
        this an exact answer rather than an apportionment: the model adds
        independent curves, so it can pull them apart again.

        Doses under a twentieth of the total are left out by `breakdownAt`, so
        these deliberately do not sum to the line above. Listing a dose from
        three half-lives ago beside this morning's would suggest they are
        comparable, and they are not.
      */}
      <ul className="mt-1 space-y-0.5 pl-4">
        {breakdown.contributions.map((c) => {
          const vial = c.dose.vialId ? describeVial?.(c.dose.vialId) : null;
          return (
            <li key={`${c.dose.at}-${c.dose.amountMcg}`} className="text-[11.5px] text-[var(--muted)]">
              {formatDose(c.dose.amountMcg)} on {formatDate(c.dose.at)}
              <span className="text-[var(--faint)]"> at {formatTime(c.dose.at)}</span>
              {" · "}
              <span className="font-mono">{percent(c.share)}</span> of this
              {vial && (
                <span className="text-[var(--faint)]">
                  {" · "}
                  {vial.label}, {vial.concentration}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
