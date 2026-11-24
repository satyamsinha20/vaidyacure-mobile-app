import { z } from 'zod';
import { SearchCache } from '../../models/SearchCache.js';
import { createChatCompletion, type ChatMessage } from '../ai/llmClient.js';
import { getAiSettings, getSearchAiTargets } from '../ai/configStore.js';
import { DAILY_TTL_MS, incrementCounter, readCounter, today } from '../rateLimit.js';
import { isUnsafeText } from './safety.js';
import type { SearchResponse } from './searchService.js';

/**
 * A short AI answer shown above the search results. The model may only use
 * the sources the search already found (VaidyaCure library, MedlinePlus,
 * Wikipedia, US FDA labels), so it summarises rather than invents. Answers
 * are cached per query, so repeated searches cost nothing.
 */
export interface AiAnswer {
  summary: string;
  points: string[];
  seeDoctor: string;
}

export type AiAnswerOutcome =
  | { answer: AiAnswer; reason?: undefined }
  | { answer: null; reason: 'blocked' | 'no_sources' | 'disabled' | 'limit' | 'no_answer' | 'unavailable' };

const ANSWER_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const NO_ANSWER_TTL_MS = 6 * 60 * 60 * 1000;
const PER_IP_PER_DAY = 150;
const MAX_SOURCES = 6;
const MAX_OUTPUT_TOKENS = 500;
const TIMEOUT_MS = 15_000;

const SYSTEM_PROMPT = `You are the health search assistant inside VaidyaCure, an Indian health and remedies app.
Write a short, safe answer to the user's search using ONLY the numbered SOURCES.
Rules:
- Use only facts found in the SOURCES. Do not add anything from memory. If the SOURCES do not answer the search, return empty fields.
- Health topics only (symptoms, conditions, medicines, herbs, home remedies, first aid, nutrition, wellness). For anything else return empty fields.
- Do not diagnose and do not prescribe. Mention a medicine dose only if it is written in a SOURCE, and say it is the label dose.
- If the search suggests an emergency (chest pain, trouble breathing, heavy bleeding, poisoning, snake or dog bite, stroke signs, high fever in a baby, thoughts of self-harm), the first point must say to call 112 or go to a hospital now.
- Language: reply in the language of the search. Hindi in Devanagari script: reply in Hindi. Hindi written in English letters (Hinglish): reply in simple Hinglish. Otherwise: simple English.
- Plain words that a non-doctor understands. No markdown, no source numbers.
Return only this JSON:
{"summary": "2-3 sentences, at most 60 words", "points": ["2 to 4 short practical points, at most 16 words each"], "seeDoctor": "one sentence on when to see a doctor"}`;

const AnswerSchema = z.object({
  summary: z.string().trim().max(700),
  points: z.array(z.string().trim().min(2).max(240)).max(5).default([]),
  seeDoctor: z.string().trim().max(300).default(''),
});

const clip = (value: unknown, max: number): string => {
  const text = Array.isArray(value) ? value.join(', ') : typeof value === 'string' ? value : '';
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
};

const buildSources = (search: SearchResponse, mode: 'all' | 'medicine'): string[] => {
  const articles = search.articles.map((a) => `${a.source} – ${clip(a.title, 80)}: ${clip(a.summary, 520)}`);
  const library = (search.library as any[]).slice(0, 3).map((item) => {
    const parts = [
      clip(item.excerpt || item.description, 260),
      item.uses?.length ? `Uses: ${clip(item.uses, 160)}.` : '',
      item.symptoms?.length ? `Helps with: ${clip(item.symptoms, 120)}.` : '',
      item.precautions ? `Precautions: ${clip(item.precautions, 160)}` : '',
    ].filter(Boolean);
    return `VaidyaCure library (${clip(item.category, 20) || 'remedy'}) – ${clip(item.name, 60)}: ${parts.join(' ')}`;
  });
  const medicines = search.medicines.map((m) => {
    const parts = [
      m.purpose ? `Purpose: ${clip(m.purpose, 160)}` : '',
      m.uses ? `Uses: ${clip(m.uses, 260)}` : '',
      m.warnings ? `Warnings: ${clip(m.warnings, 220)}` : '',
    ].filter(Boolean);
    return `US FDA drug label – ${clip(m.name, 60)}${m.genericName ? ` (${clip(m.genericName, 60)})` : ''}: ${parts.join(' ')}`;
  });
  const ordered = mode === 'medicine' ? [...medicines, ...library, ...articles] : [...articles, ...library, ...medicines];
  return ordered.filter((s) => s.length > 40).slice(0, MAX_SOURCES);
};

