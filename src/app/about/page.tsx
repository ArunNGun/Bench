"use client";
import { useLang } from "@/lib/i18n";

import { useState } from "react";
import Link from "next/link";
import { Code2, ExternalLink, Lock, MessageCircle, ShieldAlert, Sparkles } from "lucide-react";
import { Badge, Callout, Card, Rich, SectionLabel } from "@/components/ui";
import { splitSlots } from "@/lib/i18n/rich";
import { PEPTIDES } from "@/lib/data/peptides";
import { LAB_MARKERS } from "@/lib/data/labs";
import { CURRENT_VERSION, GITHUB_URL, RELEASES } from "@/lib/changelog";

const DISCORD_URL = "https://discord.gg/NTfnwSxxr";

/** Read from the library itself, so these figures cannot drift out of date. */
const COMPOUND_COUNT = PEPTIDES.length;
const MARKER_COUNT = LAB_MARKERS.length;

export default function AboutPage() {
  const [expanded, setExpanded] = useState<string | null>(RELEASES[0].version);
  const { t } = useLang();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-[24px] font-extrabold tracking-tight text-[var(--ink)]">{t("about_title")}</h1>
        {/*
          Its own key, not the first sentence of another one cut at sixty
          characters. That cut landed mid-word in English and would have landed
          mid-word differently in every other language.
        */}
        <p className="mt-1 text-[13.5px] text-[var(--muted)]">{t("about_subtitle")}</p>
      </header>

      <Card className="space-y-3 p-4">
        <SectionLabel action={<Badge tone="mint">v{CURRENT_VERSION}</Badge>}>{t("about_what_it_is")}</SectionLabel>
        <div className="space-y-2.5 text-[13.5px] leading-relaxed text-[var(--muted)]">
          <p>{t("about_desc")}</p>
          <p>{t("about_what_it_is_2", { compounds: COMPOUND_COUNT })}</p>
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <SectionLabel>
          <span className="inline-flex items-center gap-1.5">
            <Lock size={13} strokeWidth={2.6} /> {t("about_your_data")}
          </span>
        </SectionLabel>
        <div className="space-y-2.5 text-[13.5px] leading-relaxed text-[var(--muted)]">
          <p>{t("about_data_1")}</p>
          <p>{t("about_data_2")}</p>
          <p>{t("about_data_3")}</p>
        </div>
      </Card>

      {/*
        Linked to from the help icon on the log sheet, which is why it carries
        an id and sits above the fold of the page rather than at the bottom.
        The tooltip holds two sentences; everything a person might reasonably
        ask afterwards is here, where there is room for it.
      */}
      <Card id="skipped" className="space-y-3 p-4 scroll-mt-24">
        <SectionLabel>{t("about_skipped_dose")}</SectionLabel>
        <div className="space-y-2.5 text-[13.5px] leading-relaxed text-[var(--muted)]">
          <p>
            <Rich text={t("about_skipped_1")} />
          </p>
          <p className="font-semibold text-[var(--ink)]">{t("about_skipped_stops")}</p>
          <ul className="space-y-1.5 pl-4">
            <li className="list-disc">{t("about_skipped_vial")}</li>
            <li className="list-disc">{t("about_skipped_curve")}</li>
            <li className="list-disc">{t("about_skipped_ring")}</li>
            <li className="list-disc">{t("about_skipped_left_out")}</li>
            <li className="list-disc">{t("about_skipped_greyed")}</li>
          </ul>
          <p className="font-semibold text-[var(--ink)]">{t("about_skipped_shows")}</p>
          <p>{t("about_skipped_where")}</p>
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <SectionLabel>{t("about_what_it_tracks")}</SectionLabel>
        <ul className="grid gap-x-6 gap-y-1.5 text-[13px] text-[var(--muted)] sm:grid-cols-2">
          <li>{t("about_tracks_compounds", { n: COMPOUND_COUNT })}</li>
          <li>{t("about_tracks_protocols")}</li>
          <li>{t("about_tracks_reconstitution")}</li>
          <li>{t("about_tracks_stock")}</li>
          <li>{t("about_tracks_sites")}</li>
          <li>{t("about_tracks_weight")}</li>
          <li>{t("about_tracks_markers", { n: MARKER_COUNT })}</li>
          <li>{t("about_tracks_interactions")}</li>
        </ul>
      </Card>

      <Card className="space-y-3 p-4">
        <SectionLabel action={<Badge tone="grape">v{CURRENT_VERSION}</Badge>}>
          <span className="inline-flex items-center gap-1.5">
            <Sparkles size={13} strokeWidth={2.6} /> {t("about_whats_new")}
          </span>
        </SectionLabel>

        <div className="space-y-2">
          {RELEASES.map((release) => {
            const open = expanded === release.version;
            return (
              <div key={release.version} className="rounded-[var(--r-inner)] bg-[var(--sunken)] p-3">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : release.version)}
                  aria-expanded={open}
                  className="press flex w-full items-baseline gap-2 text-left"
                >
                  <span className="text-[14px] font-bold text-[var(--ink)]">v{release.version}</span>
                  <span className="text-[11.5px] text-[var(--faint)]">{release.date}</span>
                  <span className="ml-auto text-[11.5px] font-semibold text-[var(--mint-ink)]">
                    {open ? t("about_hide") : t("about_show")}
                  </span>
                </button>

                <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--muted)]">
                  {release.summary}
                </p>

                {open && (
                  <ul className="mt-2 space-y-1 text-[12.5px] leading-relaxed text-[var(--muted)]">
                    {release.changes.map((c) => (
                      <li key={c} className="flex gap-2">
                        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--mint)]" />
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {open && release.contributors && release.contributors.length > 0 && (
                  <p className="mt-2 text-[11.5px] text-[var(--faint)]">
                    {t("about_contributors")}{" "}
                    {release.contributors.map((name, i) => (
                      <span key={name}>
                        <a
                          href={`https://github.com/${name}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-[var(--mint-ink)] hover:underline"
                        >
                          @{name}
                        </a>
                        {i < release.contributors!.length - 1 && ", "}
                      </span>
                    ))}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <SectionLabel>{t("about_who_made_it")}</SectionLabel>
        <div className="space-y-2.5 text-[13.5px] leading-relaxed text-[var(--muted)]">
          <p>
            <Rich text={t("about_built_by")} />
          </p>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="press inline-flex items-center gap-2 rounded-[var(--r-btn)] bg-[var(--sunken)] px-3.5 py-2.5 text-[13.5px] font-semibold text-[var(--ink)]"
          >
            <Code2 size={15} /> github.com/ArunNGun
            <ExternalLink size={13} className="text-[var(--faint)]" />
          </a>
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="press inline-flex items-center gap-2 rounded-[var(--r-btn)] bg-[var(--sunken)] px-3.5 py-2.5 text-[13.5px] font-semibold text-[var(--ink)]"
          >
            <MessageCircle size={15} /> {t("about_join_discord")}
            <ExternalLink size={13} className="text-[var(--faint)]" />
          </a>
          <p className="text-[12.5px]">{t("about_corrections")}</p>
          {/*
            Two links inside one sentence. The key holds the whole sentence and
            marks where each link goes, so a language that wants the author
            after the site can simply say so.
          */}
          <p className="text-[12px] text-[var(--faint)]">
            {splitSlots(t("about_icon_credit"), ["author", "site"]).map((part, i) =>
              "text" in part ? (
                <span key={i}>{part.text}</span>
              ) : (
                <a
                  key={i}
                  href={
                    part.slot === "author"
                      ? "https://www.flaticon.com/authors/ricardo-ruiz"
                      : "https://www.flaticon.com/"
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-dotted"
                >
                  {part.slot === "author" ? "Ricardo Ruiz" : "Flaticon"}
                </a>
              ))}
          </p>
        </div>
      </Card>

      <Callout tone="warn" title={t("about_what_it_is_not")}>
        {t("about_not_body")}
      </Callout>

      <Card className="space-y-3 p-4">
        <SectionLabel>
          <span className="inline-flex items-center gap-1.5">
            <ShieldAlert size={13} strokeWidth={2.6} /> {t("about_numbers_title")}
          </span>
        </SectionLabel>
        <div className="space-y-2.5 text-[13px] leading-relaxed text-[var(--muted)]">
          <p>{t("about_numbers_1")}</p>
          <p>{t("about_numbers_2")}</p>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pb-2 text-[12px] text-[var(--faint)]">
        <Link href="/landing" className="underline decoration-dotted">
          {t("about_public_page")}
        </Link>
        <Link href="/settings" className="underline decoration-dotted">
          {t("about_export_data")}
        </Link>
      </div>
    </div>
  );
}
