import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/* REQUEST SCHEMA (what the mobile app sends)                                 */
/* -------------------------------------------------------------------------- */
const shortText = (max: number) => z.string().trim().max(max);

export const PROBLEM_MIN_LENGTH = 10;
export const PROBLEM_MAX_LENGTH = 1000;

export const PatientSchema = z.object({
  age: z.number().int().min(0, 'Age must be 0 or more').max(120, 'Age cannot exceed 120'),
  gender: z.enum(['male', 'female', 'other']),
  heightCm: z.number().min(40, 'Height looks too small').max(250, 'Height looks too large'),
  weightKg: z.number().min(2, 'Weight looks too small').max(350, 'Weight looks too large'),
  pregnancy: z
    .enum(['pregnant', 'breastfeeding', 'no', 'not_sure', 'not_applicable'])
    .default('not_applicable'),
  conditions: z.array(shortText(60)).max(15).default([]),
  medications: shortText(300).default(''),
  allergies: shortText(300).default(''),
  smoking: z.enum(['never', 'former', 'current']).optional(),
  alcohol: z.enum(['none', 'occasional', 'regular']).optional(),
  location: shortText(80).optional(),
});

export const DiagnosisRequestSchema = z.object({
  patient: PatientSchema,
  problem: z
    .string()
    .trim()
    .min(PROBLEM_MIN_LENGTH, 'Please describe your problem in a little more detail.')
    .max(PROBLEM_MAX_LENGTH, `Please keep the description under ${PROBLEM_MAX_LENGTH} characters.`)
    .refine((text) => /\p{L}{2,}/u.test(text), 'Please describe your health problem in words.'),
});

export type DiagnosisRequest = z.infer<typeof DiagnosisRequestSchema>;

/* -------------------------------------------------------------------------- */
/* MODEL OUTPUT SCHEMA                                                        */
/* Keep it free of min/max constraints: limits are enforced after parsing.    */
/* -------------------------------------------------------------------------- */
const RemedyItemSchema = z.object({
  name: z.string().describe('Medicine, formulation or remedy name. Allopathy: generic name (common Indian brand in brackets is fine). Ayurveda: classical name with botanical name if a single herb. Homeopathy: remedy name with potency.'),
  purpose: z.string().describe('What it helps with for this patient.'),
  dosage: z.string().describe('Exact dose and frequency for this patient (weight-based for children), including the maximum per day where relevant.'),
  how_to_take: z.string().describe('Timing and how to take it (with food/water/milk/honey, before or after meals).'),
  duration: z.string().describe('For how long, and when to stop or see a doctor.'),
  precautions: z.string().describe('Cautions specific to this patient (conditions, pregnancy, allergies, interactions with their medicines).'),
});

const RemedySystemSchema = z.object({
  available: z.boolean().describe('True only if there is a sensible, safe option in this system for this patient and condition.'),
  unavailable_reason: z.string().nullable().describe('Short reason when available is false; otherwise null.'),
  note: z.string().nullable().describe('One short line of context for this system, or null.'),
  items: z.array(RemedyItemSchema),
});

export const AssessmentSchema = z.object({
  triage: z.object({
    level: z.enum(['emergency', 'urgent', 'soon', 'self_care']),
    headline: z.string().describe('One short instruction for the patient.'),
    reason: z.string().describe('Why this urgency level, in one or two sentences.'),
  }),
  immediate_actions: z.array(z.string()).describe('Concrete steps to take right now.'),
  summary: z.string().describe('2 to 4 sentence plain-language summary of the assessment.'),
  conditions: z.array(
    z.object({
      name: z.string().describe('Common name, with the medical name in brackets if different.'),
      icd10: z.string().nullable().describe('ICD-10 code, or null if unsure.'),
      probability: z.number().describe('Integer percentage likelihood for this patient.'),
      severity: z.enum(['mild', 'moderate', 'serious', 'critical']),
      explanation: z.string().describe('What this condition is, in one or two plain sentences.'),
      supporting: z.array(z.string()).describe("This patient's findings that support it."),
      against: z.array(z.string()).describe("This patient's findings that argue against it, or what is missing."),
    })
  ),
  red_flags: z.array(z.string()).describe('Worrying features present in this case; empty if none.'),
  warning_signs: z.array(z.string()).describe('Signs that mean the patient must seek urgent care.'),
  recommended_tests: z.array(
    z.object({
      name: z.string(),
      reason: z.string(),
    })
  ),
  specialist: z.string().describe('Which kind of doctor to consult.'),
  remedies: z.object({
    allopathy: RemedySystemSchema,
    ayurveda: RemedySystemSchema,
    homeopathy: RemedySystemSchema,
  }),
  home_care: z.array(z.string()),
  diet: z.object({
    favor: z.array(z.string()),
    avoid: z.array(z.string()),
  }),
  confidence: z.object({
    level: z.enum(['low', 'moderate', 'high']),
    note: z.string().describe('What would most improve certainty.'),
  }),
});

export type AssessmentOutput = z.infer<typeof AssessmentSchema>;

export const DiagnosisModelOutputSchema = z.object({
  input_check: z.object({
    status: z.enum(['ok', 'not_medical', 'too_vague']),
    message: z.string().describe('Empty when status is ok; otherwise one or two short, friendly sentences telling the patient what to write instead.'),
  }),
  assessment: AssessmentSchema.nullable().describe('The clinical assessment when input_check.status is ok; otherwise null.'),
});

export type DiagnosisModelOutput = z.infer<typeof DiagnosisModelOutputSchema>;
