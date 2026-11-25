import mongoose, { Document, Schema, Model } from 'mongoose';

/**
 * The one active login code of an email address. The code itself is never
 * stored, only an HMAC of it (keyed with a server secret), and it is deleted
 * after use, after too many wrong tries, or when it expires.
 */
export interface IEmailOtp extends Document {
  email: string;
  codeHash: string;
  attempts: number;
  sentAt: Date;
  expiresAt: Date;
}

const EmailOtpSchema = new Schema<IEmailOtp>(
  {
    email: { type: String, required: true, unique: true },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    sentAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false }
);

EmailOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EmailOtp: Model<IEmailOtp> = mongoose.models.EmailOtp || mongoose.model<IEmailOtp>('EmailOtp', EmailOtpSchema);
