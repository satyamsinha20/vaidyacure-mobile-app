import { z } from 'zod';
import { SearchCache } from '../../models/SearchCache.js';
import { createChatCompletion, type MultimodalChatMessage } from '../ai/llmClient.js';
import { getAiSettings, getPhotoAiTargets } from '../ai/configStore.js';
import { DAILY_TTL_MS, incrementCounter, readCounter, today } from '../rateLimit.js';
import { sha256 } from '../../utils/secretBox.js';
import { isUnsafeText } from './safety.js';
import { cleanGenerics } from './medicineId.js';

/**
 * Camera search: a small vision model reads what is printed on a medicine
 * strip, bottle or box: the brand, the salt (generic names) and the strength.
 * Only printed text is returned (no guessing), and photos that are not health
 * products return nothing. Results are cached per photo, and new readings are
 * limited per device, IP and day.
 */
export interface PhotoReading {
  brand: string;
  generics: string[];
  strength: string;
  /** Brand first, then the generic names: what the app offers to search */
  candidates: string[];
}

export type PhotoReadOutcome =
  | (PhotoReading & { reason?: undefined })
  | (PhotoReading & { reason: 'disabled' | 'limit' | 'unavailable' | 'not_found' });

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PER_IP_PER_DAY = 60;
const TIMEOUT_MS = 18_000; // two tries stay inside the app's 45 s wait

const SYSTEM_PROMPT = `You read medicine and health product packaging from a photo for a health app in India.
Return only this JSON: {"brand": "", "generics": [], "strength": ""}
Rules:
- "brand": the product or brand name exactly as printed (for example "Pyregem" or "Dolo 650").
- "generics": the active ingredient or salt names printed on the pack, without words like Tablets, IP, BP (for example ["Paracetamol"]).
- "strength": the strength if printed (for example "650 mg").
- Only text that is clearly visible in the photo. Never guess or complete a word you cannot read. Use "" or [] for anything not visible.
- Health products only: allopathic medicines, ayurvedic, homeopathic, herbal, oils, flower remedies, supplements, first aid and wellness products.
- If the photo is not such a product, or nothing can be read, return {"brand": "", "generics": [], "strength": ""}.`;

const ResultSchema = z.object({
  brand: z.string().default(''),
  generics: z.array(z.string()).max(8).default([]),
  strength: z.string().default(''),
});

const clean = (text: string, max: number) =>
  text
    .replace(/[^\p{L}\p{N} .+\-/%()]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const EMPTY: PhotoReading = { brand: '', generics: [], strength: '', candidates: [] };

type Parsed = { kind: 'reading'; reading: PhotoReading } | { kind: 'invalid' };

const parseReading = (text: string): Parsed => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return { kind: 'invalid' };
  try {
    const parsed = ResultSchema.safeParse(JSON.parse(text.slice(start, end + 1)));
    if (!parsed.success) return { kind: 'invalid' };
    let brand = clean(parsed.data.brand, 60);
    if (brand.length < 2 || !/\p{L}{2,}/u.test(brand) || isUnsafeText(brand)) brand = '';
    const generics = cleanGenerics(parsed.data.generics);
    const strength = clean(parsed.data.strength, 30);
    const seen = new Set<string>();
    const candidates = [brand, ...generics].filter((c) => c && (seen.has(c.toLowerCase()) ? false : (seen.add(c.toLowerCase()), true)));
    return { kind: 'reading', reading: { brand, generics, strength, candidates } };
  } catch {
    return { kind: 'invalid' };
  }
};

export const readMedicineNamesFromPhoto = async (
  image: Buffer,
  mime: 'image/jpeg' | 'image/png',
  who: { deviceId?: string; ip: string }
): Promise<PhotoReadOutcome> => {
  const cacheKey = `photo:v2:${sha256(image.toString('base64')).slice(0, 40)}`;
  const cached = await SearchCache.findOne({ key: cacheKey }).lean();
  if (cached) {
    const reading = (cached.result as { reading?: PhotoReading }).reading ?? EMPTY;
    return reading.candidates.length ? reading : { ...reading, reason: 'not_found' };
  }

  const settings = await getAiSettings();
  if (!settings.photoAiEnabled) return { ...EMPTY, reason: 'disabled' };

  const day = today();
  if ((await readCounter(`photoai:global:${day}`)) >= settings.photoAiGlobalPerDay) return { ...EMPTY, reason: 'limit' };
  const [deviceCount, ipCount] = await Promise.all([
    who.deviceId ? incrementCounter(`photoai:device:${who.deviceId}:${day}`, DAILY_TTL_MS) : Promise.resolve(0),
    incrementCounter(`photoai:ip:${who.ip}:${day}`, DAILY_TTL_MS),
  ]);
  if (deviceCount > settings.photoAiPerDevicePerDay || ipCount > PER_IP_PER_DAY) return { ...EMPTY, reason: 'limit' };

  const targets = await getPhotoAiTargets();
  if (!targets.length) return { ...EMPTY, reason: 'disabled' };

  const messages: MultimodalChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Read the brand, salt and strength printed on this package.' },
        { type: 'image_url', image_url: { url: `data:${mime};base64,${image.toString('base64')}` } },
      ],
    },
  ];

  let reading: PhotoReading | null = null;
  for (const target of targets) {
    try {
      await incrementCounter(`photoai:global:${day}`, DAILY_TTL_MS);
      const result = await createChatCompletion(target.creds, {
        model: target.model,
        messages,
        maxTokens: 150,
        temperature: 0,
        timeoutMs: TIMEOUT_MS,
      });
      // Server log only: usage for cost tracking (no image data)
      console.log(
        `[photo-ai] model=${target.model} in=${result.usage?.prompt_tokens ?? '?'} out=${result.usage?.completion_tokens ?? '?'} ` +
          `cost=${result.usage?.cost ?? '?'} ms=${result.ms}`
      );
      const parsed = parseReading(result.content);
      if (parsed.kind === 'invalid') continue; // unreadable answer: try the fallback model
      reading = parsed.reading;
      if (reading.candidates.length) break; // found something; an empty answer gets one more try on the fallback
    } catch (error) {
      console.error(`[photo-ai] ${target.model} failed:`, error instanceof Error ? error.message : error);
    }
  }

  if (!reading) return { ...EMPTY, reason: 'unavailable' };
  await SearchCache.updateOne(
    { key: cacheKey },
    { $set: { result: { reading }, expiresAt: new Date(Date.now() + CACHE_TTL_MS) } },
    { upsert: true }
  ).catch(() => {});
  return reading.candidates.length ? reading : { ...reading, reason: 'not_found' };
};
