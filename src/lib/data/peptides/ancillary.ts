import type { Peptide } from "../../types";

/**
 * The drugs run alongside anabolics, or afterwards to recover.
 *
 * These are here because a stack the app cannot see is a stack it cannot check.
 * An androgen protocol with an aromatase inhibitor managing oestradiol is a
 * materially different situation from the same androgen alone, and until these
 * existed the interaction checks were blind to half of what people actually run.
 *
 * They are not performance compounds and the app does not present them as
 * optional extras to a cycle. Two of them, the aromatase inhibitors, are the
 * easiest drugs in this whole library to hurt yourself with: oestradiol driven
 * too low costs joint comfort, libido, lipids and bone mineral density, it feels
 * worse than the high oestradiol it was meant to correct, and it takes longer to
 * come back from. The dose ranges reflect that.
 *
 * On evidence levels. Every one of these has an approved label, but none of the
 * approved indications is "alongside anabolic steroids in a healthy man". The
 * approved figures are given because they are the only regulated numbers that
 * exist, and the ranges people actually use are tagged `anecdotal` and sit
 * separately. Do not let the presence of a label imply the use is studied.
 */
export const ANCILLARY: Peptide[] = [
  // --- Aromatase inhibitors ------------------------------------------------
  {
    id: "anastrozole",
    name: "Anastrozole",
    aka: ["Arimidex"],
    category: "ancillary",
    summary:
      "A non-steroidal aromatase inhibitor, used to hold oestradiol down when an aromatising androgen pushes it up.",
    mechanism:
      "Reversibly binds the aromatase enzyme, blocking the conversion of testosterone to oestradiol. Because the binding is reversible, effect tracks plasma concentration and returns as the drug clears.",
    halfLifeHours: 50,
    halfLifeNote:
      "Mean terminal elimination half-life about 50 hours in postmenopausal women, from the Arimidex label. Long enough that every other day dosing still accumulates, and long enough that an overshoot takes the better part of a week to correct.",
    tmaxHours: 2,
    routes: ["oral"],
    preparation: "solution",
    vialSizesMg: [],
    mechanismClass: ["aromatase-inhibitor"],
    doseRanges: [
      {
        lowMcg: 1_000,
        highMcg: 1_000,
        frequency: "once daily",
        perWeek: 7,
        evidence: "approved",
        note: "1 mg daily, the approved breast cancer dose. Far above what anyone managing oestradiol on an androgen protocol would use, and included only because it is the regulated figure.",
      },
      {
        lowMcg: 125,
        highMcg: 500,
        frequency: "twice weekly, or every other day",
        perWeek: 2,
        evidence: "anecdotal",
        note: "0.125 to 0.5 mg, titrated against symptoms and bloodwork rather than taken on a schedule. No trial supports this use; the range is what people report and nothing more.",
      },
    ],
    timeline: [
      { fromHours: 0, toHours: 6, label: "Absorbing, peak plasma around two hours" },
      { fromHours: 6, toHours: 72, label: "Aromatase suppressed, oestradiol falling" },
      { fromHours: 72, toHours: 240, label: "Clearing, oestradiol recovering" },
    ],
    sideEffects: [
      "Joint pain and stiffness, the most common complaint and usually the first sign oestradiol is too low",
      "Loss of libido and difficulty with erections, which is what crashed oestradiol does despite adequate testosterone",
      "Low mood and fatigue",
      "Falling HDL, on top of whatever the androgen is already doing to lipids",
      "Bone mineral density loss over prolonged use",
      "Monitor: oestradiol, ideally by a sensitive assay, since the standard one is unreliable at low male levels",
    ],
    contraindications: [
      "Taking a second aromatase inhibitor at the same time",
      "Running it on a compound that does not aromatise, where there is no oestrogen to control and only harm to do",
      "Existing osteopenia or osteoporosis",
      "Pregnancy",
    ],
    status:
      "Prescription-only. Approved for hormone receptor positive breast cancer in postmenopausal women, not for oestrogen management in men. Banned in sport at all times as a hormone and metabolic modulator.",
    citations: [
      {
        label: "ARIMIDEX (anastrozole) prescribing information, FDA",
        url: "https://www.accessdata.fda.gov/drugsatfda_docs/label/2024/020541s036lbl.pdf",
      },
      {
        label:
          "Pharmacology and pharmacokinetics of anastrozole, letrozole and exemestane (PubMed 12404296)",
        url: "https://pubmed.ncbi.nlm.nih.gov/12404296/",
      },
    ],
  },

  {
    id: "exemestane",
    name: "Exemestane",
    aka: ["Aromasin"],
    category: "ancillary",
    summary:
      "A steroidal aromatase inhibitor that inactivates the enzyme permanently rather than blocking it reversibly.",
    mechanism:
      "A substrate analogue that binds aromatase irreversibly, so the enzyme has to be resynthesised before conversion resumes. That is why its effect outlasts its plasma half-life, and why plasma concentration is a poor guide to how much suppression is still in effect.",
    halfLifeHours: 27,
    halfLifeNote:
      "About 27 hours in plasma at the 25 mg dose. The curve the app draws is the plasma curve and understates the duration of effect: the enzyme is inactivated irreversibly, so suppression persists past the point the drug has gone.",
    tmaxHours: 2,
    routes: ["oral"],
    preparation: "solution",
    vialSizesMg: [],
    mechanismClass: ["aromatase-inhibitor"],
    doseRanges: [
      {
        lowMcg: 25_000,
        highMcg: 25_000,
        frequency: "once daily after food",
        perWeek: 7,
        evidence: "approved",
        note: "25 mg daily, the approved breast cancer dose. Absorption improves substantially with food.",
      },
      {
        lowMcg: 6_250,
        highMcg: 12_500,
        frequency: "twice weekly",
        perWeek: 2,
        evidence: "anecdotal",
        note: "6.25 to 12.5 mg, a quarter to a half tablet. Preferred by some over anastrozole for a smaller effect on lipids, though the comparison is not established in men.",
      },
    ],
    sideEffects: [
      "Joint pain, as with any aromatase inhibitor pushed too far",
      "Hot flushes and sweating",
      "Fatigue and low mood",
      "Mildly androgenic in its own right, being a steroidal molecule",
      "Monitor: oestradiol by sensitive assay",
    ],
    contraindications: [
      "Taking a second aromatase inhibitor at the same time",
      "Running it on a compound that does not aromatise",
      "Pregnancy",
    ],
    status:
      "Prescription-only. Approved for breast cancer, not for oestrogen management in men. Banned in sport at all times.",
    citations: [
      {
        label:
          "Pharmacology and pharmacokinetics of the newer generation aromatase inhibitors (PubMed 12404296)",
        url: "https://pubmed.ncbi.nlm.nih.gov/12404296/",
      },
    ],
  },

  // --- SERMs ---------------------------------------------------------------
  {
    id: "tamoxifen",
    name: "Tamoxifen",
    aka: ["Nolvadex"],
    category: "ancillary",
    summary:
      "An oestrogen receptor modulator: blocks the receptor in breast tissue while leaving circulating oestradiol alone.",
    mechanism:
      "Competes with oestradiol at the receptor, antagonist in breast tissue and agonist in bone and liver. At the pituitary it blocks oestrogen's negative feedback, which raises LH and FSH and drives the testes to produce again. That second effect is why it appears in recovery protocols.",
    halfLifeHours: 144,
    halfLifeNote:
      "5 to 7 days for the parent drug; 144 hours is the midpoint. The active metabolite N-desmethyltamoxifen is longer still at around 14 days, so steady state takes weeks and the tail after stopping is long.",
    tmaxHours: 5,
    routes: ["oral"],
    preparation: "solution",
    vialSizesMg: [],
    mechanismClass: ["serm"],
    doseRanges: [
      {
        lowMcg: 20_000,
        highMcg: 40_000,
        frequency: "daily",
        perWeek: 7,
        evidence: "approved",
        note: "20 to 40 mg daily, the approved range for breast cancer treatment and risk reduction.",
      },
      {
        lowMcg: 10_000,
        highMcg: 20_000,
        frequency: "daily",
        perWeek: 7,
        evidence: "anecdotal",
        note: "10 to 20 mg daily, either for gynecomastia or as part of a recovery protocol after suppression. Neither use is an approved indication.",
      },
    ],
    sideEffects: [
      "Hot flushes",
      "Nausea",
      "Visual disturbance, uncommon but a reason to stop and seek advice",
      "Raised risk of venous thromboembolism",
      "Mood changes",
      "Monitor: total and free testosterone, LH and FSH, if the purpose is recovery",
    ],
    contraindications: [
      "History of deep vein thrombosis or pulmonary embolism",
      "Taking a second oestrogen receptor modulator at the same time",
      "Pregnancy",
    ],
    status:
      "Prescription-only. Approved for breast cancer, not for post-cycle recovery. Banned in sport at all times as a hormone and metabolic modulator.",
    citations: [
      {
        label: "Serum elimination half-life of tamoxifen and its metabolites (PubMed 1458563)",
        url: "https://pubmed.ncbi.nlm.nih.gov/1458563/",
      },
    ],
  },

  {
    id: "enclomiphene",
    name: "Enclomiphene",
    aka: ["Enclomiphene citrate", "trans-clomiphene"],
    category: "ancillary",
    summary:
      "The isomer of clomiphene that does the useful work, without the long-lingering one that causes most of the complaints.",
    mechanism:
      "Blocks oestrogen receptors at the hypothalamus and pituitary, removing negative feedback so LH and FSH rise and the testes are driven to produce testosterone. It raises your own output rather than replacing it, which is the whole point of using it after suppression.",
    halfLifeHours: 10,
    halfLifeNote:
      "About 10 hours, from the Wiehle pharmacokinetic study in hypogonadal men. Read the curve with care: testosterone and LH stay elevated for up to a week after stopping, because the drug is triggering the axis rather than acting directly. Plasma level and effect are not the same thing here.",
    tmaxHours: 3,
    routes: ["oral"],
    preparation: "solution",
    vialSizesMg: [],
    mechanismClass: ["serm"],
    doseRanges: [
      {
        lowMcg: 12_500,
        highMcg: 25_000,
        frequency: "daily",
        perWeek: 7,
        evidence: "clinical",
        note: "12.5 to 25 mg daily, the doses used in the trials of secondary hypogonadism in men. Not an approved product in the United States.",
      },
    ],
    sideEffects: [
      "Headache",
      "Nausea",
      "Hot flushes",
      "Visual disturbance, less commonly reported than with clomiphene but the same class effect",
      "Monitor: total testosterone, LH and FSH",
      "Monitor: oestradiol, which rises alongside testosterone",
    ],
    contraindications: [
      "Taking a second oestrogen receptor modulator at the same time",
      "Primary testicular failure, where there is nothing at the testis to stimulate",
    ],
    status:
      "Not approved in the United States; studied through phase III and available through compounding pharmacies. Banned in sport at all times.",
    citations: [
      {
        label:
          "Wiehle et al, testosterone restoration using enclomiphene citrate: pharmacodynamic and pharmacokinetic study, BJU International",
        url: "https://bjui-journals.onlinelibrary.wiley.com/doi/full/10.1111/bju.12363",
      },
    ],
  },

  {
    id: "clomiphene",
    name: "Clomiphene citrate",
    aka: ["Clomid", "Clomiphene"],
    category: "ancillary",
    summary:
      "The original oestrogen receptor modulator used to restart the axis. A mixture of two isomers with very different behaviour.",
    mechanism:
      "Blocks oestrogen feedback at the hypothalamus and pituitary, raising LH and FSH. What is sold is a roughly 3:2 mixture of enclomiphene, which does the stimulating, and zuclomiphene, which is oestrogenic and clears extremely slowly.",
    halfLifeHours: null,
    halfLifeNote:
      "Deliberately left blank, and no curve is drawn. A single half-life would be a fiction here: enclomiphene clears in hours while zuclomiphene has been detected in serum a month after the last dose. Averaging the two would describe neither, and the slow isomer is exactly the part responsible for the accumulation people complain about. Where a component matters on its own, log enclomiphene instead.",
    routes: ["oral"],
    preparation: "solution",
    vialSizesMg: [],
    mechanismClass: ["serm"],
    doseRanges: [
      {
        lowMcg: 25_000,
        highMcg: 50_000,
        frequency: "daily",
        perWeek: 7,
        evidence: "anecdotal",
        note: "25 to 50 mg daily in recovery protocols. The approved indication is ovulation induction in women, so no approved male dose exists.",
      },
    ],
    sideEffects: [
      "Visual disturbance: floaters, blurring, trails after lights. Uncommon, and a reason to stop rather than push through",
      "Mood disturbance, more pronounced than with enclomiphene and attributed to the zuclomiphene isomer",
      "Hot flushes",
      "Nausea",
      "Monitor: total testosterone, LH, FSH and oestradiol",
    ],
    contraindications: [
      "Taking a second oestrogen receptor modulator at the same time",
      "Any visual symptom that appears after starting",
      "Liver disease",
    ],
    status:
      "Prescription-only, approved for ovulation induction in women. Male use is off-label. Banned in sport at all times.",
    citations: [
      {
        label:
          "Serum levels of enclomiphene and zuclomiphene in hypogonadal men on long-term clomiphene citrate, Journal of Urology",
        url: "https://www.auajournals.org/doi/10.1016/j.juro.2016.02.1859",
      },
    ],
  },

  // --- Gonadotropin --------------------------------------------------------
  {
    id: "hcg",
    name: "hCG",
    aka: ["Human chorionic gonadotropin", "Pregnyl", "Novarel", "Ovidrel"],
    category: "ancillary",
    summary:
      "Acts like LH at the testis, keeping it working while the body's own signal is suppressed.",
    mechanism:
      "Binds the LH receptor on Leydig cells and drives testosterone production directly, bypassing the pituitary. That is why it maintains testicular volume and function during suppression, and why it does nothing to restore the pituitary signal itself.",
    halfLifeHours: 33,
    halfLifeNote:
      "Biphasic: a fast phase of roughly 5 to 9 hours, then a slower terminal phase around 24 to 37 hours. 33 hours is taken from the terminal phase, which is what governs dosing interval. The one-compartment model the app uses cannot show both phases, so the first few hours after a dose are understated.",
    tmaxHours: 6,
    routes: ["subcutaneous", "intramuscular"],
    preparation: "powder",
    iuPerMg: 1_000,
    vialSizesMg: [5, 10],
    reconstitutedDays: 30,
    mechanismClass: ["gonadotropin"],
    doseRanges: [
      {
        lowMcg: 500,
        highMcg: 1_000,
        frequency: "twice or three times weekly",
        perWeek: 3,
        evidence: "anecdotal",
        note: "500 to 1000 IU per injection, to maintain testicular function during suppression. Community practice; there is no approved dose for this use.",
      },
      {
        lowMcg: 1_000,
        highMcg: 4_000,
        frequency: "twice or three times weekly",
        perWeek: 3,
        evidence: "clinical",
        note: "1000 to 4000 IU, the range used clinically for hypogonadotropic hypogonadism and fertility restoration.",
      },
    ],
    sideEffects: [
      "Raised oestradiol, since driving testicular output raises the substrate for aromatase",
      "Leydig cell desensitisation if held above replacement level for long enough, which is the opposite of the intended effect",
      "Injection site reaction",
      "Gynecomastia, downstream of the oestradiol rise",
      "Monitor: oestradiol and total testosterone",
    ],
    contraindications: [
      "Known hormone-dependent tumour",
      "Sustained high-dose use, which desensitises the receptor it depends on",
      "Precocious puberty",
    ],
    status:
      "Prescription-only. Approved for hypogonadotropic hypogonadism and ovulation induction. Banned in sport at all times for men.",
    citations: [
      {
        label: "Disappearance of exogenously administered hCG, Fertility and Sterility",
        url: "https://www.fertstert.org/article/S0015-0282(16)60906-8/pdf",
      },
    ],
  },
];
