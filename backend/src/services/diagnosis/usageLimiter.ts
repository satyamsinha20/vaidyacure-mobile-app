import { UsageCounter } from '../../models/UsageCounter.js';

// Daily limits. Mobile carriers share IPs between many users, so the per-IP
// limit is looser than the per-device one; the global cap protects the API budget.
const DEVICE_LIMIT = 15;
const IP_LIMIT = 60;
const GLOBAL_LIMIT_DEFAULT = 100;

const increment = async (key: string, expiresAt: Date): Promise<number> => {
  const update = { $inc: { count: 1 }, $setOnInsert: { expiresAt } };
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

/**
 * Counts one diagnosis request and reports whether it is within today's limits.
 */
export const consumeDailyQuota = async (
  ip: string,
  deviceId: string | undefined
): Promise<{ allowed: boolean; message?: string }> => {
  const day = new Date().toISOString().slice(0, 10);
  const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const globalLimit = Number(process.env.DIAGNOSIS_DAILY_LIMIT) || GLOBAL_LIMIT_DEFAULT;

  const [globalCount, ipCount, deviceCount] = await Promise.all([
    increment(`diag:analysis:global:${day}`, expiresAt),
    increment(`diag:analysis:ip:${ip}:${day}`, expiresAt),
    deviceId ? increment(`diag:analysis:device:${deviceId}:${day}`, expiresAt) : Promise.resolve(0),
  ]);

  if (globalCount > globalLimit) {
    return { allowed: false, message: 'The diagnosis service has reached its daily limit. Please try again tomorrow.' };
  }
  if (ipCount > IP_LIMIT || deviceCount > DEVICE_LIMIT) {
    return { allowed: false, message: "You have reached today's diagnosis limit. Please try again tomorrow." };
  }
  return { allowed: true };
};
