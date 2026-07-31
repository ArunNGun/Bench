import type { Peptide } from "../../types";

/**
 * Anabolic androgens.
 *
 * These sit apart from the rest of the library in one important way, and the
 * entries say so: every one of them shuts down your own testosterone production
 * for as long as you run it, and for a while afterwards. That is not a side
 * effect at the margins. It is the predictable consequence of taking any of them,
 * so `suppressesNaturalProduction` is set on all of them and the app states it
 * rather than leaving it implied.
 *
 * On half-lives. These are oil depots, and they show flip-flop kinetics: release
 * from the injection site is slower than the body's clearance of the freed
 * steroid, so what you actually observe is the depot emptying, not the drug being
 * metabolised. The figures below are those observable depot half-lives, because
 * that is what governs the curve.
 *
 * Where no human pharmacokinetic study exists, trenbolone and boldenone are the
 * conspicuous cases, both of them veterinary compounds that were never developed
 * for people, `halfLifeHours` is null and the entry says why. The ester's chain
 * length is a decent guide to how fast the depot empties, and the notes say so,
 * but a plausible inference is not a measurement and the app will not draw a
 * curve from one.
 */

/** Shared by every injectable oil, so a rewording cannot drift between entries. */
const OIL_MONITORING = [
  "Haematocrit, androgens raise red cell mass, and the rise is dose-dependent",
  "Blood pressure",
  "Lipids, especially a fall in HDL",
  "Total and free testosterone, LH and FSH",
  "Oestradiol, for the aromatising compounds",
];

