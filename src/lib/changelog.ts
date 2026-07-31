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
}

export const RELEASES: Release[] = [
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
