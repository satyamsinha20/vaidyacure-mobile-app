import mongoose, { Document, Schema, Model } from 'mongoose';
import type { EncryptedSecret } from '../utils/secretBox.js';

/**
 * Internet search for the app's Search tab (Google results through Serper.dev).
 * Single document (key "global"). The API key is stored only in encrypted form,
 * is never selected by default and is never sent to any client.
 */
export interface IWebSearchSettings extends Document {
  key: string;
  enabled: boolean;
  apiKey: EncryptedSecret | null;
  keyHint: string;
  perDevicePerDay: number;
  globalPerDay: number;
  updatedAt: Date;
}

export const DEFAULT_WEB_SEARCH = {
  enabled: true,
  perDevicePerDay: 60,
  // Serper gives 2,500 free searches once: a daily cap stops a burst of traffic from using them all
  globalPerDay: 500,
};

const EncryptedSecretSchema = new Schema<EncryptedSecret>(
  {
    iv: { type: String, required: true },
    tag: { type: String, required: true },
    data: { type: String, required: true },
  },
  { _id: false }
);

const WebSearchSettingsSchema = new Schema<IWebSearchSettings>(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    enabled: { type: Boolean, default: DEFAULT_WEB_SEARCH.enabled },
    apiKey: { type: EncryptedSecretSchema, default: null, select: false },
    keyHint: { type: String, default: '' },
    perDevicePerDay: { type: Number, default: DEFAULT_WEB_SEARCH.perDevicePerDay, min: 0, max: 1000 },
    globalPerDay: { type: Number, default: DEFAULT_WEB_SEARCH.globalPerDay, min: 0, max: 100000 },
  },
  { timestamps: true }
);

export const WebSearchSettings: Model<IWebSearchSettings> =
  mongoose.models.WebSearchSettings || mongoose.model<IWebSearchSettings>('WebSearchSettings', WebSearchSettingsSchema);
