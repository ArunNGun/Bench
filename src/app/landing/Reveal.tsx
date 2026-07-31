"use client";

import { useEffect, useRef, useState } from "react";

/** Reveal once the top edge has come this far up the viewport. */
const TRIGGER = 0.88;

/**
 * Fades its children up as they scroll into view.
 *
 * Deliberately a scroll listener and a rect check rather than an
 * IntersectionObserver. The observer is the tidier API, but it is also a single
 * point of failure that fails in the worst possible direction: if its callback
 * never arrives, every element it was guarding stays at `opacity: 0` and the
 * page is blank below the fold. That is not hypothetical, it happened in
 * testing. A rect read on mount plus a passive scroll listener cannot get
 * stuck, because the state is recomputed from the layout every frame the user
 * scrolls rather than pushed once by the browser.
 *
 * `prefers-reduced-motion` is handled in globals.css, so the markup and the
 * behaviour here are the same either way.
 *
 * Everything is torn down on the first reveal. These never animate out.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  /** Milliseconds, for staggering siblings. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let timer = 0;

    function teardown() {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
      if (timer) clearInterval(timer);
      timer = 0;
    }

    // Read straight from layout on every scroll event rather than deferring to
    // requestAnimationFrame. rAF is throttled to a standstill in a hidden or
    // background tab, and a throttle that can stall is a throttle that can
    // leave the page blank. A handful of rect reads per scroll is cheap, and
    // the listener removes itself the moment it has fired.
    function check() {
      // Only the top edge is tested. Requiring the element to still be on
      // screen would strand anything the reader flew past between two events:
      // a fast flick, End, or a jump to an anchor all land with the element
      // above the viewport, and it would then stay invisible for good. Once it
      // has come far enough up, it is shown and stays shown.
      if (el!.getBoundingClientRect().top >= window.innerHeight * TRIGGER) return false;
      setShown(true);
      teardown();
      return true;
    }

    // Anything already on screen should not wait for a scroll that may never come.
    if (check()) return;

    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);

    // The scroll listener drives the effect; this makes sure it happens at all.
    // Scroll events can be missed for reasons outside this component, and the
    // cost of missing one is content stuck at opacity 0 forever. A quarter
    // second poll against the same condition cannot deadlock, is imperceptible
    // when the listener is working, and stops the moment either one fires.
    timer = window.setInterval(check, 250);
    return teardown;
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal${shown ? " reveal-in" : ""}${className ? ` ${className}` : ""}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
