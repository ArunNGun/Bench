# Status

Accurate as of 31 July 2026, version 1.8 (`versionCode` 10).

## Health

- TypeScript clean, ESLint clean
- 916 tests passing, verified across America/New_York, Europe/London,
  Asia/Kolkata, Pacific/Auckland and UTC
- Web build and Android release build both succeed
- v1.8 is built but **not yet installed on the device and not in `release/`**.
  The last APK shipped was v1.7. Run the Android steps in
  [04-runbook.md](04-runbook.md) when it is time to cut 1.8.

## Shipped

Everything in [01-product.md](01-product.md) is built and working: the library
of 43 compounds, protocols and scheduling, dose logging, stock in mass, the
reconstitution calculator, PK curves with blend decomposition, 16 blood markers,
interaction checks, site rotation, custom compounds, multiple profiles, import
from CSV/TSV/JSON/XLSX, Android Health read-in, automatic backups on Android,
the PWA with install and update prompts, and the public landing page.

Recent work, in order:

1. Anabolics, growth hormone and Selank added to the library, with IU dosing
   and pre-mixed oil vials
2. Custom compounds, usable from every picker
3. PWA: offline, install prompt, startup version check with an update prompt,
   backup nag for web users
4. Shared migration between persist and import, so old backups restore visibly
5. About tab with the version and changelog, landing page at `/landing`
6. Landing page rebuilt with per-feature SVG illustrations and scroll animations
7. Light theme by default, theme toggle on the landing page
8. `--on-accent` contrast fix for dark mode
9. Brand icon replaced throughout, generated from one source by
   `scripts/icons.mjs`
10. Daily check-ins on six subjective axes, with sleep and resting heart rate
    read from Health Connect beside them
11. Lab report PDFs read client-side, with every value shown against the line it
    was parsed from before anything is written
12. Six ancillaries added, plus the rule for an aromatase inhibitor running with
    nothing that aromatises
13. Recovery timing from ester clearance, and forward projection of a protocol
    before it runs
14. A printable clinician report at `/report`

## Known gaps and loose ends

**Web and Android icons now match**, both generated from
`assets/brand-icon.svg`. If the brand changes, run `node scripts/icons.mjs` and
nothing else needs touching.

**The legacy Android launcher PNGs are unreachable.** `minSdk` is 26, so the
adaptive icon in `mipmap-anydpi-v26` always wins. The PNGs exist only so the
manifest reference resolves. Harmless, and worth knowing before wondering why
editing them changes nothing.

**`settings.theme` in `types.ts` is vestigial.** It is typed
`"dark" | "light" | "system"` and defaults to `"system"`, but nothing reads it.
The real theme lives in `localStorage` under `bench-theme` and is applied by the
inline script in `layout.tsx`. Either wire it up or delete it.

**`drawable/ic_launcher_background.xml` and
`drawable-v24/ic_launcher_foreground.xml`** are the leftover Android Studio
template icon (the teal grid and the robot). Nothing references them now. They
were briefly restored as the launcher icon at the user's request before the
Flaticon mark was chosen, so they are worth keeping until the brand settles, but
they are dead files.

**Attribution is load-bearing.** The icon is Flaticon free tier, which requires
visible credit. It appears in the README, the About tab and the landing footer.
If Arun buys a Flaticon licence, those three can be removed. If the icon
changes, they must be updated or removed, not left pointing at the wrong author.

**iOS is PWA only.** Safari has never implemented `beforeinstallprompt`, so
there is no programmatic install; `src/lib/pwa.ts` detects iOS and shows Add to
Home Screen instructions instead. Other iOS browsers cannot add to the home
screen at all.

## If you are picking this up

1. Read [06-traps.md](06-traps.md) first.
2. Run the check gate in [04-runbook.md](04-runbook.md) before changing
   anything, so you know the baseline is green and any breakage is yours.
3. Do not touch GitHub or Vercel. Arun handles both.
4. Do not add a network call or a Health Connect write. Both are deliberate
   exclusions, not oversights. Reminders were the third of these until they
   were asked for again and allowed; the local kind is in, scheduled on the
   device, and push is still out. See [05-decisions.md](05-decisions.md).
