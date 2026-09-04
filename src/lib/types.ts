import type { SyringeScale } from "./calc/reconstitution";

export type Route = "subcutaneous" | "intramuscular" | "oral" | "intranasal" | "topical" | "intravenous";

export type EvidenceLevel =
  /** FDA-approved label or equivalent regulatory dosing. */
  | "approved"
  /** Doses used in published human clinical trials. */
  | "clinical"
  /** Human data exists but is limited: small studies, early phase. */
  | "preliminary"
  /** Animal or in-vitro data only. */
  | "preclinical"
  /** Widely repeated community practice with no clinical backing. */
  | "anecdotal";

export interface DoseRange {
  /** Micrograms. */
  lowMcg: number;
  highMcg: number;
  /** Human-readable frequency, e.g. "once weekly". */
  frequency: string;
  /** Doses per week, used for planning and inventory burn rate. */
  perWeek: number;
  evidence: EvidenceLevel;
  note?: string;
}

export interface TitrationStep {
  /** 1-based step number. */
  step: number;
  doseMcg: number;
  /** How many weeks to hold this dose before stepping up. */
  weeks: number;
  note?: string;
}

export interface TitrationPlan {
  id: string;
  name: string;
  source: string;
  sourceUrl?: string;
  evidence: EvidenceLevel;
  steps: TitrationStep[];
  note?: string;
}

export interface Citation {
  label: string;
  url: string;
}

/**
 * What a compound actually does at the receptor, for the compounds where
 * running two at once matters.
 *
 * Deliberately not derived from `category`: retatrutide and semaglutide are both
 * "metabolic", but stacking them doubles up on GLP-1 specifically, and that is
 * the fact a warning has to be built on. Absent means no stacking rule applies,
 * and the check stays silent rather than guessing.
 */
export type MechanismClass =
  | "glp1-agonist"
  | "gip-agonist"
  | "glucagon-agonist"
  | "amylin-analogue"
  | "ghrh-analogue"
  | "ghrelin-agonist"
  | "aromatase-inhibitor"
  /** Selective oestrogen receptor modulator: tamoxifen, clomiphene, raloxifene. */
  | "serm"
  /** Acts at the LH receptor to drive testicular output directly. */
  | "gonadotropin";

/**
 * A half-life the library will draw a curve from, but will not state as fact.
 *
 * Graded on the same ladder the dose ranges already use, because the question
 * is identical: how much does anyone actually know. Three of the five levels
 * apply, and they are three different kinds of claim.
 *
 *   preclinical  measured, in animals. SS-31 is 4 hours in dogs, intravenously.
 *   preliminary  measured in people, but thinly: a preprint, a conference
 *                abstract, a study too small or too early to have settled.
 *   anecdotal    nobody measured anything. A vendor's page, a community
 *                consensus, a number that has been repeated until it sounds
 *                like a fact.
 *
 * The last of those is the dangerous one and the reason `source` and `url` are
 * required on all three. An anecdotal half-life is not a weak measurement, it
 * is an attribution: the app is not saying the figure is right, it is saying
 * who says it, and showing you where to go and check. A figure that cannot name
 * anyone claiming it cannot be entered at all, which is what keeps this field
 * from becoming the place inventions get laundered.
 *
 * Nothing is ever calculated from any of them. No percentage of peak, no steady
 * state, no accumulation ratio, on any level. The curve shows a shape.
 */
export interface HalfLifeEstimate {
  hours: number;
  /** How much anyone actually knows. Drives how loudly the app says so. */
  evidence: Extract<EvidenceLevel, "preclinical" | "preliminary" | "anecdotal">;
  /**
   * Who measured it and by what route. Required for the two measured levels and
   * meaningless for the third, since an anecdotal figure has no experiment
   * behind it to describe.
   */
  species?: string;
  route?: Route;
  /** Who states it. Printed next to the number, never abbreviated away. */
  source: string;
  url: string;
}

export type PeptideCategory =
  | "metabolic"
  | "repair"
  | "growth-hormone"
  | "cognitive"
  | "longevity"
  | "immune"
  | "sexual"
  | "cosmetic"
  | "anabolic"
  /**
   * Not a performance compound. The aromatase inhibitors, SERMs and
   * gonadotropins people run alongside anabolics, or afterwards to recover.
   * Carried because a stack the app cannot see is a stack it cannot check: an
   * androgen protocol with an AI managing oestradiol is a different situation
   * from the same androgen alone.
   */
  | "ancillary"
  | "blend";

