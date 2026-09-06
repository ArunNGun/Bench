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
          {peptides.length} compounds, with half-lives, titration ladders and sources. Every dose
          carries a tag saying where it came from, an approved label, a clinical trial, or community
          practice with nothing behind it.
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
          placeholder="Search by name, alias or category…"
          className="pl-9"
          aria-label="Search the library"
        />
      </div>

      {!filtered.length && (
        <p className="py-10 text-center text-[14px] text-[var(--muted)]">
          Nothing matches “{query}”.
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
                        title={`Strongest evidence behind any listed dose: ${EVIDENCE_LABEL[best]}`}
                      >
                        {EVIDENCE_LABEL[best]}
                      </Badge>
                      {p.halfLifeHours == null && <Badge tone="rose">no PK data</Badge>}
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">{p.summary}</p>
                    <p className="mt-1.5 text-[12px] text-[var(--faint)]">
                      Half-life: {formatHalfLife(p.halfLifeHours)}
                      {p.aka.length > 0 && ` · also ${p.aka.slice(0, 2).join(", ")}`}
                    </p>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
