import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Calculator,
  Code2,
  Download,
  Droplet,
  FileUp,
  FlaskConical,
  LineChart,
  Lock,
  MessageCircle,
  Plus,
  ShieldAlert,
  Smartphone,
  Syringe,
  Users,
  WifiOff,
} from "lucide-react";

import { PEPTIDES } from "@/lib/data/peptides";
import { LAB_MARKERS } from "@/lib/data/labs";
import { CURRENT_VERSION, GITHUB_URL } from "@/lib/changelog";
import { getLandingStats } from "@/lib/landingStats";
import { translate, type Lang, type TranslationKey } from "@/lib/i18n";
import { splitSlots } from "@/lib/i18n/rich";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Reveal } from "./Reveal";
import {
  CurveArt,
  LabsArt,
  PrivacyArt,
  ReconArt,
  RotationArt,
  StackArt,
  StockArt,
} from "./visuals";

/**
 * The public page, in one language.
 *
 * Every other screen in this app is a client component that reads the language
 * out of a store in the browser. This one cannot: it renders on the server,
 * before any browser has said which language it wants, which is what lets it
 * arrive instantly on a phone that has never opened the app. So the language
 * comes from the URL and is passed in, and the strings are read with
 * `translate` rather than with `useLang`.
 *
 * English lives at /landing and the rest at /landing/de, /sl and /pl. English
 * keeps the bare path rather than gaining a /landing/en of its own: every link
 * that exists in the world today points at /landing, and a second URL holding
 * the same page is a duplicate a search engine has to be told to ignore.
 */

const DISCORD_URL = "https://discord.gg/NTfnwSxxr";
const APK_URL = "https://github.com/ArunNGun/Bench/releases/latest";

/** Read from the library itself, so the page cannot overstate what is in it. */
const COMPOUND_COUNT = PEPTIDES.length;
const MARKER_COUNT = LAB_MARKERS.length;

/** Which languages the page is written in, and where each one lives. */
export const LANDING_LANGS: { lang: Lang; path: string; label: string }[] = [
  { lang: "en", path: "/landing", label: "English" },
  { lang: "de", path: "/landing/de", label: "Deutsch" },
  { lang: "sl", path: "/landing/sl", label: "Slovenščina" },
  { lang: "pl", path: "/landing/pl", label: "Polski" },
];

/**
 * Title, description and the four addresses this page has.
 *
 * `hreflang` is the whole point of routing the page rather than translating it
 * in the browser: it tells a search engine that these four URLs are one page in
 * four languages rather than four pages competing with each other, and it can
 * only be said in the markup of a page that was rendered knowing its language.
 * `x-default` points at English, which is where a reader we have no language
 * for should land.
 *
 * The paths are relative. This app is self-hosted by whoever wants it, so there
 * is no one absolute origin to write down, and a wrong one would be worse than
 * none.
 */
export function landingMetadata(lang: Lang): Metadata {
  const languages = Object.fromEntries(
    LANDING_LANGS.map(({ lang: l, path }) => [l, path]));

  return {
    title: translate(lang, "lp_meta_title"),
    description: translate(lang, "lp_meta_description"),
    alternates: {
      canonical: LANDING_LANGS.find((l) => l.lang === lang)?.path ?? "/landing",
      languages: { ...languages, "x-default": "/landing" },
    },
  };
}

const FEATURES: {
  icon: typeof Calculator;
  eyebrow: TranslationKey;
  title: TranslationKey;
  body: TranslationKey;
  art: React.ReactNode;
}[] = [
  {
    icon: Calculator,
    eyebrow: "lp_f_recon_eyebrow",
    title: "lp_f_recon_title",
    body: "lp_f_recon_body",
    art: <ReconArt />,
  },
  {
    icon: LineChart,
    eyebrow: "lp_f_levels_eyebrow",
    title: "lp_f_levels_title",
    body: "lp_f_levels_body",
    art: <CurveArt />,
  },
  {
    icon: FlaskConical,
    eyebrow: "lp_f_stock_eyebrow",
    title: "lp_f_stock_title",
    body: "lp_f_stock_body",
    art: <StockArt />,
  },
  {
    icon: Droplet,
    eyebrow: "lp_f_labs_eyebrow",
    title: "lp_f_labs_title",
    body: "lp_f_labs_body",
    art: <LabsArt />,
  },
  {
    icon: ShieldAlert,
    eyebrow: "lp_f_safety_eyebrow",
    title: "lp_f_safety_title",
    body: "lp_f_safety_body",
    art: <StackArt />,
  },
  {
    icon: Syringe,
    eyebrow: "lp_f_rotation_eyebrow",
    title: "lp_f_rotation_title",
    body: "lp_f_rotation_body",
    art: <RotationArt />,
  },
];

