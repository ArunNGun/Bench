# Contributing to Bench

Thanks for looking. Contributions are welcome, but this is a precision tool, so a few things matter more here than in most projects.

## What is most useful

**Library corrections, with a citation.** The compound library is only worth anything if the numbers are right. If a half-life, dose range or evidence tag is wrong, open an issue or a PR with the source. An approved label or published trial beats a forum post. A forum post tagged `anecdotal` is still better than a blank.

**New compounds.** Same rule: no number without a source. If human PK data does not exist, say so with `halfLifeHours: null` and a `halfLifeNote`. Do not invent a plausible figure.

**Bug reports.** Especially reconstitution arithmetic, unit conversion, PK curves, blend decomposition and data migration. These are the failure modes with real consequences. Include steps to reproduce and what you expected.

**Import compatibility.** If your tracker exports a format Bench does not handle, a sample file (anonymised) and a PR against `src/lib/import/` is very welcome.

## What is out of scope

These were considered and deliberately excluded. Please do not open PRs for them.

- **Push notifications, or anything that reminds you from a server.** Local dose reminders now exist, scheduled by the device and off until you turn them on. Push is a different thing: it needs a server, and this project does not have one. See [`document/05-decisions.md`](document/05-decisions.md).
- **Any backend, account, sync or analytics.** The privacy claim on the landing page is absolute and verifiable. Adding a network call makes a published promise false.
- **Writing to Android Health.** Read only, by design.
- **Medical advice, dose recommendations, or any gating of what a user can log.** The app checks arithmetic. It does not tell anyone what to take.
- **Invented pharmacokinetics.** No curve where no human data exists.

## Getting started

```bash
npm install
npm run dev       # dev server on :3210
npm test          # 774 tests
TZ=America/New_York npm test   # run in a second timezone too
./node_modules/.bin/tsc --noEmit
npx next lint
```

The full gate before any PR: TypeScript clean, lint clean, all tests passing in at least two timezones, web build succeeds.

## Code conventions

- Pure logic lives in `src/lib/calc/` as pure functions with tests. Components read state and render. Components never compute doses.
- Prefer explicit units in names: `doseMcg`, `halfLifeHours`, `volumeMl`. Unit confusion is the failure mode this app exists to prevent.
- Time is local unless it is a stored instant. Stored instants are epoch milliseconds.
- No em dashes anywhere. Not in copy, comments, or the README. Hyphens in compound terms (half-life, BPC-157) are correct and stay.
- Comments explain why, not what. Would a competent reader be surprised or waste time rediscovering this? If yes, write it down.

## Pull requests

- Keep them small and focused.
- Library changes: include the citation in the PR description.
- New features: open an issue first to check it is in scope.
- Tests are required for anything in `src/lib/calc/`.

## Issues

Use the issue templates. For bugs, include steps to reproduce. For library corrections, include the source.
