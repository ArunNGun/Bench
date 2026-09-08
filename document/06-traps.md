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

## A field the form offered and the record had nowhere to put

Changing a logged dose from a 0.3 mL barrel to a 0.5 mL one did not stick. The
report read as a save bug, and the save was working perfectly: `DoseLog` had
`syringeScale` and no barrel. U-100 in, U-100 out, an identical record, and
reopening it ran `SYRINGES.find((s) => s.scale === ...)`, which is the first
entry of that scale and not the one anybody chose. Every U-100 dose in the
history reopened as the 0.3 mL half-unit barrel, so the field had been lying to
everyone all along and only became visible when somebody tried to change it.

Two lessons. **A control that writes to nothing is worse than an absent
control**, because it reads as a promise. And **when a save appears to fail,
check the shape of the record before the code that writes it**: a field the type
does not have cannot be dropped by any bug, it was never there.

`syringeId` now carries the barrel and `syringeScale` stays, since the Log and
the CSV read it. Old records know only a scale, so `syringeForLog` prefers this
person's own default barrel when the scale matches, which is a better guess than
the head of a list.

## A schedule that is rewritten backwards, and the dose it invents

Reported as a duplicate row. A dose at 07:00 was taken and logged, the schedule
was moved to 22:30, and the next morning the compound appeared twice on Now: the
correct 22:30 dose under Later today, and a row marked Overdue that read as the
old 07:00 entry left behind.

It was not that entry. It was yesterday, and it did not exist until the edit. A
protocol stores one schedule, the current one, and past days are not recorded as
events, they are recomputed by replaying that schedule over dates that have
already been. So moving the time did not only change the future: yesterday
stopped having had a 07:00 dose and started having had a 22:30 one, fifteen
hours from the log that was meant to cover it.

**The general shape is worth more than the fix.** Anything derived by replaying
current configuration over past dates is a claim about the past made out of
present state, and it is only as true as the assumption that the configuration
never changed. The past has no way to object.

Two smaller things came with it. **A card that shows a relative time hides which
instant it means**, and "was due 9 hours ago" is exactly what let a retro-dated
slot be mistaken for a different dose entirely; the report would have been much
harder to diagnose without the arithmetic. And the honest answer to a slot with
no evidence is **silence, not credit**: `slotIsKnowable` does not mark the dose
taken, it declines to ask about it.

## Nearest is not the right way to match a log to a dose

The same report, second half and unrelated cause. Eleven doses scheduled at
22:30, each taken the following morning at 07:05, nothing missed. Adherence read
10 of 11.

Each scheduled dose took the **nearest** unclaimed log. A log at 07:05 sits 8.5
hours after the dose it belongs to and 15.5 hours before the next one, so the
first dose took the *second* morning's log, that dose took the third, and the
theft ran down the whole line until the last dose found nothing inside its
tolerance.

Nearest is the intuitive rule and it is wrong here. Both sides are sorted and a
log is eligible for a contiguous run of doses, so handing each dose the
**earliest** log still in reach is the standard greedy for this shape and leaves
the most doses matched. It is also linear rather than quadratic, because logs
are then consumed strictly left to right.

**The oracle was part of the problem.** The property test compared the optimised
matcher against a brute-force reference, and that reference had been written by
copying the original algorithm verbatim. It therefore agreed enthusiastically
with the defect for as long as it existed. A reference implementation is worth
having, but it has to state the rule independently, or it only proves that two
copies of the same idea agree.

## A drawing that thins its own detail is worse than no drawing

The picker offers the 0.3 mL barrel twice, once with half-unit marks and once
with whole ones, and the marks are the only difference between the two options.
Both syringe drawings had the same rule for a barrel too fine for its width:
skip marks until the rest fit.

That is silent, and it inverts the fact the picture exists to carry. The finer
barrel crosses the threshold first, so it gets thinned and the blunter one does
not, and the finer instrument is drawn with **fewer** marks than the blunt one
beside it. A picture that is merely unclear is a nuisance. This one was
confidently wrong.

