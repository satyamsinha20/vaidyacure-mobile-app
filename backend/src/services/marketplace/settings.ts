import { DEFAULT_MARKETPLACE, MarketplaceSettings, type MarketplaceValues } from '../../models/MarketplaceSettings.js';

const CACHE_MS = 30_000;
let cache: { value: MarketplaceValues; at: number } | null = null;

export const invalidateMarketplaceSettings = (): void => {
  cache = null;
};

/** Booking, refund and payout rules (cached for 30 seconds per server instance) */
export const getMarketplaceSettings = async (): Promise<MarketplaceValues> => {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const doc = await MarketplaceSettings.findOne({ key: 'global' }).lean();
  const value = { ...DEFAULT_MARKETPLACE } as MarketplaceValues;
  if (doc) {
    for (const key of Object.keys(DEFAULT_MARKETPLACE) as Array<keyof MarketplaceValues>) {
      if (doc[key] !== undefined && doc[key] !== null) (value as Record<string, unknown>)[key] = doc[key];
    }
  }
  cache = { value, at: Date.now() };
  return value;
};
