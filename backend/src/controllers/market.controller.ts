import type { Request, Response } from 'express';
import { MarketplaceSettings } from '../models/MarketplaceSettings.js';
import { isDateKey, istDateKey } from '../utils/time.js';
import { safeEqualHex, sha256 } from '../utils/secretBox.js';
import { AppError, objectIdParam, parseInput, route } from '../services/http.js';
import { doctorSlots, listBookableDoctors } from '../services/marketplace/doctors.js';
import { getMarketplaceSettings } from '../services/marketplace/settings.js';
import { runDueWork } from '../services/marketplace/tick.js';

/* -------------------------------------------------------------------------- */
/* PUBLIC: real doctors in the app (/api/market)                              */
/* -------------------------------------------------------------------------- */
export const listDoctors = route(async (_req: Request, res: Response) => {
  res.json({ status: 'success', data: await listBookableDoctors() });
});

export const getSlots = route(async (req: Request, res: Response) => {
  const id = parseInput(objectIdParam, req.params.id);
  const date = typeof req.query.date === 'string' && isDateKey(req.query.date) ? req.query.date : istDateKey();
  res.json({ status: 'success', data: await doctorSlots(id, date) });
});

/** Booking rules shown in the app before paying */
export const getInfo = route(async (_req: Request, res: Response) => {
  const s = await getMarketplaceSettings();
  res.json({
    status: 'success',
    data: {
      payTo: { upiId: s.upiId, upiName: s.upiName },
      commissionPercent: s.commissionPercent,
      paymentWindowMinutes: s.paymentWindowMinutes,
      minLeadMinutes: s.minLeadMinutes,
      bookingDaysAhead: s.bookingDaysAhead,
      doctorJoinMinutes: s.doctorJoinMinutes,
      patientReplyMinutes: s.patientReplyMinutes,
      patientNoShowKeepPercent: s.patientNoShowKeepPercent,
      followUpHours: s.followUpHours,
      followUpFreeCount: s.followUpFreeCount,
      refundHours: s.refundHours,
    },
  });
});

/* -------------------------------------------------------------------------- */
/* CRON: GET/POST /api/cron/tick                                              */
/* -------------------------------------------------------------------------- */
/**
 * For an external cron service (e.g. cron-job.org every minute), using the
 * secret URL from the admin panel (?key=...), or Vercel Cron with the
 * CRON_SECRET env var (sent as "Authorization: Bearer <secret>").
 */
export const cronTick = route(async (req: Request, res: Response) => {
  const envSecret = process.env.CRON_SECRET?.trim();
  const header = req.headers.authorization;
  const byHeader = Boolean(envSecret && envSecret.length >= 16 && header === `Bearer ${envSecret}`);
  let byKey = false;
  const key = typeof req.query.key === 'string' ? req.query.key : '';
  if (!byHeader && /^[a-f0-9]{48}$/.test(key)) {
    const stored = await MarketplaceSettings.findOne({ key: 'global' }).select('+cronKeyHash').lean();
    byKey = Boolean(stored?.cronKeyHash && safeEqualHex(stored.cronKeyHash, sha256(key)));
  }
  if (!byHeader && !byKey) throw new AppError(401, 'Unauthorized.');
  res.set('Cache-Control', 'no-store');
  res.json({ status: 'success', data: await runDueWork() });
});
