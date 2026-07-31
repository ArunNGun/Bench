"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { AlertTriangle, Info } from "lucide-react";

/** Named hues. Every coloured thing in the app picks from this set. */
export type Tone = "mint" | "grape" | "tangerine" | "sky" | "rose" | "leaf" | "neutral";

export const TONE_FG: Record<Tone, string> = {
  mint: "var(--mint-ink)",
  grape: "var(--grape-ink)",
  tangerine: "var(--tangerine-ink)",
  sky: "var(--sky-ink)",
  rose: "var(--rose-ink)",
  leaf: "var(--leaf-ink)",
  neutral: "var(--muted)",
};

export const TONE_BG: Record<Tone, string> = {
  mint: "var(--mint-soft)",
  grape: "var(--grape-soft)",
  tangerine: "var(--tangerine-soft)",
  sky: "var(--sky-soft)",
  rose: "var(--rose-soft)",
  leaf: "var(--leaf-soft)",
  neutral: "var(--sunken)",
};

export const TONE_SOLID: Record<Tone, string> = {
  mint: "var(--mint)",
  grape: "var(--grape)",
  tangerine: "var(--tangerine)",
  sky: "var(--sky)",
  rose: "var(--rose)",
  leaf: "var(--leaf)",
  neutral: "var(--faint)",
};

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("card", className)} {...rest}>
      {children}
    </div>
  );
}

/** Kept so existing pages keep working; a Panel is just a Card now. */
export const Panel = Card;

export function SectionLabel({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-center gap-3", className)}>
      <h2 className="eyebrow shrink-0">{children}</h2>
      <span className="h-px min-w-3 flex-1 bg-[var(--line)]" />
      {action}
    </div>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-[13px] font-semibold text-[var(--ink)]">
        {label}
      </label>
      {children}
      {hint && <p className="text-[12px] leading-snug text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

const control =
  "w-full rounded-[var(--r-btn)] border border-[var(--line)] bg-[var(--sunken)] px-3.5 py-3 " +
  "text-[15px] text-[var(--ink)] transition-all placeholder:text-[var(--faint)] " +
  "hover:border-[var(--faint)] focus:border-[var(--mint)] focus:bg-[var(--card)] focus:outline-none";

export function TextInput({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, className)} {...rest} />;
}

export function NumberInput({
  className,
  suffix, ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { suffix?: string }) {
  return (
    <div className="relative">
      <input
        type="number"
        inputMode="decimal"
        className={cn(control, "tnum pr-14 font-semibold", className)}
        {...rest}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] font-medium text-[var(--faint)]">
          {suffix}
        </span>
      )}
    </div>
  );
}

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(control, "cursor-pointer appearance-none pr-9", className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "min-h-20 resize-y", className)} {...rest} />;
}

type ButtonVariant = "primary" | "default" | "ghost" | "danger" | "soft";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--mint)] text-[var(--on-accent)] font-semibold shadow-[var(--shadow-pop)] hover:brightness-105",
  default:
    "bg-[var(--card)] text-[var(--ink)] font-medium border border-[var(--line)] shadow-[var(--shadow-xs)] hover:border-[var(--faint)]",
  soft: "bg-[var(--sunken)] text-[var(--ink)] font-medium hover:bg-[var(--line)]",
  ghost: "bg-transparent text-[var(--muted)] font-medium hover:text-[var(--ink)]",
  danger: "bg-[var(--rose-soft)] text-[var(--rose-ink)] font-semibold hover:brightness-95",
};

export function buttonClasses(variant: ButtonVariant = "default", className?: string) {
  return cn(
    "press inline-flex items-center justify-center gap-2 rounded-[var(--r-btn)] px-4 py-2.5",
    "text-[14px] disabled:pointer-events-none disabled:opacity-40",
    BUTTON_VARIANTS[variant],
    className);
}

