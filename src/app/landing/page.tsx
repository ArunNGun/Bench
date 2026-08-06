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

export const metadata: Metadata = {
  title: "Bench, a private peptide, HGH and anabolic tracker",
  description:
    "Track protocols, doses, stock and bloodwork with arithmetic you can trust. No account, no server, and everything stays on your device.",
};

/** Read from the library itself, so the page cannot overstate what is in it. */
const COMPOUND_COUNT = PEPTIDES.length;
const MARKER_COUNT = LAB_MARKERS.length;

const FEATURES = [
  {
    icon: Calculator,
    eyebrow: "Reconstitution",
    title: "It draws the syringe you are actually holding",
    body: "Tell it the vial and the dose you want, and it tells you what to add and how far to draw, on a barrel rendered to real graduations. A U-40 barrel is never quietly read as U-100. That one mistake delivers two and a half times the intended dose, so the scale is an explicit choice and the reading on the other scale sits right beside it.",
    art: <ReconArt />,
  },
  {
    icon: LineChart,
    eyebrow: "Levels",
    title: "See what is circulating, not just what you took",
    body: "Every logged dose feeds a curve built from published half-lives, so you can see a trough before you feel it. Blends are split into their components and each one modelled on its own half-life, because averaging a blend into a single line describes nothing that is actually in you.",
    art: <CurveArt />,
  },
  {
    icon: FlaskConical,
    eyebrow: "Stock",
    title: "Know what is left, and what it cost",
    body: "Vials move from sealed through reconstituted to empty, counted in mass rather than volume, so a dose drawn from a sealed vial still depletes it. Beyond-use dates, doses remaining and cost per dose are all derived rather than typed in and forgotten.",
    art: <StockArt />,
  },
  {
    icon: Droplet,
    eyebrow: "Bloodwork",
    title: "Results on the same axis as your doses",
    body: `${MARKER_COUNT} markers charted against your dose history, so a change lines up with whatever caused it. The app suggests the ones your own compounds make worth watching: lipase on a GLP-1, haematocrit on an androgen, liver enzymes on an oral. Reference ranges come from your own report, because they belong to the lab that ran the sample.`,
    art: <LabsArt />,
  },
  {
    icon: ShieldAlert,
    eyebrow: "Safety",
    title: "Warnings you have not learned to ignore",
    body: "Checks run across everything active at once: two compounds on the same receptor, the same compound arriving from two protocols, two oral steroids sharing one liver. They are built on receptor classes rather than names, so a deliberate pairing like CJC-1295 with ipamorelin stays silent. A warning you dismiss on reflex is worse than no warning at all.",
    art: <StackArt />,
  },
  {
    icon: Syringe,
    eyebrow: "Rotation",
    title: "A site that has had time to recover",
    body: "Pin the sites a protocol uses and the app suggests the next one, keeping recently used tissue resting. Titration ladders advance on schedule, and adherence is reported honestly rather than flattering you.",
    art: <RotationArt />,
  },
];

