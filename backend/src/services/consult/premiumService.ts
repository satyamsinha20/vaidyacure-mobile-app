import { UnlockToken } from '../../models/UnlockToken.js';
import { getAiSettings } from '../ai/configStore.js';
import { DAILY_TTL_MS, incrementCounter, resetCounter, today } from '../rateLimit.js';
import { randomToken, sha256 } from '../../utils/secretBox.js';
import { ConsultError } from './modelCall.js';

/**
 * Premium unlocks. Payments and ads run in TEST mode until Razorpay / Play
 * Billing and AdMob (with server-side verification) are connected: the
 * server still enforces every limit, so a modified app cannot unlock more.
 */
const TOKEN_TTL_MS = 30 * 60 * 1000;
const AD_MIN_INTERVAL_MS = 5_000;

const issueUnlockToken = async (deviceId: string, method: 'payment_test' | 'ads_test') => {
  const raw = randomToken(24);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await UnlockToken.create({ tokenHash: sha256(raw), deviceId, method, expiresAt });
  return { unlockToken: raw, expiresAt: expiresAt.toISOString() };
};

export const purchasePremiumTest = async (deviceId: string, ip: string) => {
  const settings = await getAiSettings();
  if (settings.paymentMode !== 'test') {
    throw new ConsultError(503, 'Payments are not available right now.', 'payments_unavailable');
  }
  const day = today();
  const [deviceCount, ipCount] = await Promise.all([
    incrementCounter(`premium:pay:device:${deviceId}:${day}`, DAILY_TTL_MS),
    incrementCounter(`premium:pay:ip:${ip}:${day}`, DAILY_TTL_MS),
  ]);
  if (deviceCount > settings.premiumUnlocksPerDevicePerDay || ipCount > settings.premiumUnlocksPerDevicePerDay * 4) {
    throw new ConsultError(429, 'You have reached today\'s premium limit. Please try again tomorrow.', 'limit_reached');
  }
  return issueUnlockToken(deviceId, 'payment_test');
};

export const recordAdReward = async (deviceId: string) => {
  const settings = await getAiSettings();
  if (settings.adsMode !== 'test') {
    throw new ConsultError(503, 'Ads are not available right now.', 'ads_unavailable');
  }

  // At most one reward per ad length, so a script cannot fake many ads at once
  const slot = Math.floor(Date.now() / AD_MIN_INTERVAL_MS);
  if ((await incrementCounter(`ads:burst:${deviceId}:${slot}`, 60_000)) > 1) {
    throw new ConsultError(429, 'Please watch the full ad.', 'too_fast');
  }

  const day = today();
  const progressKey = `ads:progress:${deviceId}:${day}`;
  const watched = await incrementCounter(progressKey, DAILY_TTL_MS);
  const required = settings.premiumAdsRequired;
  if (watched < required) return { watched, required, unlockToken: null, expiresAt: null };

  await resetCounter(progressKey);
  const unlocks = await incrementCounter(`premium:ads:device:${deviceId}:${day}`, DAILY_TTL_MS);
  if (unlocks > settings.adUnlocksPerDevicePerDay) {
    throw new ConsultError(429, "You have used today's ad unlocks. Please try again tomorrow.", 'limit_reached');
  }
  return { watched: required, required, ...(await issueUnlockToken(deviceId, 'ads_test')) };
};
