import { Request } from 'express';
import { UsageCounter } from '../models/UsageCounter.js';

/**
 * MongoDB-backed counters: they work across serverless instances, unlike
 * in-memory rate limiters. Documents expire automatically (TTL index).
 */
export const incrementCounter = async (key: string, ttlMs: number): Promise<number> => {
  const update = { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(Date.now() + ttlMs) } };
  try {
    const doc = await UsageCounter.findOneAndUpdate({ key }, update, { upsert: true, new: true }).lean();
    return doc?.count ?? 1;
  } catch (error: any) {
    // Two concurrent upserts can race on the unique key: the retry updates the existing document
    if (error?.code === 11000) {
      const doc = await UsageCounter.findOneAndUpdate({ key }, update, { new: true }).lean();
      return doc?.count ?? 1;
    }
    throw error;
  }
};

export const readCounter = async (key: string): Promise<number> => {
  const doc = await UsageCounter.findOne({ key }).lean();
  return doc?.count ?? 0;
};

export const resetCounter = async (key: string): Promise<void> => {
  await UsageCounter.deleteOne({ key });
};

const DAY_MS = 24 * 60 * 60 * 1000;
export const today = (): string => new Date().toISOString().slice(0, 10);
export const DAILY_TTL_MS = 2 * DAY_MS;

export const getClientIp = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || req.ip || 'unknown';
};

/** Anonymous per-install id sent by the mobile app (random, never personal data) */
export const getDeviceId = (req: Request): string | undefined => {
  const raw = req.headers['x-device-id'];
  if (typeof raw !== 'string') return undefined;
  const clean = raw.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64);
  return clean.length >= 12 ? clean : undefined;
};
