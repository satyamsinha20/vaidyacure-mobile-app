import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { Feedback } from '../models/Feedback.js';
import { Ad } from '../models/Ad.js';
import { WellnessTip } from '../models/WellnessTip.js';
import { AppNotification } from '../models/AppNotification.js';
import { DAILY_TTL_MS, getClientIp, getDeviceId, incrementCounter, today } from '../services/rateLimit.js';
import { sha256 } from '../utils/secretBox.js';

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */
class InputError extends Error {}

const handle =
  (fn: (req: AuthenticatedRequest, res: Response) => Promise<void>) =>
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error instanceof InputError) {
        res.status(400).json({ status: 'error', message: error.message });
        return;
      }
      console.error('[content] error:', error instanceof Error ? error.message : error);
      res.status(500).json({ status: 'error', message: 'Something went wrong. Please try again.' });
    }
  };

const parse = <T extends z.ZodType>(schema: T, body: unknown): z.infer<T> => {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new InputError(issue ? `${issue.path.join('.') || 'input'}: ${issue.message}` : 'Invalid input.');
  }
  return result.data;
};

const objectId = z.string().refine((v) => mongoose.isValidObjectId(v), 'Invalid id');

/** Today's date in India (YYYY-MM-DD), so the daily tip changes at Indian midnight */
const indiaDate = (): string => new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

/* -------------------------------------------------------------------------- */
/* FEEDBACK                                                                   */
/* -------------------------------------------------------------------------- */
const FeedbackInput = z.object({
  rating: z.enum(['excellent', 'good', 'average', 'poor']),
  message: z.string().trim().max(1000).default(''),
  platform: z.string().trim().max(20).optional(),
  appVersion: z.string().trim().max(20).optional(),
});

/** @route POST /api/app/feedback  (public, limited per device and IP) */
export const submitFeedback = handle(async (req, res) => {
  const deviceId = getDeviceId(req);
  if (!deviceId) throw new InputError('Please update the app and try again.');
  const input = parse(FeedbackInput, req.body);

  const day = today();
  const [deviceCount, ipCount] = await Promise.all([
    incrementCounter(`feedback:device:${deviceId}:${day}`, DAILY_TTL_MS),
    incrementCounter(`feedback:ip:${getClientIp(req)}:${day}`, DAILY_TTL_MS),
  ]);
  if (deviceCount > 5 || ipCount > 30) {
    res.status(429).json({ status: 'error', message: 'Thank you! You have already sent feedback today.' });
    return;
  }

  await Feedback.create({
    rating: input.rating,
    message: input.message,
    deviceHash: sha256(deviceId).slice(0, 16),
    platform: input.platform ?? '',
    appVersion: input.appVersion ?? '',
  });
  res.status(201).json({ status: 'success', message: 'Thank you for your feedback!' });
});