export interface Peptide {
  id: string;
  name: string;
  aka: string[];
  category: PeptideCategory;
  /** One line on what it is. */
  summary: string;
  /** How it works, in a short paragraph. */
  mechanism: string;

  /** Elimination half-life in hours. Null when not established in humans. */
  halfLifeHours: number | null;
  /** Uncertainty or species caveat around the half-life figure. */
  halfLifeNote?: string;
  /**
   * A half-life the app will draw but will not assert: see `HalfLifeEstimate`
   * for what the three levels mean and why each one has to name a source.
   *
   * Only ever set alongside `halfLifeHours: null`. Where a published human
   * figure exists, that is the figure, and this has nothing to add.
   */
  halfLifeEstimate?: HalfLifeEstimate;
  /** Time to peak plasma concentration in hours, for subcutaneous dosing. */
  tmaxHours?: number;

  routes: Route[];
  doseRanges: DoseRange[];
  titrations?: TitrationPlan[];

  /**
   * How it is sold. "powder" is a lyophilised vial you reconstitute yourself;
   * "solution" arrives pre-mixed and ready to draw, which is how every oil-based
   * anabolic and most growth hormone pens come. A solution vial has a
   * concentration from the moment you open it and never needs the reconstitution
   * step. Defaults to powder.
   */
  preparation?: "powder" | "solution";

  /**
   * International units per milligram, for compounds conventionally dosed in IU
   * rather than by mass. Growth hormone is the case that matters: labels, pens
   * and every conversation about it use IU, so a tracker that only speaks
   * milligrams is useless for it. Absent means the compound is dosed by mass.
   */
  iuPerMg?: number;

  /** Concentrations the solution is commonly sold at, in mg/mL. */
  concentrationsMgPerMl?: number[];

  /** Vial sizes commonly sold, in milligrams. */
  vialSizesMg: number[];
  /** Days the reconstituted vial is usually considered good, refrigerated. */
  reconstitutedDays?: number;

  /**
   * 17-alpha-alkylated, and therefore hepatotoxic by design, the modification
   * that lets an androgen survive first-pass metabolism is the same one that
   * strains the liver. Drives the stacking warning for running two orals at once.
   */
  c17AlphaAlkylated?: boolean;

  /**
   * Suppresses the body's own testosterone production. True for every anabolic
   * androgen; the app uses it to say so plainly rather than leaving it implied.
   */
  suppressesNaturalProduction?: boolean;

  /**
   * Converts to oestradiol via aromatase to a degree that matters in practice.
   *
   * Set on androgens only. Drives the check for an aromatase inhibitor running
   * with nothing to inhibit, which is a way to crash oestradiol for no benefit
   * whatsoever and is common enough to be worth catching. False and absent mean
   * different things here: false is "this was assessed and it does not", absent
   * is "not an androgen, the question does not apply".
   */
  aromatises?: boolean;

  /** What a user typically feels or what is happening, over time. */
  timeline?: { fromHours: number; toHours: number; label: string }[];

  sideEffects: string[];
  contraindications: string[];
  /** Regulatory and sport status notes. */
  status: string;

  /**
   * Receptor-level classes this compound acts on. Only set where stacking two
   * compounds is worth flagging; see MechanismClass.
   */
  mechanismClass?: MechanismClass[];

  /** Components, for blends. */
  components?: { peptideId?: string; name: string; mgPerVial?: number }[];
  /**
   * How a blend's stated dose maps onto its components. "split" divides the
   * total mass by the ratio (KLOW, Wolverine); "per-component" gives each
   * component the full stated dose (CagriSema, dosed 2.4 mg of each).
   * Defaults to "split".
   */
  blendDosing?: "split" | "per-component";

  citations: Citation[];
  /** Set when the whole entry rests on weak evidence. */
  cautionBanner?: string;
}

// ---------------------------------------------------------------------------
// User data
// ---------------------------------------------------------------------------

/** The six accent hues a profile can be tagged with. */
export type ProfileTone = "mint" | "grape" | "tangerine" | "sky" | "rose" | "leaf";

export const PROFILE_TONES: ProfileTone[] = [
  "mint",
  "grape",
  "tangerine",
  "sky",
  "rose",
  "leaf",
];

/**
 * A person the app is tracking. Protocols, doses and vials all belong to
 * exactly one profile, so two people sharing a device never see each other's
 * numbers mixed into their own.
 */
export interface Profile {
  id: string;
  name: string;
  tone: ProfileTone;
  /** Body weight, which is what lets the app work in mcg/kg. */
  weightKg?: number;
  heightCm?: number;
  birthYear?: number;
  sex?: "male" | "female" | "other";
  createdAt: number;
  notes?: string;
}

