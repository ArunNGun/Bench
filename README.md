# Bench

[![MIT License](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Open Source](https://img.shields.io/badge/open%20source-%E2%9D%A4-mint.svg)](https://github.com/ArunNGun/Bench)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)
[![Discord](https://img.shields.io/badge/discord-join-5865F2.svg)](https://discord.gg/NTfnwSxxr)

An open source tracker for peptide, growth hormone and anabolic protocols. Protocols, doses, stock, reconstitution, bloodwork and outcomes, with no account, no server and no analytics by default. Everything you enter stays in your browser, on your device.

If you want the same data on more than one device, you can point the app at a sync server you host yourself, in [`server/`](server/README.md). It is off until you set it up, and what goes up is encrypted in your browser first, so the machine holding it cannot read it.

Runs as a web app, installs to a home screen as a PWA, and ships as an Android APK.

---

## Why it exists

Most trackers in this space either want an account or get the arithmetic wrong. The parts that are easy to get wrong are the parts this takes seriously:

- **Reconstitution is exact and tested.** A U-40 barrel and a U-100 barrel look similar and differ by 2.5×. The app never guesses which one you are holding, draws the syringe to the real proportions of the barrel you picked, and shows the cross-scale reading alongside.
- **Blends are decomposed.** A blend is not one compound. Each component is modelled on its own half-life rather than collapsing into one averaged line, and exposure is compared weekly, because 500 mcg daily and 2.5 mg twice weekly are close weekly and five-fold apart per dose.
- **Every dose figure is tagged with its evidence.** An approved label, a clinical trial and a forum convention are all shown, and never look alike.
- **Unknowns stay unknown.** Where a half-life has never been measured in humans, as with trenbolone, boldenone and several research peptides, the app says so and draws no curve rather than inventing one that looks authoritative.

## What it tracks

| | |
|---|---|
| **Library** | 49 compounds across metabolic, repair, growth hormone, anabolic, ancillary and blends. Cited half-lives, dose ranges, titration ladders, side effects, contraindications, legal status |
| **Plan** | Protocols with schedules, titration ladders, pinned injection sites, adherence |
| **Log** | Doses with site, units, syringe scale, how you felt, side effects |
| **Stock** | Vials sealed → reconstituted → empty, tracked by mass, with beyond-use dates and cost per dose |
| **Calculator** | Reconstitution and dose ↔ units for U-100 and U-40 |
| **Bloodwork** | 16 markers charted against dose history, with prompts for what your compounds make worth watching |
| **Outcomes** | Weight, waist, body fat, plus sleep and resting heart rate read from Android Health |
| **Check-ins** | A daily rating for energy, mood, libido, sleep, recovery, physical hunger and food noise, compared either side of a protocol change. Hunger and food noise are rated apart because they move apart: a GLP-1 can quieten the head while the stomach behaves normally |
| **Safety** | Interaction checks across compounds running at the same time |
| **Projection** | What a protocol will do before you run it: time to steady state, accumulation, peak to trough |
| **Recovery** | When suppressive compounds clear, from ester half-lives, with cited protocols. No date is given where no human half-life exists |
| **Report** | A printable summary for a clinician, produced by the browser rather than a PDF library |
| **Import** | CSV, TSV, JSON and XLSX from other trackers, plus lab report PDFs read on the device. Shotsy recognised by name; anything else read from its column headers |

Compounds the library does not carry can be added yourself, from any compound picker in the app. They work everywhere a built-in does, but are never presented as researched.

## Privacy

There is no backend for your data. Lab report PDFs are parsed on the device, never uploaded. The application makes two network requests in total:

1. A startup check of `/version.json` to notice a new deploy.
2. A one-time ping to `/api/ping` with a random UUID generated on your device. This increments a unique-install counter. The UUID is stored only in your browser's `localStorage` and is never linked to any personal information. The server stores a probabilistic sketch ([HyperLogLog](https://redis.io/docs/latest/develop/data-types/probabilistic/hyperloglolog/)). The raw UUIDs are never persisted and cannot be reconstructed from it. If you are offline or using the Android APK without a connection, the ping is silently skipped and the last known count is read from `localStorage`.

No analytics, no telemetry, no error reporting beyond these two calls. Fonts are self-hosted at build time, so the browser never contacts a third party.

There is a third, and it is off unless you turn it on. Sync talks to a server address you enter yourself in Settings, and to nothing else. There is no hosted option and no default address, deliberately: this project does not want to be the custodian of anyone's dose history. What is sent is sealed in your browser first, with a key derived from your password, so the machine you point it at stores something it cannot read. Leave the field empty and no request is ever made. See [`server/`](server/README.md).

Dose reminders add no fourth request. The alarm is handed to Android's own scheduler and raised on the device, offline, with the app closed. They are off until you switch them on, and by default the notification says only that a dose is due rather than naming the compound, because a lock screen is read by whoever is beside you. The calendar export is the one place that can carry anything off the device, and only if you choose to name the compound and to import the file into a calendar that syncs somewhere; the Settings panel says so at the moment that choice is made.

Data lives in **IndexedDB** (`keyval-store`, key `peptide-log-v1`). Two non-sensitive values sit in `localStorage`: the theme, and whether the install banner was dismissed.

The trade-off is stated plainly in the app: nobody can read your data, and nobody can recover it for you either.

## Backups and data safety

- **Android** writes rotating backups to `Documents/Bench` automatically, keeping the last N. That folder survives clearing the app's data.
- **Web** has no filesystem access, so export is manual, and the app reminds you once there is real history with no copy of it.
- **Migrations are shared** between the persist layer and the import path, so restoring a backup from any earlier version brings the data forward correctly. Tests assert that nothing is lost *and* that nothing ends up invisible. That is the stricter and more easily missed requirement, since every screen filters by profile id.

## Updates

The service worker is cache-first, so the app loads instantly and works offline by default. A deploy does not silently swap code mid-session. Instead the app fetches `/version.json` on start, compares it against the build id compiled into the running bundle, and offers the user the choice. Accepting clears the caches and reloads, **data is never touched**.

## Getting started

```bash
npm install
npm run dev
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server on :3210 |
| `npm run build` | Production web build (stamps a build id first) |
| `npm run build:static` | Static export for the Android shell |
| `npm run android:sync` | Static build plus `cap sync` |
| `npm test` | Full test suite |
| `npm run lint` | ESLint |

Port 3210 rather than 3000, so it never fights another dev server for the port.

### Deploying

A standard Next.js app, Vercel, Netlify and Cloudflare Pages all work with no configuration.

- `/` is the app
- `/landing` is the public page describing it
- `/about` is the in-app about page

| Branch | URL | Purpose |
|--------|-----|---------|
| `main` | [benchpep.vercel.app](https://benchpep.vercel.app) | Production |
| `beta` | [benchpep-beta.vercel.app](https://benchpep-beta.vercel.app) | Staging - new features land here first |

New features are developed on feature branches, merged into `beta` via PR, then promoted to `main` for a tagged release.

### Android

```bash
npm run android:sync
cd android && ./gradlew assembleRelease
```

Needs `JAVA_HOME` pointing at JDK 21, Android Studio ships one at `/Applications/Android Studio.app/Contents/jbr/Contents/Home`.

Signed with the local debug keystore for personal sideloading. Read the comment in `android/app/build.gradle` before changing that: the signature is what allows an in-place upgrade, and switching keys forces an uninstall, which erases the user's data.

Built APKs are in [`release/`](./release).

## Testing

962 tests, run across five timezones. The suite is weighted towards what would be dangerous to get wrong: reconstitution arithmetic, unit conversion, PK curves, blend decomposition, inventory reconciliation, import parsing and data migration.

```bash
npm test
TZ=America/New_York npm test    # DST boundaries have caught real bugs here
```

## Where the data comes from

FDA prescribing labels and equivalent SmPCs first, then published trial protocols and papers, then clinical trial registries. Every library entry carries its citations.

**PeptideAtlas is not a source here, despite the name.** It is a mass-spectrometry proteomics repository: it catalogues which peptide sequences were *detected* in MS experiments and maps them to proteins. It holds no pharmacokinetics, half-lives, dosing or plasma-concentration data for therapeutic peptides, so nothing in the "what is circulating right now" model could legitimately come from it.

## Architecture

```
src/lib/calc/       pure logic, no React, no I/O, exhaustively tested
src/lib/data/       the compound and blood-marker libraries
src/lib/import/     CSV/TSV/JSON/XLSX readers and source profiles
src/lib/health/     Health Connect adapter (read-only)
src/lib/backup/     filesystem backups and retention
src/lib/migrate.ts  version migration, shared by persist and import
src/components/     UI
src/app/            routes
```

Anything with real consequences lives in `src/lib/calc` as a pure function with tests. Components read state and render; they do not compute doses.

## Stack

Next.js 15 (App Router), React 19, TypeScript, Tailwind v4, Zustand persisted to IndexedDB, Capacitor for Android, Vitest. Plus Jakarta Sans throughout, IBM Plex Mono for precision readouts. Hand-rolled SVG for the syringe, the body map, the rings and the charts, no charting dependency.

## Community

Questions, protocol discussion, bug reports and feature ideas live in the Discord server:

**[discord.gg/NTfnwSxxr](https://discord.gg/NTfnwSxxr)**

Open an issue on GitHub for bugs, or post in `#bug-reports` on Discord. Feature requests are welcome in both places.

## Contributing

Bench is open source and contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide.

The most useful things to contribute:

- **Library corrections**, with a citation. A number without a source does not go in.
- **New compounds**, with cited half-lives and dose ranges. Where human PK data does not exist, say so.
- **Bug reports**, especially for reconstitution arithmetic, unit conversion, PK curves and data migration.
- **Import compatibility** for trackers Bench does not yet recognise.

Please open an issue before a large PR to check it is in scope.

## Disclaimer

Not medical advice, not a prescription, and not a recommendation to use anything in it. Most compounds in the library are not approved medicines anywhere, and material sold for research use has no regulated identity, purity, sterility or endotoxin standard behind it. The app can check your arithmetic. It cannot check what is in your vial, and it is no substitute for a doctor who knows your history.

## Credits

App icon by [Ricardo Ruiz](https://www.flaticon.com/authors/ricardo-ruiz) on
[Flaticon](https://www.flaticon.com/), used under the Flaticon licence, which requires this
attribution. Every icon the app ships is generated from `assets/brand-icon.svg` by
`node scripts/icons.mjs`; none of them are edited by hand.

## Author

Built by **Arun**.

## Licence

MIT
