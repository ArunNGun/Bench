# Decisions, and why

Each of these was a real choice with a real alternative. Changing one is fine,
but know what you are giving up.

## No backend of ours

There is no server, no account, no analytics, no error reporting. Nothing the
project operates ever receives a user's data, and there is nowhere for it to
leak from, because there is nowhere for it to be.

This was originally stated as an absolute: the application code makes no network
requests except a single fetch of `/version.json` at startup on web, and
`grep -r "fetch(" src/` was the evidence.

The absolute form did not survive contact with the most-asked feature request,
which was the same data on a phone and a laptop. The compromise:

- The default is unchanged. A fresh install has no account, talks to nothing,
  and still makes exactly one call.
- Sync exists, is off, and stays off until someone types in the address of a
  server they host themselves. There is no hosted option and no default server,
  deliberately, because offering one would make this project the custodian of
  other people's dose histories.
- What goes up is sealed in the browser first, with a key derived from a
  password that never leaves it. The machine holding the data cannot read it.

So the claim is no longer "the code cannot reach a network" but "we operate
nothing, and anything you switch on is yours and encrypted". Weaker, and still
true, which the first one would no longer have been.

`grep -r "fetch(" src/` is still the evidence and still short. Two hits, both
accounted for above. A third needs an argument.

The cost is accepted and stated plainly in the app: nobody can read the user's
data, and nobody can recover it either. Sync does not change that. A forgotten
password makes the server's copy unreadable to everyone, including whoever runs
it.

## Reminders, on the device only

Reminders were declined at the start, in the owner's own words: "do all except
the reminder I don't need that." They were listed as out of scope in three
places, and they stayed out for a year.

They came back because someone else asked. A user on Discord filed it as a
feature request, and the answer this time was yes, on conditions. Recording the
reversal here rather than quietly deleting the old line, because the next person
to read those documents deserves to know a rule was changed rather than ignored.

What was allowed, and what was not:

- **Local reminders are in.** The alarm is handed to Android's own
  `AlarmManager` and raised by the operating system. No network call, offline,
  and nothing leaves the phone. The privacy claim is untouched.
- **Push is still out**, and this is not a detail. Push needs a service to send
  it and a server to decide when, which is the backend this project does not
  have. A reminder that arrives from somewhere else is somewhere else knowing
  your schedule.
- **Off until switched on**, and the permission is asked for at that moment
  rather than at first launch. An app that asks on startup teaches people to
  refuse.

### The web cannot do this, and the app says so

A browser cannot raise a notification at a set hour while it is closed. The API
written for exactly this, Notification Triggers, was abandoned by Chrome before
it shipped and is filed under "no longer pursuing"; Periodic Background Sync
leaves the cadence to the browser and deals in hours rather than a time; Push
needs the server that is ruled out above.

So the switch appears on Android and the browser is told plainly what it cannot
do, rather than being given a switch that silently does nothing. What the
browser gets instead is an export of the dose schedule as a calendar file, each
dose an event carrying its own alarm. The reminding is done by the one piece of
software on every device that is already good at it.

Two details of that file are deliberate and look wrong at a glance. Every dose
is written out rather than expressed as a recurrence rule, because RRULE cannot
carry phases, weeks off, or a plan that ends, and encoding them would be a
second implementation of the schedule and therefore a second answer. Times are
floating local times with no timezone and no trailing Z, because that means
seven o'clock wherever you are, which is what `schedule.ts` already means; UTC
would drift every dose by an hour twice a year, and a TZID needs a VTIMEZONE
block whose transition rules cannot be derived without shipping a timezone
database.

### Discreet by default

A notification reading "BPC-157 250 mcg" sits on a lock screen in front of
whoever is beside you. The default says "Bench" and "A dose is due" and nothing
else. Naming the compound is one setting away and is the user's decision to
make, not ours to make for them.

The same setting governs the calendar export, where it matters more: a calendar
that syncs to Google or Apple carries whatever is in the event title to them,
which nothing else in this app does. The panel says so, in those words, and only
when the setting is on.

## A nasal spray bottle is a vial

The obvious reading of `diluent.ts` is that a new container gets a new
collection: bottles of water are kept apart from vials, with a paragraph
explaining why. The opposite conclusion is right here, and for the same reason.

Water has no milligrams. A bottle of it wearing the vial type would be a
category error carried into concentration, doses remaining, cost per milligram
and the date the shelf runs dry, and every one of those would have to remember
to exclude it. Ten places to remember is ten places to forget.