/**
 * How weight is entered and shown. Storage is always kilograms, so this is a
 * presentation choice and switching it never touches a stored figure.
 */
export type WeightUnit = "kg" | "lb";

export type ScheduleKind = "daily" | "interval-days" | "days-of-week" | "as-needed";

export interface Schedule {
  kind: ScheduleKind;
  /** For interval-days: dose every N days. */
  intervalDays?: number;
  /** For days-of-week: 0 = Sunday .. 6 = Saturday. */
  daysOfWeek?: number[];
  /**
   * Local time of day, "HH:MM". The first of `timesOfDay` when there are
   * several, kept in step so that anything reading a single time still reads
   * the right one.
   */
  timeOfDay?: string;
  /**
   * Every time a dose day carries, "HH:MM" each, for a compound taken more
   * than once a day. Absent means the single `timeOfDay`, which is what every
   * protocol made before this held and why nothing needed migrating.
   *
   * The dose is for the day and is split evenly across these, so two times
   * turn 500 mcg into 250 mcg morning and 250 mcg evening. Read through
   * `scheduleTimes` rather than directly.
   */
  timesOfDay?: string[];
  /** Weeks on, then weeks off. Zero means continuous. */
  cycleWeeksOn?: number;
  cycleWeeksOff?: number;
}

/**
 * A stretch of weeks with its own dose and, optionally, its own frequency.
 *
 * This is the general form of a titration. A titration plan varies the dose and
 * holds the frequency; a phase list can vary both, which is what "twice a week
 * for the first month, then weekly" needs and a titration cannot express.
 *
 * Phases are the user's own construction and live on the protocol, never in the
 * compound library. A published `TitrationPlan` carries a source and an evidence
 * level because it is a claim about what was studied. A phase list is a claim
 * about nothing except what its author intends to do.
 */
export interface ProtocolPhase {
  /** 1-based, for display and for stable list keys. */
  step: number;
  doseMcg: number;
  /**
   * Weeks this phase holds. The final phase runs on indefinitely whatever this
   * says, so its value only affects how the plan is drawn, never what is due.
   */
  weeks: number;
  /**
   * Frequency for this phase. Absent means the phase keeps the protocol's own
   * schedule, which is the common case and the reason it is optional.
   */
  schedule?: Schedule;
  note?: string;
}

export interface Protocol {
  id: string;
  /** Owning profile. Assigned on creation from whichever profile is active. */
  profileId: string;
  peptideId: string;
  /** User's own name for this protocol. */
  name: string;
  active: boolean;
  startedAt: number;
  endedAt?: number;
  doseMcg: number;
  route: Route;
  schedule: Schedule;
  /** Copied from a titration plan, or built by hand. */
  titration?: TitrationStep[];
  /** Index into titration steps, advanced manually or by date. */
  titrationAutoAdvance: boolean;
  /**
   * A hand-built plan by weeks. When present it governs both the dose and, for
   * phases that carry one, the frequency, and it takes precedence over
   * `titration`. Absent on every protocol made before this existed, which is
   * why nothing had to be migrated.
   */
  phases?: ProtocolPhase[];
  /**
   * Sites this protocol rotates through. Empty or absent means all of them.
   * Logging suggests only from this set, but never blocks a different choice.
   * You can always record where the injection actually went.
   */
  sites?: InjectionSite[];
  notes?: string;
}

export interface DoseLog {
  id: string;
  /** Owning profile. Assigned on creation from whichever profile is active. */
  profileId: string;
  protocolId?: string;
  peptideId: string;
  /** Epoch milliseconds of administration. */
  at: number;
  doseMcg: number;
  route: Route;
  site?: InjectionSite;
  /** Vial the dose was drawn from, for inventory depletion. */
  vialId?: string;
  volumeMl?: number;
  units?: number;
  syringeScale?: SyringeScale;
  /** Skipped doses are kept so adherence can be measured honestly. */
  skipped?: boolean;
  notes?: string;
  /** 1-5, optional subjective rating. */
  feeling?: number;
  sideEffects?: string[];
}

/**
 * A body measurement taken at a point in time.
 *
 * The app otherwise records only what goes in. This is the other half: whether
 * any of it is doing anything.
 */
export type MeasurementSource = "manual" | "health-connect";

/**
 * The subjective axes a check-in records.
 *
 * Weight answers "is this working" for a GLP-1 and almost nothing else. Most of
 * the library is now androgens and growth hormone, where the effects people are
 * actually chasing, and the ones that go wrong first, are these. Six is a
 * deliberate ceiling: a daily form long enough to feel like work stops being
 * filled in, and a half-filled record is worse than none.
 */
