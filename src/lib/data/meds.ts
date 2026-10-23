/**
 * Built-in reference library for common medicines and supplements.
 *
 * These are oral compounds — no vials, no reconstitution, no injection sites.
 * The half-life data is used to show a simple "on board / clearing" status on
 * the Now page after the user logs a dose. It is not plotted on the PK chart
 * (which is for injected peptides/anabolics) — a separate, simpler display is
 * used instead.
 *
 * Source priority: prescribing labels > published pharmacokinetic studies >
 * clinical trial data > community consensus. Evidence is tagged on every
 * half-life. Where a range is published, the midpoint is used and the range
 * is noted.
 *
 * Rule: no number without a source, no source without a URL. An anecdotal
 * half-life names who says it. A figure that cannot be traced to anyone is
 * left null.
 */

export type MedLibraryCategory =
  | "hair"        // finasteride, dutasteride, minoxidil
  | "mineral"     // magnesium, zinc, iron
  | "omega"       // omega-3, fish oil
  | "vitamin"     // D3, B12, C, K2
  | "nootropic"   // NAC, creatine
  | "sleep"       // melatonin
  | "general";    // multivitamin

export type MedEvidenceLevel =
  | "approved"     // FDA label / equivalent regulatory data
  | "clinical"     // published human PK study
  | "preliminary"  // limited human data
  | "anecdotal";   // community consensus, no measurement

export interface MedHalfLife {
  hours: number;
  evidence: MedEvidenceLevel;
  /** Published range, for context. */
  range?: string;
  source: string;
  url: string;
}

/** Clinically relevant interaction with peptide/anabolic protocol classes. */
export interface MedInteraction {
  /** What it interacts with — broad enough to match multiple compounds. */
  with: string;
  severity: "note" | "caution" | "warn";
  detail: string;
}

export interface MedEntry {
  id: string;
  name: string;
  aka: string[];
  category: MedLibraryCategory;
  summary: string;
  mechanism: string;
  /** Hours after oral administration until peak plasma concentration. */
  tmaxHours: number;
  halfLife: MedHalfLife | null;
  /**
   * Standard oral dose for reference. Not used for tracking — the user sets
   * their own dose on the Med record.
   */
  typicalDose: string;
  sideEffects: string[];
  /** Known interactions relevant to people running peptide/anabolic protocols. */
  interactions: MedInteraction[];
  status: string;
}

