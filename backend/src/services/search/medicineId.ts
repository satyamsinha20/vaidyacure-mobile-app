import { z } from 'zod';
import { SearchCache } from '../../models/SearchCache.js';
import { createChatCompletion, type ChatMessage } from '../ai/llmClient.js';
import { getAiSettings, getMedicineAiTargets } from '../ai/configStore.js';
import { DAILY_TTL_MS, incrementCounter, readCounter, today } from '../rateLimit.js';
import { isUnsafeText } from './safety.js';

/**
 * Indian medicine brands (Pyregem, Dolo 650, Combiflam …) are not in the free
 * medical sources, which know medicines by their salt (generic name). This
 * works out the salt behind a brand: from the label read off a photo when
 * available, otherwise with a small AI model that must say "unknown" rather
 * than guess. The salt is then searched in the trusted sources.
 */
export interface IdentifiedMedicine {
  brand: string;
  generics: string[];
  strength: string;
  form: string;
  /** label: printed on the photographed pack · ai: worked out from the brand name */
  source: 'label' | 'ai';
}

const KNOWN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const UNKNOWN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PER_IP_PER_DAY = 150;

const SYSTEM_PROMPT = `You help a health app in India find the active ingredients of medicines.
The user typed a search. If it is the brand or product name of a medicine or health product sold in India
(allopathic, ayurvedic, homeopathic, herbal, supplement, oil, first aid), return its active ingredients (generic or salt names).
Rules:
- Answer only if you are sure this exact brand exists and you know its ingredients. Otherwise return {"known": false}.
- Never guess from how the name sounds. A disease, symptom or herb name is not a brand: return {"known": false}.
- Generic names only, in English, without words like Tablets, IP, BP, Syrup (for example "Paracetamol").
Return only JSON:
{"known": true, "brand": "Dolo 650", "generics": ["Paracetamol"], "strength": "650 mg", "form": "tablet"}`;

const ResultSchema = z.object({
  known: z.boolean(),
  brand: z.string().optional(),
  generics: z.array(z.string()).max(6).optional(),
  strength: z.string().optional(),
  form: z.string().optional(),
});

const FORM_WORDS = /\b(tablets?|tabs?|capsules?|caps?|syrup|suspension|injection|ointment|cream|gel|drops?|ip|bp|usp|i\.p\.|b\.p\.)\b/gi;

/** "Paracetamol Tablets IP" → "Paracetamol" */
export const cleanGenericName = (name: string) =>
  name
    .replace(FORM_WORDS, ' ')
    .replace(/[^\p{L}\p{N} .+\-/]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);

export const cleanGenerics = (names: string[]): string[] => {
  const seen = new Set<string>();
  return names
    .map(cleanGenericName)
    .filter((n) => n.length >= 3 && /\p{L}{3,}/u.test(n) && !isUnsafeText(n))
    .filter((n) => (seen.has(n.toLowerCase()) ? false : (seen.add(n.toLowerCase()), true)))
    .slice(0, 4);
};

/** From a photo: the salt is printed on the pack, so no AI is needed */
export const identifiedFromLabel = (brand: string, genericHint: string): IdentifiedMedicine | null => {
  const generics = cleanGenerics(genericHint.split(/[,+&]| and /i));
  return generics.length ? { brand: brand.trim().slice(0, 60), generics, strength: '', form: '', source: 'label' } : null;
};

export const identifyMedicine = async (query: string, who: { deviceId?: string; ip: string }): Promise<IdentifiedMedicine | null> => {
  const key = `medid:v1:${query.toLowerCase().trim()}`;
  const cached = await SearchCache.findOne({ key }).lean();
  if (cached) return ((cached.result as { medicine: IdentifiedMedicine | null }).medicine ?? null);

  const settings = await getAiSettings();
  if (!settings.searchAiEnabled) return null;

  // Shares the search AI spending limits
  const day = today();
  if ((await readCounter(`searchai:global:${day}`)) >= settings.searchAiGlobalPerDay) return null;
  const [deviceCount, ipCount] = await Promise.all([
    who.deviceId ? incrementCounter(`searchai:device:${who.deviceId}:${day}`, DAILY_TTL_MS) : Promise.resolve(0),
    incrementCounter(`searchai:ip:${who.ip}:${day}`, DAILY_TTL_MS),
  ]);
  if (deviceCount > settings.searchAiPerDevicePerDay || ipCount > PER_IP_PER_DAY) return null;

  const targets = await getMedicineAiTargets();
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Search: "${query}"` },
  ];

  for (const target of targets) {
    try {
      await incrementCounter(`searchai:global:${day}`, DAILY_TTL_MS);
      const result = await createChatCompletion(target.creds, { model: target.model, messages, maxTokens: 150, temperature: 0, timeoutMs: 15_000 });
      console.log(
        `[medicine-id] model=${target.model} in=${result.usage?.prompt_tokens ?? '?'} out=${result.usage?.completion_tokens ?? '?'} ` +
          `cost=${result.usage?.cost ?? '?'} ms=${result.ms}`
      );
      const start = result.content.indexOf('{');
      const end = result.content.lastIndexOf('}');
      if (start < 0 || end <= start) continue;
      const parsed = ResultSchema.safeParse(JSON.parse(result.content.slice(start, end + 1)));
      if (!parsed.success) continue;
      const generics = parsed.data.known ? cleanGenerics(parsed.data.generics ?? []) : [];
      const medicine: IdentifiedMedicine | null = generics.length
        ? {
            brand: (parsed.data.brand || query).trim().slice(0, 60),
            generics,
            strength: (parsed.data.strength ?? '').trim().slice(0, 40),
            form: (parsed.data.form ?? '').trim().slice(0, 30),
            source: 'ai',
          }
        : null;
      await SearchCache.updateOne(
        { key },
        { $set: { result: { medicine }, expiresAt: new Date(Date.now() + (medicine ? KNOWN_TTL_MS : UNKNOWN_TTL_MS)) } },
        { upsert: true }
      ).catch(() => {});
      return medicine;
    } catch (error) {
      console.error(`[medicine-id] ${target.model} failed:`, error instanceof Error ? error.message : error);
    }
  }
  return null;
};