/**
 * `appetite` is labelled Physical hunger and always will be.
 *
 * The id is deliberately not renamed. It keys every rating anyone has ever
 * saved, and a year of them would go unreadable the moment the list they are
 * drawn from stopped mentioning it. What the axis asks about did not change,
 * only what it is called, so the history carries forward meaning what it always
 * meant. See `document/05-decisions.md`.
 */
export type SymptomId =
  | "energy"
  | "mood"
  | "libido"
  | "sleep"
  | "recovery"
  | "appetite"
  | "foodNoise";

export interface SymptomDef {
  id: SymptomId;
  label: string;
  /** What a 5 means, and what a 1 means. */
  high: string;
  low: string;
  /**
   * Which end of the scale is the good one. Three states, and all three are
   * used:
   *
   * - `true`, a five is what you want. Energy, mood, sleep.
   * - `false`, a one is. Food noise, where five is a day spent thinking about
   *   food and nobody on any protocol is aiming for that.
   * - absent, no opinion. Physical hunger, where the direction depends on what
   *   you are running: suppressed hunger is the point of a GLP-1 and a problem
   *   on a bulk, so the app charts it and declines to judge.
   *
   * The middle case arrived with food noise and is the reason `ratingTone` and
   * `lowestRatedTone` had to learn that `false` is not the same as absent.
   */
  higherIsBetter?: boolean;
  /**
   * What the axis is actually asking, for the axes where that is not obvious
   * from a one-word label. Optional: an axis with nothing to explain shows no
   * question mark rather than an empty one.
   */
  hint?: string;
}

export const SYMPTOMS: SymptomDef[] = [
  { id: "energy", label: "Energy", low: "Flat", high: "Strong", higherIsBetter: true },
  { id: "mood", label: "Mood", low: "Low", high: "Good", higherIsBetter: true },
  { id: "libido", label: "Libido", low: "Absent", high: "High", higherIsBetter: true },
  { id: "sleep", label: "Sleep", low: "Broken", high: "Deep", higherIsBetter: true },
  { id: "recovery", label: "Recovery", low: "Sore", high: "Fresh", higherIsBetter: true },
  {
    id: "appetite",
    label: "Physical hunger",
    low: "None",
    high: "Ravenous",
    hint: "What your body is telling you: an empty or growling stomach, flagging energy from not eating, a real need to eat, and whether a meal actually left you satisfied. Not what your head is doing about food, which is the next one.",
  },
  {
    id: "foodNoise",
    label: "Food noise",
    low: "Quiet",
    high: "Constant",
    higherIsBetter: false,
    hint: "How much of the day food occupied your thoughts: planning the next meal shortly after finishing one, cravings with no hunger behind them, food you could not ignore, the pull to snack when you were not hungry. These two move apart, which is the point of rating them apart: a GLP-1 can quieten the head while the stomach still behaves normally.",
  },
];

export const SYMPTOM_SCALE_MAX = 5;

/**
 * One day's subjective reading.
 *
 * At most one per profile per local day, keyed on the day rather than the
 * instant, because "how was today" is not a measurement taken at a moment. A
 * second entry for the same day replaces the first.
 *
 * Ratings are partial on purpose. Rating only what you noticed is honest;
 * forcing a number onto every axis manufactures data.
 */
export interface CheckIn {
  id: string;
  profileId: string;
  /** Local midnight of the day this describes. */
  at: number;
  ratings: Partial<Record<SymptomId, number>>;
  notes?: string;
}

export interface Measurement {
  id: string;
  profileId: string;
  at: number;
  weightKg?: number;
  waistCm?: number;
  bodyFatPct?: number;
  /**
   * Hours slept, and resting heart rate. Both are read from the platform's
   * health store rather than typed, and both matter here for the same reason:
   * they are the two objective numbers that move with the subjective ratings in
   * a check-in, so a claim like "sleep is worse on this dose" can be checked
   * against something other than memory.
   */
  sleepHours?: number;
  restingHrBpm?: number;
  notes?: string;
  /** Where the reading came from. Absent means it was typed in. */
  source?: MeasurementSource;
  /** The platform's own record id, so a re-read does not duplicate it. */
  externalId?: string;
}

/**
 * Side effects worth offering as one tap. Deliberately short, a long list
 * gets skipped, and anything unusual belongs in the note field.
 */
export const COMMON_SIDE_EFFECTS = [
  "Nausea",
  "Vomiting",
  "Diarrhoea",
  "Constipation",
  "Headache",
  "Fatigue",
  "Appetite loss",
  "Injection site reaction",
  "Water retention",
  "Joint pain",
  "Insomnia",
  "Flushing",
] as const;

