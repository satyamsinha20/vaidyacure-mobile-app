import { z } from 'zod';
import {
  AnalysisOutputSchema,
  InterviewOutputSchema,
  MAX_INTERVIEW_ROUNDS,
  MAX_QUESTIONS_FIRST_ROUND,
  MAX_QUESTIONS_LATER_ROUNDS,
  type AnalysisOutput,
  type DiagnosisRequest,
  type InterviewOutput,
} from './schemas.js';
import {
  ANALYSIS_TASK,
  CLINICAL_SYSTEM_PROMPT,
  buildInterviewTask,
  buildPatientData,
  computeBmi,
} from './prompts.js';

/* -------------------------------------------------------------------------- */
/* CONFIG (any OpenAI-compatible chat completions provider)                   */
/* -------------------------------------------------------------------------- */
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';
const getModel = (): string => process.env.LLM_MODEL?.trim() || DEFAULT_MODEL;

const INTERVIEW_TIMEOUT_MS = 60_000;
const ANALYSIS_TIMEOUT_MS = 120_000;
// One extra attempt for network errors, 5xx/429 responses and unreadable output
const MAX_ATTEMPTS = 2;

export class DiagnosisError extends Error {
  constructor(public status: number, message: string) {
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

/* -------------------------------------------------------------------------- */
/* MODEL CALL                                                                 */
/* -------------------------------------------------------------------------- */
interface ModelCallOptions<T extends z.ZodType> {
  label: string;
  schema: T;
  task: string;
  request: DiagnosisRequest;
  maxTokens: number;
  timeoutMs: number;
}

interface ChatCompletionResponse {
  choices?: { finish_reason?: string; message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  error?: { message?: string };
}

// Errors worth one more attempt; everything else fails immediately
class RetryableError extends Error {
  constructor(public final: DiagnosisError) {
    super(final.message);
  }
}

const attemptCall = async <T extends z.ZodType>(opts: ModelCallOptions<T>, jsonSchema: object): Promise<z.infer<T>> => {
  const { baseUrl, apiKey } = getConfig();
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

  let response: Response;
  let body: ChatCompletionResponse;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: getModel(),
        max_tokens: opts.maxTokens,
        temperature: 0.2,
        // JSON mode + schema in the prompt: the provider's strict json_schema mode
        // fails on large schemas, and the output is validated with Zod anyway
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: CLINICAL_SYSTEM_PROMPT },
          {
            role: 'user',
            content:
              `${buildPatientData(opts.request)}\n\n${opts.task}\n\n` +
              `Reply with ONLY a JSON object (no markdown) that matches this JSON schema exactly, with every field present:\n` +
              JSON.stringify(jsonSchema),
          },
        ],
      }),
      signal: controller.signal,
    });
    body = (await response.json().catch(() => ({}))) as ChatCompletionResponse;
  } catch (error) {
    const timedOut = (error as { name?: string })?.name === 'AbortError';
    throw new RetryableError(
      timedOut
        ? new DiagnosisError(504, 'The analysis took too long. Please try again.')
        : new DiagnosisError(503, 'Could not reach the diagnosis service. Please try again.')
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    console.error(`[diagnosis] ${opts.label} provider error ${response.status}: ${body.error?.message ?? ''}`.slice(0, 300));
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

  const choice = body.choices?.[0];
  // Log usage only - never log patient data
  console.log(
    `[diagnosis] ${opts.label} model=${getModel()} finish=${choice?.finish_reason} ` +
      `in=${body.usage?.prompt_tokens ?? '?'} out=${body.usage?.completion_tokens ?? '?'} ` +
      `cost=${body.usage?.cost ?? '?'} ms=${Date.now() - started}`
  );

  const unreadable = new DiagnosisError(502, 'The AI response could not be read. Please try again.');
  if (choice?.finish_reason === 'length') throw new RetryableError(unreadable);

  let json: unknown;
  try {
    json = JSON.parse(choice?.message?.content ?? '');
  } catch {
    throw new RetryableError(unreadable);
  }
  const parsed = opts.schema.safeParse(json);
  if (!parsed.success) {
    console.error(`[diagnosis] ${opts.label} schema mismatch:`, parsed.error.issues.slice(0, 3));
    throw new RetryableError(unreadable);
  }
  return parsed.data;
};

/**
 * Some providers only accept a single JSON type per field, so nullable fields
 * (["string", "null"]) are sent as plain strings. Empty strings are already
 * treated as "not provided" when the output is normalised.
 */
const simplifySchema = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(simplifySchema);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === '$schema') continue;
    if (key === 'type' && Array.isArray(value)) {
      out.type = value.find((t) => t !== 'null') ?? 'string';
    } else {
      out[key] = simplifySchema(value);
    }
  }
  return out;
};

const callModel = async <T extends z.ZodType>(opts: ModelCallOptions<T>): Promise<z.infer<T>> => {
  const jsonSchema = simplifySchema(z.toJSONSchema(opts.schema, { target: 'draft-7' })) as object;
  for (let attempt = 1; ; attempt++) {
    try {
      return await attemptCall(opts, jsonSchema);
    } catch (error) {
      if (error instanceof RetryableError) {
        if (attempt < MAX_ATTEMPTS) continue;
        throw error.final;
      }
      if (error instanceof DiagnosisError) throw error;
      console.error(`[diagnosis] ${opts.label} unexpected error:`, error);
      throw new DiagnosisError(500, 'Something went wrong while analysing. Please try again.');
    }
  }
};

