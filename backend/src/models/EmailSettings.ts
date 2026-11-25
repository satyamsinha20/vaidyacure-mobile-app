import mongoose, { Document, Schema, Model } from 'mongoose';
import type { EncryptedSecret } from '../utils/secretBox.js';

/**
 * SMTP account used by Nodemailer (e.g. Gmail with an App Password). The
 * password is encrypted and never returned to any client.
 */
export interface IEmailSettings extends Document {
  key: string;
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: EncryptedSecret | null;
  passHint: string;
  fromName: string;
  fromEmail: string;
  updatedAt: Date;
}

export const DEFAULT_EMAIL = { enabled: true, host: 'smtp.gmail.com', port: 465, secure: true, fromName: 'VaidyaCure' };

const EmailSettingsSchema = new Schema<IEmailSettings>(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    enabled: { type: Boolean, default: DEFAULT_EMAIL.enabled },
    host: { type: String, default: DEFAULT_EMAIL.host, trim: true, maxlength: 120 },
    port: { type: Number, default: DEFAULT_EMAIL.port, min: 1, max: 65535 },
    secure: { type: Boolean, default: DEFAULT_EMAIL.secure },
    user: { type: String, default: '', trim: true, maxlength: 120 },
    pass: { type: Schema.Types.Mixed, default: null, select: false },
    passHint: { type: String, default: '' },
    fromName: { type: String, default: DEFAULT_EMAIL.fromName, trim: true, maxlength: 60 },
    fromEmail: { type: String, default: '', trim: true, maxlength: 120 },
  },
  { timestamps: true }
);

export const EmailSettings: Model<IEmailSettings> =
  mongoose.models.EmailSettings || mongoose.model<IEmailSettings>('EmailSettings', EmailSettingsSchema);
