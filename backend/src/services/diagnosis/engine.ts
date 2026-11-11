import { z } from 'zod';
import {
  DiagnosisModelOutputSchema,
  type AssessmentOutput,
  type DiagnosisModelOutput,
  type DiagnosisRequest,
} from './schemas.js';
import { ANALYSIS_TASK, CLINICAL_SYSTEM_PROMPT, buildPatientData, computeBmi } from './prompts.js';

/* -------------------------------------------------------------------------- */
/* CONFIG (any OpenAI-compatible chat completions provider)                   */
/* -------------------------------------------------------------------------- */
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';
const getModel = (): string => process.env.LLM_MODEL?.trim() || DEFAULT_MODEL;

// Vercel functions stop at 300s: (timeout x attempts) must stay below that
const ANALYSIS_TIMEOUT_MS = 120_000;
// One extra attempt for network errors, 5xx/429 responses and unreadable output
const MAX_ATTEMPTS = 2;
const MAX_OUTPUT_TOKENS = 8000;

export class DiagnosisError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
    this.name = 'DiagnosisError';
  }
}

const getConfig = (): { baseUrl: string; apiKey: string } => {
  const baseUrl = process.env.LLM_BASE_URL?.trim().replace(/\/+$/, '');
  const apiKey = process.env.LLM_API_KEY?.trim();
  if (!baseUrl || !apiKey) {
    throw new DiagnosisError(503, 'The diagnosis service is not configured yet. Please try again later.');
  }
  return { baseUrl, apiKey };
};

// The schema goes into the prompt (JSON mode): the provider's strict json_schema
// mode fails on large schemas, and the reply is validated with Zod anyway.
const stripSchemaMeta = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(stripSchemaMeta);
  if (!node || typeof node !== 'object') return node;
  return Object.fromEntries(
    Object.entries(node as Record<string, unknown>)
      .filter(([key]) => key !== '$schema')
      .map(([key, value]) => [key, stripSchemaMeta(value)])
  );
};

const PROMPT_SCHEMA = JSON.stringify(stripSchemaMeta(z.toJSONSchema(DiagnosisModelOutputSchema, { target: 'draft-7' })));

/* -------------------------------------------------------------------------- */
/* MODEL CALL                                                                 */
/* -------------------------------------------------------------------------- */
interface ChatCompletionResponse {
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  error?: { message?: string };
}

interface StreamChunk {
  choices?: { finish_reason?: string | null; delta?: { content?: string | null } }[];
  usage?: ChatCompletionResponse['usage'];
}

// Errors worth one more attempt; everything else fails immediately
class RetryableError extends Error {
  constructor(public final: DiagnosisError) {
    super(final.message);
  }
}

const UNREADABLE = () => new DiagnosisError(502, 'The AI response could not be read. Please try again.');

const requestOnce = async (request: DiagnosisRequest): Promise<DiagnosisModelOutput> => {
  const { baseUrl, apiKey } = getConfig();
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);

  let response: Response;
  let content = '';
  let finishReason: string | undefined;
  let usage: ChatCompletionResponse['usage'];
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: getModel(),
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0.2,
        // Streaming keeps the connection busy: the provider drops long silent requests
        stream: true,
        stream_options: { include_usage: true },
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: CLINICAL_SYSTEM_PROMPT },
          {
            role: 'user',
            content:
              `${buildPatientData(request)}\n\n${ANALYSIS_TASK}\n\n` +
              `Reply with ONLY a JSON object (no markdown) that matches this JSON schema exactly, with every field present:\n` +
              PROMPT_SCHEMA,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ChatCompletionResponse;
      console.error(`[diagnosis] provider error ${response.status}: ${body.error?.message ?? ''}`.slice(0, 300));
      if (response.status === 401 || response.status === 403) {
        throw new DiagnosisError(503, 'The diagnosis service is not configured correctly. Please try again later.');
      }
      if (response.status === 402) {
        throw new DiagnosisError(503, 'The diagnosis service is temporarily unavailable. Please try again later.');
      }
      const error = new DiagnosisError(503, 'The diagnosis service is busy right now. Please try again in a minute.');
      if (response.status === 429 || response.status >= 500) throw new RetryableError(error);
      throw error;
    }

    // Read the server-sent events: "data: {chunk}" lines, ending with "data: [DONE]"
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const chunk = JSON.parse(data) as StreamChunk;
          const choice = chunk.choices?.[0];
          if (choice?.delta?.content) content += choice.delta.content;
          if (choice?.finish_reason) finishReason = choice.finish_reason;
          if (chunk.usage) usage = chunk.usage;
        } catch {
          // Ignore keep-alive or malformed lines
        }
      }
    }
  } catch (error) {
    if (error instanceof DiagnosisError || error instanceof RetryableError) throw error;
    const timedOut = (error as { name?: string })?.name === 'AbortError';
    throw new RetryableError(
      timedOut
        ? new DiagnosisError(504, 'The analysis took too long. Please try again.')
        : new DiagnosisError(503, 'Could not reach the diagnosis service. Please try again.')
    );
  } finally {
    clearTimeout(timer);
  }

  // Log usage only - never log patient data
  console.log(
    `[diagnosis] model=${getModel()} finish=${finishReason} ` +
      `in=${usage?.prompt_tokens ?? '?'} out=${usage?.completion_tokens ?? '?'} ` +
      `cost=${usage?.cost ?? '?'} ms=${Date.now() - started}`
  );

  if (finishReason === 'length') throw new RetryableError(UNREADABLE());

  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    throw new RetryableError(UNREADABLE());
  }
  const parsed = DiagnosisModelOutputSchema.safeParse(json);
  if (!parsed.success) {
    console.error('[diagnosis] schema mismatch:', parsed.error.issues.slice(0, 3));
    throw new RetryableError(UNREADABLE());
  }
  if (parsed.data.input_check.status === 'ok' && !parsed.data.assessment) {
    throw new RetryableError(UNREADABLE());
  }
  return parsed.data;
};

