import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { Feedback } from '../models/Feedback.js';
import { Ad } from '../models/Ad.js';
import { AdSettings } from '../models/AdSettings.js';
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

/* One feedback per week per phone AND per network, so reinstalling the app doesn't allow another */
const FEEDBACK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** IPv4 as is; IPv6 by its /64 network (one home connection or one phone), since the rest of the address changes */
const networkOf = (ip: string): string => {
  const clean = ip.trim().toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  const mappedV4 = clean.match(/^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mappedV4) return mappedV4[1];
  if (!clean.includes(':')) return clean;
  const [head, tail = ''] = clean.split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = tail ? tail.split(':') : [];
  const missing = clean.includes('::') ? Math.max(0, 8 - headParts.length - tailParts.length) : 0;
  const groups = [...headParts, ...Array(missing).fill('0'), ...tailParts].map((g) => g.padStart(4, '0'));
  return `${groups.slice(0, 4).join(':')}::/64`;
};

const feedbackIdentity = (req: Request) => {
  const deviceId = getDeviceId(req);
  // A phone id that survives reinstalling the app (Android ID / iOS Keychain), sent by the app
  const rawKey = req.headers['x-device-key'];
  const deviceKey = typeof rawKey === 'string' ? rawKey.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 128) : '';
  return {
    deviceHash: deviceId ? sha256(deviceId).slice(0, 16) : '',
    deviceKeyHash: deviceKey.length >= 8 ? sha256(`device-key:${deviceKey}`).slice(0, 24) : '',
    ipHash: sha256(`network:${networkOf(getClientIp(req))}`).slice(0, 24),
  };
};

/** When this phone or network may send feedback again, or null if it may now */
const nextFeedbackAllowedAt = async (identity: ReturnType<typeof feedbackIdentity>): Promise<Date | null> => {
  const matches: Record<string, string>[] = [{ ipHash: identity.ipHash }];
  if (identity.deviceHash) matches.push({ deviceHash: identity.deviceHash });
  if (identity.deviceKeyHash) matches.push({ deviceKeyHash: identity.deviceKeyHash });
  const last = await Feedback.findOne({ createdAt: { $gte: new Date(Date.now() - FEEDBACK_WINDOW_MS) }, $or: matches })
    .sort({ createdAt: -1 })
    .select('createdAt')
    .lean();
  return last ? new Date(new Date(last.createdAt).getTime() + FEEDBACK_WINDOW_MS) : null;
};

const indiaDateLabel = (date: Date) =>
  date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });

/** @route GET /api/app/feedback/status  - can this phone/network send feedback now? */
export const feedbackStatus = handle(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const next = await nextFeedbackAllowedAt(feedbackIdentity(req));
  res.json({
    status: 'success',
    data: { canSubmit: !next, nextAllowedAt: next, nextAllowedLabel: next ? indiaDateLabel(next) : null },
  });
});

/** @route POST /api/app/feedback  (public, one per phone and network per week) */
export const submitFeedback = handle(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const deviceId = getDeviceId(req);
  if (!deviceId) throw new InputError('Please update the app and try again.');
  const input = parse(FeedbackInput, req.body);
  const identity = feedbackIdentity(req);

  // Two taps at the same moment must not save two entries
  const lockKey = `feedback:lock:${identity.ipHash}:${Math.floor(Date.now() / 10_000)}`;
  if ((await incrementCounter(lockKey, 60_000)) > 1) {
    res.status(429).json({ status: 'error', code: 'busy', message: 'Please wait a moment and try again.' });
    return;
  }

  const next = await nextFeedbackAllowedAt(identity);
  if (next) {
    res.status(429).json({
      status: 'error',
      code: 'weekly_limit',
      message: `You have already sent feedback this week. You can send feedback again on ${indiaDateLabel(next)}.`,
      data: { nextAllowedAt: next, nextAllowedLabel: indiaDateLabel(next) },
    });
    return;
  }

  await Feedback.create({
    rating: input.rating,
    message: input.message,
    ...identity,
    platform: input.platform ?? '',
    appVersion: input.appVersion ?? '',
  });
  const allowedAgain = new Date(Date.now() + FEEDBACK_WINDOW_MS);
  res.status(201).json({
    status: 'success',
    message: 'Thank you for your feedback!',
    data: { nextAllowedAt: allowedAgain, nextAllowedLabel: indiaDateLabel(allowedAgain) },
  });
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

/** The home carousel always has three slides; empty ones invite brands to advertise */
const CAROUSEL_SLOTS = 3;

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
    slot: z.number().int().min(1).max(CAROUSEL_SLOTS).default(1),
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
  slot: a.slot ?? 1,
  impressions: a.impressions,
  clicks: a.clicks,
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
});

const publicAdView = (a: any) => ({
  id: String(a._id),
  slot: a.slot ?? 1,
  title: a.title,
  subtitle: a.subtitle,
  imageUrl: a.imageUrl,
  actionType: a.actionType,
  actionValue: a.actionValue,
});

