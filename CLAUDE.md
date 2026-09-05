# Bench

A private tracker for peptide, growth hormone and anabolic protocols. Next.js 15
plus Capacitor for Android, no backend, everything stored on the user's device.

**Full context is in [`document/`](document/README.md). Read it before making
changes.** Start with [`document/06-traps.md`](document/06-traps.md), which is
the list of bugs that have already cost hours.

## The rules that matter most

- **No em dashes or en dashes, anywhere.** Not in UI copy, comments, docs or
  library prose. Restructure the sentence rather than swapping in a comma; a
  comma between two independent clauses is a splice. Hyphens inside compound
  terms (half-life, BPC-157, U-100) are correct and stay.
- **Do not touch GitHub or Vercel.** Write code. Arun pushes and deploys.
- **Do not drive the phone's UI.** adb install, logcat, push and pull are fine.
  Tapping through the launcher is not.
- **No new network calls.** `grep -r "fetch(" src/` is meant to stay short
  enough to read, and every hit has to be accounted for in the Privacy section
  of the README. Today: `/version.json` at startup on web, the landing page's
  own server-side stats fetch, and `src/lib/sync/client.ts`, which is inert
  until someone enters a server address in Settings. Nothing new goes in without
  a line in that section explaining it and a reason it cannot be done on the
  device.
- **Health Connect is read only.** Enforced by a test.
- **Local dose reminders are in, push is not.** Reminders were declined at the
  start and allowed later, on conditions: scheduled by the device, off until
  switched on, discreet by default. Push needs a server to decide when your
  phone should buzz, which is the backend this project does not have. A browser
  cannot schedule at all, so the web is offered a calendar export instead. See
  [`document/05-decisions.md`](document/05-decisions.md).
- **No invented pharmacology.** A number without a source does not go in the
  library. Where no human data exists, set `halfLifeHours: null`, explain why,
  and draw no curve.
- **Data must survive every update.** `migrateAppData` is shared by persistence
  and by import. Test that restored data is not just present but visible; every
  screen filters by `profileId`. A write that empties a collection is caught in
  the storage layer and the previous document is set aside, because this has now
  happened twice and both times it was found days later by accident.
- **Icons are generated.** One source, `assets/brand-icon.svg`, one command,
  `node scripts/icons.mjs`. Never hand-edit the outputs.

## Layout

```
src/lib/calc/    pure logic, no React, no I/O, exhaustively tested
src/lib/data/    the compound and blood marker libraries
src/lib/import/  CSV, TSV, JSON, XLSX readers
src/components/  UI. Components render; they never compute doses
src/app/         routes. / is the app, /landing is public, /about is in-app
document/        project context
```

## Commands

```bash
npm run dev                      # port 3210
npm test                         # 1506 tests
TZ=America/New_York npm test     # DST has caught real bugs
npx tsc --noEmit && npx next lint
npm run build                    # web
npm run android:sync && (cd android && ./gradlew assembleRelease)
node scripts/icons.mjs           # regenerate every icon
```

Android needs `JAVA_HOME` pointing at JDK 21. Package id is `app.bench.peptide`.

If the dev server serves stale code, suspect the cache-first service worker
before suspecting your edit. See [`document/04-runbook.md`](document/04-runbook.md).
