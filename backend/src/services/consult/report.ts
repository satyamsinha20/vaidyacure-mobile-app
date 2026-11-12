import type { AssessmentOutput } from '../diagnosis/schemas.js';
import { computeBmi } from '../diagnosis/prompts.js';
import type { PatientInput } from '../diagnosis/schemas.js';
import { redactVendorNames } from '../ai/vendorGuard.js';

type RemedySystemOutput = AssessmentOutput['remedies']['allopathy'];

export interface RemedySystem {
  available: boolean;
  unavailableReason: string | null;
  note: string | null;
  items: RemedySystemOutput['items'];
}

/** The report sent to the app. It never contains provider or model details. */
export interface ConsultReport {
  triage: AssessmentOutput['triage'];
  immediateActions: string[];
  summary: string;
  conditions: AssessmentOutput['conditions'];
  redFlags: string[];
  warningSigns: string[];
  recommendedTests: AssessmentOutput['recommended_tests'];
  specialist: string;
  remedies: { allopathy: RemedySystem; ayurveda: RemedySystem; homeopathy: RemedySystem };
  homeCare: string[];
  diet: AssessmentOutput['diet'];
  confidence: AssessmentOutput['confidence'];
  meta: { bmi: number; generatedAt: string };
}

const EMERGENCY_REMEDY_REASON = 'This needs emergency medical care. Do not self-medicate.';

const cleanList = (list: string[], max: number): string[] => list.map((s) => s.trim()).filter(Boolean).slice(0, max);

const normalizeRemedySystem = (system: RemedySystemOutput, isEmergency: boolean): RemedySystem => {
  const items = system.items.filter((item) => item.name.trim()).slice(0, 4);
  if (isEmergency) {
    return { available: false, unavailableReason: EMERGENCY_REMEDY_REASON, note: null, items: [] };
  }
  if (!system.available || items.length === 0) {
    return {
      available: false,
      unavailableReason: system.unavailable_reason?.trim() || 'No suitable remedy for this condition.',
      note: system.note?.trim() || null,
      items: [],
    };
  }
  return { available: true, unavailableReason: null, note: system.note?.trim() || null, items };
};

const normalizeConditions = (conditions: AssessmentOutput['conditions']): AssessmentOutput['conditions'] => {
  const list = conditions
    .filter((c) => c.name.trim())
    .map((c) => ({
      ...c,
      icd10: c.icd10?.trim() || null,
      probability: Math.round(Math.min(100, Math.max(0, Number.isFinite(c.probability) ? c.probability : 0))),
      supporting: cleanList(c.supporting, 6),
      against: cleanList(c.against, 6),
    }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 5);

  // Probabilities are shares of one patient's likelihood: never more than 100 in total
  const total = list.reduce((sum, c) => sum + c.probability, 0);
  if (total > 100) {
    list.forEach((c) => {
      c.probability = Math.floor((c.probability / total) * 100);
    });
  }
  return list;
};

export const buildReport = (assessment: AssessmentOutput, patient: PatientInput): ConsultReport => {
  const isEmergency = assessment.triage.level === 'emergency';
  return redactVendorNames({
    triage: assessment.triage,
    immediateActions: cleanList(assessment.immediate_actions, 6),
    summary: assessment.summary.trim(),
    conditions: normalizeConditions(assessment.conditions),
    redFlags: cleanList(assessment.red_flags, 8),
    warningSigns: cleanList(assessment.warning_signs, 8),
    recommendedTests: assessment.recommended_tests.filter((t) => t.name.trim()).slice(0, 6),
    specialist: assessment.specialist.trim(),
    remedies: {
      allopathy: normalizeRemedySystem(assessment.remedies.allopathy, isEmergency),
      ayurveda: normalizeRemedySystem(assessment.remedies.ayurveda, isEmergency),
      homeopathy: normalizeRemedySystem(assessment.remedies.homeopathy, isEmergency),
    },
    homeCare: cleanList(assessment.home_care, 8),
    diet: { favor: cleanList(assessment.diet.favor, 8), avoid: cleanList(assessment.diet.avoid, 8) },
    confidence: assessment.confidence,
    meta: { bmi: computeBmi(patient.heightCm, patient.weightKg), generatedAt: new Date().toISOString() },
  });
};
