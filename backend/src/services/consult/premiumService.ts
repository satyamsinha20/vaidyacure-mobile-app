import { UnlockToken } from '../../models/UnlockToken.js';
import { getAiSettings } from '../ai/configStore.js';
import { DAILY_TTL_MS, incrementCounter, resetCounter, today } from '../rateLimit.js';
import { randomToken, sha256 } from '../../utils/secretBox.js';
import { ConsultError } from './modelCall.js';

/**
 * Ad unlocks for free AI doctors (premium doctors are paid from the wallet).
 * Ads run in TEST mode until AdMob rewarded ads with server-side verification
 * are connected: the server still enforces every limit, so a modified app
 * cannot unlock more.
 */
const TOKEN_TTL_MS = 30 * 60 * 1000;
const AD_MIN_INTERVAL_MS = 5_000;

const issueUnlockToken = async (deviceId: string, method: 'ads_test') => {
  const raw = randomToken(24);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await UnlockToken.create({ tokenHash: sha256(raw), deviceId, method, expiresAt });
  return { unlockToken: raw, expiresAt: expiresAt.toISOString() };
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
  const required = settings.adsRequired;
  if (watched < required) return { watched, required, unlockToken: null, expiresAt: null };

  // Every unlock needs a fresh set of ads; there is no daily limit on unlocks
  await resetCounter(progressKey);
  return { watched: required, required, ...(await issueUnlockToken(deviceId, 'ads_test')) };
};