/** 1 is rough, 5 is great. */
export const FEELING_LABELS: Record<number, string> = {
  1: "Rough",
  2: "Off",
  3: "Fine",
  4: "Good",
  5: "Great",
};

export type InjectionSite =
  | "abdomen-ul"
  // Midline sites exist because other trackers rotate through them, Shotsy's
  // seven-position abdominal cycle uses both. Collapsing them into left or right
  // on import would corrupt the rotation view it took someone months to build.
  | "abdomen-um"
  | "abdomen-ur"
  | "abdomen-ll"
  | "abdomen-lm"
  | "abdomen-lr"
  | "thigh-l"
  | "thigh-r"
  | "arm-l"
  | "arm-r"
  | "glute-l"
  | "glute-r";

/**
 * Where a vial is in its life.
 *
 * "on-order" is paid for and not here. It exists so that stock in the post is
 * visible without being counted: the app must never say you have three weeks
 * left when half of that is with a courier. Everything that asks "can I draw a
 * dose from this" goes through `vialUsable`, which excludes it.
 */
export type VialState = "on-order" | "sealed" | "reconstituted" | "finished" | "discarded";

export interface Vial {
  id: string;
  /** Owning profile. Assigned on creation from whichever profile is active. */
  profileId: string;
  peptideId: string;
  /** Label strength in milligrams. */
  strengthMg: number;
  state: VialState;
  /** Where it came from, free text. */
  supplier?: string;
  lot?: string;
  /** What the vial cost, in whole currency units. */
  cost?: number;
  /** ISO currency code, e.g. "INR". Falls back to the app setting. */
  currency?: string;
  /**
   * The order this vial arrived in, if its shipping was recorded.
   *
   * Only ever set when there is shipping to share. A vial bought on its own
   * carries no order, because an order with nothing to say about it would be a
   * record kept for its own sake.
   */
  orderId?: string;
  acquiredAt?: number;
  /** Manufacturer expiry of the sealed vial. */
  expiresAt?: number;

  /** Set when reconstituted, or at acquisition for a pre-mixed solution. */
  reconstitutedAt?: number;
  /**
   * The volume the drug is dissolved in. Diluent you added for a powder; the
   * manufacturer's fill volume for a pre-mixed solution. Either way it is what
   * turns a label strength into a concentration, so the same arithmetic serves
   * both and no separate field is needed.
   */
  diluentMl?: number;
  diluent?: DiluentKind;
  /**
   * The bottle the water came from, when it was drawn from tracked stock.
   *
   * Absent means the water was not tracked, which is the honest state for every
   * vial made up before bottles existed and for anyone who does not want to
   * count millilitres.
   */
  diluentBottleId?: string;
  /**
   * Cumulative mass withdrawn, in micrograms. Mass rather than volume, because
   * a dose has a mass whatever state the vial is in, volume only becomes
   * meaningful once the vial has been reconstituted.
   */
  drawnMcg?: number;
  /** Beyond-use date, from first puncture. */
  budAt?: number;

  notes?: string;
}

export interface Settings {
  theme: "dark" | "light" | "system";
  /** Preferred display unit for doses. */
  doseUnit: "mcg" | "mg";
  /** Default syringe, by id. Never assumed, set on first use. */
  defaultSyringeId?: string;
  /** True once the user has acknowledged the safety notice. */
  disclaimerAcceptedAt?: number;
  /** Days before a vial's beyond-use date to start warning. */
  budWarningDays: number;
  /** Warn when fewer than this many doses remain in stock. */
  lowStockDoses: number;
  weekStartsOn: 0 | 1;
  /** Currency vial costs are entered in. */
  currency: string;
  /** Kilograms or pounds for weight entry. Stored always in kg. */
  weightUnit: WeightUnit;

  /**
   * Self-hosted sync, web only. Absent means off, which is what every install
   * has until someone deliberately turns it on.
   *
   * The password is deliberately not here. It never leaves the login form: the
   * key derived from it lives in memory for the session and nowhere else, so
   * an exported backup cannot hand someone the means to read the server copy.
   */
  sync?: {
    /** Base address of the sync server, for example https://bench.example.com */
    url: string;
    username: string;
    /**
     * The server version this device last agreed with, not a clock reading of
     * its own. Two devices disagree about the time and never disagree about
     * which copy they last saw, which is why the decision in `decide.ts` is
     * made from this and not from a timestamp comparison.
     *
     * Absent means this device has never synced with this server, which is
     * treated as a question to ask rather than a race to win.
     */
    remoteSeenAt?: number;
  };

