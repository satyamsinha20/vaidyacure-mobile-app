import { z } from 'zod';
import { SearchCache } from '../../models/SearchCache.js';
import { createChatCompletion, type MultimodalChatMessage } from '../ai/llmClient.js';
import { getAiSettings, getPhotoAiTargets } from '../ai/configStore.js';
import { DAILY_TTL_MS, incrementCounter, readCounter, today } from '../rateLimit.js';
import { sha256 } from '../../utils/secretBox.js';
import { isUnsafeText } from './safety.js';

/**
 * Camera search: a small vision model reads the medicine name printed on a
 * strip, bottle or box. Only printed text is returned (no guessing), and
 * photos that are not health products return nothing. Results are cached per
 * photo, and new readings are limited per device, IP and day.
 */
export type PhotoReadOutcome =
  | { candidates: string[]; reason?: undefined }
  | { candidates: []; reason: 'disabled' | 'limit' | 'unavailable' | 'not_found' };

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PER_IP_PER_DAY = 60;
const TIMEOUT_MS = 18_000; // two tries stay inside the app's 45 s wait

const SYSTEM_PROMPT = `You read medicine and health product packaging from a photo for a health app's search.
Return only this JSON: {"names": ["..."]}
Rules:
- "names": up to 4 entries. First the product or brand name exactly as printed, with its strength if printed (for example "Dolo 650"). Then the generic or active ingredient names if printed (for example "Paracetamol").
- Only text that is clearly visible in the photo. Never guess or complete a name you cannot read.
- Health products only: allopathic medicines, ayurvedic, homeopathic, herbal, oils, flower remedies, supplements, first aid and wellness products.
- If the photo is not such a product, or the name cannot be read, return {"names": []}.`;

const ResultSchema = z.object({ names: z.array(z.string()).max(8).default([]) });

const cleanName = (name: string) =>
  name
    .replace(/[^\p{L}\p{N} .+\-/%()]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);

type Parsed = { kind: 'names'; names: string[] } | { kind: 'invalid' };

const parseNames = (text: string): Parsed => {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return { kind: 'invalid' };
  try {
    const parsed = ResultSchema.safeParse(JSON.parse(text.slice(start, end + 1)));
    if (!parsed.success) return { kind: 'invalid' };
    const seen = new Set<string>();
    const names = parsed.data.names
      .map(cleanName)
      .filter((n) => n.length >= 3 && /\p{L}{2,}/u.test(n) && !isUnsafeText(n))
      .filter((n) => (seen.has(n.toLowerCase()) ? false : (seen.add(n.toLowerCase()), true)))
      .slice(0, 4);
    return { kind: 'names', names };
  } catch {
    return { kind: 'invalid' };
  }
};

export const readMedicineNamesFromPhoto = async (
  image: Buffer,
  mime: 'image/jpeg' | 'image/png',
  who: { deviceId?: string; ip: string }
): Promise<PhotoReadOutcome> => {
  const cacheKey = `photo:v1:${sha256(image.toString('base64')).slice(0, 40)}`;
  const cached = await SearchCache.findOne({ key: cacheKey }).lean();
  if (cached) {
    const names = (cached.result as { names?: string[] }).names ?? [];
    return names.length ? { candidates: names } : { candidates: [], reason: 'not_found' };
  }

  const settings = await getAiSettings();
  if (!settings.photoAiEnabled) return { candidates: [], reason: 'disabled' };

  const day = today();
  if ((await readCounter(`photoai:global:${day}`)) >= settings.photoAiGlobalPerDay) return { candidates: [], reason: 'limit' };
  const [deviceCount, ipCount] = await Promise.all([
    who.deviceId ? incrementCounter(`photoai:device:${who.deviceId}:${day}`, DAILY_TTL_MS) : Promise.resolve(0),
    incrementCounter(`photoai:ip:${who.ip}:${day}`, DAILY_TTL_MS),
  ]);
  if (deviceCount > settings.photoAiPerDevicePerDay || ipCount > PER_IP_PER_DAY) return { candidates: [], reason: 'limit' };

  const targets = await getPhotoAiTargets();
  if (!targets.length) return { candidates: [], reason: 'disabled' };

  const messages: MultimodalChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Read the medicine or product name on this package.' },
        { type: 'image_url', image_url: { url: `data:${mime};base64,${image.toString('base64')}` } },
      ],
    },
  ];

  let lastNames: string[] | null = null;
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
      const parsed = parseNames(result.content);
      if (parsed.kind === 'invalid') continue; // unreadable answer: try the fallback model
      lastNames = parsed.names;
      if (parsed.names.length) break; // found a name; an empty answer gets one more try on the fallback
    } catch (error) {
      console.error(`[photo-ai] ${target.model} failed:`, error instanceof Error ? error.message : error);
    }
  }

  if (lastNames === null) return { candidates: [], reason: 'unavailable' };
  await SearchCache.updateOne(
    { key: cacheKey },
    { $set: { result: { names: lastNames }, expiresAt: new Date(Date.now() + CACHE_TTL_MS) } },
    { upsert: true }
  ).catch(() => {});
  return lastNames.length ? { candidates: lastNames } : { candidates: [], reason: 'not_found' };
};
