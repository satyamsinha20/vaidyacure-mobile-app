import { Request, Response } from 'express';
import { z } from 'zod';
import { runSearch, QUERY_MAX_LENGTH } from '../services/search/searchService.js';
import { readMedicineText } from '../services/search/ocr.js';
import { isUnsafeText } from '../services/search/safety.js';
import { DAILY_TTL_MS, getClientIp, getDeviceId, incrementCounter, today } from '../services/rateLimit.js';

const SearchQuery = z.object({
  q: z.string().trim().min(2, 'Please type at least 2 letters.').max(QUERY_MAX_LENGTH, 'Search is too long.'),
  mode: z.enum(['all', 'medicine']).default('all'),
});

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
    res.json({ status: 'success', data: await runSearch(parsed.data.q, parsed.data.mode) });
  } catch (error) {
    console.error('[search] error:', error instanceof Error ? error.message : error);
    res.status(500).json({ status: 'error', message: 'Search failed. Please try again.' });
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
    const { candidates } = await readMedicineText(buffer);
    const safe = candidates.filter((c) => !isUnsafeText(c));
    res.json({
      status: 'success',
      data: {
        candidates: safe,
        message: safe.length
          ? 'Tap the medicine name we read from your photo.'
          : 'Could not read a medicine name. Take a clear, close photo of the name on the strip or box.',
      },
    });
  } catch (error) {
    console.error('[search] image error:', error instanceof Error ? error.message : error);
    res.status(500).json({ status: 'error', message: 'Could not read the photo. Please try again.' });
  }
};