  /**
   * Collapse sealed vials of the same compound and strength into one row on the
   * Stock page, with their doses and value added up.
   *
   * Off by default. Someone with three vials may well want to see three vials,
   * and the grouped view is only an improvement once the list is long enough to
   * be tedious, which is a judgement only the owner of the fridge can make.
   */
  groupIdenticalVials?: boolean;

  /**
   * Automatic backups to the device's Documents folder. Android only, a web
   * page cannot write to a folder unattended, so the manual export is the answer
   * there.
   */
  backupEnabled: boolean;
  /** Hours between automatic backups. */
  backupIntervalHours: number;
  /** How many backups to keep before the oldest is removed. */
  backupKeep: number;
  /** When the last automatic or manual backup was written. */
  lastBackupAt?: number;
  /**
   * When the document last changed in a way that ends up in a backup file.
   *
   * Stored rather than held in memory because the question it answers, is there
   * anything unsaved, has to survive a reload. A flag that resets when the tab
   * is closed would go quiet at exactly the moment the work is most at risk.
   *
   * Written by the store itself, not by any screen, so it cannot be forgotten
   * by a new one.
   */
  dataChangedAt?: number;
  /** When the "nothing is backed up" reminder was last dismissed. */
  backupNagDismissedAt?: number;

  /**
   * Reminders for a scheduled dose.
   *
   * Off until someone turns it on, and the permission is only asked for at that
   * moment rather than at startup. An app that asks on first launch teaches
   * people to refuse, and this one has nothing to say until there is a plan.
   *
   * Absent means off, which is what every install has today. Nothing was
   * migrated to add this.
   */
  reminders?: RemindersSettings;
}

/**
 * How dose reminders behave.
 *
 * Scheduled on the device by the operating system. Nothing is sent anywhere, so
 * this adds no network call and the privacy claim is untouched. See
 * `document/05-decisions.md`.
 */
export interface RemindersSettings {
  enabled: boolean;
  /**
   * Minutes before the scheduled time to fire. Zero means on the hour.
   *
   * Some people want the nudge while they are still near the fridge rather than
   * at the moment the dose is already late.
   */
  leadMinutes: number;
  /**
   * Name the compound and the dose, or say only that something is due.
   *
   * Discreet by default, and deliberately. A notification reading "BPC-157
   * 250 mcg" sits on a lock screen in front of whoever is next to you, and the
   * rest of this app has been careful never to put that there. Someone who
   * would rather see what is due can say so; nobody has it decided for them.
   */
  showCompound: boolean;
  /** Days ahead the calendar export covers, for surfaces that cannot schedule. */
  calendarDays: number;
}

export type LabCategory = "growth" | "metabolic" | "lipids" | "organ" | "blood" | "cardio";

/**
 * A band of a guideline-defined scale, such as the diabetes cut-offs for HbA1c.
 * `from` is inclusive, `under` exclusive; either may be absent for an open end.
 */
export interface LabBand {
  from?: number;
  under?: number;
  label: string;
  tone: "leaf" | "tangerine" | "rose";
}

/**
 * A published set of cut-offs, used only where a real guideline defines the
 * numbers rather than the testing laboratory.
 */
export interface LabGuideline {
  /** Who defines these, shown next to the verdict so it can be checked. */
  source: string;
  bands: LabBand[];
}

/**
 * One thing that can be measured in blood, plus why it is worth watching while
 * running these compounds.
 *
 * Deliberately carries no built-in "normal range" for most markers. A reference
 * interval belongs to the assay that produced the number, varies by sex, age and
 * laboratory, and is printed on every report, so it is recorded per result from
 * your own paperwork instead of being asserted here. `guideline` exists only for
 * the handful of markers where a body like the ADA or AHA defines the thresholds
 * outright, which is a different kind of claim.
 */
export interface LabMarker {
  id: string;
  name: string;
  aka?: string;
  unit: string;
  decimals: number;
  category: LabCategory;
  /** Why it matters here, in one line. */
  why: string;
  guideline?: LabGuideline;
  /** Why no single normal range is given, when that needs saying. */
  rangeNote?: string;
  /** Higher is better, so a fall is the thing to flag. Defaults to false. */
  higherIsBetter?: boolean;
}

export interface LabResult {
  id: string;
  profileId: string;
  at: number;
  markerId: string;
  value: number;
  /**
   * The reference interval printed on your own report. Optional, but it is what
   * makes an in-range verdict meaningful for assay-specific markers.
   */
  refLow?: number;
  refHigh?: number;
  /** Which lab or panel this came from. */
  lab?: string;
  notes?: string;
}

