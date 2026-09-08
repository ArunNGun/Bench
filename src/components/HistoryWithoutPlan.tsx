"use client";

import { useMemo, useState } from "react";
import { CalendarPlus, Sparkles } from "lucide-react";
import { Badge, Button, ButtonLink, Card, EmptyState, SectionLabel, TONE_BG } from "./ui";
import { findPeptide, useProfileData, useStore } from "@/lib/store";
import { inferAllProtocols, type InferredProtocol } from "@/lib/calc/infer";
import { formatDate, formatDose } from "@/lib/format";
import { INJECTION_SITES } from "@/lib/types";
import { useLang } from "@/lib/i18n";

/**
 * What the Now page shows when there are doses on record but no protocol.
 *
 * This is the state you land in straight after importing from another app: the
 * history is all there, but nothing is planned, so the usual Now page has nothing
 * due, nothing circulating and nothing to say. Previously it showed only an empty
 * state, which made a successful import of a year of data look like it had failed.
 *
 * So: show the history, and offer to reconstruct the plan from it.
 */
export function HistoryWithoutPlan({ nowMs }: { nowMs: number }) {
  const { t } = useLang();
  const { logs } = useProfileData();
  const custom = useStore((s) => s.customPeptides);
  const addProtocol = useStore((s) => s.addProtocol);

  /**
   * Which suggestions have been accepted, so a double tap cannot create the same
   * protocol twice. Only reachable when the history holds more than one compound:
   * accepting the last one unmounts this component, because the parent switches to
   * the full Now page as soon as a protocol exists.
   */
  const [created, setCreated] = useState<string[]>([]);

  const suggestions = useMemo(
    () => inferAllProtocols(logs, (id) => findPeptide(custom, id)),
    [logs, custom]);

  if (!logs.length) {
    return (
      <EmptyState
        title={t("hwp_empty_title")}
        action={
          <ButtonLink href="/plan" variant="primary">
            {t("hwp_empty_action")}
          </ButtonLink>
        }
      >
        {t("hwp_empty_body")}
      </EmptyState>
    );
  }

  function create(s: InferredProtocol) {
    addProtocol({
      peptideId: s.peptideId,
      name: s.peptideName,
      active: true,
      startedAt: s.startedAt,
      doseMcg: s.doseMcg,
      route: "subcutaneous",
      schedule: s.schedule,
      titrationAutoAdvance: false,
      sites: s.sites.length ? s.sites : undefined,
    });
    setCreated((c) => [...c, s.peptideId]);
  }

  const recent = [...logs].sort((a, b) => b.at - a.at).slice(0, 8);

  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-4">
        <SectionLabel>{t("hwp_title")}</SectionLabel>
        <p className="text-[13px] leading-relaxed text-[var(--muted)]">
          {t("hwp_body", { doses: t("count_doses", { n: logs.length }) })}
        </p>

        {suggestions.map((s) => {
          const done = created.includes(s.peptideId);
          return (
            <div
              key={s.peptideId}
              className="rounded-[var(--r-inner)] p-3.5"
              style={{
                background: done ? TONE_BG.leaf : "var(--sunken)",
                border: `1px solid ${done ? "var(--leaf)" : "var(--line)"}`,
              }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Sparkles size={15} strokeWidth={2.4} style={{ color: "var(--mint)" }} />
                <span className="text-[14.5px] font-bold text-[var(--ink)]">{s.peptideName}</span>
                {s.confidence === "rough" && (
                  <Badge tone="tangerine" title={t("hwp_rough_title")}>
                    {t("hwp_worth_checking")}
                  </Badge>
                )}
              </div>

              <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">{s.summary}</p>

              <p className="mt-1 text-[11.5px] text-[var(--faint)]">
                {t("hwp_span", {
                  from: formatDate(s.startedAt),
                  last: formatDate(s.lastAt),
                })}
                {s.sites.length
                  ? ` · ${s.sites.map((id) => INJECTION_SITES.find((x) => x.id === id)?.label ?? id).join(", ")}`
                  : ""}
              </p>

              <div className="mt-2.5">
                <Button variant="primary" onClick={() => create(s)} disabled={done}>
                  <CalendarPlus size={15} /> {t("hwp_create")}
                </Button>
              </div>
            </div>
          );
        })}

        <ButtonLink href="/plan">{t("hwp_by_hand")}</ButtonLink>
      </Card>

      <Card className="p-4">
        <SectionLabel
          action={
            <ButtonLink href="/log" variant="soft" className="px-2.5 py-1 text-[12px] font-bold">
              {t("hwp_all", { n: logs.length })}
            </ButtonLink>
          }
        >
          {t("hwp_recent")}
        </SectionLabel>

        <ul className="space-y-1">
          {recent.map((l) => {
            const peptide = findPeptide(custom, l.peptideId);
            return (
              <li
                key={l.id}
                className="flex flex-wrap items-baseline gap-x-2.5 rounded-[var(--r-inner)] px-2.5 py-2 text-[13px] hover:bg-[var(--sunken)]"
              >
                <span className="font-bold text-[var(--ink)]">{formatDose(l.doseMcg)}</span>
                <span className="text-[var(--ink)]">{peptide?.name ?? l.peptideId}</span>
                <span className="text-[var(--muted)]">{formatDate(l.at)}</span>
                {l.site && (
                  <span className="text-[var(--faint)]">
                    {INJECTION_SITES.find((s) => s.id === l.site)?.label}
                  </span>
                )}
                {l.at > nowMs && <Badge tone="sky">{t("hwp_future")}</Badge>}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
