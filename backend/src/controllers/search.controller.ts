import { Request, Response } from 'express';
import { z } from 'zod';
import { runSearch, QUERY_MAX_LENGTH } from '../services/search/searchService.js';
import { getAiAnswer } from '../services/search/aiAnswer.js';
import { readMedicineNamesFromPhoto } from '../services/search/photoReader.js';
import { searchWeb } from '../services/search/webSearch.js';
import { getAiSettings } from '../services/ai/configStore.js';
import { WebSearchSettings } from '../models/WebSearchSettings.js';
import { DAILY_TTL_MS, getClientIp, getDeviceId, incrementCounter, today } from '../services/rateLimit.js';

const SearchQuery = z.object({
  q: z.string().trim().min(2, 'Please type at least 2 letters.').max(QUERY_MAX_LENGTH, 'Search is too long.'),
  mode: z.enum(['all', 'medicine']).default('all'),
  // Salt printed on a photographed pack (camera search), e.g. "Paracetamol"
  generic: z.string().trim().max(QUERY_MAX_LENGTH).optional(),
});

const whoIs = (req: Request) => ({ deviceId: getDeviceId(req), ip: getClientIp(req) });

const overLimit = async (req: Request, kind: string, deviceLimit: number, ipLimit: number): Promise<boolean> => {
  const day = today();
  const deviceId = getDeviceId(req);
  const [deviceCount, ipCount] = await Promise.all([
    deviceId ? incrementCounter(`${kind}:device:${deviceId}:${day}`, DAILY_TTL_MS) : Promise.resolve(0),
    incrementCounter(`${kind}:ip:${getClientIp(req)}:${day}`, DAILY_TTL_MS),
  ]);
  return deviceCount > deviceLimit || ipCount > ipLimit;
};

/**
 * @route GET /api/search?q=&mode=all|medicine
 * @access Public (mobile app), CDN-cached, limited per device/IP
 */
export const search = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = SearchQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ status: 'error', message: parsed.error.issues[0]?.message ?? 'Invalid search.' });
      return;
    }
    if (await overLimit(req, 'search', 200, 800)) {
      res.status(429).json({ status: 'error', message: 'Too many searches today. Please try again tomorrow.' });
      return;
    }
    const { q, mode, generic } = parsed.data;
    res.json({ status: 'success', data: await runSearch(q, mode, { generic, who: whoIs(req) }) });
  } catch (error) {
    console.error('[search] error:', error instanceof Error ? error.message : error);
    res.status(500).json({ status: 'error', message: 'Search failed. Please try again.' });
  }
};

/**
 * @route GET /api/search/ai?q=&mode=all|medicine
 * @access Public (mobile app). A short AI answer built only from the search's own sources.
 * Answers are cached per query; new answers are limited per device, IP and day.
 */
export const searchAi = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = SearchQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ status: 'error', message: parsed.error.issues[0]?.message ?? 'Invalid search.' });
      return;
    }
    if (await overLimit(req, 'searchai-req', 200, 800)) {
      res.set('Cache-Control', 'no-store');
      res.json({ status: 'success', data: { answer: null, reason: 'limit' } });
      return;
    }
    const { q, mode, generic } = parsed.data;
    const results = await runSearch(q, mode, { generic, who: whoIs(req) });
    // Internet results (usually already cached by /search/web) are sources for the summary too
    const web = results.blocked ? null : (await searchWeb(q, whoIs(req))).data;
    const outcome = await getAiAnswer(results, mode, whoIs(req), web);
    // Only real answers are shared through the CDN; "no answer" may change on the next try
    res.set(
      'Cache-Control',
      outcome.answer ? 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600' : 'no-store'
    );
    res.json({ status: 'success', data: { answer: outcome.answer, reason: outcome.reason ?? null } });
  } catch (error) {
    console.error('[search] ai error:', error instanceof Error ? error.message : error);
    res.set('Cache-Control', 'no-store');
    res.json({ status: 'success', data: { answer: null, reason: 'unavailable' } });
  }
};

