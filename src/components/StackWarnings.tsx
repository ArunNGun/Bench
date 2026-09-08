"use client";
import { useLang } from "@/lib/i18n";

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
  const { t } = useLang();
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
          {t("stack_all_clear", {
            protocols: t("count_protocols", { n: active.length }),
          })}
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
            {t("stack_compact", { things: t("count_things", { n: issues.length }) })}
          </span>{" "}
          {t("stack_see_plan", { title: issues[0].title })}
        </div>
      </div>
    );
  }

  return (
    <Card className="space-y-3 p-4">
      <SectionLabel>{t("warnings_title")}</SectionLabel>
      {issues.map((issue, i) => (
        <IssueRow key={`${issue.kind}-${i}`} issue={issue} />
      ))}
      <p className="text-[11.5px] leading-relaxed text-[var(--faint)]">
        {t("stack_footnote")}
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