A spray bottle is a mass dissolved in a volume. That is what a vial is. So it is
a `Vial` with `container: "spray"`, and it inherits concentration, depletion,
cost per dose, days of supply and the whole of `stockFor` without a line of new
arithmetic. A separate collection would have meant a second implementation of
all of it, which is the same trap read backwards.

### What it does not inherit is the syringe

The one place a shared type can go quietly wrong is a bottle being handed to a
syringe. `pickVialForDose`, `stockFor` and `marksForDose` take a container and
default it to `"vial"`, so nothing that already asked those questions had to
learn a new one, and a spray cannot become the answer to "which vial does this
injection come from" even when it is the only stock of that compound there is.
`marksForDose` passes `"vial"` explicitly rather than by omission, because marks
are a reading off a barrel and a nasal dose never meets one.

### Two things it deliberately will not say

**No beyond-use date.** The twenty-eight days used for a punctured vial comes
from a convention about multi-dose vials, and there is no such convention for a
preservative-free solution in a pump that one person carries in a pocket and
another keeps in a fridge. The day it was filled is recorded and the judgement
is left where it belongs. Saying nothing at all would imply it keeps
indefinitely, so the fill date is shown rather than hidden.

**Presses remaining is an estimate and says so.** Solution is lost in
preparation and in transfer, priming delivers less than a dose, and the last
millilitre cannot be lifted by the pump. The figure reads high by an unknowable
amount, so the word "about" is in the interface and marking a bottle empty by
hand stays available. A precise count would be the same class of error as an
invented half-life.

## A write that destroys records keeps a copy

Twice a collection has emptied itself with nobody doing anything. Both times it
was three bottles of water, both times it was found days later by accident, and
both times the rows were recoverable only because an export happened to exist
from before it happened. The second time, the only surviving copy was a file the
user had saved for an unrelated reason.

The cause of the second one is still not known, which is exactly why this exists.
Archaeology after the fact depends on luck. The app had no opinion about a write
that destroys records, so a write that emptied a whole collection went through as
quietly as one that added a dose, and the only witness was a file.

So the storage layer now compares what is about to be written against what it
last wrote, and when a collection has emptied or lost most of itself, it sets the
previous document aside under a second key before letting the write through.

Three choices inside that are worth defending.

**It does not refuse the write.** Deleting your own records is allowed, and this
layer cannot tell a deletion that was meant from one that was not. Refusing would
mean the app arguing with someone emptying their own fridge. Keeping a copy costs
nothing and decides nothing.

**The bar is high, deliberately.** A collection going to nothing, or losing more
than half of itself in one write, with lists of two or three exempted because on
a short list any single deletion is a large fraction. Deleting one dose, one
vial, one protocol stays silent. A warning that fires on ordinary editing is a
warning that gets ignored, which would leave the app worse off than it was.

**Putting rows back is a union, not a restore.** Days can pass before anyone
notices, and replacing the document wholesale would trade one silent loss for
another. Only the collections that shrank are touched, only rows the live
document does not already have are added, and where both sides have a row the
live one wins, because a bottle drawn down since is the more current of the two.

The copy lives under its own key rather than inside the document. Inside, it
would ride along in every export and every sync payload, and a copy of your data
folded into your data grows without anyone deciding that it should.

## A symptom id is never renamed

Appetite became Physical hunger and food noise was added beside it. The id
stayed `appetite`.

That is the whole decision. Every rating anyone has ever saved is keyed by these
ids, and every screen draws only what `SYMPTOMS` mentions, so an id that stops
appearing in that list takes a year of ratings off every screen while leaving
them in the file. Present and invisible is the failure this project already has
a migration and a trap entry about.

What the axis asks about did not change, only what it is called, so the history
carries forward meaning what it always meant. A rename that did change the
question would need a new id and the old one kept as something the app reads
back but no longer offers, which does not exist yet and should be built the day
it is actually needed.

`src/lib/calc/checkins.test.ts` asserts the id and its label, so the promise is
held by a test rather than by whoever remembers this page.

### Three directions, not two

`higherIsBetter` was a flag with two states standing in for three. Food noise is
the first axis whose good end is the bottom: five is a day spent thinking about
food, and nobody on any protocol is aiming for more of that.

