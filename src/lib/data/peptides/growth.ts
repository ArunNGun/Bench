import type { Peptide } from "../../types";

/**
 * Growth hormone axis, mitochondrial, cognitive and other peptides.
 *
 * Where a half-life or dose could not be traced to a primary source it is left
 * null and the note says so. Several widely repeated community figures turned
 * out to have no source at all; those are called out on the entry rather than
 * quietly reproduced.
 */
export const GROWTH: Peptide[] = [
  {
    id: "somatropin",
    name: "Somatropin (HGH)",
    aka: ["Human growth hormone", "HGH", "Norditropin", "Genotropin", "Humatrope", "Omnitrope"],
    category: "growth-hormone",
    summary:
      "Growth hormone itself, rather than something that asks your pituitary to make more of it.",
    mechanism:
      "Recombinant human growth hormone, identical in sequence to the pituitary hormone. It acts directly at the GH receptor and more importantly for most of its effects, drives the liver to produce IGF-1. Unlike a secretagogue it does not depend on your own pituitary having anything left to give, and equally it does not respect the feedback loop that would normally limit the response.",
    halfLifeHours: 2.6,
    halfLifeNote:
      "2.6 hours after subcutaneous injection, peaking at about 4 hours. Short, but misleading on its own: the effects run through IGF-1, which has a half-life measured in hours to days, so what the body does lasts far longer than the hormone is present. The curve is drawn with a 3.5 hour peak rather than the published 4, because absorption from the subcutaneous depot is slower than clearance and a one-compartment model cannot place a peak later than that, the shape is right, the peak is half an hour early.",
    tmaxHours: 3.5,
    routes: ["subcutaneous", "intramuscular"],
    preparation: "solution",
    // The WHO international standard for recombinant somatropin. Every pen and
    // every conversation about growth hormone is in IU, so the app converts.
    iuPerMg: 3,
    vialSizesMg: [5, 10, 15],
    concentrationsMgPerMl: [3.3, 6.7, 10],
    reconstitutedDays: 28,
    doseRanges: [
      {
        lowMcg: 100,
        highMcg: 300,
        frequency: "daily",
        perWeek: 7,
        evidence: "approved",
        note: "0.1-0.3 mg daily, or roughly 0.3-0.9 IU, as the starting dose for adult-onset growth hormone deficiency. Titrated monthly against IGF-1 rather than by feel.",
      },
      {
        lowMcg: 300,
        highMcg: 1000,
        frequency: "daily",
        perWeek: 7,
        evidence: "approved",
        note: "Maintenance for diagnosed deficiency, not exceeding 1 mg (3 IU) daily. Women on oral oestrogen generally need more; requirement falls with age.",
      },
      {
        lowMcg: 667,
        highMcg: 1333,
        frequency: "daily",
        perWeek: 7,
        evidence: "anecdotal",
        note: "The 2-4 IU daily range used non-medically. Above the licensed maximum, and the glucose and fluid-retention effects scale with it.",
      },
    ],
    timeline: [
      { fromHours: 0, toHours: 4, label: "Rising towards peak; the pulse is deliberately brief." },
      { fromHours: 4, toHours: 12, label: "Falling, while IGF-1 production in the liver picks up." },
      { fromHours: 12, toHours: 48, label: "Hormone long gone; IGF-1 is doing the work." },
    ],
    sideEffects: [
      "Fluid retention, which is the commonest early effect and is dose-dependent",
      "Carpal tunnel syndrome and paraesthesia",
      "Joint and muscle aches",
      "Insulin resistance and rising fasting glucose",
      "Hypothyroidism, which can be unmasked rather than caused",
      "Benign intracranial hypertension, rarely",
      "Monitor: IGF-1, which is the only meaningful measure of whether the dose is right",
      "Monitor: fasting glucose and HbA1c",
      "Monitor: thyroid function",
    ],
    contraindications: [
      "Any active malignancy",
      "Acute critical illness following surgery, trauma or respiratory failure",
      "Proliferative diabetic retinopathy",
      "Children with closed epiphyses, for growth purposes",
    ],
    status:
      "Prescription-only everywhere, and specifically scheduled in several countries including the United States, where distribution for non-medical use is a federal offence. Banned in sport at all times.",
    citations: [
      {
        label: "Norditropin SmPC, 1 mg = 3 IU, adult dosing, pharmacokinetics",
        url: "https://www.medicines.org.uk/emc/product/11757/smpc",
      },
      {
        label: "Somatropin dosage reference (Drugs.com)",
        url: "https://www.drugs.com/dosage/somatropin.html",
      },
    ],
  },

  {
    id: "selank",
    name: "Selank",
    aka: ["TP-7", "Selanx"],
    category: "cognitive",
    summary:
      "An anxiolytic peptide developed in Russia, and the usual companion to Semax.",
    mechanism:
      "A synthetic analogue of the immunomodulatory peptide tuftsin, stabilised with the same proline-glycine-proline tail that Semax carries. Reported to act on GABAergic and serotonergic signalling and to raise BDNF, without the sedation or dependence associated with benzodiazepines.",
    halfLifeHours: null,
    halfLifeNote:
      "Not established in humans. The parent peptide is degraded in plasma within minutes, and intranasal absorption rather than clearance is likely to govern how long anything is present, but no study has measured it, so no curve is drawn.",
    routes: ["intranasal", "subcutaneous"],
    vialSizesMg: [5, 10],
    reconstitutedDays: 28,
    doseRanges: [
      {
        lowMcg: 250,
        highMcg: 900,
        frequency: "daily, usually split between nostrils",
        perWeek: 7,
        evidence: "preliminary",
        note: "The range used in Russian clinical work on generalised anxiety disorder. Those studies are small, largely unreplicated outside Russia, and mostly unavailable in English.",
      },
    ],
    sideEffects: [
      "Nasal irritation with the intranasal form",
      "Fatigue or flatness in some users",
      "The safety record rests on small studies from a single country",
    ],
    contraindications: ["Pregnancy", "No meaningful interaction data exists, so caution alongside psychiatric medication"],
    status:
      "Registered as a medicine in Russia; not approved anywhere in the EU or the United States, where it is sold as a research chemical.",
    citations: [
      {
        label: "Selank, pharmacology and clinical studies overview",
        url: "https://en.wikipedia.org/wiki/Selank",
      },
    ],
    cautionBanner:
      "The evidence is a small Russian literature that has not been replicated elsewhere. Dose ranges come from those studies rather than from anything independent.",
  },

  {
    id: "tesamorelin",
    name: "Tesamorelin",
    aka: ["Egrifta", "TH9507"],
    category: "growth-hormone",
    mechanismClass: ["ghrh-analogue"],
    summary: "A stabilised GHRH analogue. The only FDA-approved compound in this category.",
    mechanism:
      "A synthetic analogue of growth hormone releasing hormone that binds pituitary GHRH receptors and stimulates the body's own pulsatile growth hormone release, rather than supplying growth hormone directly.",
    halfLifeHours: 0.4,
    halfLifeNote: "Roughly 26 to 38 minutes after subcutaneous dosing in people with HIV lipodystrophy.",
    tmaxHours: 0.25,
    routes: ["subcutaneous"],
    vialSizesMg: [1, 2],
    doseRanges: [
      {
        lowMcg: 2000,
        highMcg: 2000,
        frequency: "once daily",
        perWeek: 7,
        evidence: "approved",
        note: "2 mg subcutaneously into the abdomen once daily, rotating the site. Approved for excess abdominal fat in HIV-associated lipodystrophy.",
      },
    ],
    timeline: [
      { fromHours: 0, toHours: 0.5, label: "Peak plasma levels within about 15 minutes, triggering a growth hormone pulse." },
      { fromHours: 0.5, toHours: 3, label: "Peptide cleared. The growth hormone pulse it triggered outlasts it." },
      { fromHours: 3, toHours: 24, label: "Downstream IGF-1 effects, which build over weeks of daily dosing." },
    ],
    sideEffects: [
      "Injection site reactions, joint pain, muscle pain, swelling in the limbs",
      "Raised IGF-1, which is the intended pharmacology and also the monitoring parameter",
      "Glucose intolerance, growth hormone is counter-regulatory to insulin",
    ],
    contraindications: [
      "Active malignancy.",
      "Disruption of the hypothalamic-pituitary axis from surgery, radiation or tumour.",
      "Pregnancy.",
      "Known hypersensitivity to tesamorelin or mannitol.",
    ],
    status: "FDA approved as Egrifta. Prohibited in sport at all times under WADA category S2.",
    citations: [
      { label: "Egrifta prescribing information", url: "https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=EGRIFTA" },
    ],
  },

  {
    id: "ghrp-6",
    name: "GHRP-6",
    aka: ["SKF-110679", "CIGB-500"],
    category: "growth-hormone",
    mechanismClass: ["ghrelin-agonist"],
    summary: "A hexapeptide ghrelin receptor agonist. Strongly appetite-stimulating.",
    mechanism:
      "Agonist at the ghrelin receptor GHS-R1a on pituitary somatotrophs and on appetite neurons in the arcuate nucleus. It works largely through the body's own GHRH, blocking GHRH cuts the growth hormone response by about 82%, and by opposing somatostatin tone. It also binds CD36, which is the basis of a separate cytoprotective effect unrelated to growth hormone.",
    halfLifeHours: 2.5,
    halfLifeNote:
      "2.5 hours elimination, 7.6 minutes distribution, measured intravenously in nine healthy men. Note this was measured at 100 to 400 mcg/kg, which is 100 to 400 times the dose that saturates growth hormone release, so extrapolating down to a 100 mcg dose is unvalidated. No human subcutaneous pharmacokinetic study exists.",
    tmaxHours: 0.3,
    routes: ["subcutaneous", "intravenous", "intranasal", "oral"],
    vialSizesMg: [5],
    reconstitutedDays: 28,
    doseRanges: [
      {
        lowMcg: 70,
        highMcg: 100,
        frequency: "once, intravenously",
        perWeek: 1,
        evidence: "clinical",
        note: "About 1 mcg/kg intravenously saturates the growth hormone response, peak GH of 68.7 mcg/L against 7.6 at a tenth of the dose.",
      },
      {
        lowMcg: 100,
        highMcg: 300,
        frequency: "two or three times daily, at least 3 hours apart",
        perWeek: 17,
        evidence: "anecdotal",
        note: "The community subcutaneous convention. It is extrapolated from a 1990 intravenous study; no human subcutaneous dose-ranging study has ever been done.",
      },
    ],
    timeline: [
      { fromHours: 0, toHours: 0.5, label: "Growth hormone pulse peaks 15 to 30 minutes in. Appetite stimulation begins." },
      { fromHours: 0.5, toHours: 2, label: "Pulse largely resolved. Cortisol and prolactin also rise at growth-hormone-saturating doses." },
      { fromHours: 2, toHours: 8, label: "Peptide cleared. Appetite effects can persist several hours in animal studies." },
    ],
    sideEffects: [
      "Strong appetite stimulation, the defining feature of this peptide",
      "Prolactin and cortisol both roughly double at the dose that maximises growth hormone",
      "Increased stage 2 sleep when dosed overnight, along with a nocturnal cortisol rise",
      "Water retention, joint and muscle pain, injection site reactions",
      "Transient bradycardia at every dose level in 28-day dog toxicology",
    ],
    contraindications: [
      "Active or suspected malignancy.",
      "Cushing's disease or any ACTH-dependent hypercortisolism.",
      "Prolactinoma or existing hyperprolactinaemia.",
      "Diabetes or impaired glucose tolerance, growth hormone is counter-regulatory.",
      "Untreated thyroid dysfunction.",
    ],
    status:
      "Not approved anywhere. Zero registered trials on ClinicalTrials.gov. A Cuban programme reached phase 3 for acute ischaemic stroke and missed its primary endpoint. Prohibited in sport at all times.",
    cautionBanner:
      "Two things the vendor literature gets wrong. First, cortisol and prolactin do not only rise 'at high doses', they roughly double at exactly the 1 mcg/kg dose that maximises growth hormone, so the effects cannot be separated by dosing lower. Second, the widely cited '28% increase in food intake in men' comes from a ghrelin study, not a GHRP-6 study.",
    citations: [
      { label: "Bowers et al., JCEM 1990, the canonical dose-response", url: "https://academic.oup.com/jcem/article-abstract/70/4/975/2652594" },
      { label: "Cabrales et al. 2013, human pharmacokinetics", url: "https://pubmed.ncbi.nlm.nih.gov/23099431/" },
      { label: "Pandya et al. 1998, GHRH dependence", url: "https://pubmed.ncbi.nlm.nih.gov/9543138/" },
    ],
  },

  {
    id: "ipamorelin",
    name: "Ipamorelin",
    aka: ["NNC 26-0161"],
    category: "growth-hormone",
    mechanismClass: ["ghrelin-agonist"],
    summary: "A selective ghrelin receptor agonist, chosen for not raising cortisol or prolactin.",
    mechanism:
      "A pentapeptide agonist at GHS-R1a. Its selling point over GHRP-6 and GHRP-2 is selectivity: in the original characterisation it released growth hormone without the accompanying ACTH, cortisol and prolactin rise.",
    halfLifeHours: 2,
    halfLifeNote:
      "2 hours terminal, measured in humans. Clearance 0.078 L/h/kg, volume at steady state 0.22 L/kg. The growth hormone pulse it triggers peaks around 40 minutes, well before the peptide has cleared.",
    tmaxHours: 0.5,
    routes: ["subcutaneous"],
    vialSizesMg: [2, 5, 10],
    reconstitutedDays: 28,
    doseRanges: [
      {
        lowMcg: 100,
        highMcg: 300,
        frequency: "one to three times daily",
        perWeek: 14,
        evidence: "anecdotal",
        note: "Community convention, often paired with a GHRH analogue. No approved dosing exists.",
      },
    ],
    timeline: [
      { fromHours: 0, toHours: 0.5, label: "Growth hormone pulse rises and peaks." },
      { fromHours: 0.5, toHours: 3, label: "Pulse subsides. Peptide clearing." },
    ],
    sideEffects: [
      "Headache, flushing, lightheadedness",
      "Water retention and joint discomfort at higher doses",
      "Less appetite stimulation than GHRP-6, though not none",
    ],
    contraindications: ["Active or suspected malignancy.", "Diabetes or impaired glucose tolerance."],
    status:
      "Not approved. Its one substantial human trial, 0.03 mg/kg intravenously twice daily for 7 days in postoperative ileus, 117 patients, failed, and development stopped. Prohibited in sport at all times. Placed in FDA compounding Category 2 in September 2023.",
    cautionBanner:
      "The well-known selectivity claim, that it releases growth hormone without raising cortisol or prolactin, comes from a study in conscious swine. No dedicated human selectivity study was found. The longest human exposure on record is 7 days, by a different route and at roughly 10 to 20 times community doses.",
    citations: [
      { label: "Raun et al. 1998, original characterisation (swine)", url: "https://pubmed.ncbi.nlm.nih.gov/9849822/" },
      { label: "Gobburu et al. 1999, human pharmacokinetics", url: "https://pubmed.ncbi.nlm.nih.gov/10496658/" },
    ],
  },

  {
    id: "cjc-1295-no-dac",
    name: "CJC-1295 without DAC",
    aka: ["Modified GRF 1-29", "Mod GRF 1-29", "Sermorelin analogue"],
    category: "growth-hormone",
    mechanismClass: ["ghrh-analogue"],
    summary: "A short-acting GHRH analogue. Often paired with a ghrelin agonist.",
    mechanism:
      "A modified fragment of GHRH, with four amino acid substitutions that resist enzymatic breakdown. Without the drug affinity complex it does not bind albumin, so it produces a single sharp growth hormone pulse rather than sustained elevation.",
    halfLifeHours: 0.5,
    halfLifeNote: "About 30 minutes. Commonly cited; not verified against a primary human paper here.",
    tmaxHours: 0.25,
    routes: ["subcutaneous"],
    vialSizesMg: [2, 5],
    reconstitutedDays: 28,
    doseRanges: [
      {
        lowMcg: 100,
        highMcg: 100,
        frequency: "one to three times daily",
        perWeek: 14,
        evidence: "anecdotal",
        note: "Community convention. The rationale for pulsed rather than continuous dosing is sound: in rodents, continuous exposure raises hypothalamic somatostatin and suppresses natural pulses.",
      },
    ],
    sideEffects: ["Injection site reactions, flushing, water retention, head rush shortly after dosing."],
    contraindications: ["Active or suspected malignancy.", "Diabetes or impaired glucose tolerance."],
    status: "Not approved. Prohibited in sport at all times.",
    citations: [
      { label: "Teichman et al. 2006, CJC-1295 phase 1", url: "https://pubmed.ncbi.nlm.nih.gov/16352683/" },
    ],
  },

  {
    id: "cjc-1295-dac",
    name: "CJC-1295 with DAC",
    aka: ["DAC:GRF", "CJC-1295 DAC"],
    category: "growth-hormone",
    mechanismClass: ["ghrh-analogue"],
    summary: "The long-acting version, which binds albumin and lasts days rather than minutes.",
    mechanism:
      "The same GHRH analogue carrying a drug affinity complex that binds covalently to serum albumin. That extends exposure from minutes to days, producing a sustained elevation in growth hormone and IGF-1 rather than a pulse.",
    halfLifeHours: 144,
    halfLifeNote:
      "Roughly 5.8 to 8.1 days in the phase 1 study. Single doses raised growth hormone 2 to 10 fold for six days or more and IGF-1 1.5 to 3 fold for up to 11 days.",
    tmaxHours: 24,
    routes: ["subcutaneous"],
    vialSizesMg: [2, 5],
    reconstitutedDays: 28,
    doseRanges: [
      {
        lowMcg: 30,
        highMcg: 60,
        frequency: "once or twice weekly",
        perWeek: 1.5,
        evidence: "anecdotal",
        note: "Community convention, usually expressed per kilogram. Phase 1 studied single doses of 30 to 60 mcg/kg.",
      },
    ],
    timeline: [
      { fromHours: 0, toHours: 24, label: "Building toward peak. Growth hormone begins rising." },
      { fromHours: 24, toHours: 144, label: "Sustained elevation of growth hormone, 2 to 10 fold above baseline." },
      { fromHours: 144, toHours: 264, label: "Growth hormone returning to baseline while IGF-1 stays elevated." },
    ],
    sideEffects: [
      "Water retention, joint pain and carpal tunnel symptoms, all more likely than with the short-acting version",
      "Sustained rather than pulsatile growth hormone, which is not how the hormone is normally secreted",
    ],
    contraindications: [
      "Active or suspected malignancy.",
      "Diabetes or impaired glucose tolerance.",
      "IGF-1 stays elevated for up to 28 days after repeated dosing, so exposure cannot be withdrawn quickly if something goes wrong.",
    ],
    status:
      "Not approved. The phase 2 programme in HIV lipodystrophy was halted after a participant died of a myocardial infarction. The attending physician attributed it to pre-existing coronary disease and causality was never established, but the programme was not restarted. Prohibited in sport at all times.",
    cautionBanner:
      "Flattening growth hormone into a sustained elevation removes its natural pulsatility. Rodent work shows continuous secretagogue exposure raises hypothalamic somatostatin and suppresses spontaneous pulses, which is the mechanistic argument against this format rather than the short-acting one. Note also that any off-period shorter than about four weeks is not a washout, IGF-1 remains above baseline that long.",
    citations: [
      { label: "Teichman et al. 2006, JCEM, phase 1", url: "https://pubmed.ncbi.nlm.nih.gov/16352683/" },
    ],
  },

  {
    id: "hgh-frag-176-191",
    name: "HGH Fragment 176-191",
    aka: ["hGH 176-191"],
    category: "metabolic",
    summary: "The literal C-terminal fragment of growth hormone. Distinct from AOD-9604.",
    mechanism:
      "A 16-residue fragment of human growth hormone beginning with phenylalanine, cyclised through a disulfide bond. A lipolytic effect independent of the growth hormone receptor is claimed but no receptor target has been identified.",
    halfLifeHours: null,
    halfLifeNote: "No pharmacokinetic data exists for this peptide in any species.",
    routes: ["subcutaneous"],
    vialSizesMg: [2, 5],
    doseRanges: [
      {
        lowMcg: 250,
        highMcg: 500,
        frequency: "once or twice daily",
        perWeek: 10,
        evidence: "anecdotal",
        note: "Community convention with no supporting study of any kind.",
      },
    ],
    sideEffects: ["No safety data exists."],
    contraindications: ["Prohibited in sport at all times, WADA names hGH 176-191 explicitly."],
    status: "Not approved. No human data of any kind.",
    cautionBanner:
      "This is not the same molecule as AOD-9604, despite constant cross-labelling. AOD-9604 has a tyrosine at the first position where this peptide has phenylalanine. All human data belongs to AOD-9604; native 176-191 has none. WADA lists the two separately, and a vial labelled one way may contain the other.",
    citations: [
      { label: "UniProt P01241, human somatotropin sequence", url: "https://rest.uniprot.org/uniprotkb/P01241.txt" },
    ],
  },

  {
    id: "mots-c",
    name: "MOTS-c",
    aka: ["mitochondrial ORF of the twelve S rRNA type-c"],
    category: "longevity",
    summary: "A 16-amino-acid peptide encoded in mitochondrial DNA.",
    mechanism:
      "A mitochondrial-derived peptide that activates AMPK and influences the folate, methionine cycle, shifting cells toward glucose utilisation. Studied for insulin sensitivity and exercise capacity.",
    halfLifeHours: null,
    halfLifeNote: "No human pharmacokinetic data was located.",
    routes: ["subcutaneous"],
    vialSizesMg: [5, 10],
    reconstitutedDays: 28,
    doseRanges: [
      {
        lowMcg: 5000,
        highMcg: 10000,
        frequency: "two or three times weekly",
        perWeek: 2.5,
        evidence: "anecdotal",
        note: "Community convention. No human trial dosing exists.",
      },
    ],
    sideEffects: ["No human safety data exists."],
    contraindications: ["No established contraindications, because no human study has been done."],
    status:
      "Not approved. An FDA advisory committee voted 7 to 5 in favour of adding it to the 503A compounding list in July 2026, nominated for obesity and osteoporosis. That vote is non-binding.",
    citations: [
      { label: "Lee et al. 2015, Cell Metabolism, original characterisation", url: "https://pubmed.ncbi.nlm.nih.gov/25738459/" },
    ],
  },

  {
    id: "ss-31",
    name: "SS-31",
    aka: ["Elamipretide", "Bendavia", "MTP-131", "Forzinity"],
    category: "longevity",
    summary:
      "A four-amino-acid peptide that binds cardiolipin in the inner mitochondrial membrane. Approved in the United States in September 2025, for one rare disease.",
    mechanism:
      "D-Arg-dimethylTyr-Lys-Phe-NH2. It concentrates in the inner mitochondrial membrane and binds cardiolipin, the lipid that organises the electron transport chain into supercomplexes. Binding cardiolipin changes how cytochrome c interacts with it, which the approved label describes as improving mitochondrial morphology and function. It is not an antioxidant supplement and not a hormone.",
    halfLifeHours: null,
    halfLifeNote:
      "Not stated anywhere citable for people. This is the unusual case of an approved drug whose label reports absorption, distribution and excretion but no half-life: peak at 0.5 to 1 hour after subcutaneous injection, 92% bioavailable, and essentially the whole dose recovered in urine as parent or the M1 and M2 metabolites by 48 hours, with minimal accumulation on daily dosing. Those facts bound it below a day without giving a figure. The 4 hours recorded here was measured in dogs given it intravenously, so the curve drawn from it shows a shape and not a level.",
    halfLifeEstimate: {
      hours: 4,
      evidence: "preclinical",
      species: "dogs",
      route: "intravenous",
      source: "ADDF Cognitive Vitality review, SS-31",
      url: "https://www.alzdiscovery.org/uploads/cognitive_vitality_media/SS-31-Cognitive-Vitality-For-Researchers.pdf",
    },
    routes: ["subcutaneous", "intravenous"],
    vialSizesMg: [10, 50],
    reconstitutedDays: 28,
    doseRanges: [
      {
        lowMcg: 40_000,
        highMcg: 40_000,
        frequency: "once daily",
        perWeek: 7,
        evidence: "approved",
        note: "40 mg subcutaneously once daily, in the abdomen or outer thigh, rotating sites. Halved to 20 mg in adults with an eGFR under 30 mL/min who are not on dialysis. This is the Barth syndrome dose in patients weighing at least 30 kg, and it is the same 40 mg daily dose used in the mitochondrial myopathy and heart failure trials.",
      },
    ],
    sideEffects: [
      "Injection site reactions, which are close to universal: every patient in the approved crossover trial had injection site erythema, and induration, pruritus and pain each affected two thirds or more.",
      "Raised eosinophils, appearing when dosing runs past 30 days and peaking around day 90, then returning to baseline on continued treatment or after stopping. Not associated with any symptom or other laboratory change.",
      "Hypersensitivity, including reactions needing emergency treatment. Rash, papular lesions, eczematous dermatitis and cough, from minutes to months after starting.",
    ],
    contraindications: [
      "Serious hypersensitivity to elamipretide. Anyone who has had one should not be rechallenged.",
      "Neonates. The approved solution is preserved with benzyl alcohol, 20 mg/mL, which has caused fatal gasping syndrome in low birth weight and preterm infants.",
      "Severe renal impairment without a dose reduction. Exposure to the M1 and M2 metabolites rose by 280% and 640% at a creatinine clearance under 30 mL/min.",
      "Known or suspected cancer, cautiously. In one mouse model of liver cancer, mitochondria-targeted antioxidants including this one increased tumour number and size while conventional antioxidants reduced them. Mouse data, one model, and never assessed in people.",
    ],
    status:
      "Approved by the FDA in September 2025 as Forzinity, to improve muscle strength in Barth syndrome at 30 kg and above. That is an accelerated approval resting on knee extensor strength, an intermediate endpoint, in twelve patients. Its phase 3 trial in primary mitochondrial myopathy, MMPOWER-3, enrolled 218 people and missed its primary endpoints, as did phase 2 trials in heart failure and the original Barth trial.",
    cautionBanner:
      "One narrow approval, and no evidence for the reason most people buy it. Nothing has been shown in humans for mitochondrial ageing, energy, fitness or cognition; the trials that tested harder endpoints in larger populations failed. Note also that the approved product is a ready-made preserved solution at 80 mg/mL, while material sold as research-grade SS-31 is lyophilised powder you reconstitute yourself, so the vial sizes here follow the powder.",
    citations: [
      { label: "FDA prescribing information, Forzinity (elamipretide), September 2025", url: "https://www.accessdata.fda.gov/drugsatfda_docs/label/2025/215244s000lbl.pdf" },
      { label: "DailyMed, Forzinity label", url: "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=146bf34c-76f2-48db-ac07-fb29cce2cd75" },
      { label: "Karaa et al. 2023, Neurology, MMPOWER-3 phase 3 in primary mitochondrial myopathy", url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10382259/" },
      { label: "ADDF Cognitive Vitality review, SS-31, for the canine 4 hour figure", url: "https://www.alzdiscovery.org/uploads/cognitive_vitality_media/SS-31-Cognitive-Vitality-For-Researchers.pdf" },
    ],
  },

  {
    id: "pt-141",
    name: "PT-141",
    aka: ["Bremelanotide", "Vyleesi"],
    category: "sexual",
    summary: "A melanocortin receptor agonist for low sexual desire. FDA approved.",
    mechanism:
      "An analogue of alpha-MSH acting at melanocortin receptors in the central nervous system, principally MC4R. It works through brain pathways governing sexual desire rather than through blood flow, which is what distinguishes it from PDE5 inhibitors.",
    halfLifeHours: 2.7,
    halfLifeNote: "About 2.7 hours after subcutaneous injection.",
    tmaxHours: 1,
    routes: ["subcutaneous"],
    vialSizesMg: [1.75, 10],
    doseRanges: [
      {
        lowMcg: 1750,
        highMcg: 1750,
        frequency: "as needed, at least 45 minutes before activity",
        perWeek: 2,
        evidence: "approved",
        note: "1.75 mg subcutaneously in the abdomen or thigh. No more than one dose in 24 hours and no more than eight doses per month.",
      },
    ],
    timeline: [
      { fromHours: 0, toHours: 1, label: "Absorbing. The label advises dosing at least 45 minutes ahead." },
      { fromHours: 1, toHours: 3, label: "Peak levels. Nausea, if it happens, is most likely here." },
      { fromHours: 3, toHours: 16, label: "Clearing. Blood pressure rises transiently and heart rate falls in this window." },
    ],
    sideEffects: [
      "Nausea, often on the first dose, it affected about 40% in trials and led 8% to stop",
      "Flushing and injection site reactions",
      "Headache",
      "Transient rise in blood pressure with a fall in heart rate, peaking in the first hours",
      "Darkening of the skin or gums with repeated use, more likely in people with darker skin",
    ],
    contraindications: [
      "Uncontrolled high blood pressure or known cardiovascular disease.",
      "Not for premenopausal women who are pregnant.",
    ],
    status: "FDA approved as Vyleesi for hypoactive sexual desire disorder in premenopausal women.",
    citations: [
      { label: "Vyleesi prescribing information", url: "https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=VYLEESI" },
    ],
  },

  {
    id: "semax",
    name: "Semax",
    aka: ["Met-Glu-His-Phe-Pro-Gly-Pro"],
    category: "cognitive",
    summary: "A heptapeptide ACTH fragment analogue, used in Russia as a nootropic and stroke drug.",
    mechanism:
      "Derived from ACTH(4-10) with a Pro-Gly-Pro tail that resists degradation. Raises BDNF and NGF expression and modulates monoamine systems, with no corticotropic activity of its own.",
    halfLifeHours: null,
    halfLifeNote:
      "No reliable human pharmacokinetic figure was located. Intranasal absorption is rapid; duration of central effect is reported as far longer than plasma presence.",
    routes: ["intranasal", "subcutaneous"],
    vialSizesMg: [5, 10],
    reconstitutedDays: 28,
    doseRanges: [
      {
        lowMcg: 200,
        highMcg: 1000,
        frequency: "once or twice daily",
        perWeek: 10,
        evidence: "anecdotal",
        note: "Community convention for the intranasal route. Registered in Russia with its own dosing, which was not verified here.",
      },
    ],
    sideEffects: ["Nasal irritation with prolonged intranasal use. Little systematic safety data outside Russia."],
    contraindications: [
      "A history of seizures or convulsions.",
      "Conditions accompanied by anxiety, the registered leaflet lists this explicitly, and it is the caution most often left off vendor pages.",
      "Pregnancy and breastfeeding.",
      "Acute psychotic states.",
    ],
    status:
      "Registered as a medicine in Russia; not approved in the US or EU. An FDA advisory committee voted 8 to 5 in favour of the 503A compounding list in July 2026. That vote is non-binding.",
    citations: [
      { label: "Federal Register, July 2026 PCAC meeting notice", url: "https://www.federalregister.gov/documents/2026/04/16/2026-07361/" },
    ],
  },

  {
    id: "epitalon",
    name: "Epitalon",
    aka: ["Epithalon", "Ala-Glu-Asp-Gly"],
    category: "longevity",
    summary: "A four-amino-acid peptide studied in Russia for telomerase activation and ageing.",
    mechanism:
      "A synthetic tetrapeptide based on epithalamin, a pineal extract. Reported to activate telomerase and normalise melatonin rhythm. The supporting work is almost entirely from a single Russian research group.",
    halfLifeHours: null,
    halfLifeNote: "No pharmacokinetic data was located in any species.",
    routes: ["subcutaneous"],
    vialSizesMg: [10, 20, 50],
    reconstitutedDays: 28,
    doseRanges: [
      {
        lowMcg: 5000,
        highMcg: 10000,
        frequency: "once daily for a 10 to 20 day course",
        perWeek: 7,
        evidence: "anecdotal",
        note: "Community convention, usually run as short courses once or twice a year rather than continuously.",
      },
    ],
    sideEffects: ["No systematic safety data outside the originating research group."],
    contraindications: ["No established contraindications."],
    status:
      "Not approved outside Russia. An FDA advisory committee voted 7 to 5 in favour of the 503A compounding list in July 2026. That vote is non-binding.",
    cautionBanner:
      "Two things worth knowing. There are zero registered clinical trials of this compound, the only two published human studies used 5 micrograms per eye and 0.5 mg sublingually, so the community injection dose of 5 to 10 mg is roughly twenty times higher than any published human dose, by a different route. And the entire selling proposition, telomerase activation, is also a hallmark of cellular immortalisation; the oncological implication of chronic systemic telomerase induction has never been assessed in people.",
    citations: [
      { label: "Federal Register, July 2026 PCAC meeting notice", url: "https://www.federalregister.gov/documents/2026/04/16/2026-07361/" },
    ],
  },
];
