# Project context

Handoff notes for anyone, human or agent, picking this project up cold. The code
explains what the app does. These files explain what it is for, what it must
never do, and which apparently reasonable ideas have already been tried and
failed.

Read in order. The whole set is about twenty minutes.

| File | What it covers |
|---|---|
| [01-product.md](01-product.md) | What Bench is, who it is for, and what is deliberately out of scope |
| [02-architecture.md](02-architecture.md) | Stack, code layout, data model, where logic lives |
| [03-conventions.md](03-conventions.md) | Rules for code, for written content, and for the compound library |
| [04-runbook.md](04-runbook.md) | Every command: dev, test, web build, Android build, install, release |
| [05-decisions.md](05-decisions.md) | Why the app is built the way it is, including the roads not taken |
| [06-traps.md](06-traps.md) | Bugs that cost real time. Read this one before touching anything |
| [07-status.md](07-status.md) | What is shipped, what is half done, what is open |

## If you read only one thing

[06-traps.md](06-traps.md). Most of the difficult bugs in this project were not
in the app's own logic. They were in the seams: a Capacitor plugin that cannot
be imported the documented way, a static export that does not route the way dev
does, an SVG mask that scales twice, a service worker serving stale code during
testing. Each one looked like the code was correct and the platform was broken,
and each one took much longer to find than to fix.

## The user

Arun. Builds and tests on a Galaxy S25 Ultra (Android 16, API 36) over adb.

Standing preferences that are not obvious from the code:

- **Do not do anything with GitHub.** Write the code; Arun pushes and deploys to
  Vercel himself. Do not run `gh`, do not create branches or PRs, do not commit
  unless asked.
- **Do not drive the phone's UI.** adb install, logcat, file push and pull are
  fine. Swiping and tapping through the launcher is not: it has landed in the
  middle of a personal app that was open at the time. Verify through the shipped
  artefacts (unzip the APK, read the backup JSON, decode the resources) instead.
- **No em dashes or en dashes anywhere.** See [03-conventions.md](03-conventions.md).
  Hyphens inside compound terms are correct and stay.
- Verify on the real device rather than trusting a green build.
