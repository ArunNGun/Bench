"use client";
import { useLang } from "@/lib/i18n";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Badge, Card, SectionLabel, TextInput } from "@/components/ui";
import { CustomCompounds } from "@/components/CustomCompounds";
import { allPeptides, useStore } from "@/lib/store";
import { CATEGORY_LABEL, EVIDENCE_LABEL, type PeptideCategory } from "@/lib/types";
import { formatHalfLife } from "@/lib/format";
import { MEDS_LIBRARY, type MedEntry, type MedLibraryCategory } from "@/lib/data/meds";

/** The strongest evidence behind any of a peptide's dose ranges. */
const EVIDENCE_RANK = ["anecdotal", "preclinical", "preliminary", "clinical", "approved"] as const;

export default function LibraryPage() {
  const custom = useStore((s) => s.customPeptides);
  const [query, setQuery] = useState("");
  const { t } = useLang();

  const peptides = useMemo(() => allPeptides(custom), [custom]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return peptides;
    return peptides.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.aka.some((a) => a.toLowerCase().includes(q)) ||
        p.summary.toLowerCase().includes(q) ||
        CATEGORY_LABEL[p.category].toLowerCase().includes(q));
  }, [peptides, query]);

  const byCategory = useMemo(() => {
    const map = new Map<PeptideCategory, typeof filtered>();
    for (const p of filtered) {
      if (!map.has(p.category)) map.set(p.category, []);
      map.get(p.category)!.push(p);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-[24px] font-extrabold tracking-tight text-[var(--ink)]">{t("library_title")}</h1>
        <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-[var(--muted)]">
          {t("library_subtitle", { n: peptides.length })}
        </p>
      </header>

      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--faint)]"
        />
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("library_search_placeholder")}
          className="pl-9"
          aria-label={t("search")}
        />
      </div>

      {!filtered.length && (
        <p className="py-10 text-center text-[14px] text-[var(--muted)]">
          {t("library_no_results", { query })}
        </p>
      )}

      <CustomCompounds />


      {byCategory.map(([category, items]) => (
        <section key={category}>
          <SectionLabel>{CATEGORY_LABEL[category]}</SectionLabel>
          <div className="space-y-1.5">
            {items.map((p) => {
              const best = p.doseRanges
                .map((d) => d.evidence)
                .sort((a, b) => EVIDENCE_RANK.indexOf(b) - EVIDENCE_RANK.indexOf(a))[0];
              return (
                <Link key={p.id} href={`/library/${p.id}`} className="block">
                  <Card className="p-3.5 transition-colors hover:border-[var(--faint)]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] text-[var(--ink)]">{p.name}</span>
                      <Badge
                        tone={
                          best === "approved"
                            ? "leaf"
                            : best === "clinical"
                              ? "sky"
                              : best === "anecdotal"
                                ? "rose"
                                : "neutral"
                        }
                        title={EVIDENCE_LABEL[best]}
                      >
                        {EVIDENCE_LABEL[best]}
                      </Badge>
                      {p.halfLifeHours == null && <Badge tone="rose">{t("library_no_pk_data")}</Badge>}
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">{p.summary}</p>
                    <p className="mt-1.5 text-[12px] text-[var(--faint)]">
                      {t("library_half_life")} {formatHalfLife(p.halfLifeHours)}
                      {p.aka.length > 0 && ` · ${t("library_also_known")} ${p.aka.slice(0, 2).join(", ")}`}
                    </p>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      {/* ------------------------------------------------------------------ */}
      {/* Meds & supplements reference                                         */}
      {/* ------------------------------------------------------------------ */}
      <MedLibrarySection query={query} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Meds & supplements library section
// ---------------------------------------------------------------------------

const MED_CATEGORY_LABEL: Record<MedLibraryCategory, string> = {
  hair: "Hair",
  mineral: "Mineral",
  omega: "Omega / Fish oil",
  vitamin: "Vitamin",
  nootropic: "Performance support",
  sleep: "Sleep",
  general: "General",
};

const MED_EVIDENCE_TONE: Record<string, "leaf" | "sky" | "neutral" | "rose"> = {
  approved: "leaf",
  clinical: "sky",
  preliminary: "neutral",
  anecdotal: "rose",
};

function formatMedHalfLife(hl: MedEntry["halfLife"]): string {
  if (!hl) return "Unknown";
  const h = hl.hours;
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 24) return `${h} h`;
  if (h < 24 * 7) return `${(h / 24).toFixed(1)} d`;
  return `${(h / (24 * 7)).toFixed(1)} wk`;
}

function MedLibrarySection({ query }: { query: string }) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MEDS_LIBRARY;
    return MEDS_LIBRARY.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.aka.some((a) => a.toLowerCase().includes(q)) ||
        m.summary.toLowerCase().includes(q) ||
        MED_CATEGORY_LABEL[m.category].toLowerCase().includes(q),
    );
  }, [query]);

  if (!filtered.length) return null;

  const byCategory = useMemo(() => {
    const map = new Map<MedLibraryCategory, MedEntry[]>();
    for (const m of filtered) {
      if (!map.has(m.category)) map.set(m.category, []);
      map.get(m.category)!.push(m);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div>
        <SectionLabel>Meds &amp; supplements</SectionLabel>
        <p className="mt-1 text-[13px] text-[var(--muted)]">
          Common oral supplements and medicines — half-life, mechanism, and interactions with
          peptide and anabolic protocols. {MEDS_LIBRARY.length} entries.
        </p>
      </div>

      {byCategory.map(([cat, items]) => (
        <section key={cat}>
          <SectionLabel>{MED_CATEGORY_LABEL[cat]}</SectionLabel>
          <div className="space-y-1.5">
            {items.map((m) => (
              <Card key={m.id} className="p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-medium text-[var(--ink)]">{m.name}</span>
                  {m.halfLife && (
                    <Badge tone={MED_EVIDENCE_TONE[m.halfLife.evidence] ?? "neutral"}>
                      {m.halfLife.evidence}
                    </Badge>
                  )}
                  {m.aka.length > 0 && (
                    <span className="text-[12px] text-[var(--faint)]">
                      {m.aka.slice(0, 2).join(", ")}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">{m.summary}</p>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-[var(--faint)]">
                  <span>Half-life: {formatMedHalfLife(m.halfLife)}</span>
                  <span>Peak: ~{m.tmaxHours} h after dose</span>
                  <span>Typical: {m.typicalDose}</span>
                </div>
                {m.interactions.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {m.interactions.map((ix, i) => (
                      <div
                        key={i}
                        className={`rounded-[var(--r-inner)] px-2.5 py-1.5 text-[12px] leading-relaxed ${
                          ix.severity === "warn"
                            ? "bg-[var(--rose-soft)] text-[var(--rose-ink)]"
                            : ix.severity === "caution"
                              ? "bg-[var(--tangerine-soft)] text-[var(--tangerine-ink)]"
                              : "bg-[var(--card)] text-[var(--muted)]"
                        }`}
                      >
                        <span className="font-medium">{ix.with}:</span> {ix.detail}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
