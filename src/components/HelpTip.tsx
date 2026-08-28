"use client";

/**
 * A question mark that explains the control it sits next to.
 *
 * Two behaviours, one component, because a desktop and a phone are asking
 * different questions of the same widget.
 *
 * On a mouse it should appear under the cursor without a click, since hovering
 * to find out what something means costs nothing and clicking to find out is a
 * commitment. On a touch screen hover does not exist at all, so the only way in
 * is a tap, and a floating panel pinned to a 20 pixel target in a bottom sheet
 * is a panel half off the screen.
 *
 * So: hover opens it where a pointer is fine, a tap opens it everywhere, the
 * panel floats beside the icon on a wide screen, and on a narrow one it is
 * pinned above the sheet's footer where it can neither clip nor cover the Save
 * button. The `(hover: hover)` query is a question about the input device
 * rather than about the browser, which is why this is not user agent sniffing
 * and does not go stale.
 *
 * Deliberately not a tooltip in the `title` attribute sense. That is invisible
 * on touch, cannot be styled, cannot hold a link, and appears after a delay
 * long enough that most people have moved on.
 */

import { useEffect, useId, useRef, useState } from "react";
import { HelpCircle, X } from "lucide-react";
import { cn } from "@/lib/cn";

export function HelpTip({
  label,
  children,
  className,
}: {
  /** Names the thing being explained, for a screen reader and for the heading. */
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hoverable, setHoverable] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const panelId = useId();

  /*
   * Asked once on mount rather than read in render, because it touches
   * `window` and the first pass happens on the server during the build.
   * Watched afterwards: a tablet with a keyboard attached and removed changes
   * the answer without reloading the page.
   */
  useEffect(() => {
    const q = window.matchMedia("(hover: hover) and (pointer: fine)");
    setHoverable(q.matches);
    const onChange = (e: MediaQueryListEvent) => setHoverable(e.matches);
    q.addEventListener("change", onChange);
    return () => q.removeEventListener("change", onChange);
  }, []);

  // Escape and a click elsewhere both mean "I am done reading".
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };

    // Capture, so Escape closes this before the sheet it lives in closes too.
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <span
      ref={wrap}
      className={cn("relative inline-flex", className)}
      onPointerEnter={() => hoverable && setOpen(true)}
      onPointerLeave={() => hoverable && setOpen(false)}
    >
      <button
        type="button"
        aria-label={`What ${label} means`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
        // Keyboard users get it on focus, which is the closest thing they have
        // to hovering. Blur is left to Escape and to clicking away, so that
        // tabbing to a link inside the panel does not close it first.
        onFocus={() => setOpen(true)}
        className="press inline-flex h-5 w-5 items-center justify-center rounded-full text-[var(--faint)] transition-colors hover:text-[var(--ink)]"
      >
        <HelpCircle size={15} strokeWidth={2.2} />
      </button>

      {open && (
        <span
          id={panelId}
          role="note"
          /*
           * Two placements, for two reasons rather than for tidiness.
           *
           * With a pointer it floats beside the icon, anchored to it, so the
           * eye does not have to travel and the panel disappears the moment
           * the cursor leaves.
           *
           * On a phone it is pinned near the bottom of the viewport instead.
           * Anchoring to the icon there does not work: the panel is wider than
           * the space to either side of a control sitting mid-row, so it would
           * hang off one edge. `bottom-24` clears the sheet's own sticky footer,
           * which is the one thing a panel must not cover, since that is where
           * Save lives.
           */
          className={cn(
            "z-40 block rounded-[var(--r-inner)] border border-[var(--line)] bg-[var(--card)] p-3.5 text-left shadow-[var(--shadow-md)]",
            "absolute left-0 right-auto top-full mt-2 w-[min(20rem,calc(100vw-2.5rem))]",
            "max-sm:fixed max-sm:inset-x-3 max-sm:bottom-24 max-sm:top-auto max-sm:mt-0 max-sm:w-auto")}
        >
          <span className="mb-1.5 flex items-start gap-2">
            <span className="flex-1 text-[13px] font-bold text-[var(--ink)]">{label}</span>
            {/* Touch has no way to leave the panel other than a deliberate one. */}
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="press -mr-1 -mt-1 p-1 text-[var(--faint)] hover:text-[var(--ink)] sm:hidden"
            >
              <X size={14} />
            </button>
          </span>
          <span className="block space-y-2 text-[12.5px] leading-relaxed text-[var(--muted)]">
            {children}
          </span>
        </span>
      )}
    </span>
  );
}
