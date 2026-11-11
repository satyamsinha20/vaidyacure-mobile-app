import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/* LIMITS                                                                     */
/* -------------------------------------------------------------------------- */
export const MAX_INTERVIEW_ROUNDS = 3;
export const MAX_QUESTIONS_FIRST_ROUND = 8;
export const MAX_QUESTIONS_LATER_ROUNDS = 5;

/* -------------------------------------------------------------------------- */
/* REQUEST SCHEMAS (what the mobile app sends)                                */
/* -------------------------------------------------------------------------- */
const shortText = (max: number) => z.string().trim().max(max);

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

export const ComplaintSchema = z
  .object({
    symptoms: z.array(shortText(60)).max(20).default([]),
    description: shortText(1000).default(''),
    duration: z.enum([
      'less_than_24_hours',
      '1_to_3_days',
      '4_to_7_days',
      '1_to_4_weeks',
      '1_to_6_months',
      'more_than_6_months',
    ]),
    severity: z.enum(['mild', 'moderate', 'severe']),
  })
  .refine((c) => c.symptoms.length > 0 || c.description.length >= 3, {
    message: 'Please select at least one symptom or describe what you are feeling.',
  });

export const AnsweredRoundSchema = z.object({
  items: z
    .array(
      z.object({
        question: shortText(400),
        answer: shortText(400),
      })
    )
    .max(10),
});

export const DiagnosisRequestSchema = z.object({
  patient: PatientSchema,
  complaint: ComplaintSchema,
  rounds: z.array(AnsweredRoundSchema).max(MAX_INTERVIEW_ROUNDS).default([]),
});

export type DiagnosisRequest = z.infer<typeof DiagnosisRequestSchema>;

/* -------------------------------------------------------------------------- */
/* MODEL OUTPUT SCHEMAS (structured outputs)                                  */
/* Keep these free of min/max constraints: limits are enforced after parsing. */
/* -------------------------------------------------------------------------- */
export const InterviewOutputSchema = z.object({
  urgent_warning: z
    .string()
    .nullable()
    .describe('One or two short sentences telling the patient what to do right now, only if the information already suggests a possible emergency; otherwise null.'),
  done: z
    .boolean()
    .describe('True when further questions would not meaningfully change the assessment or an emergency is already clear.'),
  questions: z.array(
    z.object({
      text: z.string().describe('The question, in simple English, one idea only.'),
      help: z.string().nullable().describe('Short plain explanation of any medical term, or null.'),
      type: z.enum(['single_choice', 'multi_choice', 'yes_no', 'number', 'text']),
      options: z.array(z.string()).describe('Answer options for single_choice and multi_choice; empty for yes_no, number and text.'),
      unit: z.string().nullable().describe('Unit for number questions (e.g. "°F", "days"); otherwise null.'),
    })
  ),
});

export type InterviewOutput = z.infer<typeof InterviewOutputSchema>;

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

export const AnalysisOutputSchema = z.object({
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

export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>;
