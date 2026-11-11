import { UsageCounter } from '../../models/UsageCounter.js';

export type UsageKind = 'interview' | 'analysis';

// Daily limits. Mobile carriers share IPs between many users, so the per-IP
// limit is looser than the per-device one; the global cap protects the API budget.
const LIMITS: Record<UsageKind, { device: number; ip: number; globalEnv: string; globalDefault: number }> = {
  analysis: { device: 15, ip: 60, globalEnv: 'DIAGNOSIS_DAILY_LIMIT', globalDefault: 100 },
  interview: { device: 45, ip: 180, globalEnv: 'DIAGNOSIS_INTERVIEW_DAILY_LIMIT', globalDefault: 300 },
};

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
 * Counts one request and reports whether it is within today's limits.
 */
export const consumeDailyQuota = async (
  kind: UsageKind,
  ip: string,
  deviceId: string | undefined
): Promise<{ allowed: boolean; message?: string }> => {
  const day = new Date().toISOString().slice(0, 10);
  const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const limits = LIMITS[kind];
  const globalLimit = Number(process.env[limits.globalEnv]) || limits.globalDefault;

  const [globalCount, ipCount, deviceCount] = await Promise.all([
    increment(`diag:${kind}:global:${day}`, expiresAt),
    increment(`diag:${kind}:ip:${ip}:${day}`, expiresAt),
    deviceId ? increment(`diag:${kind}:device:${deviceId}:${day}`, expiresAt) : Promise.resolve(0),
  ]);

  if (globalCount > globalLimit) {
    return { allowed: false, message: 'The diagnosis service has reached its daily limit. Please try again tomorrow.' };
  }
  if (ipCount > limits.ip || deviceCount > limits.device) {
    return { allowed: false, message: 'You have reached today\'s diagnosis limit. Please try again tomorrow.' };
  }
  return { allowed: true };
};
