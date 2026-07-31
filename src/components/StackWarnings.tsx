"use client";

import { useMemo } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Card, SectionLabel, TONE_BG, TONE_FG } from "./ui";
import { findPeptide, useProfileData, useStore } from "@/lib/store";
import { stackIssues, type StackIssue } from "@/lib/calc/stack";

/**
 * What is running together, and whether any of it collides.
 *
 * Shows the all-clear as well as the warnings. Silence is ambiguous, it reads
 * the same whether the app checked and found nothing or never looked, and the
 * whole value of this panel rests on trusting that it did look.
 */
export function StackWarnings({ nowMs, compact = false }: { nowMs: number; compact?: boolean }) {
  const { protocols } = useProfileData();
  const custom = useStore((s) => s.customPeptides);

  const active = useMemo(() => protocols.filter((p) => p.active), [protocols]);

  const issues = useMemo(
    () =>
      stackIssues({
        protocols: active,
        resolve: (id) => findPeptide(custom, id),
        nowMs,
      }),
    [active, custom, nowMs]);

  // Nothing to say about a single compound, and saying "all clear" would be
  // meaningless when there is no combination to check.
  if (active.length < 2) return null;

  if (!issues.length) {
    return (
      <div
        className="flex items-center gap-2.5 rounded-[var(--r-inner)] px-3.5 py-3 text-[13px] font-medium"
        style={{ background: TONE_BG.leaf, color: TONE_FG.leaf }}
      >
        <ShieldCheck size={16} strokeWidth={2.4} className="shrink-0" />
        <span>
          No interactions found across your {active.length} active protocols, no shared receptor
          targets and no compound arriving twice.
        </span>
      </div>
    );
  }

  const worst = issues.some((i) => i.severity === "high") ? "high" : "medium";

  if (compact) {
    return (
      <div
        className="flex items-start gap-2.5 rounded-[var(--r-inner)] px-3.5 py-3"
        style={{
          background: worst === "high" ? TONE_BG.rose : TONE_BG.tangerine,
          color: worst === "high" ? TONE_FG.rose : TONE_FG.tangerine,
        }}
      >
        <ShieldAlert size={16} strokeWidth={2.4} className="mt-0.5 shrink-0" />
        <div className="min-w-0 text-[13px] leading-relaxed">
          <span className="font-bold">
            {issues.length} thing{issues.length === 1 ? "" : "s"} to know about running these
            together.
          </span>{" "}
          {issues[0].title}. See Plan for the detail.
        </div>
      </div>
    );
  }

  return (
    <Card className="space-y-3 p-4">
      <SectionLabel>Running together</SectionLabel>
      {issues.map((issue, i) => (
        <IssueRow key={`${issue.kind}-${i}`} issue={issue} />
      ))}
      <p className="text-[11.5px] leading-relaxed text-[var(--faint)]">
        These are mechanism-level observations from the library, not clinical advice, and absence of a
        warning is not a safety clearance, most of these compounds have never been studied in
        combination at all.
      </p>
    </Card>
  );
}

function IssueRow({ issue }: { issue: StackIssue }) {
  const hue = issue.severity === "high" ? "rose" : "tangerine";

  return (
    <div
      className="rounded-[var(--r-inner)] p-3.5"
      style={{ background: TONE_BG[hue], color: TONE_FG[hue] }}
    >
      <div className="flex items-start gap-2.5">
        <ShieldAlert size={16} strokeWidth={2.4} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-[13.5px] font-bold leading-snug">{issue.title}</p>
          <p className="mt-1 text-[12.5px] leading-relaxed opacity-90">{issue.detail}</p>
        </div>
      </div>
    </div>
  );
}