`ratingTone` read a missing flag and a false one as the same thing, so writing
`false` would have produced no colour rather than an inverted one. Worse,
`lowestRatedTone` marks a day by its lowest rating, which for a downward axis is
its best moment: a day entirely preoccupied with food would have been painted
green. Both now turn a rating into a score, where five is always the good end,
and compare those.

Physical hunger keeps no direction at all, and that is deliberate and unchanged:
suppressed hunger is the point of a GLP-1 and a problem on a bulk, so the app
charts it and declines to judge. Food noise is not that kind of question.

## Health Connect is read only

Originally it read weight and wrote it back. The user asked for the write path
to be removed: "our app only reads from android health sync but it should not
write back specially weight values."

Removing the call was not enough. The plugin declares
`android.permission.health.WRITE_WEIGHT` in its own manifest, which merges into
the app's, so the permission still shipped and the app still asked for it. It
had to be stripped explicitly:

```xml
<uses-permission android:name="android.permission.health.WRITE_WEIGHT"
                 tools:node="remove" />
```

`src/lib/calc/healthsync.test.ts` has a guard asserting that no exported name
matches `/push|write|save|upload|send/i`, so the write path cannot creep back
in by accident.

## Cache-first, with an explicit update prompt

The service worker is cache-first, so the app opens instantly and works offline
by default. That means a deploy does not reach anyone by itself.

Rather than a stale-while-revalidate scheme that swaps code mid-session, the app
checks once at startup and asks. The user's framing: "we want our app to work
offline, we should just show a popup if there is an update available."

Accepting clears caches, unregisters the worker and reloads. Data is untouched,
and the prompt says so, because "update" reads as "might lose my stuff."

Skipped entirely on Android, which updates through the APK.

## Light theme by default

First load is light, regardless of the system preference. Someone arriving from
the landing page has just been looking at a light page, and the illustrations
were drawn against light first. The inline script in `layout.tsx` always writes
`data-theme`, so the `prefers-color-scheme` fallback in the CSS only covers the
instant before it runs. A single tap switches, and the choice is remembered.

## `--on-accent`

Buttons on a mint background used `text-white`. In the dark palette mint is
`#2dd4bf`, and white on that is a contrast ratio of about **1.86:1**, which is
effectively invisible. The user reported it as unreadable.

Every accent in the dark palette is a light pastel, so this affected badges,
profile buttons and import toggles too, not just the one button. The fix is a
token that flips with the theme: white in light, `#0d1420` in dark, about 9.8:1.

The logo mark is a deliberate exception and stays white, so it matches the
launcher icon.

## Migration is shared between persist and import

`migrateAppData` runs on rehydration **and** on `importData`. Before that, a
restored old backup skipped migration entirely and landed without `profileId`
on its rows, so it loaded successfully and was invisible on every screen.

Migration inspects the shape of the data rather than trusting `version`, because
a bug once wrote a v5 payload stamped v1 and the stamp cannot be relied upon.

## Icons are generated, never hand-exported

One source (`assets/brand-icon.svg`), one script (`scripts/icons.mjs`).

The rule exists because hand-exporting failed silently: every Android adaptive
foreground was once written as **solid opaque white**, which covers the
background completely and gives a blank white squircle on every launcher from
Android 8 onward. Nothing catches that. The build does not look inside a PNG,
and the correct-looking legacy icons sitting beside it hid the problem. The
script now asserts that no generated layer is a single flat colour.

The current mark is a Flaticon icon by Ricardo Ruiz. **Attribution is required**
by its licence and appears in the README, the About tab and the landing footer.
The same licence does not permit registering it as a trademark, which is worth
remembering if the brand ever needs to be defensible.

## No charting library

The syringe, body map, rings and charts are hand-rolled SVG. The syringe in
particular has to be drawn to the true proportions of the selected barrel, which
no chart library does, and pulling one in for the rest would add weight for
things that are twenty lines of path data.

## The landing page animates without IntersectionObserver

`src/app/landing/Reveal.tsx` uses a scroll listener plus a rect read plus a slow
interval, not an observer. The observer is the tidier API and it is also a
single point of failure that fails in the worst direction: if its callback never
arrives, everything it guards stays at `opacity: 0` and the page is blank below
the fold. That happened in testing. See [06-traps.md](06-traps.md).

## Static export routing

`trailingSlash: true` for the Android build, because the export writes
`out/plan/index.html` and a request for `/plan` with no trailing slash resolves
to no file. This is why `ButtonLink` exists: `window.location.href = "/plan"`
silently does nothing inside the APK.