const callModel = async (request: DiagnosisRequest): Promise<DiagnosisModelOutput> => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await requestOnce(request);
    } catch (error) {
      if (error instanceof RetryableError) {
        if (attempt < MAX_ATTEMPTS) continue;
        throw error.final;
      }
      if (error instanceof DiagnosisError) throw error;
      console.error('[diagnosis] unexpected error:', error);
      throw new DiagnosisError(500, 'Something went wrong while analysing. Please try again.');
    }
  }
};

/* -------------------------------------------------------------------------- */
/* ANALYSIS (input check, triage, possible conditions and remedies)           */
/* -------------------------------------------------------------------------- */
type RemedySystemOutput = AssessmentOutput['remedies']['allopathy'];

export interface RemedySystem {
  available: boolean;
  unavailableReason: string | null;
  note: string | null;
  items: RemedySystemOutput['items'];
}

export interface AnalysisResult {
  triage: AssessmentOutput['triage'];
  immediateActions: string[];
  summary: string;
  conditions: AssessmentOutput['conditions'];
  redFlags: string[];
  warningSigns: string[];
  recommendedTests: AssessmentOutput['recommended_tests'];
  specialist: string;
  remedies: {
    allopathy: RemedySystem;
    ayurveda: RemedySystem;
    homeopathy: RemedySystem;
  };
  homeCare: string[];
  diet: AssessmentOutput['diet'];
  confidence: AssessmentOutput['confidence'];
  meta: {
    bmi: number;
    model: string;
    generatedAt: string;
  };
}

const REJECTION_DEFAULTS: Record<'not_medical' | 'too_vague', string> = {
  not_medical: 'Please describe only your health problem: what you feel, since when and how severe it is.',
  too_vague: 'Please add more details: since when, how severe it is, where exactly, and any other symptoms.',
};

const EMERGENCY_REMEDY_REASON = 'This needs emergency medical care. Do not self-medicate.';

const cleanList = (list: string[], max: number): string[] =>
  list.map((s) => s.trim()).filter(Boolean).slice(0, max);

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

export const runAnalysis = async (request: DiagnosisRequest): Promise<AnalysisResult> => {
  const output = await callModel(request);

  const { status, message } = output.input_check;
  if (status !== 'ok') {
    throw new DiagnosisError(422, message.trim() || REJECTION_DEFAULTS[status], status);
  }

  const assessment = output.assessment as AssessmentOutput;
  const isEmergency = assessment.triage.level === 'emergency';

  return {
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
    diet: {
      favor: cleanList(assessment.diet.favor, 8),
      avoid: cleanList(assessment.diet.avoid, 8),
    },
    confidence: assessment.confidence,
    meta: {
      bmi: computeBmi(request.patient.heightCm, request.patient.weightKg),
      model: getModel(),
      generatedAt: new Date().toISOString(),
    },
  };
};
