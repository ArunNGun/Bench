import type { LabMarker } from "../types";

/**
 * The blood markers worth following while running these compounds.
 *
 * On reference ranges, deliberately: almost nothing here carries a built-in
 * "normal". A reference interval is a property of the assay that produced the
 * number. It shifts with laboratory, method, sex and age, and every report
 * prints its own. Asserting one here would invent a verdict, so instead you can
 * record the interval from your own paperwork alongside the value and the app
 * compares against that.
 *
 * The exceptions are HbA1c, fasting glucose and blood pressure. Those are not
 * assay reference intervals but diagnostic cut-offs defined outright by the ADA
 * and the AHA, so they are the same wherever the sample was run and are shipped
 * with the body that defines them named on screen.
 */
export const LAB_MARKERS: LabMarker[] = [
  // --- Growth hormone axis -------------------------------------------------
  {
    id: "igf1",
    name: "IGF-1",
    aka: "Insulin-like growth factor 1",
    unit: "ng/mL",
    decimals: 0,
    category: "growth",
    why: "The readout for anything acting on growth hormone. GH itself is pulsatile and a single measurement means little; IGF-1 is stable and reflects the average.",
    rangeNote:
      "Strongly age-dependent, and every assay has its own scale. Use the age-matched range printed on your own report, because a single number would be wrong for most people.",
  },

  // --- Metabolic -----------------------------------------------------------
  {
    id: "hba1c",
    name: "HbA1c",
    aka: "Glycated haemoglobin",
    unit: "%",
    decimals: 1,
    category: "metabolic",
    why: "Average glucose over roughly the previous three months. The single most useful number for whether a metabolic protocol is working.",
    guideline: {
      source: "ADA diagnostic criteria",
      bands: [
        { under: 5.7, label: "Normal", tone: "leaf" },
        { from: 5.7, under: 6.5, label: "Prediabetes range", tone: "tangerine" },
        { from: 6.5, label: "Diabetes range", tone: "rose" },
      ],
    },
  },
  {
    id: "glucose-fasting",
    name: "Fasting glucose",
    unit: "mg/dL",
    decimals: 0,
    category: "metabolic",
    why: "Same axis as HbA1c but responds within days, so it moves first when a dose changes.",
    guideline: {
      source: "ADA diagnostic criteria",
      bands: [
        { under: 100, label: "Normal", tone: "leaf" },
        { from: 100, under: 126, label: "Prediabetes range", tone: "tangerine" },
        { from: 126, label: "Diabetes range", tone: "rose" },
      ],
    },
  },
  {
    id: "insulin-fasting",
    name: "Fasting insulin",
    unit: "µIU/mL",
    decimals: 1,
    category: "metabolic",
    why: "Falls before glucose does as insulin sensitivity improves, which makes it an early signal on a metabolic protocol.",
    rangeNote: "Assay-dependent with no agreed cut-off. Use your lab's interval.",
  },

  // --- Lipids --------------------------------------------------------------
  {
    id: "triglycerides",
    name: "Triglycerides",
    unit: "mg/dL",
    decimals: 0,
    category: "lipids",
    why: "Usually the lipid that moves most on a GLP-1, and it tracks visceral fat rather than total weight.",
    rangeNote: "Lipid targets depend on your overall cardiovascular risk. Use your lab's interval or your clinician's target.",
  },
  {
    id: "hdl",
    name: "HDL cholesterol",
    unit: "mg/dL",
    decimals: 0,
    category: "lipids",
    higherIsBetter: true,
    why: "The one lipid where a fall is the thing to notice rather than a rise.",
    rangeNote: "Sex-dependent, and the cut-offs differ between guidelines. Use your lab's interval.",
  },
  {
    id: "ldl",
    name: "LDL cholesterol",
    unit: "mg/dL",
    decimals: 0,
    category: "lipids",
    why: "Tracked alongside the rest of the panel; weight loss shifts it but not always downwards.",
    rangeNote: "The target depends on your cardiovascular risk, not on a population range. Use your clinician's target.",
  },

  // --- Organ safety --------------------------------------------------------
  {
    id: "alt",
    name: "ALT",
    aka: "Alanine aminotransferase",
    unit: "U/L",
    decimals: 0,
    category: "organ",
    why: "Liver enzyme. Often improves as fatty liver does on a metabolic protocol, and a rise is worth explaining.",
    rangeNote: "Upper limits vary by laboratory and by sex. Use your lab's interval.",
  },
  {
    id: "ast",
    name: "AST",
    aka: "Aspartate aminotransferase",
    unit: "U/L",
    decimals: 0,
    category: "organ",
    why: "Read next to ALT. Also rises with heavy training, so it is not liver-specific on its own.",
    rangeNote: "Upper limits vary by laboratory and by sex. Use your lab's interval.",
  },
  {
    id: "creatinine",
    name: "Creatinine",
    unit: "mg/dL",
    decimals: 2,
    category: "organ",
    why: "Kidney function. Worth a baseline before anything that causes appreciable fluid loss through vomiting or diarrhoea.",
    rangeNote: "Depends on sex and muscle mass, so a muscular person sits higher without anything being wrong. Use your lab's interval.",
  },
  {
    id: "lipase",
    name: "Lipase",
    unit: "U/L",
    decimals: 0,
    category: "organ",
    why: "Pancreatic enzyme. Pancreatitis is the recognised serious risk with GLP-1 receptor agonists, and this is the marker for it.",
    rangeNote:
      "Assay-dependent. A modest asymptomatic rise is common on these drugs; severe abdominal pain needs medical attention regardless of the number.",
  },

  // --- Blood ---------------------------------------------------------------
  {
    id: "haematocrit",
    name: "Haematocrit",
    unit: "%",
    decimals: 1,
    category: "blood",
    why: "Rises with dehydration, which is easy to reach when appetite and fluid intake both drop.",
    rangeNote: "Sex-dependent. Use your lab's interval.",
  },
  {
    id: "tsh",
    name: "TSH",
    aka: "Thyroid stimulating hormone",
    unit: "mIU/L",
    decimals: 2,
    category: "blood",
    why: "Thyroid function, which changes the interpretation of a stalled weight trend.",
    rangeNote: "Reference intervals differ between laboratories and shift in pregnancy. Use your lab's interval.",
  },

  // --- Cardiovascular ------------------------------------------------------
  {
    id: "bp-systolic",
    name: "Systolic blood pressure",
    unit: "mmHg",
    decimals: 0,
    category: "cardio",
    why: "Usually falls with weight loss. The upper of the two numbers on a cuff.",
    guideline: {
      source: "AHA/ACC 2017 categories",
      bands: [
        { under: 120, label: "Normal", tone: "leaf" },
        { from: 120, under: 130, label: "Elevated", tone: "tangerine" },
        { from: 130, under: 140, label: "Stage 1 hypertension", tone: "tangerine" },
        { from: 140, label: "Stage 2 hypertension", tone: "rose" },
      ],
    },
  },
  {
    id: "bp-diastolic",
    name: "Diastolic blood pressure",
    unit: "mmHg",
    decimals: 0,
    category: "cardio",
    why: "The lower of the two numbers on a cuff. Either number alone can put you in a category.",
    guideline: {
      source: "AHA/ACC 2017 categories",
      bands: [
        { under: 80, label: "Normal", tone: "leaf" },
        { from: 80, under: 90, label: "Stage 1 hypertension", tone: "tangerine" },
        { from: 90, label: "Stage 2 hypertension", tone: "rose" },
      ],
    },
  },
  {
    id: "resting-hr",
    name: "Resting heart rate",
    unit: "bpm",
    decimals: 0,
    category: "cardio",
    why: "GLP-1 receptor agonists raise it by a few beats per minute on average. Worth a baseline so a change is recognisable.",
    rangeNote: "Varies widely with fitness. Your own baseline is more informative than any population range.",
  },
];

export const LAB_CATEGORY_LABEL: Record<string, string> = {
  growth: "Growth hormone axis",
  metabolic: "Glucose and insulin",
  lipids: "Lipids",
  organ: "Liver, kidney and pancreas",
  blood: "Blood and thyroid",
  cardio: "Cardiovascular",
};

export function findMarker(id: string): LabMarker | undefined {
  return LAB_MARKERS.find((m) => m.id === id);
}
