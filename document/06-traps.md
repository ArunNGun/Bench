# Traps

Bugs that cost real time. Most were not in the app's logic. They were in the
seams, where the code looked right and the platform behaved differently from the
documentation.

## Capacitor and Android

**A bare module specifier cannot resolve in a WebView.** Health Connect was
completely dead because the adapter did `await import("@capgo/capacitor-health")`.
There is no bundler at runtime in the WebView, so that import can never resolve
and the failure is silent. Reach plugins through the global registry instead:

```ts
window.Capacitor.Plugins.Health
```

**Do not guess a plugin's API.** Every method name guessed for the health plugin
was wrong. Read the plugin's own `.d.ts` in `node_modules` and confirm on the
device. The real surface is `isAvailable`, `checkAuthorization`,
`requestAuthorization`, `readSamples({ dataType: 'weight' })`,
`openHealthConnectSettings`.

**A plugin's manifest merges into yours.** Removing the write call did not
remove `WRITE_WEIGHT`; the plugin declares it. Strip it with
`tools:node="remove"`.

**Edge to edge means the WebView starts behind the status bar.** On the test
device `env(safe-area-inset-top)` is 35px and is unconsumed by default, so the
header sits under the clock and the camera cutout. The CSS variables in
`globals.css` handle it, and `viewportFit: "cover"` in the root layout is what
makes `env()` non-zero at all. Without it, the insets silently report 0.

**Release APK resource names are obfuscated.** AAPT2 renames `res/*` to things
like `res/BW.xml`. Find PNGs by dimension, and resolve XML by dumping the
resource table.

## Static export

**`window.location.href = "/plan"` does nothing in the APK.** The export writes
`out/plan/index.html`, and with `trailingSlash: true` a request for `/plan`
resolves to no file. Use the `ButtonLink` component, which goes through Next's
router.

**Offline deep links used to render the home page.** Client-side navigation
caches RSC payloads, not HTML documents, so a cold offline load of `/stock` had
nothing to serve. The service worker now precaches every route document.

## Service worker, during development

**It will serve you stale code and you will misdiagnose it as your edit not
working.** This happened repeatedly across sessions: a component was verified as
"not rendering" when in fact the browser was running a bundle from before the
edit. The tell is markup that matches your new code while behaviour matches the
old. Unregister and clear caches (snippet in [04-runbook.md](04-runbook.md))
before concluding anything about client behaviour.

## Time

**DST.** `modalTimeOfDay` in `infer.ts` filtered midnight out before taking the
mode, which was wrong only in `America/New_York` and only across a DST boundary.
Always run the suite in more than one timezone.

**Clock skew, three separate times.** A negative elapsed interval read as
"recent" and permanently suppressed `backupDue`, `shouldOffer` and `backupNag`.
Device clocks move, and a timestamp in the future is normal. Decide explicitly
whether future means fresh or stale for each field, and test it.

## Import parsing

**Regex alternation order.** The XLSX cell matcher tried the paired form before
the self-closing form, so `<c/>` swallowed the following cell and every column
after it shifted. Silent, and the worst possible failure for an import.

**`\b` does not work around `µ`.** "500 µg" matched the grams branch and came
out a million times too large. Read the unit as the letters following the
number, do not rely on word boundaries with non-ASCII.

**`parseNumber` treated `e` as an exponent marker**, so "Wegovy 1.0 mg" parsed
wrongly. Match the first numeric literal rather than stripping non-numeric
characters.

## Data

**`importData` did not migrate.** Restoring an old backup produced rows with no
`profileId`. They loaded, and were invisible on every screen, because everything
filters by profile. Migration is now shared. When touching persistence, test
both that data survives **and** that it is reachable.

**`EMPTY_DATA.version` was hardcoded to 1.** `resetAll()` restored it, so every
export after a reset was stamped v1 while holding v5 data. `DATA_VERSION` now
lives in `types.ts` and `EMPTY_DATA` references it.

## SVG

**A mask inherits the transform of the element it is applied to.** Putting the
same `transform` on both a group and its mask scales the mask a second time, so
the content is clipped to the `k²` shape and comes out about two thirds of the
size requested, with no error. Keep the mask content untransformed and put the
transform on a wrapper outside it.

**librsvg silently drops masks on a small nominal canvas.** The identical markup
at `width="512"` renders correctly and at `width="108"` renders **completely
empty**. Compose at the source's own size and let sharp resize down.

**Measure the pixels.** Both of the above rendered without warnings and looked
plausible. They were caught only by reading the output buffer and comparing the
mark's bounding box against what was asked for.

## Browser APIs that quietly do nothing

Found while testing the landing page animations, and worth generalising:

- **IntersectionObserver callbacks never fired** in one test browser. Anything
  gated behind an observer stayed at `opacity: 0`, which would have shipped a
  blank page below the fold.
- **`requestAnimationFrame` is throttled to a standstill** in a hidden or
  background tab. A rAF-gated throttle can stall indefinitely.
- **`window.scrollTo` did not dispatch scroll events** in that same browser,
  though `scrollY` and the layout both updated.

The lesson is not about those APIs specifically. It is that if the failure mode
of a mechanism is *invisible content*, it needs a fallback that cannot deadlock.
`Reveal.tsx` uses a scroll listener, a rect read on mount, and a slow interval,
plus a `<noscript>` opt-out.

Related: a reveal condition that requires the element to still be **in** view
will strand anything the reader flew past between two events, via a fast flick,
the End key, or an anchor jump. Test the top edge only.

## Contrast

White text on the dark palette's mint (`#2dd4bf`) is **1.86:1**. Every accent in
the dark palette is a light pastel. Use `--on-accent`, and check the ratio for
both themes rather than assuming a brand colour behaves the same in each.

## Bulk edits over prose

A sweep to remove em dashes was run with a cleanup rule of
`re.sub(r",\s*\.", ".", s)`, which ate every `, ...spread` in the codebase and
produced 75 TypeScript errors. Recovering that took longer than the original
task.

The same sweep also:

- welded comment lines together, because the `\s*` in a `\s*\u2014\s*` pattern
  matched the newline too, leaving `text, * continuation` inside block comments;
- turned the lone `\u2014` placeholder glyph, used to mean "no value here",
  into a literal `", "` in numeric readouts
  and in **CSV test fixtures**, where `"a,,c"` silently became `"a, c"`;
- left about twenty five comma splices in user-facing copy;
- missed `manifest.webmanifest` entirely, because the glob only covered source
  extensions, so the app's installed name kept its dash.

If you must sweep: bound the regex to a single line, never let `\s` cross a
newline, review the diff, and run the full suite plus a build afterwards.
