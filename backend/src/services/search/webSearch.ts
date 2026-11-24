import { SearchCache } from '../../models/SearchCache.js';
import { DEFAULT_WEB_SEARCH, WebSearchSettings } from '../../models/WebSearchSettings.js';
import { decryptSecret } from '../../utils/secretBox.js';
import { DAILY_TTL_MS, incrementCounter, readCounter, today } from '../rateLimit.js';
import { checkQuerySafety, isUnsafeText } from './safety.js';
import { toEnglishQuery } from './dictionary.js';

/**
 * Internet results for the Search tab: Google results through Serper.dev.
 * Only health results are kept (trusted health and pharmacy sites first),
 * social media and shopping sites are dropped, and anything the safety filter
 * would block is removed. Results are cached per query for a week.
 */
export interface WebResult {
  title: string;
  url: string;
  site: string;
  snippet: string;
  /** From a known health, government or pharmacy website */
  trusted: boolean;
}

export interface WebSearchData {
  results: WebResult[];
  /** Google's knowledge panel, when it is about health */
  knowledge: { title: string; description: string; source: string; url: string } | null;
  /** "People also ask" answers, used only as extra context for the AI summary */
  questions: { question: string; snippet: string }[];
}

export type WebSearchOutcome =
  | { data: WebSearchData; reason?: undefined }
  | { data: null; reason: 'blocked' | 'disabled' | 'not_configured' | 'limit' | 'unavailable' };

export class WebSearchError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

const SERPER_URL = 'https://google.serper.dev/search';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMPTY_TTL_MS = 6 * 60 * 60 * 1000;
const PER_IP_PER_DAY = 200;
const TIMEOUT_MS = 8_000;
const MAX_RESULTS = 6;

const TRUSTED_SITES = [
  // Indian pharmacies and health platforms
  '1mg.com', 'pharmeasy.in', 'netmeds.com', 'apollopharmacy.in', 'apollo247.com', 'medplusmart.com', 'truemeds.in',
  'practo.com', 'lybrate.com', 'medindia.net',
  // Government and global health
  'who.int', 'nhs.uk', 'nih.gov', 'medlineplus.gov', 'cdc.gov', 'fda.gov', 'mohfw.gov.in', 'nhp.gov.in', 'ayush.gov.in',
  'cdsco.gov.in', 'icmr.gov.in', 'aiims.edu',
  // Medical references
  'mayoclinic.org', 'clevelandclinic.org', 'hopkinsmedicine.org', 'webmd.com', 'healthline.com', 'medicalnewstoday.com',
  'drugs.com', 'rxlist.com', 'msdmanuals.com', 'patient.info', 'everydayhealth.com', 'verywellhealth.com', 'wikipedia.org',
];

const BLOCKED_SITES = [
  'facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'threads.net', 'pinterest.com', 'tiktok.com', 'reddit.com',
  'quora.com', 'linkedin.com', 'youtube.com', 'snapchat.com', 't.me', 'telegram.me', 'whatsapp.com', 'amazon.in',
  'amazon.com', 'flipkart.com', 'indiamart.com', 'justdial.com', 'tradeindia.com', 'ebay.com', 'olx.in',
];

const HEALTH_HINT =
  /\b(tablets?|capsules?|syrup|suspension|injection|ointment|cream|drops|mg|mcg|ml|dose|dosage|uses?|side[- ]effects?|composition|salt|generic|medicines?|medication|drugs?|treatment|symptoms?|diseases?|disorders?|infections?|fever|pain|cough|cold|allerg\w*|diabet\w*|blood pressure|health\w*|doctors?|hospitals?|clinics?|pharma\w*|ayurved\w*|homeopath\w*|herbs?|herbal|vitamins?|supplements?|nutrition|diet|first aid|remed\w*|cure|therapy)\b/i;

const clip = (value: unknown, max: number): string => {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return text.length > max ? `${text.slice(0, max).replace(/\s+\S*$/, '')}…` : text;
};

const siteOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

const isSite = (site: string, list: string[]) => list.some((d) => site === d || site.endsWith(`.${d}`));

