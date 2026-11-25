import mongoose, { Document, Schema, Model } from 'mongoose';

/** Single settings document (key "global") controlling consultations and premium */
export interface IAiSettings extends Document {
  key: string;
  /** Price of one premium AI consultation, paid from the patient's wallet */
  premiumPriceInr: number;
  /** Ads to watch to unlock one free AI doctor (the library doctor needs none) */
  adsRequired: number;
  consultationSeconds: number;
  maxUserMessages: number;
  freeConsultsPerDevicePerDay: number;
  premiumUnlocksPerDevicePerDay: number;
  adUnlocksPerDevicePerDay: number;
  globalConsultsPerDay: number;
  /** Premium AI doctors can be paid from the wallet */
  walletEnabled: boolean;
  adsMode: 'test' | 'disabled';
  /** Short AI answer on top of health search results */
  searchAiEnabled: boolean;
  searchAiModel: string;
  searchAiFallbackModel: string;
  searchAiPerDevicePerDay: number;
  searchAiGlobalPerDay: number;
  /** Works out the salt (generic names) behind a medicine brand typed in search */
  medicineAiModel: string;
  /** Reading the medicine name from a photo (camera search) */
  photoAiEnabled: boolean;
  photoAiModel: string;
  photoAiFallbackModel: string;
  photoAiPerDevicePerDay: number;
  photoAiGlobalPerDay: number;
  /** Voice search (mic) in the app, and the language it starts in */
  voiceSearchEnabled: boolean;
  voiceSearchLanguage: 'en-IN' | 'hi-IN';
  /** The Library Doctor was created once (it is not re-created if the admin deletes it) */
  libraryDoctorSeeded?: boolean;
  updatedAt: Date;
}

export const DEFAULT_AI_SETTINGS = {
  premiumPriceInr: 35,
  adsRequired: 3,
  consultationSeconds: 180,
  maxUserMessages: 6,
  freeConsultsPerDevicePerDay: 10,
  premiumUnlocksPerDevicePerDay: 3,
  adUnlocksPerDevicePerDay: 2,
  globalConsultsPerDay: 500,
  walletEnabled: true,
  adsMode: 'test' as const,
  // Cheapest capable models on the gateway (about ₹0.004 and ₹0.011 per search answer)
  searchAiEnabled: true,
  searchAiModel: 'mistralai/mistral-nemo',
  searchAiFallbackModel: 'qwen/qwen3.7-flash',
  searchAiPerDevicePerDay: 40,
  searchAiGlobalPerDay: 3000,
  // Knows Indian medicine brands well for its price (about ₹0.003 per brand, cached for 30 days)
  medicineAiModel: 'qwen/qwen3.7-flash',
  // Cheapest models that read printed text from photos (about ₹0.002 and ₹0.008 per photo)
  photoAiEnabled: true,
  photoAiModel: 'google/gemma-3-4b-it',
  photoAiFallbackModel: 'qwen/qwen3.7-flash',
  photoAiPerDevicePerDay: 20,
  photoAiGlobalPerDay: 1000,
  voiceSearchEnabled: true,
  voiceSearchLanguage: 'en-IN' as 'en-IN' | 'hi-IN',
};

const AiSettingsSchema = new Schema<IAiSettings>(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    premiumPriceInr: { type: Number, default: DEFAULT_AI_SETTINGS.premiumPriceInr, min: 1, max: 5000 },
    adsRequired: { type: Number, default: DEFAULT_AI_SETTINGS.adsRequired, min: 1, max: 10 },
    consultationSeconds: { type: Number, default: DEFAULT_AI_SETTINGS.consultationSeconds, min: 60, max: 900 },
    maxUserMessages: { type: Number, default: DEFAULT_AI_SETTINGS.maxUserMessages, min: 2, max: 20 },
    freeConsultsPerDevicePerDay: { type: Number, default: DEFAULT_AI_SETTINGS.freeConsultsPerDevicePerDay, min: 0, max: 100 },
    premiumUnlocksPerDevicePerDay: { type: Number, default: DEFAULT_AI_SETTINGS.premiumUnlocksPerDevicePerDay, min: 0, max: 50 },
    adUnlocksPerDevicePerDay: { type: Number, default: DEFAULT_AI_SETTINGS.adUnlocksPerDevicePerDay, min: 0, max: 50 },
    globalConsultsPerDay: { type: Number, default: DEFAULT_AI_SETTINGS.globalConsultsPerDay, min: 0, max: 100000 },
    walletEnabled: { type: Boolean, default: DEFAULT_AI_SETTINGS.walletEnabled },
    adsMode: { type: String, enum: ['test', 'disabled'], default: 'test' },
    searchAiEnabled: { type: Boolean, default: DEFAULT_AI_SETTINGS.searchAiEnabled },
    searchAiModel: { type: String, default: DEFAULT_AI_SETTINGS.searchAiModel, trim: true, maxlength: 120 },
    searchAiFallbackModel: { type: String, default: DEFAULT_AI_SETTINGS.searchAiFallbackModel, trim: true, maxlength: 120 },
    searchAiPerDevicePerDay: { type: Number, default: DEFAULT_AI_SETTINGS.searchAiPerDevicePerDay, min: 0, max: 1000 },
    searchAiGlobalPerDay: { type: Number, default: DEFAULT_AI_SETTINGS.searchAiGlobalPerDay, min: 0, max: 100000 },
    medicineAiModel: { type: String, default: DEFAULT_AI_SETTINGS.medicineAiModel, trim: true, maxlength: 120 },
    photoAiEnabled: { type: Boolean, default: DEFAULT_AI_SETTINGS.photoAiEnabled },
    photoAiModel: { type: String, default: DEFAULT_AI_SETTINGS.photoAiModel, trim: true, maxlength: 120 },
    photoAiFallbackModel: { type: String, default: DEFAULT_AI_SETTINGS.photoAiFallbackModel, trim: true, maxlength: 120 },
    photoAiPerDevicePerDay: { type: Number, default: DEFAULT_AI_SETTINGS.photoAiPerDevicePerDay, min: 0, max: 500 },
    photoAiGlobalPerDay: { type: Number, default: DEFAULT_AI_SETTINGS.photoAiGlobalPerDay, min: 0, max: 100000 },
    voiceSearchEnabled: { type: Boolean, default: DEFAULT_AI_SETTINGS.voiceSearchEnabled },
    voiceSearchLanguage: { type: String, enum: ['en-IN', 'hi-IN'], default: DEFAULT_AI_SETTINGS.voiceSearchLanguage },
    libraryDoctorSeeded: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const AiSettings: Model<IAiSettings> =
  mongoose.models.AiSettings || mongoose.model<IAiSettings>('AiSettings', AiSettingsSchema);
