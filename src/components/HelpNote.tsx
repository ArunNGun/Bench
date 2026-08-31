"use client";

/**
 * A question mark that explains the control it sits next to, by opening a note
 * underneath it rather than floating over it.
 *
 * The first attempt was a floating panel, and it could not work here. The log
 * sheet scrolls, and CSS does not let a box scroll on one axis and overflow on
 * the other: setting `overflow-y: auto` computes `overflow-x` to `auto` as
 * well, so the sheet clips its own children sideways. An absolutely positioned
 * panel anchored to an icon mid-row was therefore cut off at the sheet's edge,
 * whatever direction it was pointed in. A portal would escape the clip, at the
 * cost of measuring the icon and re-measuring it on every scroll and resize.
 *
 * Opening in the flow avoids the whole problem instead of working around it.
 * The note cannot be clipped, because it is inside the box that would do the
 * clipping. It cannot cover the Save button, because it never overlaps
 * anything. It scrolls with the thing it explains, and it needs no measuring,
 * no portal and no second placement for touch.
 *
 * What that costs is hover. Content that moves when the pointer passes over it
 * is worse than content that waits to be asked, so this opens on click, on
 * every device, which is also the only thing touch could ever do.
 *
 * Deliberately not the `title` attribute, which is invisible on touch, cannot
 * be styled and cannot hold a link.
 */

import { useEffect, useId, useState } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/cn";

export function HelpNote({
  label,
  control,
  children,
  className,
}: {
  /** Names the thing being explained, for a screen reader and for the heading. */
  label: string;
  /** The control this explains. Rendered on the same row as the question mark. */
  control: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const noteId = useId();

  // Escape closes it, as it would any transient panel. Captured, so it does not
  // reach the sheet this lives in and close that instead.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        {control}
        <button
          type="button"
          aria-label={`What ${label} means`}
          aria-expanded={open}
          aria-controls={open ? noteId : undefined}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "press inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors",
            open ? "text-[var(--ink)]" : "text-[var(--faint)] hover:text-[var(--ink)]")}
        >
          <HelpCircle size={15} strokeWidth={2.2} />
        </button>
      </div>

      {open && (
        <div
          id={noteId}
          className="rounded-[var(--r-inner)] bg-[var(--sunken)] p-3.5"
        >
          <p className="mb-1.5 text-[13px] font-bold text-[var(--ink)]">{label}</p>
          <div className="space-y-2 text-[12.5px] leading-relaxed text-[var(--muted)]">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
