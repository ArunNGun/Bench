"use client";

import { useState } from "react";
import Link from "next/link";
import { Code2, ExternalLink, Lock, MessageCircle, ShieldAlert, Sparkles } from "lucide-react";
import { Badge, Callout, Card, SectionLabel } from "@/components/ui";
import { PEPTIDES } from "@/lib/data/peptides";
import { LAB_MARKERS } from "@/lib/data/labs";
import { CURRENT_VERSION, GITHUB_URL, RELEASES } from "@/lib/changelog";

const DISCORD_URL = "https://discord.gg/NTfnwSxxr";

/** Read from the library itself, so these figures cannot drift out of date. */
const COMPOUND_COUNT = PEPTIDES.length;
const MARKER_COUNT = LAB_MARKERS.length;

export default function AboutPage() {
  const [expanded, setExpanded] = useState<string | null>(RELEASES[0].version);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-[24px] font-extrabold tracking-tight text-[var(--ink)]">About Bench</h1>
        <p className="mt-1 text-[13.5px] text-[var(--muted)]">
          What this is, who made it, and what it will not do.
        </p>
      </header>

      <Card className="space-y-3 p-4">
        <SectionLabel action={<Badge tone="mint">v{CURRENT_VERSION}</Badge>}>What it is</SectionLabel>
        <div className="space-y-2.5 text-[13.5px] leading-relaxed text-[var(--muted)]">
          <p>
            A tracker for peptide, growth hormone and anabolic protocols. It holds what you are
            running, what you have actually taken, what is left in the fridge, what it cost, and
            whether any of it is doing anything: weight, bloodwork, how you felt.
          </p>
          <p>
            The parts that are easy to get wrong are the parts it takes seriously. Reconstitution
            arithmetic is exact and covered by tests. Blends are split into their components and each
            one modelled on its own half-life. A U-40 barrel is never quietly read as U-100. And the{" "}
            {COMPOUND_COUNT} compound library tags every dose figure with where it came from, so an
            approved label and a forum convention never look alike.
          </p>
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <SectionLabel>
          <span className="inline-flex items-center gap-1.5">
            <Lock size={13} strokeWidth={2.6} /> Your data
          </span>
        </SectionLabel>
        <div className="space-y-2.5 text-[13.5px] leading-relaxed text-[var(--muted)]">
          <p>
            By default there is no account, no server and no analytics. Everything you enter is
            stored in this browser, on this device, and never leaves it. Not to me, not to whoever
            is hosting it.
          </p>
          <p>
            One exception, and it is off unless you switch it on. In Settings you can point the app
            at a sync server you run yourself, so a second device can read the same data. Your data
            is encrypted in this browser before it is uploaded, with a key derived from your
            password, so that server holds something it cannot read either. Leave it alone and
            nothing is ever sent.
          </p>
          <p>
            That is a real privacy guarantee and a real risk at the same time. Nobody can read your
            data, and nobody can recover it for you either. Clearing your browsing data erases it.
            Export a copy from Settings and keep it somewhere else.
          </p>
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <SectionLabel>What it tracks</SectionLabel>
        <ul className="grid gap-x-6 gap-y-1.5 text-[13px] text-[var(--muted)] sm:grid-cols-2">
          <li>{COMPOUND_COUNT} compounds, with cited half-lives and dose ranges</li>
          <li>Protocols, titration ladders and adherence</li>
          <li>Reconstitution for U-100 and U-40 syringes</li>
          <li>Vial stock, beyond-use dates and cost per dose</li>
          <li>Injection site rotation</li>
          <li>Weight, with Android Health read-in</li>
          <li>{MARKER_COUNT} blood markers, charted against your doses</li>
          <li>Interaction checks across what you run together</li>
        </ul>
      </Card>

      <Card className="space-y-3 p-4">
        <SectionLabel action={<Badge tone="grape">v{CURRENT_VERSION}</Badge>}>
          <span className="inline-flex items-center gap-1.5">
            <Sparkles size={13} strokeWidth={2.6} /> What is new
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
                    {open ? "Hide" : "Show"}
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
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <SectionLabel>Who made it</SectionLabel>
        <div className="space-y-2.5 text-[13.5px] leading-relaxed text-[var(--muted)]">
          <p>
            Built by <strong className="text-[var(--ink)]">Arun</strong>, originally to track my own
            protocols properly, because every other option either wanted an account or got the
            arithmetic wrong. It is free, there is nothing to buy, and nothing about you is collected.
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
            <MessageCircle size={15} /> Join the Discord
            <ExternalLink size={13} className="text-[var(--faint)]" />
          </a>
          <p className="text-[12.5px]">
            Corrections to the library are welcome, particularly with a citation attached.
          </p>
          <p className="text-[12px] text-[var(--faint)]">
            App icon by{" "}
            <a
              href="https://www.flaticon.com/authors/ricardo-ruiz"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-dotted"
            >
              Ricardo Ruiz
            </a>{" "}
            on{" "}
            <a
              href="https://www.flaticon.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-dotted"
            >
              Flaticon
            </a>
            , used under the Flaticon licence.
          </p>
        </div>
      </Card>

      <Callout tone="warn" title="What this is not">
        Not medical advice, not a prescription, and not a recommendation to use anything in it. Most
        compounds here are not approved medicines anywhere, and material sold for research use has no
        regulated identity, purity or sterility behind it. The app can check your arithmetic. It
        cannot check what is in your vial, and it is no substitute for a doctor who knows your history.
      </Callout>

      <Card className="space-y-3 p-4">
        <SectionLabel>
          <span className="inline-flex items-center gap-1.5">
            <ShieldAlert size={13} strokeWidth={2.6} /> Where the numbers come from
          </span>
        </SectionLabel>
        <div className="space-y-2.5 text-[13px] leading-relaxed text-[var(--muted)]">
          <p>
            Prescribing labels first, then published trials, then registries. Community practice is
            included where it is genuinely what people do, but it is always tagged as such.
          </p>
          <p>
            Where a half-life has never been measured in humans, as with trenbolone and several
            research peptides, the app says so and draws no curve rather than inventing one that looks
            authoritative. Every entry links its sources.
          </p>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pb-2 text-[12px] text-[var(--faint)]">
        <Link href="/landing" className="underline decoration-dotted">
          The public page for this app
        </Link>
        <Link href="/settings" className="underline decoration-dotted">
          Export your data
        </Link>
      </div>
    </div>
  );
}
