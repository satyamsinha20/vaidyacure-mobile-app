import mongoose, { Document, Schema, Model } from 'mongoose';

/**
 * Daily wellness tip shown on the app home screen. A tip with `scheduledFor`
 * (YYYY-MM-DD, India time) is shown on that day; otherwise active tips rotate.
 */
export interface IWellnessTip extends Document {
  title: string;
  text: string;
  category: string;
  scheduledFor: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const WellnessTipSchema = new Schema<IWellnessTip>(
  {
    title: { type: String, default: 'Daily Wellness Tip', trim: true, maxlength: 60 },
    text: { type: String, required: true, trim: true, maxlength: 400 },
    category: { type: String, default: '', trim: true, maxlength: 40 },
    scheduledFor: { type: String, default: null, match: /^\d{4}-\d{2}-\d{2}$/ },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

WellnessTipSchema.index({ scheduledFor: 1 });

export const WellnessTip: Model<IWellnessTip> =
  mongoose.models.WellnessTip || mongoose.model<IWellnessTip>('WellnessTip', WellnessTipSchema);