/** The ad shown in each slot: the newest running ad assigned to it, or null */
const liveAdsBySlot = async () => {
  const now = new Date();
  const running = await Ad.find({
    isActive: true,
    $and: [{ $or: [{ startAt: null }, { startAt: { $lte: now } }] }, { $or: [{ endAt: null }, { endAt: { $gte: now } }] }],
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  return Array.from({ length: CAROUSEL_SLOTS }, (_, i) => running.find((a) => (a.slot ?? 1) === i + 1) ?? null);
};

const AdContactInput = z
  .object({
    contactType: z.enum(['none', 'phone', 'whatsapp', 'email']),
    contactValue: z.string().trim().max(120).default(''),
  })
  .superRefine((c, ctx) => {
    if ((c.contactType === 'phone' || c.contactType === 'whatsapp') && !/^\+?\d{10,13}$/.test(c.contactValue.replace(/[\s-]/g, ''))) {
      ctx.addIssue({ code: 'custom', path: ['contactValue'], message: 'Enter a valid phone number (10 digits, optional +91).' });
    }
    if (c.contactType === 'email' && !z.string().email().safeParse(c.contactValue).success) {
      ctx.addIssue({ code: 'custom', path: ['contactValue'], message: 'Enter a valid email address.' });
    }
  });

const getAdContact = async () => {
  const s = await AdSettings.findOne({ key: 'global' }).lean();
  return { contactType: s?.contactType ?? 'none', contactValue: s?.contactValue ?? '' };
};

/** @route GET /api/app/carousel  (public, CDN-cached) - three slides plus the advertising contact */
export const carousel = handle(async (_req, res) => {
  const [slots, contact] = await Promise.all([liveAdsBySlot(), getAdContact()]);
  res.json({
    status: 'success',
    data: {
      slots: slots.map((a) => (a ? publicAdView(a) : null)),
      contact: contact.contactType === 'none' ? null : { type: contact.contactType, value: contact.contactValue },
    },
  });
});

/** @route GET /api/app/ads  (public, CDN-cached) - kept for older app builds */
export const activeAds = handle(async (_req, res) => {
  const slots = await liveAdsBySlot();
  res.json({ status: 'success', data: slots.filter(Boolean).map(publicAdView) });
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

/** @route GET /api/admin/content/ads - every ad, which one each slot shows, and the advertising contact */
export const listAds = handle(async (_req, res) => {
  const [ads, live, contact] = await Promise.all([
    Ad.find().sort({ slot: 1, createdAt: -1 }).lean(),
    liveAdsBySlot(),
    getAdContact(),
  ]);
  res.json({
    status: 'success',
    data: { items: ads.map(adView), liveIds: live.map((a) => (a ? String(a._id) : null)), contact },
  });
});

/** @route PUT /api/admin/content/ads-settings {contactType, contactValue} */
export const updateAdSettings = handle(async (req, res) => {
  const input = parse(AdContactInput, req.body);
  const contactValue =
    input.contactType === 'none' ? '' : input.contactType === 'email' ? input.contactValue : input.contactValue.replace(/[\s-]/g, '');
  await AdSettings.updateOne({ key: 'global' }, { $set: { contactType: input.contactType, contactValue } }, { upsert: true });
  res.json({ status: 'success', data: { contactType: input.contactType, contactValue } });
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
const latestNotificationItems = async () => {
  const items = await AppNotification.find().sort({ createdAt: -1 }).limit(30).lean();
  return items.map((n) => ({
    id: String(n._id),
    type: n.type,
    title: n.title,
    body: n.body,
    category: n.category,
    remedyId: n.remedyId ? String(n.remedyId) : null,
    createdAt: n.createdAt,
  }));
};

/** @route GET /api/app/notifications  (public, CDN-cached; latest 30) */
export const latestNotifications = handle(async (_req, res) => {
  res.json({ status: 'success', data: await latestNotificationItems() });
});

export const deleteNotification = handle(async (req, res) => {
  const id = parse(objectId, req.params.id);
  await AppNotification.findByIdAndDelete(id);
  res.json({ status: 'success', message: 'Notification removed.' });
});

/* -------------------------------------------------------------------------- */
/* HOME SCREEN (one request for everything the home screen shows)              */
/* -------------------------------------------------------------------------- */
/** @route GET /api/app/home  (public, CDN-cached for a few seconds so admin changes appear almost at once) */
export const homeContent = handle(async (_req, res) => {
  const date = indiaDate();
  const [tip, slots, contact, notifications] = await Promise.all([
    pickTipFor(date),
    liveAdsBySlot(),
    getAdContact(),
    latestNotificationItems(),
  ]);
  res.json({
    status: 'success',
    data: {
      tip: tip ? { title: tip.title, text: tip.text, category: tip.category, date } : null,
      carousel: {
        slots: slots.map((a) => (a ? publicAdView(a) : null)),
        contact: contact.contactType === 'none' ? null : { type: contact.contactType, value: contact.contactValue },
      },
      notifications,
    },
  });
});

