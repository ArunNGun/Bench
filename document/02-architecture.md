# Architecture

## Stack

Next.js 15 (App Router), React 19, TypeScript, Tailwind v4, Zustand persisted to
IndexedDB via `idb-keyval`, Capacitor 8 for Android, Vitest. Plus Jakarta Sans
and IBM Plex Mono, self-hosted at build time so the browser never contacts a
third party.

No charting library. The syringe, body map, rings and charts are hand-rolled
SVG.

## Two build targets from one codebase

| Target | Command | Output |
|---|---|---|
| Web / PWA | `npm run build` | Normal Next build, deployed to Vercel |
| Android | `npm run build:static` | `BUILD_TARGET=static` sets `output: "export"` and `trailingSlash: true`, writing `out/`, which Capacitor copies into the APK |

`trailingSlash` matters and is the cause of a whole class of bug. See
[06-traps.md](06-traps.md).

## Layout

```
src/lib/calc/       pure logic. No React, no I/O. Exhaustively tested
src/lib/data/       the compound and blood marker libraries
src/lib/import/     CSV/TSV/JSON/XLSX/PDF readers and per-source profiles
src/lib/health/     Health Connect adapter (read only)
src/lib/notify/     local notification adapter (Android schedules, web reports itself unavailable)
src/lib/backup/     filesystem backups and retention
src/lib/migrate.ts  version migration, shared by persist and by import
src/lib/store.ts    Zustand store, persistence, profile-scoped selectors
src/lib/types.ts    every domain type, and DATA_VERSION
src/components/     UI
src/app/            routes
scripts/            build-time generators (version stamp, icons)
assets/             brand source art
document/           these notes
release/            shipped APKs
```

The rule: anything with real consequences lives in `src/lib/calc` as a pure
function with tests. Components read state and render. **Components never
compute doses.**

## Key modules in `src/lib/calc`

| Module | Responsibility |
|---|---|
| `reconstitution.ts` | The arithmetic that matters most. Vial strength, diluent, concentration, units, U-100 and U-40, draw rounding, beyond-use dates |
| `pk.ts` | Bateman one-compartment model. `ka` solved by bisection from Tmax, constrained so Tmax stays below `1/ke` |
| `blend.ts` | Splits a blend dose into per-component masses, compares weekly rather than per-dose |
| `schedule.ts` | Every schedule kind, due dates, adherence, all in local time |
| `stack.ts` | Interaction checks: duplicate compounds, shared receptor classes, stacked orals, component overlap across protocols |
| `infer.ts` | Builds a protocol from imported dose history |
| `units.ts` | mcg to IU and back, concentration from fill volume |
| `inventory.ts`, `cost.ts` | Stock depletion in mass, cost per dose and per week |
| `sites.ts` | Rotation, respecting rest days and pinned sites |
| `labs.ts`, `outcomes.ts`, `progress.ts` | Bloodwork bands, weight trends, weekly exposure |
| `backupnag.ts` | When to nag a web user who has never exported |
| `checkins.ts` | Daily subjective ratings: averages, before and after a protocol, coverage. Deliberately computes no correlation coefficient |
| `pct.ts` | When suppressive compounds clear, and published recovery protocols. Refuses to give a date where the half-life is unknown |
| `project.ts` | What a protocol will do before it runs: accumulation, time to steady state, peak to trough swing |
| `healthsync.ts` | Plans a read from Health Connect, and aggregates sleep and resting heart rate. Has no write path, by design and by test |
| `spray.ts` | Filling a nasal spray bottle from a vial, and what one press of the pump delivers |
| `rescue.ts` | Which collections lost rows, whether that looks like an accident, and how to union them back |
| `reminders.ts` | Which dose reminders should be armed, and what each one says. Shares `unloggedDoseTimes` with the Today page so the two cannot disagree |
| `ics.ts` | The dose schedule as a calendar file, for the surfaces that cannot raise an alarm of their own |

## Data model

`DATA_VERSION` is 6 and lives in `src/lib/types.ts`. Everything is one JSON
object persisted under IndexedDB key `peptide-log-v1` in store `keyval-store`.

Top-level collections: `profiles`, `protocols`, `logs`, `vials`, `measurements`,
`labs`, `checkIns`, `customPeptides`, `settings`, `activeProfileId`, `version`.

**Every row carries a `profileId`.** Every screen filters by it. This is the
detail that makes migration dangerous: data can restore successfully and still
be invisible, because it landed with no owner. Tests assert both that nothing is
lost and that nothing ends up unreachable.

`localStorage` holds exactly two non-sensitive values: the theme
(`bench-theme`) and whether the install banner was dismissed.

## Migration

`src/lib/migrate.ts` exports `migrateAppData`, used by **both** the Zustand
persist `migrate` hook and `importData`. It is idempotent, and it inspects the
shape of the data rather than trusting the version stamp, because stamps have
been wrong in the wild.

Any new field must survive an old backup being restored. This is a hard promise
the user made explicitly: "we should always maintain data backward compatibility
in all apps, webapp or android, doesn't matter."

## Offline and updates

`public/sw.js` is cache-first with a per-build cache namespace
(`bench-<buildId>`), registered as `/sw.js?v=<buildId>`. It precaches all route
documents, and never intercepts `/sw.js` or `/version.json`.

A deploy does not silently swap code. On startup the web app fetches
`/version.json` once and compares it with the build id compiled into the running
bundle (`src/lib/update.ts`). If they differ the user is offered the update;
accepting clears caches, unregisters the worker and reloads. Data is never
touched. This is skipped entirely on Android, which updates through the APK.

## Theme

Light is the default on first load. An inline script in `src/app/layout.tsx`
sets `data-theme` before first paint, defaulting to light rather than following
`prefers-color-scheme`. `ThemeToggle` flips it, persists it, and rewrites the
`theme-color` meta so the browser chrome matches.

Colour tokens live in `src/app/globals.css`. Note `--on-accent`: it is white in
light and near-black in dark, because every dark-palette accent is a light
pastel that white text disappears against.

## Icons

One source, `assets/brand-icon.svg`, and one generator,
`node scripts/icons.mjs`. It writes the Android adaptive foreground at five
densities, the legacy launcher PNGs, the web and PWA icons, the favicon, and a
flattened preview. **Never hand-edit any generated icon.** See
[06-traps.md](06-traps.md) for why that rule exists.