The rule is now to magnify: draw the first whole numbered divisions that fit, at
true spacing, and say on the drawing that it is a stretch. `barrelTicks` in
`src/lib/calc/barrel.ts` owns it for both syringes, and a test asserts the
property the old rule broke.

**A drawing computed in viewBox units is not computed in pixels.** The first
version worked out spacing against a fixed viewBox of 232 while the card
stretched it to about 300, so it magnified a barrel that had room to draw in
full. Any judgement about what an eye can separate has to be made in the units
the eye sees, which means the component has to be told the width it will really
occupy rather than inferring one.

The old fallback also hid a second bug for as long as it was never reached: it
doubled the step, and on a barrel numbered every five a step of two became four,
which never lands on five, so the marks meant to carry the numbers stopped being
drawn at all.

## A key that ends in the word "other"

`translate` decides a key is a plural family by asking whether `${key}_other`
exists, and the parity test derives the list of families the same way, from
every English key ending in `_other`. Both are looking at spelling, because
nothing else in the file says which keys are families and which are not.

So `install_ios_other`, a perfectly ordinary key holding one sentence about
Safari, was read as the `other` form of a family called `install_ios`. The test
then asked Slovenian for the four forms that family would need, found one, and
failed with a message about grammar for a string that has no number in it.

The fix was to rename the key. It is worth knowing that the suffix is reserved:
a key whose last word happens to be `other`, `one`, `two`, `few` or `many` will
be mistaken for part of a family, and the failure arrives in a test about
plurals rather than anywhere near the key itself.

## Keys nothing renders

The dictionary reached 1236 keys with 246 of them unused. They were the
original set from the first translation pass, and each screen that got wired up
afterwards introduced more specific keys and left the old ones behind. Nothing
failed: an unused key breaks nothing, type checks fine, and the parity test was
perfectly happy to demand four translations of a string no screen would ever
show.

The cost lands on whoever is translating. A person working down the file has no
way to tell which strings will be seen and which are ghosts, and a fifth of the
work was ghosts.

`src/lib/i18n/unused.test.ts` reads the source and fails when a key has no call
site. Two things about how it reads:

- A key reached as `` t(`reminders_lead_${minutes}`) `` never appears in full,
  so the prefix is collected and everything under it counts as used.
- The regex for that needs a lookbehind. `get(` ends in `t(`, so without one
  the prefix `p` gets collected from `` get(`p${n}`) `` in an unrelated test,
  and every key beginning with p is marked used. That is most of them.

The test asserts both of those on a known key before it asserts anything about
the dictionary, so a check that has quietly stopped checking fails loudly.

## A key that starts with a plural family's name

The trap above was a key ending in `_other`. This is its mirror image and it
cost the same ten minutes.

`settings_backup_saved` is a plural family: `_one` and `_other` in English, four
forms in Slovenian. Adding `settings_backup_saved_plain` for the case with no
count looked harmless. The parity test collects every key beginning with
`settings_backup_saved_`, found three forms where the grammar wants two, and
failed talking about plurals for a key that has nothing to do with them.

The family prefix is reserved for the family. A sibling key needs a name that
does not start with it, so `settings_backup_written`.

Both halves of this come from the same decision: nothing in the file marks
which keys are families, so the code reads spelling. That is worth keeping,
because the alternative is a second structure to keep in step with the first,
but it means the suffix and the prefix are both load-bearing.

## A plan in bands, before it starts

`phaseSpanAt` returned null for any moment before the protocol's start date.
Six call sites read it the same way:

```ts
phaseSpanAt(protocol, now)?.schedule ?? protocol.schedule
```

so null sent every one of them to the protocol's own schedule. For a plan built
in bands that schedule governs nothing. It is whatever the top of the form
happened to say when the bands were added, and each band overrides all of it.

Reported from a real record: a plan starting the following Monday, Monday to
Friday at 06:30, drawn on the Plan page as **every 4 days at 09:00**. Both
numbers came from the leftover. The same fallback also had
`protocolDosesPerWeek` answer 1.75 instead of 5, and the Stock page asks that
function how fast a shelf empties, so a reorder date moved. `scheduledDoseMcg`
read the same way, so a first band stepping up from the protocol's figure would
have shown the wrong milligrams as well.