/** @route GET /api/admin/content/feedback?status=&rating=&page= */
export const listFeedback = handle(async (req, res) => {
  const filter: Record<string, string> = {};
  const status = String(req.query.status ?? '');
  const rating = String(req.query.rating ?? '');
  if (['new', 'read', 'resolved'].includes(status)) filter.status = status;
  if (['excellent', 'good', 'average', 'poor'].includes(rating)) filter.rating = rating;
  const page = Math.max(1, Math.min(1000, Number(req.query.page) || 1));
  const limit = 25;

  const [items, total, counts] = await Promise.all([
    Feedback.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Feedback.countDocuments(filter),
    Feedback.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  const byStatus = Object.fromEntries(counts.map((c) => [c._id, c.n]));
  res.json({
    status: 'success',
    data: {
      items: items.map((f) => ({
        id: String(f._id),
        rating: f.rating,
        message: f.message,
        platform: f.platform,
        appVersion: f.appVersion,
        status: f.status,
        createdAt: f.createdAt,
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      counts: { new: byStatus.new ?? 0, read: byStatus.read ?? 0, resolved: byStatus.resolved ?? 0 },
    },
  });
});

/** @route GET /api/admin/content/feedback/summary  (new feedback count for the bell) */
export const feedbackSummary = handle(async (_req, res) => {
  res.json({ status: 'success', data: { newCount: await Feedback.countDocuments({ status: 'new' }) } });
});

export const updateFeedbackStatus = handle(async (req, res) => {
  const id = parse(objectId, req.params.id);
  const { status } = parse(z.object({ status: z.enum(['new', 'read', 'resolved']) }), req.body);
  const updated = await Feedback.findByIdAndUpdate(id, { $set: { status } }, { new: true }).lean();
  if (!updated) {
    res.status(404).json({ status: 'error', message: 'Feedback not found.' });
    return;
  }
  res.json({ status: 'success', data: { id, status } });
});

export const deleteFeedback = handle(async (req, res) => {
  const id = parse(objectId, req.params.id);
  await Feedback.findByIdAndDelete(id);
  res.json({ status: 'success', message: 'Feedback deleted.' });
});

/* -------------------------------------------------------------------------- */
/* ADS (home carousel)                                                        */
/* -------------------------------------------------------------------------- */
const optionalDate = z
  .string()
  .trim()
  .nullable()
  .optional()
  .refine((v) => !v || !Number.isNaN(new Date(v).getTime()), 'Invalid date');

const AdInput = z
  .object({
    clientName: z.string().trim().min(2).max(80),
    title: z.string().trim().max(80).default(''),
    subtitle: z.string().trim().max(140).default(''),
    imageUrl: z.string().trim().url().max(500).refine((u) => u.startsWith('https://'), 'Image URL must start with https://'),
    actionType: z.enum(['none', 'url', 'phone', 'whatsapp']).default('none'),
    actionValue: z.string().trim().max(300).default(''),
    startAt: optionalDate,
    endAt: optionalDate,
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(1000).default(0),
  })
  .superRefine((ad, ctx) => {
    const v = ad.actionValue;
    if (ad.actionType === 'url' && !/^https:\/\/[^\s]+$/.test(v)) {
      ctx.addIssue({ code: 'custom', path: ['actionValue'], message: 'Website link must start with https://' });
    }
    if ((ad.actionType === 'phone' || ad.actionType === 'whatsapp') && !/^\+?\d{10,13}$/.test(v.replace(/[\s-]/g, ''))) {
      ctx.addIssue({ code: 'custom', path: ['actionValue'], message: 'Enter a valid phone number (10 digits, optional +91).' });
    }
    if (ad.startAt && ad.endAt && new Date(ad.endAt) < new Date(ad.startAt)) {
      ctx.addIssue({ code: 'custom', path: ['endAt'], message: 'End date must be after the start date.' });
    }
  });

const adFields = (input: z.infer<typeof AdInput>) => ({
  ...input,
  actionValue: input.actionType === 'none' ? '' : input.actionType === 'url' ? input.actionValue : input.actionValue.replace(/[\s-]/g, ''),
  startAt: input.startAt ? new Date(input.startAt) : null,
  endAt: input.endAt ? new Date(input.endAt) : null,
});

const adView = (a: any) => ({
  id: String(a._id),
  clientName: a.clientName,
  title: a.title,
  subtitle: a.subtitle,
  imageUrl: a.imageUrl,
  actionType: a.actionType,
  actionValue: a.actionValue,
  startAt: a.startAt,
  endAt: a.endAt,
  isActive: a.isActive,
  sortOrder: a.sortOrder,
  impressions: a.impressions,
  clicks: a.clicks,
  updatedAt: a.updatedAt,
});

/** @route GET /api/app/ads  (public, CDN-cached) - only what the app needs */
export const activeAds = handle(async (_req, res) => {
  const now = new Date();
  const ads = await Ad.find({
    isActive: true,
    $and: [{ $or: [{ startAt: null }, { startAt: { $lte: now } }] }, { $or: [{ endAt: null }, { endAt: { $gte: now } }] }],
  })
    .sort({ sortOrder: 1, createdAt: -1 })
    .limit(10)
    .lean();
  res.json({
    status: 'success',
    data: ads.map((a) => ({
      id: String(a._id),
      title: a.title,
      subtitle: a.subtitle,
      imageUrl: a.imageUrl,
      actionType: a.actionType,
      actionValue: a.actionValue,
    })),
  });
});

/** @route POST /api/app/ads/:id/event {type}  - one impression and a few clicks per device per day */
export const recordAdEvent = handle(async (req, res) => {
  const id = parse(objectId, req.params.id);
  const { type } = parse(z.object({ type: z.enum(['impression', 'click']) }), req.body);
  const deviceId = getDeviceId(req);
  if (!deviceId) {
    res.status(204).end();
    return;
  }
  const count = await incrementCounter(`ad:${type}:${id}:${deviceId}:${today()}`, DAILY_TTL_MS);
  const limit = type === 'impression' ? 1 : 3;
  if (count <= limit) {
    await Ad.updateOne({ _id: id }, { $inc: type === 'impression' ? { impressions: 1 } : { clicks: 1 } });
  }
  res.status(204).end();
});

export const listAds = handle(async (_req, res) => {
  const ads = await Ad.find().sort({ sortOrder: 1, createdAt: -1 }).lean();
  res.json({ status: 'success', data: ads.map(adView) });
});

export const createAd = handle(async (req, res) => {
  const ad = await Ad.create(adFields(parse(AdInput, req.body)));
  res.status(201).json({ status: 'success', data: adView(ad.toObject()) });
});

export const updateAd = handle(async (req, res) => {
  const id = parse(objectId, req.params.id);
  const ad = await Ad.findByIdAndUpdate(id, { $set: adFields(parse(AdInput, req.body)) }, { new: true, runValidators: true }).lean();
  if (!ad) {
    res.status(404).json({ status: 'error', message: 'Ad not found.' });
    return;
  }
  res.json({ status: 'success', data: adView(ad) });
});

export const deleteAd = handle(async (req, res) => {
  const id = parse(objectId, req.params.id);
  await Ad.findByIdAndDelete(id);
  res.json({ status: 'success', message: 'Ad deleted.' });
});

/* -------------------------------------------------------------------------- */
/* DAILY WELLNESS TIP                                                         */
/* -------------------------------------------------------------------------- */
const TipInput = z.object({
  title: z.string().trim().max(60).default('Daily Wellness Tip'),
  text: z.string().trim().min(5).max(400),
  category: z.string().trim().max(40).default(''),
  scheduledFor: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-12-31')
    .nullable()
    .optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10000).default(0),
});

const tipView = (t: any) => ({
  id: String(t._id),
  title: t.title,
  text: t.text,
  category: t.category,
  scheduledFor: t.scheduledFor,
  isActive: t.isActive,
  sortOrder: t.sortOrder,
  updatedAt: t.updatedAt,
});

/** A tip scheduled for the date wins; otherwise unscheduled tips rotate one per day */
const pickTipFor = async (date: string) => {
  const scheduled = await WellnessTip.findOne({ isActive: true, scheduledFor: date }).lean();
  if (scheduled) return scheduled;
  const pool = await WellnessTip.find({ isActive: true, scheduledFor: null }).sort({ sortOrder: 1, createdAt: 1 }).lean();
  if (!pool.length) return null;
  const dayNumber = Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 86_400_000);
  return pool[dayNumber % pool.length];
};

/** @route GET /api/app/wellness-tip  (public, CDN-cached) */
export const todaysTip = handle(async (_req, res) => {
  const date = indiaDate();
  const tip = await pickTipFor(date);
  res.json({
    status: 'success',
    data: tip ? { title: tip.title, text: tip.text, category: tip.category, date } : null,
  });
});

export const listTips = handle(async (_req, res) => {
  const date = indiaDate();
  const [tips, current] = await Promise.all([
    WellnessTip.find().sort({ scheduledFor: -1, sortOrder: 1, createdAt: 1 }).lean(),
    pickTipFor(date),
  ]);
  res.json({
    status: 'success',
    data: { today: date, todayTipId: current ? String(current._id) : null, items: tips.map(tipView) },
  });
});

export const createTip = handle(async (req, res) => {
  const input = parse(TipInput, req.body);
  const tip = await WellnessTip.create({ ...input, scheduledFor: input.scheduledFor || null });
  res.status(201).json({ status: 'success', data: tipView(tip.toObject()) });
});

export const updateTip = handle(async (req, res) => {
  const id = parse(objectId, req.params.id);
  const input = parse(TipInput, req.body);
  const tip = await WellnessTip.findByIdAndUpdate(
    id,
    { $set: { ...input, scheduledFor: input.scheduledFor || null } },
    { new: true, runValidators: true }
  ).lean();
  if (!tip) {
    res.status(404).json({ status: 'error', message: 'Tip not found.' });
    return;
  }
  res.json({ status: 'success', data: tipView(tip) });
});

export const deleteTip = handle(async (req, res) => {
  const id = parse(objectId, req.params.id);
  await WellnessTip.findByIdAndDelete(id);
  res.json({ status: 'success', message: 'Tip deleted.' });
});

/* -------------------------------------------------------------------------- */
/* APP NOTIFICATIONS                                                          */
/* -------------------------------------------------------------------------- */
/** @route GET /api/app/notifications  (public, CDN-cached; latest 30) */
export const latestNotifications = handle(async (_req, res) => {
  const items = await AppNotification.find().sort({ createdAt: -1 }).limit(30).lean();
  res.json({
    status: 'success',
    data: items.map((n) => ({
      id: String(n._id),
      type: n.type,
      title: n.title,
      body: n.body,
      category: n.category,
      remedyId: n.remedyId ? String(n.remedyId) : null,
      createdAt: n.createdAt,
    })),
  });
});

export const deleteNotification = handle(async (req, res) => {
  const id = parse(objectId, req.params.id);
  await AppNotification.findByIdAndDelete(id);
  res.json({ status: 'success', message: 'Notification removed.' });
});

