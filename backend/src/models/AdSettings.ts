import mongoose, { Document, Schema, Model } from 'mongoose';

/** Single settings document (key "global") for the home carousel's empty slots */
export interface IAdSettings extends Document {
  key: string;
  contactType: 'none' | 'phone' | 'whatsapp' | 'email';
  contactValue: string;
  updatedAt: Date;
}

const AdSettingsSchema = new Schema<IAdSettings>(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    contactType: { type: String, enum: ['none', 'phone', 'whatsapp', 'email'], default: 'none' },
    contactValue: { type: String, default: '', trim: true, maxlength: 120 },
  },
  { timestamps: true }
);

export const AdSettings: Model<IAdSettings> =
  mongoose.models.AdSettings || mongoose.model<IAdSettings>('AdSettings', AdSettingsSchema);