type Parsed = { kind: 'answer'; answer: AiAnswer } | { kind: 'empty' } | { kind: 'invalid' };

const parseAnswer = (text: string): Parsed => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return { kind: 'invalid' };
  let json: unknown;
  try {
    json = JSON.parse(text.slice(start, end + 1));
  } catch {
    return { kind: 'invalid' };
  }
  const result = AnswerSchema.safeParse(json);
  if (!result.success) return { kind: 'invalid' };
  const answer = result.data;
  if (!answer.summary) return { kind: 'empty' };
  // Never show anything the search safety filter would block
  if (isUnsafeText([answer.summary, ...answer.points, answer.seeDoctor].join(' '))) return { kind: 'empty' };
  return { kind: 'answer', answer: { summary: answer.summary, points: answer.points.slice(0, 4), seeDoctor: answer.seeDoctor } };
};

export const getAiAnswer = async (
  search: SearchResponse,
  mode: 'all' | 'medicine',
  who: { deviceId?: string; ip: string }
): Promise<AiAnswerOutcome> => {
  if (search.blocked) return { answer: null, reason: 'blocked' };
  const sources = buildSources(search, mode);
  if (!sources.length) return { answer: null, reason: 'no_sources' };

  const cacheKey = `ai:v1:${mode}:${search.query.toLowerCase()}`;
  const cached = await SearchCache.findOne({ key: cacheKey }).lean();
  if (cached) {
    const stored = cached.result as { answer: AiAnswer | null };
    return stored.answer ? { answer: stored.answer } : { answer: null, reason: 'no_answer' };
  }

  const settings = await getAiSettings();
  if (!settings.searchAiEnabled) return { answer: null, reason: 'disabled' };

  // Spending limits apply only when a new answer has to be written
  const day = today();
  if ((await readCounter(`searchai:global:${day}`)) >= settings.searchAiGlobalPerDay) return { answer: null, reason: 'limit' };
  const [deviceCount, ipCount] = await Promise.all([
    who.deviceId ? incrementCounter(`searchai:device:${who.deviceId}:${day}`, DAILY_TTL_MS) : Promise.resolve(0),
    incrementCounter(`searchai:ip:${who.ip}:${day}`, DAILY_TTL_MS),
  ]);
  if (deviceCount > settings.searchAiPerDevicePerDay || ipCount > PER_IP_PER_DAY) return { answer: null, reason: 'limit' };

  const targets = await getSearchAiTargets();
  if (!targets.length) return { answer: null, reason: 'disabled' };

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Search: "${search.query}"\nEnglish meaning: "${search.englishQuery}"\n\nSOURCES:\n${sources.map((s, i) => `[${i + 1}] ${s}`).join('\n')}`,
    },
  ];

  for (const target of targets) {
    try {
      await incrementCounter(`searchai:global:${day}`, DAILY_TTL_MS);
      const result = await createChatCompletion(target.creds, {
        model: target.model,
        messages,
        maxTokens: MAX_OUTPUT_TOKENS,
        temperature: 0.2,
        timeoutMs: TIMEOUT_MS,
      });
      // Server log only: model usage for cost tracking (no search text)
      console.log(
        `[search-ai] model=${target.model} in=${result.usage?.prompt_tokens ?? '?'} out=${result.usage?.completion_tokens ?? '?'} ` +
          `cost=${result.usage?.cost ?? '?'} ms=${result.ms}`
      );
      const parsed = parseAnswer(result.content);
      if (parsed.kind === 'invalid') continue; // try the fallback model
      const answer = parsed.kind === 'answer' ? parsed.answer : null;
      await SearchCache.updateOne(
        { key: cacheKey },
        { $set: { result: { answer }, expiresAt: new Date(Date.now() + (answer ? ANSWER_TTL_MS : NO_ANSWER_TTL_MS)) } },
        { upsert: true }
      ).catch(() => {});
      return answer ? { answer } : { answer: null, reason: 'no_answer' };
    } catch (error) {
      console.error(`[search-ai] ${target.model} failed:`, error instanceof Error ? error.message : error);
    }
  }
  return { answer: null, reason: 'unavailable' };
};