/**
 * A half-life you supplied yourself, for a library compound that has none.
 *
 * Deliberately not in the library. A number nobody measured does not belong in
 * something every install downloads, and the difference between "the library
 * says 2 hours" and "you decided on 2 hours" is exactly the difference this
 * whole app is careful about. Yours lives in your data, travels in your backup,
 * and is labelled as yours everywhere it has an effect.
 *
 * Only ever consulted where the library has no published human figure. If one
 * is added later, the published figure wins and the app says so, because a
 * measurement in people beats an assumption whoever made it.
 */
export interface HalfLifeOverride {
  hours: number;
  /** When you set it, so the app can say how old your own figure is. */
  setAt: number;
  /** Optional: where you got it. Free text, shown as written. */
  note?: string;
}

/**
 * One purchase, and the only thing the app knows about it: what the postage
 * cost.
 *
 * A shelf of vials is not a shelf of orders, and this deliberately stops short
 * of becoming one. There is no supplier, no tracking number and no date beyond
 * when it was recorded, because the request was about cost per vial and every
 * extra field would be a field to maintain, migrate and eventually disagree
 * with reality.
 *
 * The share each vial carries is not stored. It is derived from how many vials
 * still point at the order, so deleting one redistributes its share across the
 * rest without rewriting a single row. Sixty dollars of postage on a box of
 * three is twenty each; throw one away and the remaining two carry thirty.
 */
/** What a vial was made up with. Bottles on the shelf are one of these too. */
export type DiluentKind = "bacteriostatic" | "sterile" | "saline" | "oil";

/**
 * A bottle of water on the shelf, measured in millilitres.
 *
 * Deliberately not a `Vial`. Everything about a vial is mass: a label strength
 * in milligrams, a concentration derived from it, a cost per milligram, a date
 * the doses run out. Water has none of those, so a bottle wearing that type
 * would be a wrong answer in every one of those figures rather than a missing
 * one, and each of them would have to remember to exclude it.
 *
 * Two inventories is the price. It buys the guarantee that nothing which
 * reasons about doses can ever be handed a bottle of water.
 */
export interface DiluentBottle {
  id: string;
  profileId: string;
  kind: DiluentKind;
  /** What the label says, in millilitres. */
  volumeMl: number;
  /** Cumulative millilitres drawn out. */
  drawnMl?: number;
  state: "sealed" | "open" | "finished" | "discarded";
  /** When it was first punctured, which is when its own clock starts. */
  openedAt?: number;
  /** The manufacturer's date, which only binds while it is sealed. */
  expiresAt?: number;
  /** Beyond-use date, from first puncture. */
  budAt?: number;
  supplier?: string;
  cost?: number;
  currency?: string;
  /** The order it arrived in, so it shares postage like anything else. */
  orderId?: string;
}

export interface Order {
  id: string;
  profileId: string;
  /** Postage and handling for the whole order, in whole currency units. */
  shippingCost: number;
  /** Matches the vials it covers. Falls back to the app setting. */
  currency?: string;
  placedAt: number;
}

export interface AppData {
  version: number;
  profiles: Profile[];
  measurements: Measurement[];
  labs: LabResult[];
  /** Whose data the app is currently showing. */
  activeProfileId: string;
  protocols: Protocol[];
  logs: DoseLog[];
  vials: Vial[];
  settings: Settings;
  /** User-authored peptides, merged over the built-in library. */
  customPeptides: Peptide[];
  /** Daily subjective ratings, at most one per local day. */
  checkIns: CheckIn[];
  /**
   * Your own half-lives, keyed by peptide id. Not per profile: it is a belief
   * about a compound rather than a fact about a person, and the same belief
   * would otherwise have to be retyped for every profile on the device.
   */
  halfLifeOverrides?: Record<string, HalfLifeOverride>;
  /** Purchases whose shipping was recorded, referenced by their vials. */
  orders: Order[];
  /** Bottles of water and saline, counted in millilitres rather than mass. */
  diluents: DiluentBottle[];
}

/**
 * Off, discreet, and a quarter ahead.
 *
 * Ninety days for the calendar export is long enough not to be re-exported
 * every week and short enough that a forgotten re-export clears itself within a
 * quarter rather than haunting a calendar for a year.
 */