export function Button({
  variant = "default",
  className, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={buttonClasses(variant, className)} {...rest} />;
}

/**
 * A button that navigates.
 *
 * Exists because `window.location.href = "/plan"` does not work in the Android
 * build: the static export writes `/plan/index.html`, so a request for `/plan`
 * with no trailing slash resolves to no file and the tap silently does nothing.
 * Next's Link knows the app's routing rules and gets this right.
 */
export function ButtonLink({
  href,
  variant = "default",
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={buttonClasses(variant, className)}>
      {children}
    </Link>
  );
}

/** A number with its label. The figure is the point, so it gets the weight. */
export function Stat({
  label,
  value,
  unit,
  tone = "neutral",
  hint,
  className,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  tone?: Tone;
  hint?: string;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1.5 flex items-center gap-1.5">
        {icon && <span style={{ color: TONE_SOLID[tone] }}>{icon}</span>}
        <span className="eyebrow">{label}</span>
      </div>
      <div
        className="tnum text-[26px] font-extrabold leading-none tracking-tight"
        style={{ color: tone === "neutral" ? "var(--ink)" : TONE_FG[tone] }}
      >
        {value}
        {unit && <span className="ml-1 text-[13px] font-semibold text-[var(--faint)]">{unit}</span>}
      </div>
      {hint && <div className="mt-1.5 text-[12px] leading-snug text-[var(--muted)]">{hint}</div>}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
  title,
  solid,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
  title?: string;
  solid?: boolean;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--r-pill)] px-2.5 py-1",
        "text-[11px] font-bold leading-none",
        className)}
      style={
        solid
          ? { background: TONE_SOLID[tone], color: "var(--on-accent)" }
          : { background: TONE_BG[tone], color: TONE_FG[tone] }
      }
    >
      {children}
    </span>
  );
}

export function Callout({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "warn" | "danger";
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const map = {
    info: { icon: Info, hue: "sky" as Tone },
    warn: { icon: AlertTriangle, hue: "tangerine" as Tone },
    danger: { icon: AlertTriangle, hue: "rose" as Tone },
  }[tone];
  const Icon = map.icon;

  return (
    <div
      className={cn("flex gap-3 rounded-[var(--r-inner)] p-3.5", className)}
      style={{ background: TONE_BG[map.hue] }}
    >
      <Icon size={16} strokeWidth={2.4} className="mt-0.5 shrink-0" style={{ color: TONE_FG[map.hue] }} />
      <div className="min-w-0 text-[13px] leading-relaxed" style={{ color: TONE_FG[map.hue] }}>
        {title && <div className="mb-0.5 font-bold">{title}</div>}
        <div className="opacity-90">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
  icon,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && (
        <div
          className="mb-4 flex h-14 w-14 items-center justify-center rounded-[var(--r-pill)]"
          style={{ background: "var(--mint-soft)", color: "var(--mint-ink)" }}
        >
          {icon}
        </div>
      )}
      <h3 className="text-[16px] font-bold text-[var(--ink)]">{title}</h3>
      {children && (
        <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-[var(--muted)]">{children}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}

/** Segmented control. Better than a select for two or three options. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  options: { value: T; label: string; hint?: string }[];
  value: T | null;
  onChange: (v: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex gap-1 rounded-[var(--r-pill)] bg-[var(--sunken)] p-1",
        className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.hint}
            onClick={() => onChange(o.value)}
            className={cn(
              "press flex-1 whitespace-nowrap rounded-[var(--r-pill)] px-3.5 py-2 text-[13px] transition-all",
              active
                ? "bg-[var(--card)] font-bold text-[var(--ink)] shadow-[var(--shadow-xs)]"
                : "font-medium text-[var(--muted)] hover:text-[var(--ink)]")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A circular progress dial. Used for the day's doses and for adherence, where a
 * ring reads as "how far through" faster than a number does.
 */
export function ProgressRing({
  value,
  size = 72,
  stroke = 8,
  tone = "mint",
  children,
  trackTone,
  label,
}: {
  /** 0 to 1. Values above 1 are clamped. */
  value: number;
  size?: number;
  stroke?: number;
  tone?: Tone;
  children?: React.ReactNode;
  trackTone?: string;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={label ?? `${Math.round(clamped * 100)} percent`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={trackTone ?? "var(--line)"}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={TONE_SOLID[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          className="animate-ring"
          style={
            {
              "--ring-circumference": circumference,
              transition: "stroke-dashoffset 600ms cubic-bezier(0.2,0.7,0.3,1)",
            } as React.CSSProperties
          }
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
      )}
    </div>
  );
}

/** A slim horizontal bar, for inline progress inside list rows. */
export function Meter({
  value,
  tone = "mint",
  className,
  label,
}: {
  value: number;
  tone?: Tone;
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-[var(--r-pill)] bg-[var(--line)]", className)}
      role="img"
      aria-label={label ?? `${Math.round(pct * 100)} percent`}
    >
      <div
        className="h-full rounded-[var(--r-pill)] transition-[width] duration-500"
        style={{ width: `${pct * 100}%`, background: TONE_SOLID[tone] }}
      />
    </div>
  );
}

/** A round tinted icon holder, the little coloured circle on every card. */
export function IconChip({
  tone = "mint",
  children,
  size = 38,
}: {
  tone?: Tone;
  children: React.ReactNode;
  size?: number;
}) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[14px]"
      style={{ width: size, height: size, background: TONE_BG[tone], color: TONE_FG[tone] }}
    >
      {children}
    </span>
  );
}