const ALSO: { icon: typeof WifiOff; title: TranslationKey; body: TranslationKey }[] = [
  { icon: WifiOff, title: "lp_also_offline_title", body: "lp_also_offline_body" },
  { icon: FileUp, title: "lp_also_import_title", body: "lp_also_import_body" },
  { icon: Download, title: "lp_also_backup_title", body: "lp_also_backup_body" },
  { icon: Plus, title: "lp_also_own_title", body: "lp_also_own_body" },
  { icon: Users, title: "lp_also_profiles_title", body: "lp_also_profiles_body" },
  { icon: Lock, title: "lp_also_updates_title", body: "lp_also_updates_body" },
];

function Cta({ children }: { children: React.ReactNode }) {
  return (
    <Link
      href="/"
      className="press inline-flex items-center gap-2 rounded-[var(--r-btn)] px-6 py-3.5 text-[15px] font-bold text-[var(--on-accent)] shadow-[var(--shadow-pop)]"
      style={{ background: "var(--mint)" }}
    >
      {children} <ArrowRight size={17} strokeWidth={2.6} />
    </Link>
  );
}

/** The same generated icon the launcher and the home screen use. */
function Logo({ size = 40 }: { size?: number }) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element -- a static icon, nothing for the image pipeline to do */
    <img
      src="/icon.svg"
      alt=""
      width={size}
      height={size}
      className="shrink-0"
      style={{ width: size, height: size, borderRadius: size * 0.28 }}
    />
  );
}

/**
 * The language row, plain links rather than a picker.
 *
 * A dropdown would need script, and this page is deliberately readable without
 * it. Links also give a search engine the four addresses in the markup, which
 * is half of what the `hreflang` tags are saying in the head.
 */
function LangBar({ lang }: { lang: Lang }) {
  return (
    <span className="flex items-center gap-2 text-[12.5px]" aria-label={translate(lang, "lp_language")}>
      {LANDING_LANGS.map(({ lang: l, path, label }) =>
        l === lang ? (
          <span key={l} className="font-bold text-[var(--ink)]" aria-current="true">
            {label}
          </span>
        ) : (
          <Link key={l} href={path} hrefLang={l} className="text-[var(--faint)] hover:text-[var(--ink)]">
            {label}
          </Link>
        ))}
    </span>
  );
}

