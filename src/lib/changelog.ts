/**
 * What changed, and when.
 *
 * Hand-written rather than generated from commits. A commit log is a record of
 * work; a changelog is a record of what someone using the app would notice, and
 * the two are not the same list.
 *
 * Newest first. `version` matches the Android versionName so a screenshot of the
 * About page is enough to know exactly which build someone is on.
 */

/** Where the source lives, and who to raise a correction with. */
export const GITHUB_URL = "https://github.com/ArunNGun";

export interface Release {
  version: string;
  date: string;
  /** One line on what this release was about. */
  summary: string;
  changes: string[];
  /** GitHub usernames of contributors beyond the main author. */
  contributors?: string[];
}

export const RELEASES: Release[] = [
  {
    version: "2.1",
    date: "2026-09-06",
    summary: "German language support, weight on the PK chart, actual mg in the readout, and a wave of fixes and features from the community.",
    changes: [
      "German language support throughout the app. Switch between EN and DE from the header. Everything from nav labels to descriptions, section headers, buttons and empty states is translated. Compound names and units stay in English.",
      "The circulating-levels readout now shows actual estimated mass on board (e.g. 1.2 mg) instead of a percentage of one dose. Each contributing dose also shows how much of it is still remaining.",
      "Weight entries can be overlaid on the PK chart. Toggle it from the Weight card. Each entry appears as a dot on the highest active curve at that moment, with a dashed stem to the baseline, so you can see body weight alongside compound levels on the same timeline.",
      "Details button added to Later Today dose rows, so you can open the full logging form before confirming an early log.",
      "Delete button on protocol cards is now always visible on mobile, not hidden behind a hover.",
      "Nasal sprays: track a vial transferred to a spray bottle, log doses in presses, and see marks alongside the dose.",
      "Dose reminders, scheduled on the device. Off by default, calendar export for the web.",
      "Bacteriostatic water tracked in millilitres, drawn from a bottle you open once.",
      "Rate physical hunger and food noise as separate check-in axes.",
      "Correct, remove or backfill any day's rating.",
      "The account wins at the start of a session in hosted builds, local data wins after.",
      "A save that empties a collection now keeps a copy before writing, catching a data-loss bug that had appeared twice.",
      "Settings is now a menu rather than a tab, freeing up the header for the theme toggle and the backup button.",
    ],
    contributors: ["suskozaver", "tofus"],
  },
  {
    version: "2.0",
    date: "2026-08-24",
    summary: "Protocol editing, week-band dosing plans, dose logging by protocol, grouped vials, and a fix for the body-weight unit bug.",
    changes: [
      "Edit an existing protocol in place instead of deleting it and starting over",
      "Plan a protocol by week bands, each with its own dose and frequency, so taper and loading phases are first-class",
      "Log a dose by picking the protocol first, so the compound, vial, and dose are pre-filled from your plan",
      "Identical sealed vials on the Stock screen can now be grouped into a single row to reduce clutter",
      "Body weight now respects your kg/lbs setting correctly. Previously it always saved as if you had entered kg",
      "Protocol start date no longer lands a day early for users west of Greenwich",
      "Discord community link added to the landing page, About tab, and README",
    ],
  },
  {
    version: "1.9",
    date: "2026-08-06",
    summary: "User count on the landing page, mg dose entry, manual update check, and a cleaner injection site map.",
    changes: [
      "Dose entry now has a toggle to switch between mcg and mg, useful for compounds typically dosed in milligrams",
      "Injection site map redrawn using the same body figure as the landing page, cleaner and consistent",
      "Delete button on vials is now always visible, not hidden behind a hover",
      "Manual \"Check for update\" button in Settings, tap to pull the latest version without waiting for the passive check",
      "Landing page shows a live user count with a pulsing dot, powered by a privacy-safe HyperLogLog counter",
      "Print CSS added so the lab report looks right on paper",
      "PK curve constant caching for faster recalculation on large dose histories",
    ],
  },
  {
    version: "1.8",
    date: "2026-07-31",
    summary: "Daily check-ins, lab reports read straight off a PDF, and ancillaries.",
    changes: [
      "Rate energy, mood, libido, sleep, recovery and appetite each day. Weight answers whether a GLP-1 is working and very little else, and most of the library is no longer GLP-1",
      "Import a lab report PDF. It is read on your device, not uploaded, and every value is shown next to the line it came from before anything is saved",
      "Six ancillaries added: anastrozole, exemestane, tamoxifen, clomiphene, enclomiphene and hCG",
      "Warns when an aromatase inhibitor is running with nothing that aromatises, which can only push oestradiol too low",
      "Recovery timing: when suppressive compounds clear, and published protocols with their sources. Where a half-life has never been measured, it says so rather than inventing a date",
      "See what a protocol will do before you run it: how long levels take to settle, and how much higher steady state is than the first dose",
      "A printable report for a clinician, covering protocols, adherence, bloodwork and outcomes",
      "Sleep and resting heart rate read from Health Connect, alongside the daily rating. Still read-only",
    ],
  },
  {
    version: "1.7",
    date: "2026-07-31",
    summary: "A public page for the app, an About tab, and a light theme by default.",
    changes: [
      "A page at /landing explaining what the app does, with an illustration for each feature",
      "About is its own tab now, showing the version you are on and what changed in it",
      "Opens in the light theme the first time, rather than following the system. The toggle is on the landing page as well as in the app",
      "Buttons on a mint background are legible in dark mode again. White text on the dark palette's mint was close to invisible",
      "The mint vial icon on the web app and anywhere you install it to a home screen. The Android launcher keeps the icon it already had",
      "Movement on the landing page as you scroll, which stops entirely if you have asked your system to reduce motion",
    ],
  },
  {
    version: "1.6",
    date: "2026-07-31",
    summary: "Anabolics and growth hormone, your own compounds, and a proper web app.",
    changes: [
      "13 anabolic steroids added: the four testosterone esters, nandrolone, trenbolone, boldenone, Masteron and three orals",
      "Growth hormone, dosed in IU the way the pens are labelled",
      "Selank added alongside Semax",
      "Add your own compound from any picker when the library does not carry it",
      "Bloodwork now suggests the androgen panel, and liver enzymes for oral steroids",
      "Warns when two oral steroids run together, since the liver strain adds up",
      "Installs to a home screen and works offline, on iPhone as well as Android",
      "Tells you when a new version is ready instead of swapping it under you",
      "Reminds you to export if there is history with no copy of it anywhere",
      "Restoring an old backup now migrates it properly. Previously it could load without being visible",
      "One icon across the launcher, the home screen and the app itself",
    ],
  },
  {
    version: "1.2",
    date: "2026-07-30",
    summary: "Import from other trackers, and bloodwork.",
    changes: [
      "Import a CSV, TSV, JSON or spreadsheet from another app, with a preview before anything is written",
      "Shotsy exports recognised by name; anything else read from its column headers",
      "Bloodwork: 16 markers charted against your dose history",
      "Interaction checks across everything you run at once",
      "Automatic backups to Documents/Bench, with restore",
      "Android Health is read-only now. Nothing this app holds is written back",
      "Imported history can build a protocol for you from the pattern of your doses",
    ],
  },
  {
    version: "1.0",
    date: "2026-07-30",
    summary: "First Android build.",
    changes: [
      "Protocols, dose logging, stock and cost",
      "Reconstitution calculator for U-100 and U-40 syringes",
      "Circulating-level curves from published half-lives",
      "Weight tracking with Android Health",
      "Multiple profiles",
    ],
  },
];

/** The release this build represents. */
export const CURRENT_VERSION = RELEASES[0].version;
