import type { Peptide } from "../../types";

/**
 * Incretin and metabolic compounds.
 *
 * Half-lives and titration ladders are taken from FDA labels where one exists,
 * and from the published trial protocol otherwise. Where a figure could not be
 * traced to a primary source it is left null and the entry says so rather than
 * carrying a plausible-looking number.
 */
export const METABOLIC: Peptide[] = [
  {
    id: "retatrutide",
    name: "Retatrutide",
    aka: ["LY3437943", "Reta"],
    category: "metabolic",
    mechanismClass: ["glp1-agonist", "gip-agonist", "glucagon-agonist"],
    summary: "Triple agonist at the GIP, GLP-1 and glucagon receptors. Investigational.",
    mechanism:
      "A single acylated peptide that activates three receptors at once. GLP-1 and GIP agonism suppress appetite and slow gastric emptying; adding glucagon receptor agonism raises energy expenditure, which is what separates it from the dual agonists.",
    halfLifeHours: 144,
    halfLifeNote: "Roughly 6 days, from the phase 1b multiple-ascending-dose study.",
    tmaxHours: 30,
    routes: ["subcutaneous"],
    vialSizesMg: [],
    doseRanges: [
      {
        lowMcg: 1000,
        highMcg: 12000,
        frequency: "once weekly",
        perWeek: 1,
        evidence: "clinical",
        note: "Range of maintenance doses studied in the phase 2 obesity trial.",
      },
    ],
    titrations: [
      {
        id: "reta-p2-12mg",
        name: "Phase 2 escalation to 12 mg",
        source: "NCT04881760 (phase 2 obesity), 2 mg starting arm",
        sourceUrl: "https://clinicaltrials.gov/study/NCT04881760",
        evidence: "clinical",
        note: "The dose sequence is verified from the trial registry. The four-week step length is the interval widely reported for this trial but could not be confirmed from the registry or the paper, so treat the timing as approximate.",
        steps: [
          { step: 1, doseMcg: 2000, weeks: 4 },
          { step: 2, doseMcg: 4000, weeks: 4 },
          { step: 3, doseMcg: 8000, weeks: 4 },
          { step: 4, doseMcg: 12000, weeks: 36, note: "Maintenance through week 48." },
        ],
      },
      {
        id: "reta-p2-8mg",
        name: "Phase 2 escalation to 8 mg",
        source: "NCT04881760, 2 mg starting arm",
        sourceUrl: "https://clinicaltrials.gov/study/NCT04881760",
        evidence: "clinical",
        steps: [
          { step: 1, doseMcg: 2000, weeks: 4 },
          { step: 2, doseMcg: 4000, weeks: 4 },
          { step: 3, doseMcg: 8000, weeks: 40 },
        ],
      },
      {
        id: "reta-p1b",
        name: "Phase 1b rapid escalation",
        source: "NCT04143802, cohort 5",
        sourceUrl: "https://clinicaltrials.gov/study/NCT04143802",
        evidence: "clinical",
        note: "Step lengths here are verified from the paper: two weeks, two weeks, then four and four.",
        steps: [
          { step: 1, doseMcg: 3000, weeks: 2 },
          { step: 2, doseMcg: 6000, weeks: 2 },
          { step: 3, doseMcg: 9000, weeks: 4 },
          { step: 4, doseMcg: 12000, weeks: 4 },
        ],
      },
    ],
    timeline: [
      { fromHours: 0, toHours: 12, label: "Absorbing from the injection site. Little felt yet." },
      { fromHours: 12, toHours: 48, label: "Peak plasma levels. Appetite suppression and any nausea are usually strongest here." },
      { fromHours: 48, toHours: 144, label: "Past peak, still around half of the peak level. Steady appetite effect." },
      { fromHours: 144, toHours: 336, label: "Falling toward trough. Appetite often returns late in the week." },
    ],
    sideEffects: [
      "Nausea, vomiting, diarrhoea and constipation, all dose-related",
      "Eructation, which showed up specifically at the highest doses",
      "Heart rate rose 2 to 13 bpm at 24 hours post-dose in the three highest dose groups",
      "Decreased appetite to the point of inadequate intake",
    ],
    contraindications: [
      "Not an approved medicine anywhere. There is no label, no established safety monitoring and no verified source of supply.",
      "Trial exclusion criteria included personal or family history of medullary thyroid carcinoma and MEN 2, following the class warning on other incretin drugs.",
    ],
    status:
      "Investigational. Not approved by the FDA or any other regulator. Phase 3 (TRIUMPH) doses are blinded and not public.",
    cautionBanner:
      "No approved label exists. Storage, stability after reconstitution and vial strength are undocumented for this compound, nothing sold as research material has verified identity, purity or sterility.",
    citations: [
      { label: "Urva et al., Lancet 2022, phase 1b PK and safety", url: "https://www.thelancet.com/journals/lancet/article/PIIS0140-6736(22)02033-5/abstract" },
      { label: "NCT04881760, phase 2 obesity trial arms", url: "https://clinicaltrials.gov/study/NCT04881760" },
      { label: "Jastreboff et al., NEJM 2023, phase 2 results", url: "https://www.nejm.org/doi/full/10.1056/NEJMoa2301972" },
    ],
  },

  {
    id: "tirzepatide",
    name: "Tirzepatide",
    aka: ["Mounjaro", "Zepbound", "LY3298176"],
    category: "metabolic",
    mechanismClass: ["glp1-agonist", "gip-agonist"],
    summary: "GIP and GLP-1 receptor dual agonist. FDA approved.",
    mechanism:
      "A GIP-based peptide that activates both the GIP and GLP-1 receptors. Slows gastric emptying, increases insulin secretion in response to glucose, and reduces appetite. Bound to albumin via a C20 diacid, which is what gives it a weekly half-life.",
    halfLifeHours: 120,
    halfLifeNote: "About 5 days per the label; population PK gives 5.4 days.",
    tmaxHours: 24,
    routes: ["subcutaneous"],
    vialSizesMg: [2.5, 5, 7.5, 10, 12.5, 15],
    reconstitutedDays: 30,
    doseRanges: [
      {
        lowMcg: 2500,
        highMcg: 15000,
        frequency: "once weekly",
        perWeek: 1,
        evidence: "approved",
        note: "2.5 mg is a starting dose only and is not intended for glycaemic control.",
      },
    ],
    titrations: [
      {
        id: "tirz-label",
        name: "Label escalation to 15 mg",
        source: "Zepbound and Mounjaro prescribing information, section 2",
        sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=487cd7e7-434c-4925-99fa-aa80b1cc776b",
        evidence: "approved",
        note: "Each step is held at least 4 weeks. Maintenance doses for weight management are 5, 10 or 15 mg.",
        steps: [
          { step: 1, doseMcg: 2500, weeks: 4, note: "Starting dose." },
          { step: 2, doseMcg: 5000, weeks: 4 },
          { step: 3, doseMcg: 7500, weeks: 4 },
          { step: 4, doseMcg: 10000, weeks: 4 },
          { step: 5, doseMcg: 12500, weeks: 4 },
          { step: 6, doseMcg: 15000, weeks: 12 },
        ],
      },
    ],
    timeline: [
      { fromHours: 0, toHours: 8, label: "Absorbing. Gastric emptying starts to slow." },
      { fromHours: 8, toHours: 48, label: "Peak plasma levels, median at 24 hours. Nausea, if it comes, usually peaks here." },
      { fromHours: 48, toHours: 120, label: "Half of peak by day 5. Steady appetite suppression." },
      { fromHours: 120, toHours: 168, label: "Trough. About 41% of peak remains at day 7 before the next dose." },
    ],
    sideEffects: [
      "Nausea, diarrhoea, vomiting, constipation, the dose-limiting effects",
      "Injection site reactions",
      "Delayed gastric emptying, strongest after the first 5 mg dose and diminishing thereafter",
      "Gallbladder disease and pancreatitis, uncommon",
    ],
    contraindications: [
      "Boxed warning: thyroid C-cell tumours in rats. Contraindicated with a personal or family history of medullary thyroid carcinoma or MEN 2.",
      "Known hypersensitivity to tirzepatide.",
      "Caution with insulin or sulfonylureas, risk of hypoglycaemia.",
    ],
    status: "FDA approved as Mounjaro (type 2 diabetes) and Zepbound (weight management, obstructive sleep apnoea).",
    citations: [
      { label: "Zepbound prescribing information", url: "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=487cd7e7-434c-4925-99fa-aa80b1cc776b" },
      { label: "Mounjaro prescribing information", url: "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=d2d7da5d-ad07-4228-955f-cf7e355c8cc0" },
      { label: "Schneck et al. 2024, population PK", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10962491/" },
    ],
  },

  {
    id: "semaglutide",
    name: "Semaglutide",
    aka: ["Ozempic", "Wegovy", "Rybelsus"],
    category: "metabolic",
    mechanismClass: ["glp1-agonist"],
    summary: "GLP-1 receptor agonist. FDA approved.",
    mechanism:
      "94% homologous to human GLP-1, modified at position 26 with a C18 diacid so that it binds albumin and resists DPP-4. Slows gastric emptying, increases glucose-dependent insulin release and acts centrally to reduce appetite.",
    halfLifeHours: 161,
    halfLifeNote: "About one week. Measured at 145 to 165 hours for the 2.4 mg dose.",
    tmaxHours: 72,
    routes: ["subcutaneous", "oral"],
    vialSizesMg: [],
    doseRanges: [
      {
        lowMcg: 250,
        highMcg: 7200,
        frequency: "once weekly",
        perWeek: 1,
        evidence: "approved",
        note: "Wegovy maintenance is 2.4 mg, extendable to 7.2 mg. Ozempic maintenance is 0.5, 1 or 2 mg.",
      },
    ],
    titrations: [
      {
        id: "sema-wegovy",
        name: "Wegovy escalation to 2.4 mg",
        source: "Wegovy prescribing information, Table 1",
        sourceUrl: "https://www.novo-pi.com/wegovy.pdf",
        evidence: "approved",
        note: "If a step is not tolerated, the label suggests delaying escalation by 4 weeks rather than pushing on. Missing two consecutive doses means restarting escalation at a lower dose.",
        steps: [
          { step: 1, doseMcg: 250, weeks: 4 },
          { step: 2, doseMcg: 500, weeks: 4 },
          { step: 3, doseMcg: 1000, weeks: 4 },
          { step: 4, doseMcg: 1700, weeks: 4 },
          { step: 5, doseMcg: 2400, weeks: 16, note: "Maintenance from week 17." },
        ],
      },
      {
        id: "sema-ozempic",
        name: "Ozempic escalation to 2 mg",
        source: "Ozempic prescribing information, section 2",
        sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=adec4fd2-6858-4c99-91d4-531f5f2a2d79",
        evidence: "approved",
        steps: [
          { step: 1, doseMcg: 250, weeks: 4, note: "Starting dose, not for glycaemic control." },
          { step: 2, doseMcg: 500, weeks: 4 },
          { step: 3, doseMcg: 1000, weeks: 4 },
          { step: 4, doseMcg: 2000, weeks: 12 },
        ],
      },
    ],
    timeline: [
      { fromHours: 0, toHours: 24, label: "Absorbing slowly. Gastric emptying begins to slow." },
      { fromHours: 24, toHours: 96, label: "Peak plasma levels, 1 to 3 days after the dose." },
      { fromHours: 96, toHours: 168, label: "Descending. About 47% of peak remains at day 7." },
      { fromHours: 168, toHours: 336, label: "Between doses at steady state the swing is small, accumulation is roughly 1.9-fold." },
    ],
    sideEffects: [
      "Nausea, vomiting, diarrhoea, constipation, abdominal pain",
      "Gallbladder disease",
      "Injection site reactions",
      "Pancreatitis, uncommon",
      "Diabetic retinopathy complications in people with existing retinopathy",
    ],
    contraindications: [
      "Boxed warning: thyroid C-cell tumours in rodents. Contraindicated with a personal or family history of medullary thyroid carcinoma or MEN 2.",
      "Stop at least 2 months before a planned pregnancy, because of the long half-life.",
      "Caution with insulin or sulfonylureas.",
    ],
    status:
      "FDA approved. Compounded semaglutide is outside that approval, and the FDA has warned specifically about salt forms (semaglutide sodium or acetate) that are not the approved active ingredient.",
    citations: [
      { label: "Wegovy prescribing information", url: "https://www.novo-pi.com/wegovy.pdf" },
      { label: "Ozempic prescribing information", url: "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=adec4fd2-6858-4c99-91d4-531f5f2a2d79" },
      { label: "Petri et al., population PK, one-compartment model", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6064581/" },
    ],
  },

  {
    id: "liraglutide",
    name: "Liraglutide",
    aka: ["Victoza", "Saxenda"],
    category: "metabolic",
    mechanismClass: ["glp1-agonist"],
    summary: "GLP-1 receptor agonist, dosed daily rather than weekly. FDA approved.",
    mechanism:
      "97% homologous to human GLP-1. Protraction comes from self-association at the injection site plus plasma protein binding, a different mechanism from semaglutide's albumin binding, and it produces a much shorter half-life.",
    halfLifeHours: 13,
    halfLifeNote: "13 hours after subcutaneous dosing. Short enough that each daily dose rises and falls almost completely.",
    tmaxHours: 10,
    routes: ["subcutaneous"],
    vialSizesMg: [],
    doseRanges: [
      { lowMcg: 600, highMcg: 3000, frequency: "once daily", perWeek: 7, evidence: "approved", note: "Saxenda tops out at 3 mg daily; Victoza at 1.8 mg." },
    ],
    titrations: [
      {
        id: "lira-saxenda",
        name: "Saxenda escalation to 3 mg",
        source: "Saxenda prescribing information, Table 1",
        sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=5a9ef4ea-c76a-4d34-a604-27c5b505f5a4",
        evidence: "approved",
        note: "If more than 3 days have passed since the last dose, the label says to restart at 0.6 mg and escalate again.",
        steps: [
          { step: 1, doseMcg: 600, weeks: 1 },
          { step: 2, doseMcg: 1200, weeks: 1 },
          { step: 3, doseMcg: 1800, weeks: 1 },
          { step: 4, doseMcg: 2400, weeks: 1 },
          { step: 5, doseMcg: 3000, weeks: 12 },
        ],
      },
    ],
    timeline: [
      { fromHours: 0, toHours: 8, label: "Absorbing from the depot." },
      { fromHours: 8, toHours: 14, label: "Peak plasma levels, 8 to 12 hours in." },
      { fromHours: 14, toHours: 24, label: "Falling steeply. Roughly a quarter of peak remains by hour 24." },
      { fromHours: 24, toHours: 48, label: "Essentially cleared. There is almost no accumulation between daily doses." },
    ],
    sideEffects: [
      "Nausea, vomiting, diarrhoea, constipation",
      "Injection site reactions",
      "Gallbladder disease",
      "Pancreatitis, uncommon",
    ],
    contraindications: [
      "Boxed warning: thyroid C-cell tumours in rodents. Contraindicated with a personal or family history of medullary thyroid carcinoma or MEN 2.",
      "Caution with insulin or sulfonylureas.",
    ],
    status: "FDA approved as Victoza (type 2 diabetes) and Saxenda (weight management).",
    citations: [
      { label: "Victoza prescribing information", url: "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=5a9ef4ea-c76a-4d34-a604-27c5b505f5a4" },
    ],
  },

  {
    id: "cagrilintide",
    name: "Cagrilintide",
    aka: ["AM833", "NNC0174-0833"],
    category: "metabolic",
    mechanismClass: ["amylin-analogue"],
    summary: "Long-acting amylin analogue. Investigational.",
    mechanism:
      "Activates all three amylin receptor subtypes and the calcitonin receptor. Amylin signalling promotes satiety and slows gastric emptying through a pathway separate from GLP-1, which is why it is being developed alongside semaglutide rather than instead of it.",
    halfLifeHours: 177,
    halfLifeNote: "Measured at 159 to 195 hours across the 0.16 to 4.5 mg range, so roughly 7 days.",
    tmaxHours: 24,
    routes: ["subcutaneous"],
    vialSizesMg: [],
    doseRanges: [
      { lowMcg: 300, highMcg: 4500, frequency: "once weekly", perWeek: 1, evidence: "clinical", note: "Phase 2 studied 0.3 through 4.5 mg. The dose used inside CagriSema is 2.4 mg." },
    ],
    titrations: [
      {
        id: "cagri-p2",
        name: "Phase 2 escalation to 4.5 mg",
        source: "NCT03856047 protocol, Table 7-2",
        sourceUrl: "https://cdn.clinicaltrials.gov/large-docs/47/NCT03856047/Prot_000.pdf",
        evidence: "clinical",
        note: "Every step is exactly two weeks. The protocol allowed a step to be held an extra week for tolerability, which stretches the climb to 4.5 mg from 6 weeks out to 9.",
        steps: [
          { step: 1, doseMcg: 600, weeks: 2 },
          { step: 2, doseMcg: 1200, weeks: 2 },
          { step: 3, doseMcg: 2400, weeks: 2 },
          { step: 4, doseMcg: 4500, weeks: 20 },
        ],
      },
    ],
    timeline: [
      { fromHours: 0, toHours: 12, label: "Absorbing." },
      { fromHours: 12, toHours: 48, label: "Peak plasma levels, median around 24 hours." },
      { fromHours: 48, toHours: 168, label: "Slow decline. About 52% of peak still present at day 7." },
    ],
    sideEffects: [
      "Nausea, 46.5% at 4.5 mg against 17.8% on placebo in phase 2",
      "Constipation and decreased appetite, both dose-related",
      "Injection site erythema, 16.8% at 4.5 mg, and zero on placebo",
      "Transient activation of the renin-angiotensin-aldosterone system, resolving about 2 weeks after each escalation",
    ],
    contraindications: [
      "Not an approved medicine. No label, no established monitoring, no verified supply.",
    ],
    status: "Investigational. No FDA approval; exists commercially only as a component of CagriSema.",
    cautionBanner:
      "Storage and stability are undocumented, the trial product is an aqueous solution in a pen cartridge, not a lyophilised vial, so there is no published guidance on reconstituting or storing powder.",
    citations: [
      { label: "Enebo et al., Lancet 2021, PK", url: "https://pubmed.ncbi.nlm.nih.gov/33894838/" },
      { label: "Lau et al., Lancet 2021, phase 2 dose finding", url: "https://europepmc.org/article/MED/34798060" },
      { label: "NCT03856047 protocol", url: "https://cdn.clinicaltrials.gov/large-docs/47/NCT03856047/Prot_000.pdf" },
    ],
  },

  {
    id: "cagrisema",
    name: "CagriSema",
    aka: ["cagrilintide + semaglutide"],
    category: "metabolic",
    mechanismClass: ["glp1-agonist", "amylin-analogue"],
    summary: "Fixed 1:1 combination of cagrilintide and semaglutide. Filed with the FDA, not approved.",
    mechanism:
      "Pairs amylin and GLP-1 signalling in one weekly injection. Delivered through a dual-chamber pen that keeps the two peptides separate until the moment of injection. Neither affects the other's exposure or elimination.",
    halfLifeHours: 170,
    halfLifeNote:
      "Two components with different curves: cagrilintide 159 to 195 hours, semaglutide 145 to 165 hours. The single figure here is an approximation of both.",
    tmaxHours: 24,
    routes: ["subcutaneous"],
    vialSizesMg: [],
    components: [
      { peptideId: "cagrilintide", name: "Cagrilintide", mgPerVial: 2.4 },
      { peptideId: "semaglutide", name: "Semaglutide", mgPerVial: 2.4 },
    ],
    // The label dose refers to each component, not to a combined mass.
    blendDosing: "per-component",
    doseRanges: [
      { lowMcg: 250, highMcg: 2400, frequency: "once weekly", perWeek: 1, evidence: "clinical", note: "Doses refer to each component; the two are always equal." },
    ],
    titrations: [
      {
        id: "cagrisema-redefine",
        name: "REDEFINE escalation to 2.4/2.4 mg",
        source: "REDEFINE-1 and REDEFINE-2, NEJM 2025",
        sourceUrl: "https://www.nejm.org/doi/full/10.1056/NEJMoa2502081",
        evidence: "clinical",
        note: "Four-week steps reaching the maintenance dose at week 16. Both trials allowed staying on a lower dose rather than dropping out, only about 57 to 62% of participants were on the full dose at week 68.",
        steps: [
          { step: 1, doseMcg: 250, weeks: 4 },
          { step: 2, doseMcg: 500, weeks: 4 },
          { step: 3, doseMcg: 1000, weeks: 4 },
          { step: 4, doseMcg: 1700, weeks: 4 },
          { step: 5, doseMcg: 2400, weeks: 52 },
        ],
      },
    ],
    sideEffects: [
      "Gastrointestinal effects in 79.6% of participants in REDEFINE-1, against 39.9% on placebo",
      "Injection site reactions notably higher than either component alone, 12.2% versus 2.6% for semaglutide",
      "Discontinuation for adverse events 5.9% in obesity, 8.4% in type 2 diabetes",
      "Gallbladder disorders 4.1%",
    ],
    contraindications: [
      "Not approved. Filed with the FDA in December 2025; a decision is expected during 2026.",
      "Inherits the semaglutide class warning on medullary thyroid carcinoma and MEN 2.",
    ],
    status:
      "Investigational. In its only head-to-head trial (REDEFINE-4, February 2026) it failed to show non-inferiority to tirzepatide 15 mg, 23.0% versus 25.5% weight loss at 84 weeks.",
    cautionBanner:
      "A fixed-ratio dual-chamber product cannot be meaningfully reproduced from separate single-peptide vials.",
    citations: [
      { label: "REDEFINE-1, NEJM 2025", url: "https://www.nejm.org/doi/full/10.1056/NEJMoa2502081" },
      { label: "REDEFINE-2, NEJM 2025", url: "https://www.nejm.org/doi/abs/10.1056/NEJMoa2502082" },
    ],
  },

  {
    id: "survodutide",
    name: "Survodutide",
    aka: ["BI 456906"],
    category: "metabolic",
    mechanismClass: ["glp1-agonist", "glucagon-agonist"],
    summary: "Glucagon and GLP-1 receptor dual agonist. Investigational.",
    mechanism:
      "Fully activates the GLP-1 receptor but only partially activates the glucagon receptor at therapeutic exposures. The glucagon arm raises energy expenditure and drives the liver-fat effect that the MASH programme is built on.",
    halfLifeHours: 100,
    halfLifeNote:
      "Roughly 4 days, from a secondary review. Note the manufacturer's own trial protocol states 10 to 15 hours, which is inconsistent with weekly dosing and a 28-day residual effect period, and appears to be an error. Treat this curve as provisional.",
    tmaxHours: 30,
    routes: ["subcutaneous"],
    vialSizesMg: [],
    doseRanges: [
      { lowMcg: 300, highMcg: 6000, frequency: "once weekly", perWeek: 1, evidence: "clinical" },
    ],
    titrations: [
      {
        id: "survo-p2-mash",
        name: "Phase 2 MASH escalation to 6 mg",
        source: "NCT04771273 protocol, Table 4.1.4:1",
        sourceUrl: "https://cdn.clinicaltrials.gov/large-docs/73/NCT04771273/Prot_000.pdf",
        evidence: "clinical",
        note: "Two weeks per step throughout. Phase 3 deliberately slowed this down after gastrointestinal effects clustered in the escalation phase.",
        steps: [
          { step: 1, doseMcg: 300, weeks: 2 },
          { step: 2, doseMcg: 600, weeks: 2 },
          { step: 3, doseMcg: 900, weeks: 2 },
          { step: 4, doseMcg: 1200, weeks: 2 },
          { step: 5, doseMcg: 1800, weeks: 2 },
          { step: 6, doseMcg: 2400, weeks: 2 },
          { step: 7, doseMcg: 3000, weeks: 2 },
          { step: 8, doseMcg: 3600, weeks: 2 },
          { step: 9, doseMcg: 4200, weeks: 2 },
          { step: 10, doseMcg: 4800, weeks: 2 },
          { step: 11, doseMcg: 5400, weeks: 2 },
          { step: 12, doseMcg: 6000, weeks: 24 },
        ],
      },
    ],
    sideEffects: [
      "Nausea in about two thirds of participants at maintenance doses",
      "Vomiting up to 48%, diarrhoea up to 56%",
      "Discontinuation for adverse events 16 to 27%, concentrated in the escalation phase rather than maintenance",
      "Cholelithiasis reported at the higher doses",
    ],
    contraindications: ["Not an approved medicine. No label and no verified supply."],
    status:
      "Investigational. Holds FDA Breakthrough Therapy designation for non-cirrhotic MASH. Phase 3 SYNCHRONIZE trials are complete; not yet filed.",
    cautionBanner:
      "The published half-life is contradictory across sources. Curves for this compound are less reliable than for the approved drugs.",
    citations: [
      { label: "NCT04771273 protocol, titration and PK", url: "https://cdn.clinicaltrials.gov/large-docs/73/NCT04771273/Prot_000.pdf" },
      { label: "Sanyal et al., NEJM 2024, phase 2 MASH", url: "https://www.nejm.org/doi/full/10.1056/NEJMoa2401755" },
      { label: "SYNCHRONIZE-1, NEJM 2026", url: "https://pubmed.ncbi.nlm.nih.gov/42253238/" },
    ],
  },

  {
    id: "mazdutide",
    name: "Mazdutide",
    aka: ["IBI362", "LY3305677"],
    category: "metabolic",
    mechanismClass: ["glp1-agonist", "glucagon-agonist"],
    summary: "GLP-1 and glucagon receptor dual agonist, an oxyntomodulin analogue. Approved in China only.",
    mechanism:
      "An oxyntomodulin analogue engineered for weekly dosing. Like survodutide it combines GLP-1 appetite suppression with glucagon-driven energy expenditure.",
    halfLifeHours: 192,
    halfLifeNote:
      "About 8 days. Individual phase 1 cohorts reported anywhere from 147 to over 1000 hours; the very long upper bounds are almost certainly artefacts of sampling only across a 168-hour window.",
    tmaxHours: 72,
    routes: ["subcutaneous"],
    vialSizesMg: [2, 4, 6],
    doseRanges: [
      {
        lowMcg: 2000,
        highMcg: 6000,
        frequency: "once weekly",
        perWeek: 1,
        evidence: "approved",
        note: "Approved in China with a maximum of 6 mg weekly, and a minimum of 5 days between doses. A 9 mg application was accepted for review in November 2025 but is not yet approved.",
      },
      {
        lowMcg: 9000,
        highMcg: 16000,
        frequency: "once weekly",
        perWeek: 1,
        evidence: "clinical",
        note: "Studied but not approved. 9 mg reached 16.7% weight loss over 60 weeks in GLORY-2; a phase 1 escalation went to 16 mg.",
      },
    ],
    titrations: [
      {
        id: "mazdu-glory1-6mg",
        name: "GLORY-1 escalation to 6 mg",
        source: "NCT05607680, phase 3",
        sourceUrl: "https://clinicaltrials.gov/study/NCT05607680",
        evidence: "clinical",
        note: "The most completely specified titration of any unapproved compound here, the registry states each step explicitly.",
        steps: [
          { step: 1, doseMcg: 2000, weeks: 4 },
          { step: 2, doseMcg: 4000, weeks: 4 },
          { step: 3, doseMcg: 6000, weeks: 40 },
        ],
      },
      {
        id: "mazdu-glory1-4mg",
        name: "GLORY-1 escalation to 4 mg",
        source: "NCT05607680, phase 3",
        sourceUrl: "https://clinicaltrials.gov/study/NCT05607680",
        evidence: "clinical",
        steps: [
          { step: 1, doseMcg: 2000, weeks: 4 },
          { step: 2, doseMcg: 4000, weeks: 44 },
        ],
      },
    ],
    timeline: [
      { fromHours: 0, toHours: 48, label: "Absorbing slowly. Little felt in the first day or two." },
      { fromHours: 48, toHours: 96, label: "Peak plasma levels around 72 hours. Gastrointestinal effects cluster here, 3 to 4 days after the injection." },
      { fromHours: 96, toHours: 168, label: "Declining toward the next dose. Roughly 60% of peak remains at day 7." },
    ],
    sideEffects: [
      "Vomiting in 53%, nausea in 47% and diarrhoea in 39% at the 9 mg dose, against a few percent on placebo",
      "Much better tolerated at the approved 4 and 6 mg doses, where discontinuation for adverse events was under 2%",
      "Decreased appetite, abdominal distension",
    ],
    contraindications: [
      "Not FDA approved. Glucagon receptor agonism carries the same considerations as survodutide.",
    ],
    status:
      "Approved in China by the NMPA in June 2025 as Xinermei, at up to 6 mg weekly. Not approved by the FDA.",
    reconstitutedDays: 30,
    citations: [
      { label: "NCT05607680, GLORY-1 phase 3", url: "https://clinicaltrials.gov/study/NCT05607680" },
      { label: "GLORY-1, NEJM 2025", url: "https://pubmed.ncbi.nlm.nih.gov/40421736/" },
      { label: "Mazdutide: First Approval, Drugs 2025", url: "https://pubmed.ncbi.nlm.nih.gov/41028652/" },
    ],
  },

  {
    id: "aod-9604",
    name: "AOD-9604",
    aka: ["hGH fragment 176-191"],
    category: "metabolic",
    summary: "Growth hormone fragment marketed for fat loss. Failed its phase 2b trial.",
    mechanism:
      "A synthetic fragment of the C-terminal region of human growth hormone. A lipolytic effect independent of the growth hormone receptor is claimed, but no receptor target has ever been identified and no mechanism is established.",
    halfLifeHours: null,
    halfLifeNote:
      "No human pharmacokinetic data has ever been published. There are zero registered trials on ClinicalTrials.gov and no PubMed pharmacokinetic results. No curve can honestly be drawn.",
    routes: ["subcutaneous", "oral"],
    vialSizesMg: [],
    doseRanges: [
      {
        lowMcg: 300,
        highMcg: 1000,
        frequency: "once daily",
        perWeek: 7,
        evidence: "anecdotal",
        note: "Community protocols only. The phase 2b trial is described as using around 1 mg daily but the dose could not be verified from any primary source.",
      },
    ],
    sideEffects: ["No systematic safety data exists."],
    contraindications: [
      "Development was discontinued. The phase 2b trial did not show significant weight loss against placebo.",
      "Prohibited by WADA as a growth hormone fragment.",
    ],
    status:
      "Never approved. The FDA declined to place it on the 503A bulk substances list for compounding. Its own trial did not meet its endpoint.",
    cautionBanner:
      "This compound has no published pharmacokinetics, no identified receptor, and a failed phase 2b trial. Any claim that it produces meaningful fat loss is contradicted by its own trial result.",
    citations: [
      { label: "ClinicalTrials.gov, no registered trials", url: "https://clinicaltrials.gov/search?term=AOD-9604" },
    ],
  },
];
