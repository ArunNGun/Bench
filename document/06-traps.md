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

## Containers

- **A spray bottle is a `Vial` with `container: "spray"`.** Anything that asks
  which container a dose comes from has to say which kind it means.
  `pickVialForDose`, `stockFor` and `marksForDose` take one and default to
  `"vial"`, which is what every row was before sprays existed.
- **Never let a spray answer a syringe question.** Marks, units, barrel scale
  and injection site are all meaningless for a nasal dose, and a bottle has a
  concentration so it will happily produce numbers for all of them. `draw` in
  the log sheet is gated on the route for exactly this reason.
- **A spray carries no `budAt`, on purpose.** If you find yourself adding one,
  read the decision first. The same goes for making presses remaining look
  precise.

## Records that vanish

- **A collection emptying itself is a real failure mode here, not a
  hypothesis.** It has happened twice, both times to the same three bottles of
  water, both times found days later by accident. The first cause was an older
  build naming the fields it wrote; the second is still unknown.
- **The storage layer keeps a copy** when a write empties a collection or takes
  most of it. Settings shows it and offers the rows back. If you are chasing a
  loss, look there first: the previous document may still be sitting under
  `peptide-log-v1:rescue`.
- **Do not raise the bar by lowering the threshold.** The check has to stay
  quiet for ordinary deleting, or it becomes noise and gets dismissed by habit,
  which is worse than not having it.
- **Putting rows back is a union.** Never restore the whole document from the
  copy: days of doses can sit between the loss and the repair, and a wholesale
  restore trades one silent loss for another.

## Reminders

- **The web has no way to raise a notification at a set time while it is
  closed.** Do not spend an afternoon looking. Notification Triggers, the API
  written for exactly this, was abandoned by Chrome before it shipped and is
  filed under "no longer pursuing". Periodic Background Sync decides its own
  cadence, in hours. Push needs a server. This is why reminders are an Android
  feature and the browser is offered a calendar export instead.
- **Never reconcile alarms one at a time.** Cancel every pending one and re-arm
  the whole set from `remindersFor`. Editing a phase, pausing a protocol or
  switching profile moves many doses at once, and incremental reconciliation is
  how a notification survives for a dose that no longer exists.
- **A dose logged early has to stop its own reminder.** Both the Today page and
  the reminder list go through `unloggedDoseTimes` for this reason. If one of
  them ever grows its own idea of what counts as covered, the phone will ask for
  a dose that is already in the leg.
- **In an `.ics` file, do not write UTC.** A dose at seven o'clock is seven
  o'clock, and UTC pins it to an instant that drifts by an hour twice a year.
  Floating local time, no `Z` and no `TZID`, is the correct form and matches how
  `schedule.ts` reasons. A `TZID` without a `VTIMEZONE` block is not valid, and a
  `VTIMEZONE` naming only today's offset is wrong in exactly the way this avoids.
- **Do not take `USE_EXACT_ALARM`.** It is granted without asking, and Google
  Play restricts it to apps whose whole purpose is alarms. Taking it to save one
  tap makes the app unpublishable there. `SCHEDULE_EXACT_ALARM` is the
  requestable form and is what the manifest declares.

## Cascade layers

**An unlayered rule in `globals.css` beats every Tailwind utility, whatever the
specificity.** `@import "tailwindcss"` puts utilities in `@layer utilities`, and
in the cascade unlayered CSS wins over layered CSS before specificity is even
considered. So a plain `button { font: inherit }` written in `globals.css`
overruled `text-[14px]` and `font-medium` on every button in the app.

It looked harmless and was a duplicate: Tailwind's own preflight already sets
`font: inherit` on form controls, in `@layer base`, exactly so that a utility
can override it. Repeating it outside a layer inverted that.

The symptom was a button in the header not matching the links beside it. The
diagnosis came from measuring rather than reading: an anchor and a button
carrying the same two classes computed to 14px/500 and 16px/400.

If a utility class is being ignored and the markup looks right, check whether
something unlayered is setting the same property. Put project CSS in
`@layer base` if it needs to be overridable, or leave it to preflight.

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

## A record nobody wrote, and a rule that trusted it

`settings.sync` holds the address, the username and `remoteSeenAt`, which is
the version of the server's copy this device last agreed with. It is written in
exactly one place: the panel in Settings, when somebody signs in there.

A hosted build has nobody who does that. They arrive through the server's own
login page and unlock in front of the app, and never open that panel. So
`setRemoteSeenAt` found no record, returned early, and `remoteSeenAt` stayed
null permanently.

Null is how the app says "this device and this server have never agreed", which
is true exactly once and was now true always. Every run looked like first
contact. Once the account became the copy that counts, every run therefore
pulled the server's copy over the top of the device, and anything logged since
the last successful push was destroyed within seconds of being typed.

Two things made it survivable rather than a catastrophe. The rescue guard
caught every one of those writes, so nothing was actually lost. And it happened
instantly and repeatedly, which is the one kind of data loss that gets reported
on the first day instead of found months later.

Both halves are fixed and either alone would have been enough, which is why
both are there.

- The runner creates the record when there is not one, rather than giving up.
- Adopting the account is refused while this device holds anything unsent. The
  leftovers that case exists for were read from disk at startup and are not
  dirty; an edit made seconds ago is, and is never adopted over.

The general lesson, worth more than the specific bug: **a piece of state that
only one screen ever writes is a piece of state that some path will find
missing.** The early return that hid it read as defensive. It was the failure.

## A click is delivered to an ancestor, and it closed the sheet

Reported from outside: select the text in a dose field by dragging, release a
few pixels past the edge of the sheet, and the sheet closed and took everything
typed with it. No confirmation, no way back.

The backdrop closed on `onClick` and the card stopped propagation, which reads
as airtight and is not. A `click` is delivered to the nearest common ancestor of
where the button went down and where it came up. Press inside the input, release
on the backdrop, and that ancestor is the backdrop itself, so its handler fires
with `e.target` genuinely equal to `e.currentTarget`. The card never saw the
event to stop.

`useBackdropDismiss` requires the press to both start and end on the backdrop.
Pointer events rather than mouse, so a finger dragged off the edge of a phone
behaves the same. The card's `stopPropagation` came out with it: two mechanisms
for one job is one more place to look when it goes wrong.

The general lesson: **`e.target === e.currentTarget` answers where a click
landed, not where the gesture happened.** Anything that dismisses on a click
outside itself has this bug until it asks about the press as well as the
release.

## A number field that could not be emptied

Every caller of `NumberInput` holds a number and turns the field's text into one
with `Number(...)`. `Number("")` is 0, so clearing a field showing 0 stored 0,
React rendered "0" again, and the nought could not be removed. Reaching 250
meant typing it after the nought and getting 0250.

Fixed in the component rather than at twenty call sites, by keeping the text as
typed and showing it for as long as it still means the number the caller holds.
Empty means zero, so an empty box over a zero is truthful and stays. The rule is
in `src/lib/calc/numberField.ts` with its tests, because it is one line of code
and a paragraph of reasoning.
