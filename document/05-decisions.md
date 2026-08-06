# Decisions, and why

Each of these was a real choice with a real alternative. Changing one is fine,
but know what you are giving up.

## No backend, ever

There is no server, no account, no analytics, no error reporting. The
application code makes no network requests of its own except a single fetch of
`/version.json` at startup on web.

This is stated on the landing page and in About as an absolute claim, and it is
verifiable: `grep -r "fetch(" src/` is the evidence. Adding a second network
call, however innocuous, makes a published promise false.

The cost is accepted and stated plainly in the app: nobody can read the user's
data, and nobody can recover it either.

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
