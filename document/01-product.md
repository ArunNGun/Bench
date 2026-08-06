# What Bench is

A tracker for peptide, growth hormone and anabolic steroid protocols. It records
what you are running, what you actually took, what is left in the fridge, what
it cost, and whether any of it is working: weight, bloodwork, how you felt.

It began as Arun's personal tracker and has been widened into something a
stranger can use. It is free, has no accounts and no server, and is published
publicly (GitHub, then Vercel).

## Who it is for

People self-administering compounds that mostly are not approved medicines,
who are already doing this and want the arithmetic to be right. It assumes the
user knows what they are taking. It does not counsel, gate, or talk anyone out
of anything, and it does not pretend to be a medical device.

## The premise

Every other tracker in this space either wants an account or gets the sums
wrong. So the things that are easy to get wrong are the things this takes
seriously:

- **Reconstitution is exact and tested.** A U-40 and a U-100 barrel look alike
  and differ by 2.5x. Reading one as the other delivers two and a half times the
  intended dose. The scale is always an explicit choice and the reading on the
  other scale is shown beside it.
- **Blends are decomposed.** A blend is not one compound. Each component is
  modelled on its own half-life instead of collapsing into one averaged line.
- **Every dose figure carries its evidence.** An approved label, a clinical
  trial and a forum convention are all present and never look alike.
- **Unknowns stay unknown.** Where a half-life has never been measured in
  humans, the app says so and draws no curve.

## What it does

| Area | Detail |
|---|---|
| Library | 43 compounds: metabolic (9), repair (9), growth hormone (12), anabolic (13), plus blends. Cited half-lives, dose ranges, titration ladders, side effects, contraindications, legal status |
| Plan | Protocols with schedules, titration ladders, pinned injection sites, adherence |
| Log | Doses with site, units, syringe scale, how you felt, side effects |
| Stock | Vials from sealed to reconstituted to empty, tracked in mass, with beyond-use dates and cost per dose |
| Calculator | Reconstitution, and dose to units, for U-100 and U-40 |
| Bloodwork | 16 markers charted against dose history, with prompts for what your compounds make worth watching |
| Outcomes | Weight (read from Android Health), waist, body fat |
| Safety | Interaction checks across everything running at once |
| Import | CSV, TSV, JSON, XLSX from other trackers. Shotsy by name, anything else by column headers |
| Custom compounds | Anything the library does not carry, added by the user, working everywhere a built-in does |
| Profiles | More than one person on one device, fully partitioned |

## Deliberately not in scope

Each of these was considered and rejected. Do not add them without asking.

- **Reminders and notifications.** Asked for explicitly, declined explicitly:
  "do all except the reminder I don't need that."
- **Any backend, account, sync or analytics.** The privacy claim on the landing
  page is absolute and is verifiable by `grep -r "fetch(" src/`. The only
  network request the app makes is one fetch of `/version.json` at startup on
  web. Adding a second network call breaks a published promise.
- **Writing to Android Health.** Read only, permanently. See
  [05-decisions.md](05-decisions.md).
- **Medical advice, dose recommendation, or gating.** The app checks arithmetic
  and flags overlaps. It does not tell anyone what to take.
- **Invented pharmacokinetics.** No number goes in the library without a source.

## Surfaces

- `/` is the app itself
- `/landing` is the public marketing page, rendered outside the app shell
- `/about` is an in-app tab with the version and changelog
- Android ships the same code inside a Capacitor WebView
- iOS is served by the PWA; there is no native iOS app
