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

export type ScheduleKind = "daily" | "interval-days" | "days-of-week" | "as-needed";

export interface Schedule {
  kind: ScheduleKind;
  /** For interval-days: dose every N days. */
  intervalDays?: number;
  /** For days-of-week: 0 = Sunday .. 6 = Saturday. */
  daysOfWeek?: number[];
  /** Local time of day, "HH:MM". */
  timeOfDay?: string;
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
export type SymptomId = "energy" | "mood" | "libido" | "sleep" | "recovery" | "appetite";

export interface SymptomDef {
  id: SymptomId;
  label: string;
  /** What a 5 means, and what a 1 means. */
  high: string;
  low: string;
  /**
   * Whether a higher rating is a better outcome. Absent where the direction
   * depends on what you are running: suppressed appetite is the point of a
   * GLP-1 and a problem on a bulk, so the app charts it and declines to judge.
   */
  higherIsBetter?: boolean;
}

export const SYMPTOMS: SymptomDef[] = [
  { id: "energy", label: "Energy", low: "Flat", high: "Strong", higherIsBetter: true },
  { id: "mood", label: "Mood", low: "Low", high: "Good", higherIsBetter: true },
  { id: "libido", label: "Libido", low: "Absent", high: "High", higherIsBetter: true },
  { id: "sleep", label: "Sleep", low: "Broken", high: "Deep", higherIsBetter: true },
  { id: "recovery", label: "Recovery", low: "Sore", high: "Fresh", higherIsBetter: true },
  { id: "appetite", label: "Appetite", low: "None", high: "Ravenous" },
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

export type VialState = "sealed" | "reconstituted" | "finished" | "discarded";

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
  diluent?: "bacteriostatic" | "sterile" | "saline" | "oil";
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
  weightUnit: "kg" | "lb";

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
  /** When the "nothing is backed up" reminder was last dismissed. */
  backupNagDismissedAt?: number;
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
}

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
export const DATA_VERSION = 6;

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