The fix is that before the start the phase in force is the first phase, which
is the one that will govern when it begins.

What made it hard to see is that the half of the feature that matters was
right the whole time. `protocolNextDoseTime` said Monday 06:30, because dose
times come from `phaseSpans`, whose first span begins at `startedAt` and never
consults `phaseSpanAt`. The app knew when the dose was due and described it
wrongly on the same card.

The general shape is worth remembering: a function that returns null for "not
applicable yet" hands every caller the job of deciding what that means, and
`?? somethingPlausible` is what they all reach for. If there is a right answer,
return it.

## The calc layer writing English

`describePhase` returned `{ id, label, detail }` and `dueStatus` returned
`{ state, label }`, where the labels and details were finished English
sentences. So `src/lib/calc`, which the layout note calls pure logic with no
React and no I/O, was also the author of the words on the dashboard, and those
words could not be translated without passing a language into a pure function.

The tell was already in the tests: every one of them asserted the id or the
state and none of them asserted a label. The id was the fact and the sentence
was decoration sitting next to it.

Both now return only the id. The page keeps a `Record<PhaseId, TranslationKey>`
and looks the words up. `dueStatus` needed one extra distinction, because
`state: "none"` covers both a paused protocol and one with nothing scheduled,
which are the same to the maths and different to a reader, so the name is its
own field rather than a second reading of the state.

The rule this leaves: a module under `src/lib/calc` may return an id, a number
or a date. If it is about to return a sentence, the sentence belongs to
whoever renders it.

## Finding the English a translation pass missed

Four rounds of this were needed, each after a user found something. The
searches that failed all looked for text in the shapes text usually takes:
between JSX tags, or in a `label=` or `title=` attribute. The strings that
survived were in none of those shapes:

- returned from a plain function, like `greeting()` or `describeSplit`
- sitting in a ternary that is assigned rather than rendered
- a **default parameter**, like `label = "Times of day"`
- inside a template literal built for an `aria-label`
- returned from `src/lib/calc`, as a label beside an id

The check that would have found all of them in one pass is much blunter, and
it is about the file rather than the string: **a component under `src/app` or
`src/components` that renders anything and does not import `useLang`**. On the
last round that listed exactly the offenders, `DoseMarks`, `PkChart`,
`Syringe`, `HelpNote` and `CheckInEditor`, and the only files it left were the
ones with no words in them at all: the runners, the service worker, the layout
and the UI primitives.

```bash
for f in $(find src/app src/components -name '*.tsx' ! -name '*.test.tsx'); do
  grep -q 'useLang\|translate(' "$f" || echo "$f"
done
```

Run that before claiming a translation pass is finished.

## A shelf with something on it that reports nothing

The Now card said **0 doses** for KPV while the Stock page, one tap away, said
2.85 mg and eleven doses left in the same vial. Both were right. The vial was
one day past its beyond-use date, `vialUsable` excludes it, and `stockFor`
counts only usable vials.

Nothing was wrong with the arithmetic. What was wrong is that the screen where
the number matters gave no reason, so the two screens contradicted each other
and the reader had to guess which one was broken.

`Stock` now carries `dosesExpired`, and the card shows that count with a past
date marker beside it rather than a zero. The first attempt showed the zero and
explained it, which is worse: zero is true of what can go in a syringe and
false about what is in the fridge, and the reader comparing the two screens
still had a contradiction to resolve.

In doses rather than in mass because the card speaks in doses everywhere else.
Kept out of `dosesRemaining` on purpose: supply days and the reorder date are
answers about what can actually be drawn, and a vial past its date is not that.

Deliberately excludes finished and discarded vials. Neither is something the
reader is being denied, and explaining a zero with one of those would be
explaining it with the wrong vial.

The general shape: when a screen filters something out, the filter is invisible
and the number is not. If a zero can be caused by a rule rather than by an
empty shelf, the rule has to say so where the zero is.