const ALSO = [
  {
    icon: WifiOff,
    title: "Works offline, installs like an app",
    body: "Add it to your home screen on iPhone or Android and it opens straight from cache, with no connection needed.",
  },
  {
    icon: FileUp,
    title: "Bring your history with you",
    body: "Import CSV, TSV, JSON or a spreadsheet. Shotsy is recognised by name, anything else is read from its column headers, and you see a preview before a single row is written.",
  },
  {
    icon: Download,
    title: "Backups you control",
    body: "Export the lot to a file whenever you like. On Android it also writes rotating backups into Documents, which survive clearing the app data.",
  },
  {
    icon: Plus,
    title: "Your own compounds",
    body: "Running something the library does not carry? Add it from any picker. It behaves like a built-in everywhere, and is never dressed up as researched.",
  },
  {
    icon: Users,
    title: "More than one person",
    body: "Separate profiles keep two people sharing one device from ever seeing each other's numbers.",
  },
  {
    icon: Lock,
    title: "Updates that leave data alone",
    body: "A new version asks before it installs, and migrations are tested in both directions, so a backup from any older version restores intact.",
  },
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

const APK_URL = "https://github.com/ArunNGun/Bench/releases/latest";

function ApkButton() {
  return (
    <a
      href={APK_URL}
      className="press inline-flex items-center gap-2 rounded-[var(--r-btn)] border border-[var(--line)] bg-[var(--card)] px-5 py-3.5 text-[14px] font-bold text-[var(--ink)] shadow-[var(--shadow-xs)] hover:border-[var(--mint)]"
    >
      <Smartphone size={16} strokeWidth={2.4} style={{ color: "var(--mint)" }} />
      Download for Android
    </a>
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

export default async function LandingPage() {
  const { apkDownloads, pageViews } = await getLandingStats();
  const totalUsers = (apkDownloads ?? 0) + (pageViews ?? 0) || null;
  return (
    <main className="min-h-screen bg-[var(--canvas)]">
      {/*
        The reveal and hero animations both start from opacity 0 and are
        released by script. With script off, nothing would release them and the
        page would be an empty canvas, so opt out of the whole scheme up front.
      */}
      <noscript>
        <style>{`.reveal,.enter{opacity:1!important;transform:none!important;animation:none!important}.trace{stroke-dasharray:none;stroke-dashoffset:0}`}</style>
      </noscript>

      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <span className="flex items-center gap-2.5">
          <Logo size={34} />
          <span className="text-[19px] font-extrabold tracking-tight text-[var(--ink)]">Bench</span>
        </span>
        <span className="flex items-center gap-3 sm:gap-5">
          <Link
            href="/about"
            className="text-[13.5px] font-semibold text-[var(--muted)] hover:text-[var(--ink)]"
          >
            About
          </Link>
          <ThemeToggle className="press flex h-9 w-9 items-center justify-center rounded-[var(--r-btn)] bg-[var(--card)] text-[var(--muted)] shadow-[var(--shadow-xs)] hover:text-[var(--ink)]" />
          <Link
            href="/"
            className="press rounded-[var(--r-btn)] bg-[var(--card)] px-4 py-2 text-[13.5px] font-bold text-[var(--ink)] shadow-[var(--shadow-xs)]"
          >
            Open app
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
              <Lock size={12} strokeWidth={2.8} /> No account, no server, no analytics
            </span>

            <h1 style={{ animationDelay: "140ms" }} className="enter mt-5 text-[36px] font-extrabold leading-[1.06] tracking-tight text-[var(--ink)] sm:text-[52px]">
              Get the arithmetic right.
              <br />
              <span style={{ color: "var(--mint)" }}>Keep the data yours.</span>
            </h1>

            <p style={{ animationDelay: "240ms" }} className="enter mt-5 max-w-lg text-[16.5px] leading-relaxed text-[var(--muted)]">
              A tracker for peptide, growth hormone and anabolic protocols. Doses, reconstitution,
              stock, bloodwork and outcomes, all held in your browser on your own device and sent
              nowhere.
            </p>

            <div style={{ animationDelay: "340ms" }} className="enter mt-8 flex flex-wrap items-center gap-4">
              <Cta>Open the app</Cta>
              <ApkButton />
            </div>
            <p style={{ animationDelay: "400ms" }} className="enter mt-3 text-[13px] leading-relaxed text-[var(--faint)]">
              Free, nothing to sign up for. Works offline once loaded.
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
            { n: String(COMPOUND_COUNT), l: "compounds, every figure cited" },
            { n: String(MARKER_COUNT), l: "blood markers you can chart" },
            { n: "962", l: "tests on the arithmetic" },
            { n: "0", l: "bytes of your data leave the device" },
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
                    users
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
                    APK downloads
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
                {eyebrow}
              </span>
              <h2 className="mt-2.5 flex items-start gap-3 text-[25px] font-extrabold leading-[1.15] tracking-tight text-[var(--ink)] sm:text-[30px]">
                <Icon
                  size={24}
                  strokeWidth={2.4}
                  className="mt-1 shrink-0"
                  style={{ color: "var(--mint)" }}
                />
                <span>{title}</span>
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-[var(--muted)]">{body}</p>
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
              <Lock size={12} strokeWidth={2.8} /> Privacy
            </span>
            <h2 className="mt-4 text-[28px] font-extrabold leading-[1.15] tracking-tight text-white sm:text-[34px]">
              There is no backend to leak.
            </h2>
            <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-white/85">
              The application code makes no network requests at all. Nothing is uploaded, nothing is
              synced, and there is no account to create. Everything you enter lives in your browser,
              on your device.
            </p>
            <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-white/85">
              That is a real guarantee and a real risk in the same breath. Nobody can read your data,
              and nobody can recover it for you either, so the app nudges you to keep an exported
              copy somewhere safe.
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
            And the rest of it
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
              <h3 className="mt-3 text-[15px] font-bold text-[var(--ink)]">{title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--muted)]">{body}</p>
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
            Where the numbers come from
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed" style={{ color: "var(--sky-ink)" }}>
            Prescribing labels first, then published trials, then registries, and every entry links
            its sources. Community practice is included where it is genuinely what people do, and it
            is tagged as exactly that so it never passes for an approved figure.
          </p>
          <p className="mt-3 text-[14px] leading-relaxed" style={{ color: "var(--sky-ink)" }}>
            Where a half-life has never been measured in humans, the app says so and draws no curve
            rather than inventing one that looks authoritative.
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
            What this is not
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed" style={{ color: "var(--tangerine-ink)" }}>
            Not medical advice, not a prescription, and not a recommendation to use anything in it.
            Most of these compounds are not approved medicines anywhere, and material sold for
            research use has no regulated identity, purity or sterility behind it.
          </p>
          <p className="mt-3 text-[14px] leading-relaxed" style={{ color: "var(--tangerine-ink)" }}>
            The app can check your arithmetic. It cannot check what is in your vial, and it is no
            substitute for a doctor who knows your history.
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
            Nothing to sign up for. Open it and start.
          </h2>
          <p className="mt-4 max-w-md text-[14.5px] leading-relaxed text-[var(--muted)]">
            Already tracking somewhere else? Import your history and the app will build a protocol
            from the pattern of your doses.
          </p>
          <div className="mt-8">
            <Cta>Open the app</Cta>
          </div>
        </div>
        </Reveal>
      </section>

      <footer className="border-t border-[var(--line)]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-[13px] text-[var(--faint)] sm:flex-row">
          <span className="flex items-center gap-2.5">
            <Logo size={26} />
            <span>
              Bench v{CURRENT_VERSION}, built by{" "}
              <strong className="font-bold text-[var(--muted)]">Arun</strong>
            </span>
          </span>
          <span className="flex items-center gap-5">
            <Link href="/about" className="hover:text-[var(--muted)]">
              About
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
              href={APK_URL}
              className="inline-flex items-center gap-1.5 hover:text-[var(--muted)]"
            >
              <Download size={13} /> Android APK
            </a>
            <Link href="/" className="font-bold hover:text-[var(--muted)]">
              Open app
            </Link>
          </span>
        </div>
        <div className="mx-auto max-w-6xl px-5 pb-8 text-[12px] text-[var(--faint)]">
          App icon by{" "}
          <a
            href="https://www.flaticon.com/authors/ricardo-ruiz"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-dotted hover:text-[var(--muted)]"
          >
            Ricardo Ruiz
          </a>{" "}
          on{" "}
          <a
            href="https://www.flaticon.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-dotted hover:text-[var(--muted)]"
          >
            Flaticon
          </a>
          .
        </div>
      </footer>
    </main>
  );
}
