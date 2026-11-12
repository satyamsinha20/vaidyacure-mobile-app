import mongoose, { Document, Schema, Model } from 'mongoose';

/** Single settings document (key "global") controlling consultations and premium */
export interface IAiSettings extends Document {
  key: string;
  premiumPriceInr: number;
  premiumAdsRequired: number;
  consultationSeconds: number;
  maxUserMessages: number;
  freeConsultsPerDevicePerDay: number;
  premiumUnlocksPerDevicePerDay: number;
  adUnlocksPerDevicePerDay: number;
  globalConsultsPerDay: number;
  paymentMode: 'test' | 'disabled';
  adsMode: 'test' | 'disabled';
  updatedAt: Date;
}

export const DEFAULT_AI_SETTINGS = {
  premiumPriceInr: 35,
  premiumAdsRequired: 3,
  consultationSeconds: 180,
  maxUserMessages: 6,
  freeConsultsPerDevicePerDay: 10,
  premiumUnlocksPerDevicePerDay: 3,
  adUnlocksPerDevicePerDay: 2,
  globalConsultsPerDay: 500,
  paymentMode: 'test' as const,
  adsMode: 'test' as const,
};

const AiSettingsSchema = new Schema<IAiSettings>(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    premiumPriceInr: { type: Number, default: DEFAULT_AI_SETTINGS.premiumPriceInr, min: 1, max: 5000 },
    premiumAdsRequired: { type: Number, default: DEFAULT_AI_SETTINGS.premiumAdsRequired, min: 1, max: 10 },
    consultationSeconds: { type: Number, default: DEFAULT_AI_SETTINGS.consultationSeconds, min: 60, max: 900 },
    maxUserMessages: { type: Number, default: DEFAULT_AI_SETTINGS.maxUserMessages, min: 2, max: 20 },
    freeConsultsPerDevicePerDay: { type: Number, default: DEFAULT_AI_SETTINGS.freeConsultsPerDevicePerDay, min: 0, max: 100 },
    premiumUnlocksPerDevicePerDay: { type: Number, default: DEFAULT_AI_SETTINGS.premiumUnlocksPerDevicePerDay, min: 0, max: 50 },
    adUnlocksPerDevicePerDay: { type: Number, default: DEFAULT_AI_SETTINGS.adUnlocksPerDevicePerDay, min: 0, max: 50 },
    globalConsultsPerDay: { type: Number, default: DEFAULT_AI_SETTINGS.globalConsultsPerDay, min: 0, max: 100000 },
    paymentMode: { type: String, enum: ['test', 'disabled'], default: 'test' },
    adsMode: { type: String, enum: ['test', 'disabled'], default: 'test' },
  },
  { timestamps: true }
);

export const AiSettings: Model<IAiSettings> =
  mongoose.models.AiSettings || mongoose.model<IAiSettings>('AiSettings', AiSettingsSchema);
