"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BookOpen,
  Calculator,
  Droplet,
  FlaskConical,
  Info,
  ListChecks,
  NotebookPen,
  Settings as SettingsIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { ThemeToggle } from "./ThemeToggle";
import { ProfileSwitcher } from "./ProfileSwitcher";
import { SystemBarsSync } from "./SystemBarsSync";
import { AutoBackup } from "./AutoBackup";
import { FirstBackupGate } from "./FirstBackupGate";
import { UnlockGate } from "./UnlockGate";
import { ReminderRunner } from "./ReminderRunner";
import { SyncNotice } from "./SyncNotice";
import { BackupButton } from "./BackupButton";

/**
 * Six destinations reachable by thumb on mobile, the same six in a rail on
 * desktop. Reference and settings sit in the header on small screens, since
 * they are read occasionally rather than tapped constantly.
 */
const PRIMARY = [
  { href: "/", label: "Now", icon: Activity },
  { href: "/plan", label: "Plan", icon: ListChecks },
  { href: "/log", label: "Log", icon: NotebookPen },
  { href: "/stock", label: "Stock", icon: FlaskConical },
  { href: "/calculator", label: "Calc", icon: Calculator },
  { href: "/about", label: "About", icon: Info },
];

/**
 * Routes that are not the app: the public landing page stands alone, with no
 * header, no tab bar and no profile switcher. Wrapping marketing copy in the
 * application chrome makes it look like a screen you are already signed into.
 */
const BARE_ROUTES = ["/landing"];

const SECONDARY = [
  { href: "/labs", label: "Bloodwork", icon: Droplet },
  { href: "/library", label: "Library", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (BARE_ROUTES.some((r) => pathname.startsWith(r))) {
    return <div className="min-h-dvh">{children}</div>;
  }

  return (
    <div className="min-h-dvh">
      <SystemBarsSync />
      <AutoBackup />
      <ReminderRunner />
      {/*
        Before the backup gate, which asks for a file this browser cannot yet
        produce: without the key there is nothing to export.
      */}
      <UnlockGate />
      <FirstBackupGate />

      {/*
        The padding pushes the content row clear of the status bar while the
        blurred surface still runs underneath it, so the clock sits on the app's
        own background rather than on top of the logo.
      */}
      <header
        data-app-header
        className="sticky top-0 z-30 bg-[var(--canvas)]/85 backdrop-blur-xl"
        style={{ paddingTop: "var(--safe-top)" }}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 md:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <BenchMark />
            <span className="text-[17px] font-extrabold tracking-tight text-[var(--ink)]">
              Bench
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-1.5">
            <ProfileSwitcher />
            {/*
              An action among links, on purpose and in this exact spot. It was
              asked for as something always in reach, and the header is the only
              place that is true on every screen. Next to the profile because
              both answer "whose data is this and where is my copy of it".
            */}
            <BackupButton />
            {SECONDARY.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                aria-current={isActive(pathname, item.href) ? "page" : undefined}
                className={cn(
                  "press flex h-10 items-center gap-2 rounded-[var(--r-pill)] px-3 text-[14px] font-medium transition-colors",
                  isActive(pathname, item.href)
                    ? "bg-[var(--mint-soft)] text-[var(--mint-ink)]"
                    : "text-[var(--muted)] hover:bg-[var(--card)] hover:text-[var(--ink)]")}
              >
                <item.icon size={18} strokeWidth={2.1} />
                <span className="hidden lg:inline">{item.label}</span>
              </Link>
            ))}
            {/*
              No sign out here. It was tried, and on a phone it pushed the row
              past the width of the screen, which gave the whole app a sideways
              scroll. The header already carries a profile, a backup button,
              three links and this toggle, and that is the ceiling.

              It lives in the profile menu instead, which is the menu about who
              is using the app and is full width on a phone, and in a card in
              Settings.
            */}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-6 px-4 md:px-6">
        {/* Desktop rail */}
        <nav
          data-app-tabs
          className="sticky hidden w-52 shrink-0 py-4 md:block"
          style={{
            top: "calc(var(--header-h) + var(--safe-top))",
            height: "calc(100dvh - var(--header-h) - var(--safe-top))",
          }}
        >
          <ul className="space-y-1.5">
            {PRIMARY.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "press flex items-center gap-3 rounded-[var(--r-inner)] px-3.5 py-3 text-[14.5px] transition-all",
                      active
                        ? "bg-[var(--card)] font-bold text-[var(--ink)] shadow-[var(--shadow-sm)]"
                        : "font-medium text-[var(--muted)] hover:bg-[var(--card)]/70 hover:text-[var(--ink)]")}
                  >
                    <item.icon
                      size={19}
                      strokeWidth={active ? 2.4 : 2}
                      style={{ color: active ? "var(--mint)" : undefined }}
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          <p className="mt-6 rounded-[var(--r-inner)] bg-[var(--card)] p-3.5 text-[11.5px] leading-relaxed text-[var(--muted)]">
            Everything stays on this device. Nothing is uploaded unless you set up sync yourself.
          </p>
        </nav>

        <main className="min-w-0 flex-1 pb-28 pt-2 md:pb-12">
          {/*
            Above the page, not inside it. A sync that has stopped is not news
            about protocols or stock, it is news about whether what you are
            looking at is the whole picture.
          */}
          <SyncNotice />
          {children}
        </main>
      </div>

      {/* Mobile tab bar */}
      <nav
        data-app-tabs
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] bg-[var(--card)]/95 backdrop-blur-xl md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="grid grid-cols-6">
          {PRIMARY.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="press flex h-16 flex-col items-center justify-center gap-1"
                >
                  <span
                    className="flex h-8 w-10 items-center justify-center rounded-[var(--r-pill)] transition-colors"
                    style={{ background: active ? "var(--mint-soft)" : "transparent" }}
                  >
                    <item.icon
                      size={20}
                      strokeWidth={active ? 2.5 : 2}
                      style={{ color: active ? "var(--mint-ink)" : "var(--faint)" }}
                    />
                  </span>
                  <span
                    className="text-[10.5px] font-semibold"
                    style={{ color: active ? "var(--mint-ink)" : "var(--faint)" }}
                  >
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

/**
 * The app mark.
 *
 * Points at the same generated /icon.svg the launcher and the home screen use,
 * rather than a hand-copied SVG, so the header can never drift from the icon.
 * The file is full bleed, so the rounded corner is applied here.
 */
function BenchMark() {
  return (
    /* eslint-disable-next-line @next/next/no-img-element -- a static icon, nothing for the image pipeline to do */
    <img src="/icon.svg" alt="" width={36} height={36} className="h-9 w-9 rounded-[12px]" />
  );
}