export async function Landing({ lang }: { lang: Lang }) {
  const t = (key: TranslationKey, vars?: Record<string, string | number>) =>
    translate(lang, key, vars);

  const { apkDownloads, pageViews } = await getLandingStats();
  const totalUsers = (apkDownloads ?? 0) + (pageViews ?? 0) || null;

  return (
    /*
      `lang` here rather than on `<html>`, which belongs to the root layout and
      is shared by the whole app. A screen reader switches voice at this
      element, which is the behaviour the attribute exists for, and a crawler
      reads the subtree as this language. Moving it to `<html>` would mean two
      root layouts and a route group around every other page, which is a lot of
      restructuring to say the same thing.
    */
    <main lang={lang} className="min-h-screen bg-[var(--canvas)]">
      {/*
        The reveal and hero animations both start from opacity 0 and are
        released by script. With script off, nothing would release them and the
        page would be an empty canvas, so opt out of the whole scheme up front.
      */}
      <noscript>
        <style>{`.reveal,.enter{opacity:1!important;transform:none!important;animation:none!important}.trace{stroke-dasharray:none;stroke-dashoffset:0}`}</style>
      </noscript>

      <nav className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-5">
        <span className="flex items-center gap-2.5">
          <Logo size={34} />
          <span className="text-[19px] font-extrabold tracking-tight text-[var(--ink)]">Bench</span>
        </span>
        <span className="flex items-center gap-3 sm:gap-5">
          <LangBar lang={lang} />
          <Link
            href="/about"
            className="text-[13.5px] font-semibold text-[var(--muted)] hover:text-[var(--ink)]"
          >
            {t("lp_nav_about")}
          </Link>
          <ThemeToggle className="press flex h-9 w-9 items-center justify-center rounded-[var(--r-btn)] bg-[var(--card)] text-[var(--muted)] shadow-[var(--shadow-xs)] hover:text-[var(--ink)]" />
          <Link
            href="/"
            className="press rounded-[var(--r-btn)] bg-[var(--card)] px-4 py-2 text-[13.5px] font-bold text-[var(--ink)] shadow-[var(--shadow-xs)]"
          >
            {t("lp_nav_open")}
          </Link>
        </span>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-[-200px] h-[600px]"
          style={{
            background:
              "radial-gradient(58% 58% at 50% 50%, color-mix(in srgb, var(--mint) 24%, transparent) 0%, transparent 72%)",
          }}
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:pb-24 lg:pt-14">
          <div>
            <span
              className="enter inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-bold"
              style={{
                animationDelay: "40ms",
                background: "var(--mint-soft)",
                color: "var(--mint-ink)",
              }}
            >
              <Lock size={12} strokeWidth={2.8} /> {t("lp_hero_badge")}
            </span>

            <h1 style={{ animationDelay: "140ms" }} className="enter mt-5 text-[36px] font-extrabold leading-[1.06] tracking-tight text-[var(--ink)] sm:text-[52px]">
              {t("lp_hero_title_1")}
              <br />
              <span style={{ color: "var(--mint)" }}>{t("lp_hero_title_2")}</span>
            </h1>

            <p style={{ animationDelay: "240ms" }} className="enter mt-5 max-w-lg text-[16.5px] leading-relaxed text-[var(--muted)]">
              {t("lp_hero_body")}
            </p>

            <div style={{ animationDelay: "340ms" }} className="enter mt-8 flex flex-wrap items-center gap-4">
              <Cta>{t("lp_cta_open")}</Cta>
              <a
                href={APK_URL}
                className="press inline-flex items-center gap-2 rounded-[var(--r-btn)] border border-[var(--line)] bg-[var(--card)] px-5 py-3.5 text-[14px] font-bold text-[var(--ink)] shadow-[var(--shadow-xs)] hover:border-[var(--mint)]"
              >
                <Smartphone size={16} strokeWidth={2.4} style={{ color: "var(--mint)" }} />
                {t("lp_cta_apk")}
              </a>
            </div>
            <p style={{ animationDelay: "400ms" }} className="enter mt-3 text-[13px] leading-relaxed text-[var(--faint)]">
              {t("lp_hero_note")}
            </p>
          </div>

          <div className="enter drift" style={{ animationDelay: "220ms" }}>
            <div
              className="lift overflow-hidden rounded-[var(--r-card)] shadow-[var(--shadow-md)]"
              style={{ aspectRatio: "798 / 1602", maxHeight: "72vh" }}
            >
              <video
                autoPlay
                loop
                muted
                playsInline
                className="h-full w-full object-cover"
                poster="/icon.svg"
              >
                <source src="/demo.webm" type="video/webm" />
                <source src="/demo.mp4" type="video/mp4" />
              </video>
            </div>
          </div>
        </div>
      </section>

      {/* Stat band */}
      <section className="mx-auto max-w-6xl px-5">
        <Reveal>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--r-card)] bg-[var(--line)] shadow-[var(--shadow-sm)] sm:grid-cols-4">
          {[
            { n: String(COMPOUND_COUNT), l: t("lp_stat_compounds") },
            { n: String(MARKER_COUNT), l: t("lp_stat_markers") },
            { n: "962", l: t("lp_stat_tests") },
            { n: "0", l: t("lp_stat_bytes") },
          ].map(({ n, l }) => (
            <div key={l} className="bg-[var(--card)] px-4 py-6 text-center">
              <p
                className="font-mono text-[30px] font-extrabold leading-none tracking-tight"
                style={{ color: "var(--mint)" }}
              >
                {n}
              </p>
              <p className="mx-auto mt-2 flex max-w-[150px] items-center justify-center gap-1.5 text-[12.5px] leading-snug text-[var(--muted)]">
                {l}
              </p>
            </div>
          ))}
          {(totalUsers != null || (apkDownloads != null && apkDownloads > 0)) && (
            <>
              {totalUsers != null && (
                <div className="col-span-2 bg-[var(--card)] px-4 py-6 text-center sm:col-span-2">
                  <p
                    className="font-mono text-[30px] font-extrabold leading-none tracking-tight"
                    style={{ color: "var(--mint)" }}
                  >
                    {totalUsers.toLocaleString()}
                  </p>
                  <p className="mx-auto mt-2 flex max-w-[150px] items-center justify-center gap-1.5 text-[12.5px] leading-snug text-[var(--muted)]">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--mint)] opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--mint)]" />
                    </span>
                    {t("lp_stat_users")}
                  </p>
                </div>
              )}
              {apkDownloads != null && apkDownloads > 0 && (
                <div className="col-span-2 bg-[var(--card)] px-4 py-6 text-center sm:col-span-2">
                  <p
                    className="font-mono text-[30px] font-extrabold leading-none tracking-tight"
                    style={{ color: "var(--mint)" }}
                  >
                    {apkDownloads.toLocaleString()}
                  </p>
                  <p className="mx-auto mt-2 text-[12.5px] leading-snug text-[var(--muted)]">
                    {t("lp_stat_downloads")}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
        </Reveal>
      </section>

      {/* Features, alternating so the eye has somewhere to go */}
      <section className="mx-auto max-w-6xl space-y-20 px-5 py-20 sm:space-y-28 sm:py-28">
        {FEATURES.map(({ icon: Icon, eyebrow, title, body, art }, i) => (
          <div key={title} className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
            <Reveal className={i % 2 === 1 ? "lg:order-2" : undefined}>
              <span
                className="text-[11.5px] font-extrabold uppercase tracking-[0.14em]"
                style={{ color: "var(--mint)" }}
              >
                {t(eyebrow)}
              </span>
              <h2 className="mt-2.5 flex items-start gap-3 text-[25px] font-extrabold leading-[1.15] tracking-tight text-[var(--ink)] sm:text-[30px]">
                <Icon
                  size={24}
                  strokeWidth={2.4}
                  className="mt-1 shrink-0"
                  style={{ color: "var(--mint)" }}
                />
                <span>{t(title)}</span>
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-[var(--muted)]">
                {t(body, { n: MARKER_COUNT })}
              </p>
            </Reveal>

            <Reveal delay={120} className={i % 2 === 1 ? "lg:order-1" : undefined}>
              <div className="lift rounded-[var(--r-card)] bg-[var(--card)] p-5 shadow-[var(--shadow-md)] sm:p-7">
                {art}
              </div>
            </Reveal>
          </div>
        ))}
      </section>

      {/* Privacy */}
      <section className="mx-auto max-w-6xl px-5">
        <Reveal>
        <div
          className="grid items-center gap-10 overflow-hidden rounded-[var(--r-card)] p-8 sm:p-12 lg:grid-cols-[1.1fr_0.9fr]"
          style={{ background: "linear-gradient(135deg, #0b8d80 0%, #0fb5a5 55%, #19c6ab 100%)" }}
        >
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1.5 text-[12px] font-bold text-white">
              <Lock size={12} strokeWidth={2.8} /> {t("lp_privacy_badge")}
            </span>
            <h2 className="mt-4 text-[28px] font-extrabold leading-[1.15] tracking-tight text-white sm:text-[34px]">
              {t("lp_privacy_title")}
            </h2>
            <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-white/85">
              {t("lp_privacy_1")}
            </p>
            <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-white/85">
              {t("lp_privacy_2")}
            </p>
            <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-white/85">
              {t("lp_privacy_3")}
            </p>
          </div>
          <PrivacyArt />
        </div>
        </Reveal>
      </section>

      {/* Everything else */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:py-24">
        <Reveal>
          <h2 className="text-[25px] font-extrabold tracking-tight text-[var(--ink)] sm:text-[30px]">
            {t("lp_also_title")}
          </h2>
        </Reveal>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ALSO.map(({ icon: Icon, title, body }, i) => (
            <Reveal key={title} delay={(i % 3) * 90}>
            <div
              className="lift h-full rounded-[var(--r-card)] bg-[var(--card)] p-5 shadow-[var(--shadow-xs)]"
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-[10px]"
                style={{ background: "var(--mint-soft)" }}
              >
                <Icon size={17} strokeWidth={2.4} style={{ color: "var(--mint-ink)" }} />
              </span>
              <h3 className="mt-3 text-[15px] font-bold text-[var(--ink)]">{t(title)}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--muted)]">{t(body)}</p>
            </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Sourcing and limits */}
      <section className="mx-auto grid max-w-6xl gap-4 px-5 pb-20 lg:grid-cols-2">
        <Reveal>
        <div className="h-full rounded-[var(--r-card)] p-6 sm:p-7" style={{ background: "var(--sky-soft)" }}>
          <h2
            className="text-[18px] font-extrabold tracking-tight"
            style={{ color: "var(--sky-ink)" }}
          >
            {t("lp_sources_title")}
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed" style={{ color: "var(--sky-ink)" }}>
            {t("lp_sources_1")}
          </p>
          <p className="mt-3 text-[14px] leading-relaxed" style={{ color: "var(--sky-ink)" }}>
            {t("lp_sources_2")}
          </p>
        </div>
        </Reveal>

        <Reveal delay={120}>
        <div
          className="h-full rounded-[var(--r-card)] p-6 sm:p-7"
          style={{ background: "var(--tangerine-soft)" }}
        >
          <h2
            className="text-[18px] font-extrabold tracking-tight"
            style={{ color: "var(--tangerine-ink)" }}
          >
            {t("lp_notwhat_title")}
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed" style={{ color: "var(--tangerine-ink)" }}>
            {t("lp_notwhat_1")}
          </p>
          <p className="mt-3 text-[14px] leading-relaxed" style={{ color: "var(--tangerine-ink)" }}>
            {t("lp_notwhat_2")}
          </p>
        </div>
        </Reveal>
      </section>

      {/* Close */}
      <section className="mx-auto max-w-6xl px-5 pb-20">
        <Reveal>
        <div className="flex flex-col items-center rounded-[var(--r-card)] bg-[var(--card)] px-6 py-14 text-center shadow-[var(--shadow-sm)]">
          <Logo size={48} />
          <h2 className="mt-5 max-w-lg text-[27px] font-extrabold leading-[1.15] tracking-tight text-[var(--ink)] sm:text-[33px]">
            {t("lp_close_title")}
          </h2>
          <p className="mt-4 max-w-md text-[14.5px] leading-relaxed text-[var(--muted)]">
            {t("lp_close_body")}
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Cta>{t("lp_cta_open")}</Cta>
            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="press inline-flex items-center gap-2 rounded-[var(--r-btn)] border border-[var(--line)] bg-[var(--card)] px-5 py-3.5 text-[14px] font-bold text-[var(--ink)] shadow-[var(--shadow-xs)] hover:border-[var(--mint)]"
            >
              <MessageCircle size={16} strokeWidth={2.4} style={{ color: "var(--mint)" }} />
              {t("lp_close_discord")}
            </a>
          </div>
        </div>
        </Reveal>
      </section>

      <footer className="border-t border-[var(--line)]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-[13px] text-[var(--faint)] sm:flex-row">
          <span className="flex items-center gap-2.5">
            <Logo size={26} />
            {/* The builder's name is a name, so it is a slot rather than copy. */}
            <span>
              {splitSlots(t("lp_footer_built", { version: CURRENT_VERSION }), ["name"]).map(
                (part, i) =>
                  "text" in part ? (
                    <span key={i}>{part.text}</span>
                  ) : (
                    <strong key={i} className="font-bold text-[var(--muted)]">
                      Arun
                    </strong>
                  ))}
            </span>
          </span>
          <span className="flex flex-wrap items-center justify-center gap-5">
            <Link href="/about" className="hover:text-[var(--muted)]">
              {t("lp_nav_about")}
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-[var(--muted)]"
            >
              <Code2 size={13} /> GitHub
            </a>
            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-[var(--muted)]"
            >
              <MessageCircle size={13} /> Discord
            </a>
            <a
              href={APK_URL}
              className="inline-flex items-center gap-1.5 hover:text-[var(--muted)]"
            >
              <Download size={13} /> {t("lp_footer_apk")}
            </a>
            <Link href="/" className="font-bold hover:text-[var(--muted)]">
              {t("lp_nav_open")}
            </Link>
          </span>
        </div>
        <div className="mx-auto max-w-6xl px-5 pb-8 text-[12px] text-[var(--faint)]">
          {/* Two names and two links inside one sentence, so the sentence stays whole. */}
          {splitSlots(t("lp_footer_icon"), ["author", "site"]).map((part, i) =>
            "text" in part ? (
              <span key={i}>{part.text}</span>
            ) : part.slot === "author" ? (
              <a
                key={i}
                href="https://www.flaticon.com/authors/ricardo-ruiz"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-dotted hover:text-[var(--muted)]"
              >
                Ricardo Ruiz
              </a>
            ) : (
              <a
                key={i}
                href="https://www.flaticon.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-dotted hover:text-[var(--muted)]"
              >
                Flaticon
              </a>
            ))}
        </div>
      </footer>
    </main>
  );
}