/**
 * @route GET /api/search/web?q=
 * @access Public (mobile app). Google results through Serper: health results only,
 * trusted health and pharmacy sites first. Cached per query; limited per device, IP and day.
 */
export const searchWebResults = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = SearchQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ status: 'error', message: parsed.error.issues[0]?.message ?? 'Invalid search.' });
      return;
    }
    if (await overLimit(req, 'web-req', 200, 800)) {
      res.set('Cache-Control', 'no-store');
      res.json({ status: 'success', data: { enabled: true, results: [], knowledge: null, reason: 'limit' } });
      return;
    }
    const outcome = await searchWeb(parsed.data.q, whoIs(req));
    const hasResults = Boolean(outcome.data && (outcome.data.results.length || outcome.data.knowledge));
    res.set('Cache-Control', hasResults ? 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600' : 'no-store');
    res.json({
      status: 'success',
      data: {
        enabled: outcome.reason !== 'disabled' && outcome.reason !== 'not_configured',
        results: outcome.data?.results ?? [],
        knowledge: outcome.data?.knowledge ?? null,
        reason: outcome.reason ?? null,
      },
    });
  } catch (error) {
    console.error('[search] web error:', error instanceof Error ? error.message : error);
    res.set('Cache-Control', 'no-store');
    res.json({ status: 'success', data: { enabled: true, results: [], knowledge: null, reason: 'unavailable' } });
  }
};

const ImageBody = z.object({
  // base64 JPEG/PNG, at most ~3 MB of image data
  image: z.string().min(100).max(4_200_000),
});

/**
 * @route POST /api/search/image  { image: base64 }
 * @access Public (mobile app), limited per device/IP. Returns likely medicine names.
 */
export const searchImage = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = ImageBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ status: 'error', message: 'Please take a clear photo of the medicine strip or box.' });
      return;
    }
    if (await overLimit(req, 'ocr', 30, 120)) {
      res.status(429).json({ status: 'error', message: 'Too many photo searches today. Please try again tomorrow.' });
      return;
    }
    const base64 = parsed.data.image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50;
    if (!isJpeg && !isPng) {
      res.status(400).json({ status: 'error', message: 'Please use a JPG or PNG photo.' });
      return;
    }
    const outcome = await readMedicineNamesFromPhoto(buffer, isPng ? 'image/png' : 'image/jpeg', whoIs(req));
    const messages: Record<string, string> = {
      not_found: 'Could not read a medicine name. Take a clear, close photo of the name on the strip or box.',
      limit: 'You have used photo search a lot today. Please type the medicine name instead.',
      disabled: 'Photo search is not available right now. Please type the medicine name.',
      unavailable: 'Could not read the photo right now. Please try again or type the medicine name.',
    };
    res.json({
      status: 'success',
      data: {
        candidates: outcome.candidates,
        brand: outcome.brand,
        generics: outcome.generics,
        strength: outcome.strength,
        message: outcome.candidates.length ? 'Tap the medicine name we read from your photo.' : messages[outcome.reason ?? 'not_found'],
      },
    });
  } catch (error) {
    console.error('[search] image error:', error instanceof Error ? error.message : error);
    res.status(500).json({ status: 'error', message: 'Could not read the photo. Please try again.' });
  }
};

/**
 * @desc    Which search features the app should show (set in admin Settings > Search)
 * @route   GET /api/search/config
 * @access  Public (Mobile App); no models, keys or limits are included
 */
export const searchConfig = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [settings, web] = await Promise.all([getAiSettings(), WebSearchSettings.findOne({ key: 'global' }).select('+apiKey enabled').lean()]);
    res.json({
      status: 'success',
      data: {
        aiAnswer: settings.searchAiEnabled,
        internet: Boolean(web?.enabled !== false && web?.apiKey),
        photo: settings.photoAiEnabled,
        voice: settings.voiceSearchEnabled,
        voiceLanguage: settings.voiceSearchLanguage,
      },
    });
  } catch (error) {
    console.error('[search] config failed:', error instanceof Error ? error.message : error);
    res.status(500).json({ status: 'error', message: 'Something went wrong.' });
  }
};
