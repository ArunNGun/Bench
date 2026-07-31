import type { Peptide } from "../../types";

/**
 * Repair, healing and cosmetic peptides.
 *
 * Almost nothing in this category has human clinical dosing. Where a dose is
 * listed as community practice, and that is exactly what it is: a convention that
 * propagated between vendors, with no derivation from the animal studies it is
 * usually cited alongside. The evidence tag on every dose range says which.
 */
export const REPAIR: Peptide[] = [
  {
    id: "bpc-157",
    name: "BPC-157",
    aka: ["Body Protection Compound 157", "Pentadecapeptide BPC 157"],
    category: "repair",
    summary: "Synthetic 15-amino-acid gastric peptide used for soft-tissue and gut repair.",
    mechanism:
      "No single receptor has been identified. Promotes angiogenesis through VEGFR2 and the Akt/eNOS nitric oxide pathway, upregulates the growth hormone receptor in tendon fibroblasts, and shifts macrophages from an inflammatory to a repair phenotype.",
    halfLifeHours: 0.42,
    halfLifeNote:
      "Animal data only: 15 minutes intravenously in rats, 5 minutes in dogs, 20 to 30 minutes intramuscularly. No human pharmacokinetic study exists. Effects in animals persist for weeks despite this, so the curve below says little about how long it is working.",
    tmaxHours: 0.4,
    routes: ["subcutaneous", "oral", "intramuscular", "topical"],
    vialSizesMg: [5, 10],
    reconstitutedDays: 28,
    doseRanges: [
      {
        lowMcg: 250,
        highMcg: 500,
        frequency: "once or twice daily",
        perWeek: 10,
        evidence: "anecdotal",
        note: "The standard community protocol. No human trial has used this dose or this route.",
      },
      {
        lowMcg: 10000,
        highMcg: 20000,
        frequency: "single intravenous dose",
        perWeek: 1,
        evidence: "preliminary",
        note: "The only published human dosing: an uncontrolled two-person intravenous safety pilot.",
      },
    ],
    timeline: [
      { fromHours: 0, toHours: 1, label: "Peak plasma levels, then cleared within about half an hour." },
      { fromHours: 1, toHours: 24, label: "Undetectable in plasma. Any ongoing effect is downstream signalling, not circulating peptide." },
    ],
    sideEffects: [
      "No systematic human safety data exists, the published human experience totals fewer than 30 people across three uncontrolled pilots.",
      "Theoretical concern about promoting unwanted blood vessel growth, though animal work has also shown the opposite.",
      "Blood pressure effects are plausible through nitric oxide signalling.",
    ],
    contraindications: [
      "Known or suspected cancer, the angiogenesis mechanism cuts both ways and has not been characterised in humans.",
      "Not compoundable in the United States. An FDA advisory committee voted 8 to 6 in favour of adding it to the 503A list in July 2026, but that vote is non-binding and does not make it legal.",
      "Prohibited in sport at all times under WADA category S0. No therapeutic use exemption is possible.",
    ],
    status:
      "Not approved anywhere. The first randomised controlled trial in its history began recruiting in February 2026 (NCT07437547, hamstring strain). A 2025 systematic review of 544 papers found 35 preclinical studies and one clinical study.",
    cautionBanner:
      "There are no published randomised controlled trials of BPC-157 for any indication. Every dose in circulation is a community convention.",
    citations: [
      { label: "He et al. 2022, the only pharmacokinetic study (rat and dog)", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC9794587/" },
      { label: "2025 systematic review, HSS Journal", url: "https://journals.sagepub.com/doi/10.1177/15563316251355551" },
      { label: "NCT07437547, first RCT, recruiting", url: "https://clinicaltrials.gov/study/NCT07437547" },
    ],
  },

  {
    id: "tb-500",
    name: "TB-500",
    aka: ["Ac-LKKTETQ", "thymosin beta-4 fragment 17-23"],
    category: "repair",
    summary: "A seven-amino-acid fragment of thymosin beta-4. Not the same molecule as thymosin beta-4 itself.",
    mechanism:
      "Carries the actin-binding LKKTETQ motif from thymosin beta-4, which sequesters G-actin and regulates cell motility and cytoskeletal remodelling during tissue repair.",
    halfLifeHours: null,
    halfLifeNote:
      "Unknown. No pharmacokinetic study of this fragment exists in any species. The widely repeated claim of a multi-day half-life has no source and is contradicted by full-length thymosin beta-4, which clears from human plasma in 0.5 to 2 hours.",
    routes: ["subcutaneous", "intramuscular"],
    vialSizesMg: [2, 5, 10],
    reconstitutedDays: 28,
    doseRanges: [
      {
        lowMcg: 2000,
        highMcg: 2500,
        frequency: "twice weekly loading, then weekly",
        perWeek: 2,
        evidence: "anecdotal",
        note: "Community loading protocol for 4 to 6 weeks, then maintenance. No clinical trial has ever used the subcutaneous route.",
      },
    ],
    sideEffects: [
      "No human safety data for this fragment exists.",
      "Full-length thymosin beta-4 showed no dose-limiting toxicity across intravenous doses from 42 to 1260 mg.",
    ],
    contraindications: [
      "Known or suspected cancer. Thymosin beta-4 overexpression in melanoma produced a 2.3-fold increase in cell migration and a 4.4-fold increase in tumour vessel count, and it is overexpressed in colon, pancreatic, renal and lung tumours.",
      "Prohibited in sport at all times. WADA names it explicitly under S2.3: 'Thymosin-β4 and its derivatives, e.g. TB-500'.",
    ],
    status:
      "Not approved. An FDA advisory committee voted 8 to 6 in favour of the 503A compounding list in July 2026; that vote is non-binding.",
    cautionBanner:
      "Two chemically different molecules are sold as 'TB-500': this 7-residue fragment and full-length 43-residue thymosin beta-4, which is roughly 5.6 times heavier. All published clinical data belongs to the full-length peptide. There is no way to tell which is in a vial without mass spectrometry.",
    citations: [
      { label: "Esposito et al. 2012, characterisation of purchased TB-500 as the 7-mer", url: "https://pubmed.ncbi.nlm.nih.gov/22962027/" },
      { label: "Thymosin beta-4 human phase 1 PK", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8419156/" },
      { label: "JNCI 2003, thymosin beta-4 and tumour angiogenesis", url: "https://academic.oup.com/jnci/article/95/22/1674/2606660" },
    ],
  },

  {
    id: "ghk-cu",
    name: "GHK-Cu",
    aka: ["copper tripeptide-1", "Gly-His-Lys copper"],
    category: "cosmetic",
    summary: "A copper-carrying tripeptide found naturally in plasma. Used topically for skin.",
    mechanism:
      "Binds copper with a stability constant slightly above albumin's, which lets it accept copper from albumin and deliver it into tissue. Modulates several thousand human genes, stimulates collagen and dermatan sulfate synthesis at nanomolar concentrations, and rebalances the MMP/TIMP system.",
    halfLifeHours: null,
    halfLifeNote:
      "Unknown. The 25 to 35 minute figure repeated across vendor sites has no primary source. No human pharmacokinetic study was found.",
    routes: ["topical", "subcutaneous"],
    vialSizesMg: [50, 100],
    reconstitutedDays: 21,
    doseRanges: [
      {
        lowMcg: 500,
        highMcg: 10000,
        frequency: "applied twice daily",
        perWeek: 14,
        evidence: "clinical",
        note: "Topical, at cosmetic use levels of 0.05 to 1%. Four controlled human studies over 12 weeks support this route. The papers do not state the cream concentrations used, so 'clinically proven at 1 to 2%' is not traceable to them.",
      },
      {
        lowMcg: 1000,
        highMcg: 3000,
        frequency: "once daily",
        perWeek: 7,
        evidence: "anecdotal",
        note: "Injected. There are zero published human trials of injectable GHK-Cu by any route. Note this is 50 to 100 times below the systemic dose Pickart himself estimated from pig data.",
      },
    ],
    timeline: [
      { fromHours: 0, toHours: 168, label: "Topical effects build over weeks, not hours. Trials measured change at 4 and 12 weeks." },
    ],
    sideEffects: [
      "Topically, the Cosmetic Ingredient Review concluded it is safe as used, with negative irritation, sensitisation and genotoxicity data.",
      "Injected, the dose-limiting effect in animals was lowered blood pressure.",
      "Copper load is the real concern by injection: a 100 mg vial carries roughly 18 mg of elemental copper against a tolerable daily upper intake near 10 mg.",
    ],
    contraindications: [
      "Wilson's disease or any disorder of copper handling.",
      "Advanced liver disease, where biliary copper excretion is impaired.",
      "Do not combine with chelators such as EDTA or citrate, with vitamin C or other strong reducing agents, or with acidic diluents, all of these break the copper complex.",
    ],
    status: "A permitted cosmetic ingredient in the EU and US. Not an approved drug. Not listed by WADA.",
    cautionBanner:
      "The blue colour is a genuine integrity check, not a dye. It comes from the copper's coordination geometry, so a solution that has gone colourless, green or brown has dissociated and should not be used. Keep it out of the light.",
    citations: [
      { label: "Pickart & Margolina 2018, GHK-Cu review", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4508379/" },
      { label: "Cosmetic Ingredient Review safety assessment", url: "https://www.cir-safety.org/sites/default/files/tripep062014final.pdf" },
    ],
  },

  {
    id: "kpv",
    name: "KPV",
    aka: ["Lys-Pro-Val", "alpha-MSH 11-13"],
    category: "repair",
    summary: "The three-amino-acid tail of alpha-MSH. Anti-inflammatory, and it works in the gut.",
    mechanism:
      "Taken up through PepT1, a di- and tripeptide transporter that is normally scarce in the colon but is upregulated in inflamed epithelium, so it concentrates in diseased tissue. Once inside it inhibits NF-kB and MAP kinase signalling. The action is transporter-mediated, not melanocortin-receptor mediated.",
    halfLifeHours: null,
    halfLifeNote: "Unknown. No pharmacokinetic study exists in any species.",
    routes: ["oral", "subcutaneous", "topical"],
    vialSizesMg: [5, 10],
    reconstitutedDays: 28,
    doseRanges: [
      {
        lowMcg: 250,
        highMcg: 500,
        frequency: "once or twice daily",
        perWeek: 10,
        evidence: "anecdotal",
        note: "No human study of KPV exists by any route. The only published efficacy dose is 205 mcg per day given orally to mice.",
      },
    ],
    sideEffects: ["No human safety data exists, because no human study exists."],
    contraindications: [
      "Active infection or concurrent immunosuppressants, inhibiting NF-kB implies immunosuppression, though this has not been documented in people.",
    ],
    status:
      "Not approved. An FDA advisory committee voted 8 to 6 in favour of the 503A compounding list in July 2026 for wound healing and inflammatory conditions. Not listed by WADA.",
    cautionBanner:
      "Oral is the mechanistically correct route, because PepT1 is a gut transporter. Injecting KPV bypasses the gut lumen entirely. Topical creams are contradicted by the only permeation study, which found passive skin flux below the limit of detection.",
    citations: [
      { label: "Dalmasso et al. 2008, Gastroenterology, PepT1 mechanism", url: "https://www.gastrojournal.org/article/S0016-5085(07)01852-5/fulltext" },
      { label: "Pawar & Kolli 2017, transdermal permeation in human skin", url: "https://jpharmsci.org/article/S0022-3549(17)30174-0/abstract" },
    ],
  },

  {
    id: "klow",
    name: "KLOW blend",
    aka: ["KLOW 80", "GHK-Cu + BPC-157 + TB-500 + KPV"],
    category: "blend",
    summary: "A four-peptide repair blend, sold as 80 mg in a 5:1:1:1 ratio.",
    mechanism:
      "Combines a copper-carrying skin peptide, two soft-tissue repair peptides and an anti-inflammatory tripeptide. Each component has its own preclinical rationale; the combination has never been studied.",
    halfLifeHours: null,
    halfLifeNote:
      "Not meaningful for a blend whose components have half-lives ranging from minutes to unknown. Track the components separately if you want a curve.",
    routes: ["subcutaneous"],
    vialSizesMg: [80],
    reconstitutedDays: 21,
    components: [
      { peptideId: "ghk-cu", name: "GHK-Cu", mgPerVial: 50 },
      { peptideId: "bpc-157", name: "BPC-157", mgPerVial: 10 },
      { peptideId: "tb-500", name: "TB-500", mgPerVial: 10 },
      { peptideId: "kpv", name: "KPV", mgPerVial: 10 },
    ],
    doseRanges: [
      {
        lowMcg: 1000,
        highMcg: 3000,
        frequency: "once daily",
        perWeek: 7,
        evidence: "anecdotal",
        note: "Total blend mass per dose, rotating injection sites. Every figure here comes from vendor and enthusiast sites.",
      },
    ],
    sideEffects: [
      "No safety data on the combination exists.",
      "Copper load from the GHK-Cu component is the main practical concern.",
    ],
    contraindications: [
      "Everything that applies to each component, in particular the copper cautions on GHK-Cu and the cancer cautions on BPC-157 and TB-500.",
    ],
    status: "Not approved. No published trial has evaluated this four-peptide combination.",
    cautionBanner:
      "The fixed 5:1:1:1 ratio means you cannot titrate the components independently. A dose that delivers a conventional 250 to 500 mcg of BPC-157 simultaneously delivers 1.25 to 2.5 mg of GHK-Cu, which is at or above the whole community range for GHK-Cu on its own. Dosing this blend to hit a BPC-157 target means dosing copper hard.",
    citations: [
      { label: "Composition verified across three vendors at 50/10/10/10 mg", url: "https://www.peptidedosingprotocols.com/stacks/klow-stack" },
    ],
  },

  {
    id: "wolverine",
    name: "Wolverine blend",
    aka: ["BPC-157 + TB-500"],
    category: "blend",
    summary: "BPC-157 and TB-500 together, usually in equal parts.",
    mechanism: "Pairs the two most common soft-tissue repair peptides. The combination has not been studied.",
    halfLifeHours: null,
    halfLifeNote: "Not meaningful for a blend. Track the components separately.",
    routes: ["subcutaneous"],
    vialSizesMg: [10, 15, 20, 30],
    reconstitutedDays: 28,
    components: [
      { peptideId: "bpc-157", name: "BPC-157" },
      { peptideId: "tb-500", name: "TB-500" },
    ],
    doseRanges: [
      {
        lowMcg: 500,
        highMcg: 2000,
        frequency: "once daily",
        perWeek: 7,
        evidence: "anecdotal",
        note: "Total blend mass per dose. Vendor protocols only.",
      },
    ],
    sideEffects: ["No safety data on the combination exists."],
    contraindications: ["Everything that applies to BPC-157 and TB-500 individually."],
    status: "Not approved. No published trial has tested the two together.",
    cautionBanner:
      "Ratios vary by vendor, 1:1 is most common at 5/5, 10/10 or 15/15 mg, but a 1:2 version exists. Check the specific vial. Note also that pre-blending forces both peptides onto the same schedule, which contradicts the usual separate-vial convention of BPC-157 daily and TB-500 once or twice weekly.",
    citations: [
      { label: "Vendor ratio survey", url: "https://www.peptidedosingprotocols.com/stacks/wolverine-stack" },
    ],
  },

  {
    id: "pda",
    name: "Pentadeca Arginate",
    aka: ["PDA", "BPC-157 arginate"],
    category: "repair",
    summary: "BPC-157 supplied as an arginine salt. The same peptide, not a new molecule.",
    mechanism:
      "Identical peptide sequence to BPC-157. Every mechanistic claim made for it is transplanted from BPC-157 rodent work; no study has ever been performed on the arginate salt.",
    halfLifeHours: 0.42,
    halfLifeNote: "Taken from BPC-157 animal data. No study of this salt form exists.",
    tmaxHours: 0.4,
    routes: ["subcutaneous", "oral"],
    vialSizesMg: [5, 10, 20],
    reconstitutedDays: 28,
    doseRanges: [
      {
        lowMcg: 250,
        highMcg: 750,
        frequency: "once or twice daily",
        perWeek: 10,
        evidence: "anecdotal",
        note: "Community protocols only. No registered human trial of PDA exists.",
      },
    ],
    sideEffects: ["No human safety data or toxicology exists for this salt form."],
    contraindications: ["The same considerations as BPC-157."],
    status:
      "Not approved. Note that the July 2026 FDA advisory vote covered BPC-157 free base and BPC-157 acetate. The arginate salt was not what was voted on.",
    cautionBanner:
      "Searching PubMed for 'pentadeca arginate' or 'BPC-157 arginate' returns zero results. The marketing claims of 90% oral bioavailability and 1000-fold greater acid stability have no published study behind them. Separately: 'Pentadeca' and 'Pentosan' are unrelated, Pentosan Polysulfate (Elmiron) is an FDA-approved sulfated polysaccharide for interstitial cystitis, not a peptide.",
    citations: [
      { label: "PubMed, zero results for the compound name", url: "https://pubmed.ncbi.nlm.nih.gov/?term=%22pentadeca+arginate%22" },
    ],
  },

  {
    id: "thymosin-alpha-1",
    name: "Thymosin Alpha-1",
    aka: ["thymalfasin", "Zadaxin", "Ta1"],
    category: "immune",
    summary: "A 28-amino-acid thymic peptide. Approved in around 35 countries, though not the US.",
    mechanism:
      "Immunomodulator cleaved from prothymosin alpha. Promotes T-cell maturation and raises peripheral CD4+ and CD8+ counts, while also damping excessive immune activation.",
    halfLifeHours: 2,
    halfLifeNote:
      "Described in the literature as short. The 2-hour figure is commonly cited but was not verified against a primary source. The existence of PEGylated versions confirms the short half-life is a real development problem.",
    tmaxHours: 1,
    routes: ["subcutaneous"],
    vialSizesMg: [1.6, 5, 10],
    doseRanges: [
      {
        lowMcg: 1600,
        highMcg: 1600,
        frequency: "twice weekly",
        perWeek: 2,
        evidence: "approved",
        note: "1.6 mg subcutaneously twice weekly is the canonical maintenance regimen across hepatitis B and C trials.",
      },
      {
        lowMcg: 1600,
        highMcg: 3200,
        frequency: "once or twice daily",
        perWeek: 7,
        evidence: "clinical",
        note: "Front-loaded daily dosing used in acute settings such as sepsis and acute-on-chronic liver failure.",
      },
    ],
    sideEffects: [
      "Consistently favourable across large trials. Grade 3 or worse treatment-related events in about 4% when combined with checkpoint inhibitors.",
    ],
    contraindications: ["No established contraindications from the approved labels were retrieved."],
    status:
      "Approved in around 35 countries for chronic hepatitis B and C and as a vaccine adjuvant. Not FDA approved. Not named on the WADA list.",
    citations: [
      { label: "NCT01178996, phase 3, 1.6 mg twice weekly", url: "https://clinicaltrials.gov/study/NCT01178996" },
      { label: "ETASS sepsis trial", url: "https://clinicaltrials.gov/study/NCT00711620" },
    ],
  },

  {
    id: "ll-37",
    name: "LL-37",
    aka: ["human cathelicidin", "hCAP18 fragment"],
    category: "immune",
    summary: "The body's own 37-amino-acid antimicrobial peptide.",
    mechanism:
      "Cationic and amphipathic, it disrupts microbial membranes directly. It is also an immune signalling molecule, driving chemotaxis and TLR2 signalling.",
    halfLifeHours: null,
    halfLifeNote: "Unknown. No pharmacokinetic data for administered LL-37 was found.",
    routes: ["subcutaneous", "topical"],
    vialSizesMg: [5, 10],
    doseRanges: [
      {
        lowMcg: 250,
        highMcg: 250,
        frequency: "weekly, injected into the lesion",
        perWeek: 1,
        evidence: "preliminary",
        note: "The melanoma trial that used this dose enrolled four patients. That is the entire interventional injection experience.",
      },
    ],
    sideEffects: ["Essentially uncharacterised in humans."],
    contraindications: [
      "Rosacea, psoriasis, lupus or other inflammatory skin disease. This is the strongest contraindication of any compound in this library: intradermal LL-37 injection is the standard method for inducing rosacea-like lesions in mice, and LL-37 acts as an autoantigen in lupus.",
    ],
    status: "Not approved. Not compoundable. Not listed by WADA.",
    cautionBanner:
      "Injecting LL-37 means administering the exact molecule used to induce rosacea in animal models. Both registered interventional trials chose local delivery, most likely because systemic cationic antimicrobial peptides risk haemolysis.",
    citations: [
      { label: "NCT02225366, intratumoral melanoma trial, n=4", url: "https://clinicaltrials.gov/study/NCT02225366" },
      { label: "LL-37 in rosacea pathogenesis", url: "https://pubmed.ncbi.nlm.nih.gov/42244277/" },
    ],
  },
];
