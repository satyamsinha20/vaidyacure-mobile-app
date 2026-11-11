import mongoose, { Document, Schema, Model } from 'mongoose';

/**
 * Daily request counters used to rate-limit paid AI endpoints.
 * Documents expire automatically after `expiresAt` (MongoDB TTL index).
 */
export interface IUsageCounter extends Document {
  key: string;
  count: number;
  expiresAt: Date;
}

const UsageCounterSchema = new Schema<IUsageCounter>(
  {
    key: { type: String, required: true, unique: true },
    count: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false }
);

UsageCounterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const UsageCounter: Model<IUsageCounter> =
  mongoose.models.UsageCounter || mongoose.model<IUsageCounter>('UsageCounter', UsageCounterSchema);