/** Keeps health results only, trusted sites first (otherwise Google's order) */
export const shapeWebResults = (raw: any): WebSearchData => {
  const organic: any[] = Array.isArray(raw?.organic) ? raw.organic : [];
  const seen = new Set<string>();
  const kept: WebResult[] = [];
  for (const item of organic) {
    const url = typeof item?.link === 'string' ? item.link.trim() : '';
    if (!/^https:\/\//i.test(url) || seen.has(url)) continue;
    const site = siteOf(url);
    const title = clip(item.title, 140);
    const snippet = clip(item.snippet, 320);
    if (!site || !title || isSite(site, BLOCKED_SITES) || isUnsafeText(`${title} ${snippet}`)) continue;
    const trusted = isSite(site, TRUSTED_SITES);
    if (!trusted && !HEALTH_HINT.test(`${title} ${snippet}`)) continue;
    seen.add(url);
    kept.push({ title, url, site, snippet, trusted });
  }
  const results = [...kept.filter((r) => r.trusted), ...kept.filter((r) => !r.trusted)].slice(0, MAX_RESULTS);

  const kg = raw?.knowledgeGraph;
  const kgText = `${kg?.title ?? ''} ${kg?.type ?? ''} ${kg?.description ?? ''}`;
  const knowledge =
    kg && typeof kg.description === 'string' && HEALTH_HINT.test(kgText) && !isUnsafeText(kgText)
      ? {
          title: clip(kg.title, 100),
          description: clip(kg.description, 600),
          source: clip(kg.descriptionSource, 60),
          url: /^https:\/\//i.test(kg.descriptionLink ?? '') ? kg.descriptionLink : '',
        }
      : null;

  const questions = (Array.isArray(raw?.peopleAlsoAsk) ? raw.peopleAlsoAsk : [])
    .map((q: any) => ({ question: clip(q?.question, 140), snippet: clip(q?.snippet, 320) }))
    .filter((q: { question: string; snippet: string }) => q.question && q.snippet && !isUnsafeText(`${q.question} ${q.snippet}`))
    .slice(0, 3);

  return { results, knowledge, questions };
};

/** One Google search through Serper. Throws WebSearchError with a readable message. */
export const fetchSerper = async (apiKey: string, query: string): Promise<unknown> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(SERPER_URL, {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      // India, English: Indian brands and pharmacies come first
      body: JSON.stringify({ q: query, gl: 'in', hl: 'en', num: 10 }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = (await response.text().catch(() => '')).slice(0, 200);
      console.error(`[web-search] serper ${response.status}: ${text}`);
      if (response.status === 401 || response.status === 403) throw new WebSearchError('Serper rejected the API key.', response.status);
      if (/credit/i.test(text)) throw new WebSearchError('Serper credits are used up. Add credits on serper.dev.', response.status);
      if (response.status === 429) throw new WebSearchError('Serper is limiting requests right now. Try again shortly.', response.status);
      throw new WebSearchError(`Serper returned an error (${response.status}).`, response.status);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof WebSearchError) throw error;
    const timedOut = (error as { name?: string })?.name === 'AbortError';
    throw new WebSearchError(timedOut ? 'Serper took too long to answer.' : 'Could not reach Serper.');
  } finally {
    clearTimeout(timer);
  }
};

/** Settings plus the decrypted key (decrypted per use, never cached or sent anywhere) */
const loadSettings = async () => {
  const doc = await WebSearchSettings.findOne({ key: 'global' }).select('+apiKey').lean();
  let apiKey: string | null = null;
  if (doc?.apiKey) {
    try {
      apiKey = decryptSecret(doc.apiKey);
    } catch {
      console.error('[web-search] could not decrypt the Serper key (check CONFIG_ENCRYPTION_KEY)');
    }
  }
  return {
    enabled: doc?.enabled ?? DEFAULT_WEB_SEARCH.enabled,
    apiKey,
    perDevicePerDay: doc?.perDevicePerDay ?? DEFAULT_WEB_SEARCH.perDevicePerDay,
    globalPerDay: doc?.globalPerDay ?? DEFAULT_WEB_SEARCH.globalPerDay,
  };
};

export const searchWeb = async (rawQuery: string, who: { deviceId?: string; ip: string }): Promise<WebSearchOutcome> => {
  const query = rawQuery.replace(/\s+/g, ' ').trim().slice(0, 100);
  // Never send a blocked search to the internet
  if (!checkQuerySafety(`${query} ${toEnglishQuery(query)}`).allowed) return { data: null, reason: 'blocked' };

  const cacheKey = `web:v1:${query.toLowerCase()}`;
  const cached = await SearchCache.findOne({ key: cacheKey }).lean();
  if (cached) return { data: cached.result as WebSearchData };

  const settings = await loadSettings();
  if (!settings.enabled) return { data: null, reason: 'disabled' };
  if (!settings.apiKey) return { data: null, reason: 'not_configured' };

  const day = today();
  if ((await readCounter(`websearch:global:${day}`)) >= settings.globalPerDay) return { data: null, reason: 'limit' };
  const [deviceCount, ipCount] = await Promise.all([
    who.deviceId ? incrementCounter(`websearch:device:${who.deviceId}:${day}`, DAILY_TTL_MS) : Promise.resolve(0),
    incrementCounter(`websearch:ip:${who.ip}:${day}`, DAILY_TTL_MS),
  ]);
  if (deviceCount > settings.perDevicePerDay || ipCount > PER_IP_PER_DAY) return { data: null, reason: 'limit' };

  try {
    await incrementCounter(`websearch:global:${day}`, DAILY_TTL_MS);
    const data = shapeWebResults(await fetchSerper(settings.apiKey, query));
    const empty = data.results.length === 0 && !data.knowledge;
    await SearchCache.updateOne(
      { key: cacheKey },
      { $set: { result: data, expiresAt: new Date(Date.now() + (empty ? EMPTY_TTL_MS : CACHE_TTL_MS)) } },
      { upsert: true }
    ).catch(() => {});
    return { data };
  } catch (error) {
    console.error('[web-search] failed:', error instanceof Error ? error.message : error);
    return { data: null, reason: 'unavailable' };
  }
};

/** Admin "Test" button: one live search with the saved key (uses one Serper credit) */
export const testWebSearchKey = async (): Promise<{ ok: boolean; message: string; count?: number; firstTitle?: string; ms?: number }> => {
  const settings = await loadSettings();
  if (!settings.apiKey) return { ok: false, message: 'No API key saved yet.' };
  const started = Date.now();
  try {
    const data = shapeWebResults(await fetchSerper(settings.apiKey, 'paracetamol tablet uses'));
    return {
      ok: true,
      message: 'Serper is working.',
      count: data.results.length,
      firstTitle: data.results[0]?.title ?? '',
      ms: Date.now() - started,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Test failed.' };
  }
};

export const webSearchUsedToday = () => readCounter(`websearch:global:${today()}`);