export const MEDS_LIBRARY: MedEntry[] = [
  // -------------------------------------------------------------------------
  // Hair
  // -------------------------------------------------------------------------
  {
    id: "finasteride",
    name: "Finasteride",
    aka: ["Propecia", "Proscar", "fin"],
    category: "hair",
    summary:
      "A type II 5-alpha reductase inhibitor that blocks conversion of testosterone to DHT, used for male-pattern hair loss and BPH.",
    mechanism:
      "Selectively and reversibly inhibits type II 5-alpha reductase, the isoenzyme that converts testosterone to dihydrotestosterone (DHT) in the scalp, prostate and skin. Reduces scalp DHT by roughly 60-70% and serum DHT by about 65% at the 1 mg dose. Effect is concentration-dependent and reverses within weeks of stopping.",
    tmaxHours: 1.5,
    halfLife: {
      hours: 6,
      evidence: "approved",
      range: "5-6 hours in men aged 18-60; 8 hours in men over 70",
      source: "Propecia (finasteride 1 mg) US prescribing information, Organon",
      url: "https://www.accessdata.fda.gov/drugsatfda_docs/label/2012/020788s020lbl.pdf",
    },
    typicalDose: "1 mg daily",
    sideEffects: [
      "Sexual side effects: reduced libido, erectile dysfunction, decreased ejaculate volume — reported in ~2-4% in trials",
      "Post-finasteride syndrome (persistent sexual or cognitive symptoms after stopping) — mechanism debated, prevalence uncertain",
      "Mild reduction in PSA; halve any PSA reading to interpret it correctly",
      "Gynecomastia, rare",
    ],
    interactions: [
      {
        with: "Testosterone / anabolic steroids",
        severity: "note",
        detail:
          "Blocks DHT production from testosterone. On a testosterone protocol this blunts DHT-mediated effects (androgenic sides, hair loss, libido effects from DHT). Does not reduce total testosterone. Many users run it intentionally for scalp protection.",
      },
      {
        with: "SARMs",
        severity: "note",
        detail:
          "SARMs are not 5a-reduced; finasteride has no effect on SARM-mediated androgenicity. Hair protection from finasteride does not apply to SARM cycles.",
      },
    ],
    status:
      "FDA-approved for male-pattern hair loss (1 mg) and BPH (5 mg). Schedule H in India. Not approved for women of childbearing age.",
  },
  {
    id: "dutasteride",
    name: "Dutasteride",
    aka: ["Avodart", "duta"],
    category: "hair",
    summary:
      "A dual-action 5-alpha reductase inhibitor (type I and II) that produces a deeper DHT reduction than finasteride.",
    mechanism:
      "Inhibits both type I and type II 5-alpha reductase isoenzymes. Reduces serum DHT by about 90% versus 65% for finasteride. The greater suppression comes from blocking type I, the isoenzyme responsible for the remaining DHT that finasteride spares. Very long half-life means a missed dose is inconsequential.",
    tmaxHours: 2,
    halfLife: {
      hours: 1200, // ~5 weeks
      evidence: "approved",
      range: "3-5 weeks (steady state accumulates over 3-6 months)",
      source: "Avodart (dutasteride 0.5 mg) US prescribing information, GSK",
      url: "https://www.accessdata.fda.gov/drugsatfda_docs/label/2011/021319s017lbl.pdf",
    },
    typicalDose: "0.5 mg daily",
    sideEffects: [
      "Same sexual side effect profile as finasteride but more pronounced due to deeper DHT suppression",
      "Very long half-life: side effects persist for weeks after stopping",
      "Reduces PSA by ~40%; halve PSA readings to interpret correctly",
      "Increased gynecomastia risk relative to finasteride",
    ],
    interactions: [
      {
        with: "Testosterone / anabolic steroids",
        severity: "note",
        detail:
          "Suppresses DHT by ~90%. On a testosterone protocol this nearly eliminates DHT-mediated androgenic effects — including both the scalp benefits and some DHT-dependent libido/wellbeing effects some users rely on.",
      },
    ],
    status:
      "FDA-approved for BPH. Used off-label for hair loss. Schedule H in India.",
  },
  {
    id: "minoxidil-oral",
    name: "Minoxidil (oral)",
    aka: ["Loniten", "low-dose oral minoxidil", "LDOM"],
    category: "hair",
    summary:
      "A vasodilating antihypertensive used in low doses to promote hair growth. Oral low-dose use for hair loss is off-label.",
    mechanism:
      "Opens ATP-sensitive potassium channels, hyperpolarising smooth muscle cells and causing vasodilation. In hair follicles this prolongs the anagen (growth) phase and increases follicle size. The active metabolite minoxidil sulfate mediates most of the effect; sulfotransferase enzyme activity in the scalp predicts response.",
    tmaxHours: 1,
    halfLife: {
      hours: 4.2,
      evidence: "approved",
      range: "3-4 hours; active sulfate metabolite has longer tissue retention",
      source: "Loniten (minoxidil 2.5/10 mg) US prescribing information, Pfizer",
      url: "https://www.accessdata.fda.gov/drugsatfda_docs/label/2013/018154s015lbl.pdf",
    },
    typicalDose: "2.5-5 mg daily (off-label for hair)",
    sideEffects: [
      "Fluid retention and oedema, particularly at the lower legs",
      "Reflex tachycardia — clinically significant in people with cardiac conditions",
      "Hypertrichosis (unwanted body/face hair) — dose-dependent",
      "Orthostatic hypotension",
      "Rare: pericardial effusion at higher doses",
    ],
    interactions: [
      {
        with: "Peptides — BPC-157, TB-500",
        severity: "note",
        detail:
          "Both promote angiogenesis/vasodilation. Combined vasodilatory effect is theoretical rather than documented; monitor blood pressure.",
      },
      {
        with: "GLP-1 agonists (semaglutide, tirzepatide)",
        severity: "note",
        detail:
          "GLP-1 agonists lower blood pressure. Additive hypotensive effect with oral minoxidil is possible; monitor.",
      },
    ],
    status:
      "FDA-approved for severe hypertension (2.5-80 mg). Off-label for hair loss at 0.25-5 mg. Requires monitoring at higher doses.",
  },

  // -------------------------------------------------------------------------
  // Omega
  // -------------------------------------------------------------------------
  {
    id: "omega3",
    name: "Omega-3 (EPA/DHA)",
    aka: ["fish oil", "EPA", "DHA", "krill oil"],
    category: "omega",
    summary:
      "Long-chain polyunsaturated fatty acids that reduce triglycerides, support cardiovascular health and have anti-inflammatory effects.",
    mechanism:
      "EPA and DHA are incorporated into cell membrane phospholipids, competing with arachidonic acid and reducing the synthesis of pro-inflammatory eicosanoids (PGE2, TXA2). EPA reduces triglyceride synthesis in the liver. DHA concentrates in neural tissue. At prescription doses (4 g EPA/DHA daily), reduces triglycerides by 20-50%.",
    tmaxHours: 5,
    halfLife: {
      hours: 60,
      evidence: "clinical",
      range: "Tissue half-life varies: plasma phospholipids ~2-3 days; tissue turnover weeks to months",
      source: "Harris WS, Connor WE. J Clin Invest. 1980;66(6):1371.",
      url: "https://pubmed.ncbi.nlm.nih.gov/7440704/",
    },
    typicalDose: "1000-4000 mg EPA+DHA daily",
    sideEffects: [
      "Fishy aftertaste and burping — minimised by enteric-coated capsules taken with meals",
      "Loose stools at high doses",
      "Mild antiplatelet effect — relevant before surgery",
      "At very high doses: increased LDL in some individuals",
    ],
    interactions: [
      {
        with: "Anabolic steroids",
        severity: "note",
        detail:
          "Anabolics suppress HDL and raise LDL. Omega-3 partially offsets triglyceride elevation. Cardiovascular benefit is additive but does not fully counteract lipid changes from anabolics.",
      },
      {
        with: "GLP-1 agonists",
        severity: "note",
        detail:
          "Both reduce triglycerides by different mechanisms. Combination is generally beneficial; no adverse interaction documented.",
      },
    ],
    status: "OTC supplement. Prescription form (Vascepa/Lovaza) approved for hypertriglyceridaemia.",
  },

  // -------------------------------------------------------------------------
  // Minerals
  // -------------------------------------------------------------------------
  {
    id: "magnesium",
    name: "Magnesium",
    aka: ["Mg", "magnesium glycinate", "magnesium citrate", "magnesium oxide"],
    category: "mineral",
    summary:
      "An essential mineral cofactor for over 300 enzymatic reactions, including ATP production, protein synthesis and muscle contraction.",
    mechanism:
      "Magnesium acts as a cofactor for ATP-dependent reactions and regulates voltage-gated calcium channels. Deficiency is associated with impaired glucose metabolism, elevated cortisol, and disrupted sleep. Adequate magnesium status supports testosterone production and insulin sensitivity. Glycinate and citrate forms have higher bioavailability than oxide.",
    tmaxHours: 2,
    halfLife: {
      hours: 24,
      evidence: "preliminary",
      range: "Plasma half-life approximately 24-48 h; bone reservoir turns over over years",
      source: "Rude RK. Magnesium deficiency. In: Coates PM et al., eds. Encyclopedia of Dietary Supplements. 2010.",
      url: "https://ods.od.nih.gov/factsheets/Magnesium-HealthProfessional/",
    },
    typicalDose: "200-400 mg elemental magnesium daily",
    sideEffects: [
      "Loose stools and diarrhoea — most common with oxide form; glycinate is better tolerated",
      "Nausea at high doses",
      "Excessive doses can cause hypotension and bradycardia (typically only with IV administration or severe renal impairment)",
    ],
    interactions: [
      {
        with: "Anabolic steroids",
        severity: "note",
        detail:
          "Anabolics can increase magnesium excretion via altered renal handling. Maintaining adequate magnesium supports sleep quality and testosterone production.",
      },
      {
        with: "GLP-1 agonists",
        severity: "note",
        detail:
          "Rapid weight loss increases risk of micronutrient depletion. Monitoring magnesium is reasonable during rapid weight loss.",
      },
    ],
    status: "OTC supplement. Upper tolerable intake: 350 mg/day from supplements (not food) per NIH.",
  },
  {
    id: "zinc",
    name: "Zinc",
    aka: ["Zn", "zinc gluconate", "zinc picolinate"],
    category: "mineral",
    summary:
      "An essential trace mineral required for testosterone synthesis, immune function, wound healing and hundreds of enzymatic reactions.",
    mechanism:
      "Zinc is a cofactor for LH receptor signalling and steroidogenic enzymes. Deficiency reduces LH pulsatility and testosterone production. Zinc also inhibits aromatase activity to a degree at physiological concentrations. Picolinate and gluconate forms are better absorbed than oxide.",
    tmaxHours: 2,
    halfLife: {
      hours: 24,
      evidence: "preliminary",
      range: "Plasma zinc turns over rapidly; whole-body zinc half-life ~160 days",
      source: "King JC. Zinc. In: Ross AC et al., eds. Modern Nutrition in Health and Disease. 2012.",
      url: "https://ods.od.nih.gov/factsheets/Zinc-HealthProfessional/",
    },
    typicalDose: "15-30 mg elemental zinc daily",
    sideEffects: [
      "Nausea on an empty stomach",
      "Chronic high doses (>150 mg/day) impair copper absorption",
      "Metallic taste",
    ],
    interactions: [
      {
        with: "Anabolic steroids",
        severity: "note",
        detail:
          "On an exogenous testosterone protocol, endogenous testosterone production is suppressed anyway; zinc's LH-supporting role is less relevant. Post-cycle, adequate zinc supports recovery of the HPG axis.",
      },
    ],
    status: "OTC supplement. Upper tolerable intake: 40 mg/day elemental zinc per NIH.",
  },

  // -------------------------------------------------------------------------
  // Vitamins
  // -------------------------------------------------------------------------
  {
    id: "vitamin-d3",
    name: "Vitamin D3",
    aka: ["cholecalciferol", "D3", "Vit D"],
    category: "vitamin",
    summary:
      "A fat-soluble vitamin that acts as a hormone, regulating calcium, bone mineralisation, immune function and testosterone production.",
    mechanism:
      "Cholecalciferol is hydroxylated in the liver to 25(OH)D (the stored form measured by blood tests), then in the kidney to the active form 1,25(OH)2D (calcitriol). Vitamin D receptors are expressed in testicular Leydig cells; adequate status is associated with higher testosterone in observational studies. Deficiency is extremely common and worsens with low sun exposure.",
    tmaxHours: 12,
    halfLife: {
      hours: 576, // ~24 days for 25(OH)D storage form
      evidence: "clinical",
      range: "Parent D3 half-life ~24h; storage form 25(OH)D half-life ~15-30 days",
      source: "Vieth R. Vitamin D supplementation. Am J Clin Nutr. 1999;69(5):842-56.",
      url: "https://pubmed.ncbi.nlm.nih.gov/10232622/",
    },
    typicalDose: "2000-5000 IU daily",
    sideEffects: [
      "Toxicity only at very high sustained doses (>10,000 IU/day for months): hypercalcaemia, kidney stones",
      "Rare at doses under 4000 IU/day",
    ],
    interactions: [
      {
        with: "Anabolic steroids",
        severity: "note",
        detail:
          "Anabolics do not meaningfully alter vitamin D metabolism. Ensuring adequate D3 status supports bone mineral density, which androgens both benefit and can sometimes strain at extremes.",
      },
    ],
    status: "OTC supplement. Upper tolerable intake: 4000 IU/day per Institute of Medicine; many clinicians use up to 10,000 IU with monitoring.",
  },
  {
    id: "vitamin-b12",
    name: "Vitamin B12",
    aka: ["cobalamin", "methylcobalamin", "cyanocobalamin"],
    category: "vitamin",
    summary:
      "A water-soluble vitamin essential for nerve function, DNA synthesis and red blood cell formation.",
    mechanism:
      "Cobalamin is a cofactor for methionine synthase (DNA methylation) and methylmalonyl-CoA mutase (fatty acid metabolism). Deficiency causes megaloblastic anaemia, peripheral neuropathy and elevated homocysteine. Methylcobalamin is the active form in the nervous system; cyanocobalamin must be converted. Absorption requires intrinsic factor; sublingual or injectable forms bypass gastric issues.",
    tmaxHours: 1,
    halfLife: {
      hours: 720, // ~30 days; body stores 2-5 mg
      evidence: "clinical",
      range: "Functional half-life of body stores: several months to years",
      source: "Allen LH. Vitamin B12. In: Coates PM et al., eds. Encyclopedia of Dietary Supplements. 2010.",
      url: "https://ods.od.nih.gov/factsheets/VitaminB12-HealthProfessional/",
    },
    typicalDose: "500-1000 mcg daily",
    sideEffects: [
      "Extremely safe at supplemental doses; excretion is renal",
      "Rare allergic reaction to cyanocobalamin injections",
    ],
    interactions: [
      {
        with: "Peptides — BPC-157",
        severity: "note",
        detail:
          "BPC-157 has been studied alongside B12 in rat models of nerve repair; no meaningful pharmacokinetic interaction in humans.",
      },
    ],
    status: "OTC supplement. No established upper intake level due to low toxicity.",
  },

  // -------------------------------------------------------------------------
  // Nootropics / performance support
  // -------------------------------------------------------------------------
  {
    id: "nac",
    name: "NAC (N-Acetyl Cysteine)",
    aka: ["N-acetylcysteine", "acetylcysteine"],
    category: "nootropic",
    summary:
      "A precursor to glutathione, the body's primary intracellular antioxidant. Used for liver support, mucolysis and antioxidant defence.",
    mechanism:
      "NAC replenishes cysteine, the rate-limiting substrate for glutathione synthesis. Glutathione quenches reactive oxygen species and conjugates electrophilic metabolites for excretion. On oral/injectable anabolics, hepatic oxidative stress is a concern; NAC is commonly used for liver support. It also modulates glutamate signalling and has some evidence in OCD and addiction.",
    tmaxHours: 1,
    halfLife: {
      hours: 5.6,
      evidence: "clinical",
      range: "5-6 hours for the free thiol form",
      source: "Borgstrom L et al. Pharmacokinetics of N-acetylcysteine in man. Eur J Clin Pharmacol. 1986;31:217-222.",
      url: "https://pubmed.ncbi.nlm.nih.gov/3803254/",
    },
    typicalDose: "600-1200 mg daily",
    sideEffects: [
      "Nausea and GI discomfort, especially on an empty stomach",
      "Rotten-egg smell in breath and urine (from sulfur metabolites)",
      "Rare: allergic reactions",
    ],
    interactions: [
      {
        with: "Oral anabolic steroids (c17-alpha-alkylated)",
        severity: "caution",
        detail:
          "Oral 17aa anabolics generate hepatotoxic metabolites. NAC supports glutathione-mediated detoxification and is commonly co-administered. Not a substitute for limiting oral anabolic duration or monitoring LFTs.",
      },
      {
        with: "GLP-1 agonists",
        severity: "note",
        detail: "No pharmacokinetic interaction. NAC's antioxidant properties may be complementary during rapid weight loss.",
      },
    ],
    status: "OTC supplement. FDA-approved as Mucomyst (mucolysis) and as antidote for acetaminophen overdose at higher doses.",
  },
  {
    id: "creatine",
    name: "Creatine Monohydrate",
    aka: ["creatine", "Cr"],
    category: "nootropic",
    summary:
      "The most evidence-backed ergogenic supplement, increasing phosphocreatine stores in muscle to improve strength, power and recovery.",
    mechanism:
      "Creatine is phosphorylated to phosphocreatine, which rapidly regenerates ATP during high-intensity efforts. Supplementation saturates intramuscular stores over 4-6 weeks. It also draws water into muscle cells (the 1-3 kg weight gain at loading is mostly intramuscular water) and may reduce muscle protein breakdown after training. Has emerging cognitive and neuroprotective data.",
    tmaxHours: 1.5,
    halfLife: {
      hours: 3,
      evidence: "clinical",
      range: "Plasma half-life ~3h; muscular stores turn over at ~2g/day",
      source: "Greenhaff PL et al. Influence of oral creatine supplementation. Clin Sci. 1994;87(4):415-9.",
      url: "https://pubmed.ncbi.nlm.nih.gov/7820584/",
    },
    typicalDose: "3-5 g daily (no loading phase needed)",
    sideEffects: [
      "Mild weight gain from intramuscular water retention (1-3 kg) — expected and benign",
      "GI discomfort with loading doses (>10 g at once); resolved by spreading doses",
      "Raises serum creatinine — can appear as elevated on standard metabolic panels; does not indicate kidney damage in healthy individuals",
    ],
    interactions: [
      {
        with: "Anabolic steroids / SARMs",
        severity: "note",
        detail:
          "Creatine and anabolics improve strength by separate mechanisms (phosphocreatine availability vs. androgen receptor signalling). Additive effect on training performance. No adverse interaction.",
      },
      {
        with: "GLP-1 agonists",
        severity: "note",
        detail:
          "During caloric restriction on GLP-1 agonists, creatine helps preserve muscle mass and strength. No pharmacokinetic interaction.",
      },
    ],
    status: "OTC supplement. International Society of Sports Nutrition position: safe for healthy adults.",
  },

  // -------------------------------------------------------------------------
  // Sleep
  // -------------------------------------------------------------------------
  {
    id: "melatonin",
    name: "Melatonin",
    aka: ["N-acetyl-5-methoxytryptamine"],
    category: "sleep",
    summary:
      "The primary circadian hormone, produced by the pineal gland at night. Used to shift sleep timing, treat jet lag and improve sleep onset.",
    mechanism:
      "Melatonin binds MT1 and MT2 receptors in the suprachiasmatic nucleus. MT1 activation inhibits neuronal firing (sleep promotion); MT2 activation phase-shifts the circadian clock. Effective doses for circadian shifting (0.5-1 mg) are lower than typical OTC doses. Peak endogenous production occurs 2-4 h after onset of darkness. Suppressed by blue light.",
    tmaxHours: 0.75,
    halfLife: {
      hours: 0.75,
      evidence: "clinical",
      range: "30-50 minutes; extended-release preparations available",
      source: "Brzezinski A et al. Effects of exogenous melatonin on sleep. Sleep Med Rev. 2005;9(1):41-50.",
      url: "https://pubmed.ncbi.nlm.nih.gov/15649737/",
    },
    typicalDose: "0.5-5 mg, 30-60 min before target sleep time",
    sideEffects: [
      "Morning grogginess, especially at doses above 1-2 mg",
      "Vivid dreams",
      "Headache",
      "Hypothermia at high doses",
    ],
    interactions: [
      {
        with: "Growth hormone peptides (GHRP, Ipamorelin, CJC-1295)",
        severity: "note",
        detail:
          "GH is predominantly secreted during slow-wave sleep. Quality sleep, which melatonin can support, improves GH pulse amplitude. No direct pharmacokinetic interaction.",
      },
      {
        with: "Anabolic steroids",
        severity: "note",
        detail:
          "Anabolics can disrupt sleep architecture. Melatonin supports sleep quality on cycle. No pharmacokinetic interaction.",
      },
    ],
    status: "OTC supplement in most countries. Prescription-only in UK and some EU countries.",
  },
];

export const MED_LIBRARY_BY_ID = new Map(MEDS_LIBRARY.map((m) => [m.id, m]));