export const DEFAULT_REMINDERS: RemindersSettings = {
  enabled: false,
  leadMinutes: 0,
  showCompound: false,
  calendarDays: 90,
};

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  doseUnit: "mcg",
  budWarningDays: 5,
  lowStockDoses: 4,
  weekStartsOn: 1,
  currency: "INR",
  weightUnit: "kg",
  backupEnabled: true,
  backupIntervalHours: 24,
  backupKeep: 10,
  reminders: DEFAULT_REMINDERS,
};

export const DEFAULT_PROFILE_ID = "me";

export const DEFAULT_PROFILE: Profile = {
  id: DEFAULT_PROFILE_ID,
  name: "Me",
  tone: "mint",
  createdAt: 0,
};

/**
 * The shape version this build reads and writes.
 *
 * Lives here rather than beside the migration so EMPTY_DATA can reference it
 * without a circular import. Getting that wrong is what produced backups
 * stamped "version 1" holding version 5 data: EMPTY_DATA hard-coded 1, resetAll
 * restored it, and exportData faithfully wrote the lie into the file.
 */
export const DATA_VERSION = 8;

export const EMPTY_DATA: AppData = {
  version: DATA_VERSION,
  profiles: [DEFAULT_PROFILE],
  measurements: [],
  labs: [],
  activeProfileId: DEFAULT_PROFILE_ID,
  protocols: [],
  logs: [],
  vials: [],
  settings: DEFAULT_SETTINGS,
  customPeptides: [],
  checkIns: [],
  halfLifeOverrides: {},
  orders: [],
  diluents: [],
};

/** Currencies offered in settings. Any ISO code works; these are shortcuts. */
export const CURRENCIES: { code: string; label: string }[] = [
  { code: "INR", label: "Indian rupee (₹)" },
  { code: "USD", label: "US dollar ($)" },
  { code: "EUR", label: "Euro (€)" },
  { code: "GBP", label: "Pound sterling (£)" },
  { code: "AED", label: "UAE dirham (د.إ)" },
  { code: "CAD", label: "Canadian dollar (C$)" },
  { code: "AUD", label: "Australian dollar (A$)" },
  { code: "SGD", label: "Singapore dollar (S$)" },
];

export const INJECTION_SITES: { id: InjectionSite; label: string; group: string }[] = [
  { id: "abdomen-ul", label: "Abdomen, upper left", group: "Abdomen" },
  { id: "abdomen-um", label: "Abdomen, upper middle", group: "Abdomen" },
  { id: "abdomen-ur", label: "Abdomen, upper right", group: "Abdomen" },
  { id: "abdomen-ll", label: "Abdomen, lower left", group: "Abdomen" },
  { id: "abdomen-lm", label: "Abdomen, lower middle", group: "Abdomen" },
  { id: "abdomen-lr", label: "Abdomen, lower right", group: "Abdomen" },
  { id: "thigh-l", label: "Left thigh", group: "Thigh" },
  { id: "thigh-r", label: "Right thigh", group: "Thigh" },
  { id: "arm-l", label: "Left arm", group: "Arm" },
  { id: "arm-r", label: "Right arm", group: "Arm" },
  { id: "glute-l", label: "Left glute", group: "Glute" },
  { id: "glute-r", label: "Right glute", group: "Glute" },
];

export const EVIDENCE_LABEL: Record<EvidenceLevel, string> = {
  approved: "Approved label",
  clinical: "Clinical trial",
  preliminary: "Early human data",
  preclinical: "Animal data only",
  anecdotal: "Community practice",
};

export const EVIDENCE_DETAIL: Record<EvidenceLevel, string> = {
  approved: "Dosing comes from an FDA-approved prescribing label.",
  clinical: "Dosing comes from published human clinical trials.",
  preliminary: "Human data exists but is limited to small or early-phase studies.",
  preclinical: "Only animal or laboratory data supports this. No human dosing has been established.",
  anecdotal: "Widely repeated in community protocols with no clinical evidence behind it.",
};

export const ROUTE_LABEL: Record<Route, string> = {
  subcutaneous: "Subcutaneous",
  intramuscular: "Intramuscular",
  oral: "Oral",
  intranasal: "Intranasal",
  topical: "Topical",
  intravenous: "Intravenous",
};

export const CATEGORY_LABEL: Record<PeptideCategory, string> = {
  metabolic: "Metabolic",
  repair: "Repair & healing",
  "growth-hormone": "Growth hormone axis",
  cognitive: "Cognitive",
  longevity: "Longevity & mitochondrial",
  immune: "Immune",
  sexual: "Sexual function",
  cosmetic: "Skin & cosmetic",
  anabolic: "Anabolic steroids",
  ancillary: "Ancillaries & recovery",
  blend: "Blends",
};