export const ANABOLIC: Peptide[] = [
  // -------------------------------------------------------------------------
  // Testosterone esters
  // -------------------------------------------------------------------------
  {
    id: "testosterone-enanthate",
    name: "Testosterone enanthate",
    aka: ["Test E", "Delatestryl", "Xyosted"],
    category: "anabolic",
    summary:
      "The reference long-acting testosterone ester, and the backbone of most replacement regimens.",
    mechanism:
      "A testosterone molecule with a seven-carbon ester attached, which makes it oil-soluble enough to sit in a muscle depot and release slowly. The ester is cleaved off in circulation, leaving plain testosterone to act on the androgen receptor.",
    halfLifeHours: 108,
    halfLifeNote:
      "4.5 days, measured after intramuscular injection in oil. This is the depot-release rate, not the clearance of testosterone itself, which is a matter of minutes to hours. The injection site is what governs the curve.",
    tmaxHours: 48,
    routes: ["intramuscular", "subcutaneous"],
    preparation: "solution",
    concentrationsMgPerMl: [200, 250],
    vialSizesMg: [2000, 2500],
    suppressesNaturalProduction: true,
    doseRanges: [
      {
        lowMcg: 50_000,
        highMcg: 100_000,
        frequency: "weekly, often split into two injections",
        perWeek: 1,
        evidence: "approved",
        note: "Replacement dosing for diagnosed hypogonadism. Splitting the weekly amount across two injections flattens the peak-to-trough swing.",
      },
      {
        lowMcg: 100_000,
        highMcg: 150_000,
        frequency: "weekly",
        perWeek: 1,
        evidence: "clinical",
        note: "Studied in supraphysiological-dose trials. Above replacement, the dose-response for muscle continues but so does the rise in haematocrit and the fall in HDL.",
      },
    ],
    timeline: [
      { fromHours: 0, toHours: 24, label: "Ester still largely in the depot; little has reached circulation." },
      { fromHours: 24, toHours: 72, label: "Levels climbing towards peak." },
      { fromHours: 72, toHours: 168, label: "The plateau most of the week is spent in." },
    ],
    sideEffects: [
      "Raised haematocrit, which is the most common reason to reduce a dose",
      "Acne and oily skin",
      "Oestradiol-driven effects: water retention, gynecomastia",
      "Testicular atrophy and reduced fertility",
      "Accelerated male-pattern hair loss in those predisposed",
      "Mood and sleep changes", ...OIL_MONITORING.map((m) => `Monitor: ${m}`),
    ],
    contraindications: [
      "Prostate or breast cancer",
      "Trying to conceive, suppression of spermatogenesis is the expected effect",
      "Untreated severe sleep apnoea",
      "Polycythaemia",
      "Pregnancy",
    ],
    status:
      "Prescription-only in most countries and a controlled substance in many, including Schedule III in the United States. Banned in sport by WADA at all times.",
    citations: [
      {
        label: "Pharmacokinetics of testosterone, ester half-lives after IM injection",
        url: "https://en.wikipedia.org/wiki/Pharmacokinetics_of_testosterone",
      },
      {
        label: "Depo-Testosterone clinical pharmacology (Pfizer)",
        url: "https://www.pfizermedical.com/depo-testosterone/clinical-pharmacology",
      },
    ],
  },

  {
    id: "testosterone-cypionate",
    name: "Testosterone cypionate",
    aka: ["Test C", "Depo-Testosterone"],
    category: "anabolic",
    summary: "Near-identical in behaviour to enanthate; the ester common in the United States.",
    mechanism:
      "An eight-carbon cyclopentylpropionate ester of testosterone. Slightly heavier than enanthate, and released from the depot at a very similar rate.",
    halfLifeHours: 108,
    halfLifeNote:
      "Given as comparable to enanthate, around 4.5 days, in direct comparisons. A figure of about 8 days is widely repeated online; it traces to a single older estimate and is not what head-to-head measurements show.",
    tmaxHours: 48,
    routes: ["intramuscular", "subcutaneous"],
    preparation: "solution",
    concentrationsMgPerMl: [100, 200, 250],
    vialSizesMg: [2000, 2500],
    suppressesNaturalProduction: true,
    doseRanges: [
      {
        lowMcg: 50_000,
        highMcg: 100_000,
        frequency: "weekly, often split into two injections",
        perWeek: 1,
        evidence: "approved",
        note: "Replacement dosing. The label also describes 50 to 400 mg every two to four weeks, a schedule that produces a much larger swing between peak and trough.",
      },
    ],
    sideEffects: [
      "As testosterone enanthate, raised haematocrit, acne, oestradiol effects, testicular atrophy, hair loss in those predisposed", ...OIL_MONITORING.map((m) => `Monitor: ${m}`),
    ],
    contraindications: [
      "Prostate or breast cancer",
      "Trying to conceive",
      "Untreated severe sleep apnoea",
      "Polycythaemia",
      "Pregnancy",
    ],
    status: "Prescription-only, Schedule III in the United States. Banned in sport at all times.",
    citations: [
      {
        label: "Depo-Testosterone clinical pharmacology (Pfizer)",
        url: "https://www.pfizermedical.com/depo-testosterone/clinical-pharmacology",
      },
      {
        label: "Pharmacokinetics of testosterone",
        url: "https://en.wikipedia.org/wiki/Pharmacokinetics_of_testosterone",
      },
    ],
  },

  {
    id: "testosterone-propionate",
    name: "Testosterone propionate",
    aka: ["Test P"],
    category: "anabolic",
    summary: "A short ester needing frequent injection, with correspondingly little accumulation.",
    mechanism:
      "A three-carbon ester. Too short to hold a depot for long, so it clears quickly and has to be injected every day or two to hold a steady level.",
    halfLifeHours: 19,
    halfLifeNote: "0.8 days after intramuscular injection in oil.",
    tmaxHours: 12,
    routes: ["intramuscular", "subcutaneous"],
    preparation: "solution",
    concentrationsMgPerMl: [100],
    vialSizesMg: [1000],
    suppressesNaturalProduction: true,
    doseRanges: [
      {
        lowMcg: 25_000,
        highMcg: 50_000,
        frequency: "every day or every other day",
        perWeek: 3.5,
        evidence: "anecdotal",
        note: "Weekly totals in the same range as the longer esters, delivered in smaller, more frequent injections. Post-injection soreness is common and dose-related.",
      },
    ],
    sideEffects: [
      "Injection-site pain, notably more than the longer esters",
      "As testosterone generally, raised haematocrit, acne, oestradiol effects, testicular atrophy", ...OIL_MONITORING.map((m) => `Monitor: ${m}`),
    ],
    contraindications: [
      "Prostate or breast cancer",
      "Trying to conceive",
      "Polycythaemia",
      "Pregnancy",
    ],
    status: "Prescription-only, Schedule III in the United States. Banned in sport at all times.",
    citations: [
      {
        label: "Pharmacokinetics of testosterone",
        url: "https://en.wikipedia.org/wiki/Pharmacokinetics_of_testosterone",
      },
    ],
  },

  {
    id: "testosterone-undecanoate",
    name: "Testosterone undecanoate (injectable)",
    aka: ["Nebido", "Aveed", "Test U"],
    category: "anabolic",
    summary: "A very long depot given every ten to fourteen weeks rather than weekly.",
    mechanism:
      "An eleven-carbon ester in castor oil. The long chain and the viscous vehicle together slow depot release enough to hold levels for months from a single injection.",
    halfLifeHours: 814,
    halfLifeNote:
      "33.9 days in castor oil; 20.9 days when formulated in tea seed oil. The vehicle matters as much as the ester, so the figure is specific to the preparation.",
    tmaxHours: 274,
    routes: ["intramuscular"],
    preparation: "solution",
    concentrationsMgPerMl: [250],
    vialSizesMg: [1000],
    suppressesNaturalProduction: true,
    doseRanges: [
      {
        lowMcg: 1_000_000,
        highMcg: 1_000_000,
        frequency: "every 10 to 14 weeks",
        perWeek: 0.083,
        evidence: "approved",
        note: "1000 mg, with the second dose six weeks after the first and every 10 to 14 weeks thereafter. The label carries a boxed warning for pulmonary oil microembolism, which is why it is given under observation.",
      },
    ],
    sideEffects: [
      "Pulmonary oil microembolism, coughing, chest tightness during or just after injection",
      "A large injection volume, given slowly and deep intramuscular",
      "As testosterone generally, but harder to reverse quickly given how long the depot lasts", ...OIL_MONITORING.map((m) => `Monitor: ${m}`),
    ],
    contraindications: [
      "Prostate or breast cancer",
      "Trying to conceive",
      "Polycythaemia",
      "Pregnancy",
      "Any situation where a dose may need withdrawing quickly",
    ],
    status:
      "Prescription-only and in the United States, dispensed through a restricted programme because of the embolism risk. Banned in sport at all times.",
    citations: [
      {
        label: "Pharmacokinetics of testosterone, undecanoate half-life by vehicle",
        url: "https://en.wikipedia.org/wiki/Pharmacokinetics_of_testosterone",
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 19-nortestosterones
  // -------------------------------------------------------------------------
  {
    id: "nandrolone-decanoate",
    name: "Nandrolone decanoate",
    aka: ["Deca-Durabolin", "Deca", "19-nortestosterone decanoate"],
    category: "anabolic",
    summary: "A long-acting nandrolone ester, used clinically for anaemia and wasting.",
    mechanism:
      "Nandrolone differs from testosterone by a single missing carbon, which makes it a weaker androgen at the skin and prostate while remaining strongly anabolic in muscle. It does not aromatise to oestradiol but is progestogenic, which is a different route to the same gynecomastia risk.",
    halfLifeHours: 144,
    halfLifeNote:
      "6 days, being the half-life of release from the intramuscular depot. Once freed, nandrolone itself is cleared with a half-life of about 4.3 hours, so the depot is entirely what governs the curve.",
    tmaxHours: 72,
    routes: ["intramuscular"],
    preparation: "solution",
    concentrationsMgPerMl: [100, 200, 250],
    vialSizesMg: [1000, 2000, 2500],
    suppressesNaturalProduction: true,
    doseRanges: [
      {
        lowMcg: 50_000,
        highMcg: 100_000,
        frequency: "every 1 to 4 weeks",
        perWeek: 1,
        evidence: "approved",
        note: "Clinical dosing for anaemia of renal insufficiency and for wasting.",
      },
      {
        lowMcg: 200_000,
        highMcg: 400_000,
        frequency: "weekly",
        perWeek: 1,
        evidence: "anecdotal",
        note: "Common non-medical range. No trial supports it, and progestogenic effects and sexual dysfunction both scale with the dose.",
      },
    ],
    sideEffects: [
      "Sexual dysfunction, common and able to persist, the effect the compound is best known for",
      "Progestogen-driven gynecomastia, by a different mechanism than oestrogen",
      "Marked and prolonged suppression; recovery is slower than from testosterone",
      "Raised haematocrit and blood pressure",
      "Detectable in anti-doping tests for many months", ...OIL_MONITORING.map((m) => `Monitor: ${m}`),
      "Monitor: prolactin, given the progestogenic activity",
    ],
    contraindications: [
      "Prostate or breast cancer",
      "Trying to conceive",
      "Pregnancy",
      "Any competitive athlete subject to testing, the detection window is exceptionally long",
    ],
    status: "Prescription-only, Schedule III in the United States. Banned in sport at all times.",
    citations: [
      {
        label:
          "Pharmacokinetic parameters of nandrolone after IM nandrolone decanoate (Eur J Endocrinol)",
        url: "https://academic.oup.com/ejendo/article/110/3_Supplement_a/S19/6802058",
      },
      {
        label: "Pharmacokinetic evaluation of three IM doses of nandrolone decanoate (JCEM)",
        url: "https://academic.oup.com/jcem/article-abstract/90/5/2624/2836761",
      },
    ],
  },

  {
    id: "nandrolone-phenylpropionate",
    name: "Nandrolone phenylpropionate",
    aka: ["NPP", "Durabolin"],
    category: "anabolic",
    summary: "The short-ester nandrolone, injected every few days instead of weekly.",
    mechanism:
      "The same nandrolone as the decanoate, on a much shorter ester. Levels rise and fall faster, which makes an unwanted effect easier to back out of.",
    halfLifeHours: null,
    halfLifeNote:
      "No published human pharmacokinetic study measures this directly. Duration of action is given as around 10 days, but a duration is not a half-life and the two are not interchangeable, so no curve is drawn. Expect depot release considerably faster than the decanoate, on the strength of the shorter ester alone.",
    routes: ["intramuscular"],
    preparation: "solution",
    concentrationsMgPerMl: [100],
    vialSizesMg: [1000],
    suppressesNaturalProduction: true,
    doseRanges: [
      {
        lowMcg: 100_000,
        highMcg: 300_000,
        frequency: "weekly total, split every second or third day",
        perWeek: 3,
        evidence: "anecdotal",
        note: "No clinical dosing exists for this ester at these amounts.",
      },
    ],
    sideEffects: [
      "As nandrolone decanoate: sexual dysfunction, progestogenic gynecomastia, strong suppression",
      "More frequent injections than the decanoate", ...OIL_MONITORING.map((m) => `Monitor: ${m}`),
      "Monitor: prolactin",
    ],
    contraindications: [
      "Prostate or breast cancer",
      "Trying to conceive",
      "Pregnancy",
      "Competitive athletes subject to testing",
    ],
    status: "Prescription-only, Schedule III in the United States. Banned in sport at all times.",
    citations: [
      {
        label: "Androgen ester, parenteral durations of action",
        url: "https://en.wikipedia.org/wiki/Androgen_ester",
      },
    ],
    cautionBanner:
      "Dosing here is community convention, not clinical practice. Nothing at these amounts has been studied.",
  },

  // -------------------------------------------------------------------------
  // Veterinary-origin compounds with no human data
  // -------------------------------------------------------------------------
  {
    id: "trenbolone-acetate",
    name: "Trenbolone acetate",
    aka: ["Tren A", "Finaplix"],
    category: "anabolic",
    summary:
      "A cattle-growth implant compound. Never developed for human use, and no human pharmacokinetic data exists.",
    mechanism:
      "Binds the androgen receptor with much higher affinity than testosterone and is not aromatised. It is also a potent progesterone receptor agonist, which accounts for a good deal of what people report from it.",
    halfLifeHours: null,
    halfLifeNote:
      "Unmeasured in humans. Trenbolone was developed as a veterinary implant and has never been through human pharmacokinetic study, so there is no half-life to quote and no honest curve to draw. The acetate ester is short, and injections are typically daily or every other day on that basis alone.",
    routes: ["intramuscular"],
    preparation: "solution",
    concentrationsMgPerMl: [75, 100],
    vialSizesMg: [750, 1000],
    suppressesNaturalProduction: true,
    doseRanges: [
      {
        lowMcg: 50_000,
        highMcg: 100_000,
        frequency: "every day or every other day",
        perWeek: 3.5,
        evidence: "anecdotal",
        note: "Entirely community convention. There is no clinical dosing for this compound in humans at any amount.",
      },
    ],
    sideEffects: [
      "Night sweats and insomnia, reported very consistently",
      "Marked cardiovascular strain, a severe fall in HDL is characteristic",
      "Aggression, anxiety and mood disturbance",
      "Progestogenic effects including gynecomastia and sexual dysfunction",
      "Reduced aerobic capacity and breathlessness on exertion",
      "Strong, prolonged suppression", ...OIL_MONITORING.map((m) => `Monitor: ${m}`),
      "Monitor: prolactin, and kidney function",
    ],
    contraindications: [
      "Any pre-existing cardiovascular or psychiatric condition",
      "Prostate or breast cancer",
      "Trying to conceive",
      "Pregnancy",
    ],
    status:
      "Not approved for human use anywhere. Schedule III in the United States. Banned in sport at all times.",
    citations: [
      {
        label: "Androgen ester, structural and duration data",
        url: "https://en.wikipedia.org/wiki/Androgen_ester",
      },
    ],
    cautionBanner:
      "No human pharmacokinetic or safety study exists for this compound. Everything below the mechanism is community report, and the cardiovascular effects reported are more severe than for any other entry here.",
  },

  {
    id: "trenbolone-enanthate",
    name: "Trenbolone enanthate",
    aka: ["Tren E"],
    category: "anabolic",
    summary: "The long-ester trenbolone. The same absence of human data applies.",
    mechanism:
      "As trenbolone acetate, high-affinity androgen receptor agonist with progestogenic activity, on a longer ester intended to allow less frequent injection.",
    halfLifeHours: null,
    halfLifeNote:
      "Unmeasured in humans, as for the acetate. The enanthate ester would be expected to empty its depot considerably more slowly, but that is inference from the ester rather than anything measured for this compound.",
    routes: ["intramuscular"],
    preparation: "solution",
    concentrationsMgPerMl: [200],
    vialSizesMg: [2000],
    suppressesNaturalProduction: true,
    doseRanges: [
      {
        lowMcg: 150_000,
        highMcg: 300_000,
        frequency: "weekly, usually split",
        perWeek: 2,
        evidence: "anecdotal",
        note: "Community convention only.",
      },
    ],
    sideEffects: [
      "As trenbolone acetate, but harder to withdraw from quickly given the longer depot", ...OIL_MONITORING.map((m) => `Monitor: ${m}`),
      "Monitor: prolactin, and kidney function",
    ],
    contraindications: [
      "Any pre-existing cardiovascular or psychiatric condition",
      "Prostate or breast cancer",
      "Trying to conceive",
      "Pregnancy",
    ],
    status: "Not approved for human use anywhere. Banned in sport at all times.",
    citations: [
      {
        label: "Androgen ester, structural and duration data",
        url: "https://en.wikipedia.org/wiki/Androgen_ester",
      },
    ],
    cautionBanner:
      "No human pharmacokinetic or safety study exists for this compound, and the long ester means an adverse effect cannot be backed out of quickly.",
  },

  {
    id: "boldenone-undecylenate",
    name: "Boldenone undecylenate",
    aka: ["Equipoise", "EQ"],
    category: "anabolic",
    summary: "A long-acting veterinary androgen, originally for horses.",
    mechanism:
      "Structurally testosterone with an extra double bond, which slows aromatisation without stopping it. Mild androgenically relative to its anabolic effect.",
    halfLifeHours: null,
    halfLifeNote:
      "No human pharmacokinetic study exists. The undecylenate ester is long, a close relative of the undecanoate on injectable testosterone, which empties over weeks, so a similar order is likely, but likely is not measured.",
    routes: ["intramuscular"],
    preparation: "solution",
    concentrationsMgPerMl: [200, 250],
    vialSizesMg: [2000, 2500],
    suppressesNaturalProduction: true,
    doseRanges: [
      {
        lowMcg: 200_000,
        highMcg: 600_000,
        frequency: "weekly",
        perWeek: 1,
        evidence: "anecdotal",
        note: "Community convention. No human clinical dosing exists.",
      },
    ],
    sideEffects: [
      "A pronounced rise in haematocrit, reported more consistently than for most compounds here",
      "Increased appetite",
      "Aromatises, so oestradiol-driven effects apply",
      "Very long detection window in anti-doping tests", ...OIL_MONITORING.map((m) => `Monitor: ${m}`),
    ],
    contraindications: [
      "Polycythaemia or any tendency to a high haematocrit",
      "Prostate or breast cancer",
      "Trying to conceive",
      "Pregnancy",
    ],
    status: "Veterinary only. Schedule III in the United States. Banned in sport at all times.",
    citations: [
      {
        label: "Androgen ester, structural and duration data",
        url: "https://en.wikipedia.org/wiki/Androgen_ester",
      },
    ],
    cautionBanner: "No human pharmacokinetic or safety data. Dosing is community convention.",
  },

  {
    id: "drostanolone-propionate",
    name: "Drostanolone propionate",
    aka: ["Masteron", "Mast P"],
    category: "anabolic",
    summary: "A non-aromatising DHT derivative, once used in breast cancer treatment.",
    mechanism:
      "Derived from dihydrotestosterone, so it cannot be converted to oestradiol and has some anti-oestrogenic activity of its own. Strongly androgenic relative to its anabolic effect.",
    halfLifeHours: null,
    halfLifeNote:
      "No modern human pharmacokinetic study is available. The propionate ester is short, and injection every day or two follows from that, but the figure itself has not been measured.",
    routes: ["intramuscular"],
    preparation: "solution",
    concentrationsMgPerMl: [100],
    vialSizesMg: [1000],
    suppressesNaturalProduction: true,
    doseRanges: [
      {
        lowMcg: 50_000,
        highMcg: 100_000,
        frequency: "every day or every other day",
        perWeek: 3.5,
        evidence: "anecdotal",
        note: "Community convention. Its historical clinical use in breast cancer was at quite different amounts and is not a guide here.",
      },
    ],
    sideEffects: [
      "Androgenic effects are prominent: hair loss in those predisposed, acne",
      "Does not aromatise, so no oestrogenic effects of its own",
      "Adverse lipid changes", ...OIL_MONITORING.map((m) => `Monitor: ${m}`),
    ],
    contraindications: [
      "Male-pattern hair loss you would rather not accelerate",
      "Prostate or breast cancer in men",
      "Trying to conceive",
      "Pregnancy",
    ],
    status: "Withdrawn from human medical use in most countries. Banned in sport at all times.",
    citations: [
      {
        label: "Androgen ester, structural and duration data",
        url: "https://en.wikipedia.org/wiki/Androgen_ester",
      },
    ],
    cautionBanner: "No current human pharmacokinetic data. Dosing is community convention.",
  },

  // -------------------------------------------------------------------------
  // Orals
  // -------------------------------------------------------------------------
  {
    id: "oxandrolone",
    name: "Oxandrolone",
    aka: ["Anavar", "Oxandrin"],
    category: "anabolic",
    summary:
      "An oral with genuine clinical history, burns recovery and weight restoration, and the best-documented pharmacokinetics of any oral here.",
    mechanism:
      "A DHT derivative, 17-alpha-alkylated so it survives first-pass metabolism in the liver. Does not aromatise.",
    halfLifeHours: 9.4,
    halfLifeNote:
      "9.4 hours in adults, from the approved label. Longer than most orals, which is why once or twice daily is enough.",
    tmaxHours: 1,
    routes: ["oral"],
    preparation: "solution",
    vialSizesMg: [],
    c17AlphaAlkylated: true,
    suppressesNaturalProduction: true,
    doseRanges: [
      {
        lowMcg: 2_500,
        highMcg: 20_000,
        frequency: "daily, in two divided doses",
        perWeek: 7,
        evidence: "approved",
        note: "2.5 to 20 mg daily for weight gain after weight loss, trauma or prolonged corticosteroid use.",
      },
      {
        lowMcg: 20_000,
        highMcg: 80_000,
        frequency: "daily",
        perWeek: 7,
        evidence: "anecdotal",
        note: "Common non-medical range, above the approved maximum. Liver strain and the fall in HDL both scale with the dose.",
      },
    ],
    sideEffects: [
      "A pronounced fall in HDL cholesterol, more so than the injectables, as with all 17-alpha-alkylated orals",
      "Liver strain; the label carries a warning for peliosis hepatis and liver tumours",
      "Suppression, which happens on orals just as it does on injectables",
      "Monitor: ALT and AST",
      "Monitor: lipids, especially HDL",
      "Monitor: haematocrit and blood pressure",
    ],
    contraindications: [
      "Existing liver disease",
      "Prostate or breast cancer",
      "Pregnancy",
      "Taking another 17-alpha-alkylated oral at the same time",
    ],
    status: "Prescription-only, Schedule III in the United States. Banned in sport at all times.",
    citations: [
      {
        label: "Somatropin and anabolic agent dosing reference (Drugs.com)",
        url: "https://www.drugs.com/dosage/oxandrolone.html",
      },
    ],
  },

  {
    id: "stanozolol",
    name: "Stanozolol",
    aka: ["Winstrol", "Winny"],
    category: "anabolic",
    summary: "An oral DHT derivative, historically used for hereditary angioedema.",
    mechanism:
      "A DHT derivative carrying a pyrazole ring, 17-alpha-alkylated for oral use. Does not aromatise and binds SHBG strongly, which raises the free fraction of anything else being run alongside it.",
    halfLifeHours: 9,
    halfLifeNote:
      "About 9 hours for the oral form. The injectable aqueous suspension behaves quite differently and is not covered by this figure.",
    tmaxHours: 1,
    routes: ["oral"],
    preparation: "solution",
    vialSizesMg: [],
    c17AlphaAlkylated: true,
    suppressesNaturalProduction: true,
    doseRanges: [
      {
        lowMcg: 2_000,
        highMcg: 6_000,
        frequency: "daily",
        perWeek: 7,
        evidence: "approved",
        note: "The dosing used for hereditary angioedema prophylaxis, which is what it was licensed for.",
      },
      {
        lowMcg: 20_000,
        highMcg: 50_000,
        frequency: "daily",
        perWeek: 7,
        evidence: "anecdotal",
        note: "Common non-medical range, roughly ten times the clinical dose.",
      },
    ],
    sideEffects: [
      "Among the harshest of these compounds on lipids, a severe fall in HDL",
      "Liver strain, as with any 17-alpha-alkylated oral",
      "Joint discomfort and dryness, reported very consistently",
      "Suppression",
      "Monitor: ALT and AST",
      "Monitor: lipids",
      "Monitor: blood pressure",
    ],
    contraindications: [
      "Existing liver disease",
      "Prostate or breast cancer",
      "Pregnancy",
      "Taking another 17-alpha-alkylated oral at the same time",
    ],
    status:
      "Withdrawn from human use in the United States; still licensed in some countries. Schedule III. Banned in sport at all times.",
    citations: [
      {
        label: "Androgen ester and anabolic steroid pharmacology overview",
        url: "https://en.wikipedia.org/wiki/Stanozolol",
      },
    ],
    cautionBanner:
      "Non-medical dosing is around ten times the licensed dose, and the effect on lipids is the most severe of any compound in this category.",
  },

  {
    id: "methandienone",
    name: "Methandienone",
    aka: ["Dianabol", "Dbol", "Methandrostenolone"],
    category: "anabolic",
    summary: "The original oral anabolic, and still the archetype.",
    mechanism:
      "A 17-alpha-alkylated testosterone derivative that aromatises readily, so oestrogenic effects are prominent alongside the androgenic ones.",
    halfLifeHours: 5,
    halfLifeNote:
      "Around 4.5 to 6 hours, which is why it is conventionally split across the day. The figure is consistent across sources but rests on old pharmacology rather than a modern study.",
    tmaxHours: 1.5,
    routes: ["oral"],
    preparation: "solution",
    vialSizesMg: [],
    c17AlphaAlkylated: true,
    suppressesNaturalProduction: true,
    doseRanges: [
      {
        lowMcg: 20_000,
        highMcg: 50_000,
        frequency: "daily, in divided doses",
        perWeek: 7,
        evidence: "anecdotal",
        note: "Community convention. No current clinical dosing exists; the compound is not licensed for human use anywhere.",
      },
    ],
    sideEffects: [
      "Rapid water retention and a matching rise in blood pressure",
      "Aromatises strongly, gynecomastia is a common reason people stop",
      "Liver strain, as with any 17-alpha-alkylated oral",
      "A steep fall in HDL",
      "Suppression",
      "Monitor: ALT and AST",
      "Monitor: blood pressure, which can rise quickly",
      "Monitor: lipids and oestradiol",
    ],
    contraindications: [
      "Existing liver disease",
      "Hypertension",
      "Prostate or breast cancer",
      "Pregnancy",
      "Taking another 17-alpha-alkylated oral at the same time",
    ],
    status:
      "Not licensed for human use in most countries. Schedule III in the United States. Banned in sport at all times.",
    citations: [
      {
        label: "Metandienone pharmacology",
        url: "https://en.wikipedia.org/wiki/Metandienone",
      },
    ],
    cautionBanner:
      "Not licensed for human use anywhere. Dosing is entirely community convention, and blood pressure can rise sharply within the first fortnight.",
  },
];
