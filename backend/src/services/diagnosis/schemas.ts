import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/* PATIENT (what the mobile app sends; the name never leaves the device)      */
/* -------------------------------------------------------------------------- */
export const PatientSchema = z.object({
  age: z.number().int().min(0, 'Age must be 0 or more').max(120, 'Age cannot exceed 120'),
  gender: z.enum(['male', 'female', 'other']),
  heightCm: z.number().min(40, 'Height looks too small').max(250, 'Height looks too large'),
  weightKg: z.number().min(2, 'Weight looks too small').max(350, 'Weight looks too large'),
  pregnancy: z
    .enum(['pregnant', 'breastfeeding', 'no', 'not_sure', 'not_applicable'])
    .default('not_applicable'),
});

export type PatientInput = z.infer<typeof PatientSchema>;

/* -------------------------------------------------------------------------- */
/* MODEL OUTPUT SCHEMA                                                        */
/* Keep it free of min/max constraints: limits are enforced after parsing.    */
/* Small slips (a missing list, a number sent as text) are repaired with       */
/* .catch() instead of failing the whole report; the safety-critical fields   */
/* (triage, summary, condition names) stay strict.                            */
/* -------------------------------------------------------------------------- */
const text = (description: string) => z.string().catch('').describe(description);
const textList = (description: string) => z.array(z.string()).catch([]).describe(description);

const RemedyItemSchema = z.object({
  name: z.string().describe('Medicine, formulation or remedy name. Allopathy: generic name (common Indian brand in brackets is fine). Ayurveda: classical name with botanical name if a single herb. Homeopathy: remedy name with potency.'),
  purpose: text('What it helps with for this patient.'),
  dosage: text('Exact dose and frequency for this patient (weight-based for children), including the maximum per day where relevant.'),
  how_to_take: text('Timing and how to take it (with food/water/milk/honey, before or after meals).'),
  duration: text('For how long, and when to stop or see a doctor.'),
  precautions: text('Cautions specific to this patient (conditions, pregnancy, allergies, interactions with their medicines).'),
});

const RemedySystemSchema = z.object({
  available: z.boolean().catch(false).describe('True only if there is a sensible, safe option in this system for this patient and condition.'),
  unavailable_reason: z.string().nullable().catch(null).describe('Short reason when available is false; otherwise null.'),
  note: z.string().nullable().catch(null).describe('One short line of context for this system, or null.'),
  items: z.array(RemedyItemSchema).catch([]),
});

const EMPTY_REMEDIES = { available: false, unavailable_reason: null, note: null, items: [] };

export const AssessmentSchema = z.object({
  triage: z.object({
    level: z.enum(['emergency', 'urgent', 'soon', 'self_care']),
    headline: z.string().describe('One short instruction for the patient.'),
    reason: z.string().describe('Why this urgency level, in one or two sentences.'),
  }),
  immediate_actions: textList('Concrete steps to take right now.'),
  summary: z.string().describe('2 to 4 sentence plain-language summary of the assessment.'),
  conditions: z.array(
    z.object({
      name: z.string().describe('Common name, with the medical name in brackets if different.'),
      icd10: z.string().nullable().catch(null).describe('ICD-10 code, or null if unsure.'),
      probability: z.coerce.number().catch(0).describe('Integer percentage likelihood for this patient.'),
      severity: z.enum(['mild', 'moderate', 'serious', 'critical']).catch('moderate'),
      explanation: text('What this condition is, in one or two plain sentences.'),
      supporting: textList("This patient's findings that support it."),
      against: textList("This patient's findings that argue against it, or what is missing."),
    })
  ),
  red_flags: textList('Worrying features present in this case; empty if none.'),
  warning_signs: textList('Signs that mean the patient must seek urgent care.'),
  recommended_tests: z
    .array(z.object({ name: z.string(), reason: z.string().catch('') }))
    .catch([]),
  specialist: z.string().catch('General Physician').describe('Which kind of doctor to consult.'),
  remedies: z.object({
    allopathy: RemedySystemSchema.catch(EMPTY_REMEDIES),
    ayurveda: RemedySystemSchema.catch(EMPTY_REMEDIES),
    homeopathy: RemedySystemSchema.catch(EMPTY_REMEDIES),
  }),
  home_care: textList('Practical self-care steps.'),
  diet: z
    .object({ favor: z.array(z.string()).catch([]), avoid: z.array(z.string()).catch([]) })
    .catch({ favor: [], avoid: [] }),
  confidence: z
    .object({
      level: z.enum(['low', 'moderate', 'high']).catch('moderate'),
      note: text('What would most improve certainty.'),
    })
    .catch({ level: 'moderate', note: '' }),
});

export type AssessmentOutput = z.infer<typeof AssessmentSchema>;

export const DiagnosisModelOutputSchema = z.object({
  input_check: z.object({
    status: z.enum(['ok', 'not_medical', 'too_vague']),
    message: z.string().catch('').describe('Empty when status is ok; otherwise one or two short, friendly sentences telling the patient what to write instead.'),
  }),
  assessment: AssessmentSchema.nullable().describe('The clinical assessment when input_check.status is ok; otherwise null.'),
});

export type DiagnosisModelOutput = z.infer<typeof DiagnosisModelOutputSchema>;
