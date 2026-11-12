import mongoose, { Document, Schema, Model } from 'mongoose';

/**
 * One-time permission for a single premium consultation, issued after a
 * (test) payment or after watching the required ads. Only a SHA-256 hash of
 * the token is stored, it is bound to one device, and it expires quickly.
 */
export interface IUnlockToken extends Document {
  tokenHash: string;
  deviceId: string;
  method: 'payment_test' | 'ads_test';
  usedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

const UnlockTokenSchema = new Schema<IUnlockToken>(
  {
    tokenHash: { type: String, required: true, unique: true },
    deviceId: { type: String, required: true },
    method: { type: String, enum: ['payment_test', 'ads_test'], required: true },
    usedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

UnlockTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const UnlockToken: Model<IUnlockToken> =
  mongoose.models.UnlockToken || mongoose.model<IUnlockToken>('UnlockToken', UnlockTokenSchema);