/* -------------------------------------------------------------------------- */
/* INTERVIEW (adaptive follow-up questions)                                   */
/* -------------------------------------------------------------------------- */
export interface InterviewQuestion {
  id: string;
  text: string;
  help: string | null;
  type: 'single_choice' | 'multi_choice' | 'yes_no' | 'number' | 'text';
  options: string[];
  unit: string | null;
}

export interface InterviewResult {
  round: number;
  done: boolean;
  urgentWarning: string | null;
  questions: InterviewQuestion[];
}

const normalizeQuestion = (
  q: InterviewOutput['questions'][number],
  round: number,
  index: number
): InterviewQuestion | null => {
  const text = q.text.trim();
  if (!text) return null;

  let type = q.type;
  let options = Array.from(new Set(q.options.map((o) => o.trim()).filter(Boolean))).slice(0, 8);

  if (type === 'yes_no') {
    options = ['Yes', 'No', 'Not sure'];
  } else if (type === 'single_choice' || type === 'multi_choice') {
    if (options.length < 2) type = 'text';
  }
  if (type === 'number' || type === 'text') options = [];

  return {
    id: `r${round}q${index + 1}`,
    text,
    help: q.help?.trim() || null,
    type,
    options,
    unit: type === 'number' ? q.unit?.trim() || null : null,
  };
};

export const runInterview = async (request: DiagnosisRequest): Promise<InterviewResult> => {
  const round = request.rounds.length + 1;
  if (round > MAX_INTERVIEW_ROUNDS) {
    return { round, done: true, urgentWarning: null, questions: [] };
  }

  const output = await callModel({
    label: `interview r${round}`,
    schema: InterviewOutputSchema,
    task: buildInterviewTask(round),
    request,
    maxTokens: 3000,
    timeoutMs: INTERVIEW_TIMEOUT_MS,
  });

  const limit = round === 1 ? MAX_QUESTIONS_FIRST_ROUND : MAX_QUESTIONS_LATER_ROUNDS;
  const questions = output.done
    ? []
    : output.questions
        .slice(0, limit)
        .map((q, i) => normalizeQuestion(q, round, i))
        .filter((q): q is InterviewQuestion => q !== null);

  return {
    round,
    done: questions.length === 0,
    urgentWarning: output.urgent_warning?.trim() || null,
    questions,
  };
};

/* -------------------------------------------------------------------------- */
/* ANALYSIS (differential diagnosis, triage and remedies)                     */
/* -------------------------------------------------------------------------- */
type RemedySystemOutput = AnalysisOutput['remedies']['allopathy'];

export interface RemedySystem {
  available: boolean;
  unavailableReason: string | null;
  note: string | null;
  items: RemedySystemOutput['items'];
}

export interface AnalysisResult {
  triage: AnalysisOutput['triage'];
  immediateActions: string[];
  summary: string;
  conditions: AnalysisOutput['conditions'];
  redFlags: string[];
  warningSigns: string[];
  recommendedTests: AnalysisOutput['recommended_tests'];
  specialist: string;
  remedies: {
    allopathy: RemedySystem;
    ayurveda: RemedySystem;
    homeopathy: RemedySystem;
  };
  homeCare: string[];
  diet: AnalysisOutput['diet'];
  confidence: AnalysisOutput['confidence'];
  meta: {
    bmi: number;
    model: string;
    generatedAt: string;
  };
}

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

const normalizeConditions = (conditions: AnalysisOutput['conditions']): AnalysisOutput['conditions'] => {
  const list = conditions
    .filter((c) => c.name.trim())
    .map((c) => ({
      ...c,
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
  const output = await callModel({
    label: 'analysis',
    schema: AnalysisOutputSchema,
    task: ANALYSIS_TASK,
    request,
    maxTokens: 8000,
    timeoutMs: ANALYSIS_TIMEOUT_MS,
  });

  const isEmergency = output.triage.level === 'emergency';

  return {
    triage: output.triage,
    immediateActions: cleanList(output.immediate_actions, 6),
    summary: output.summary.trim(),
    conditions: normalizeConditions(output.conditions),
    redFlags: cleanList(output.red_flags, 8),
    warningSigns: cleanList(output.warning_signs, 8),
    recommendedTests: output.recommended_tests.filter((t) => t.name.trim()).slice(0, 6),
    specialist: output.specialist.trim(),
    remedies: {
      allopathy: normalizeRemedySystem(output.remedies.allopathy, isEmergency),
      ayurveda: normalizeRemedySystem(output.remedies.ayurveda, isEmergency),
      homeopathy: normalizeRemedySystem(output.remedies.homeopathy, isEmergency),
    },
    homeCare: cleanList(output.home_care, 8),
    diet: {
      favor: cleanList(output.diet.favor, 8),
      avoid: cleanList(output.diet.avoid, 8),
    },
    confidence: output.confidence,
    meta: {
      bmi: computeBmi(request.patient.heightCm, request.patient.weightKg),
      model: getModel(),
      generatedAt: new Date().toISOString(),
    },
  };
};
