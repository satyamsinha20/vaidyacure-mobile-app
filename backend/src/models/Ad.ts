import mongoose, { Document, Schema, Model } from 'mongoose';

/** A sponsored slide in the app's home carousel, managed from Marketing */
export interface IAd extends Document {
  clientName: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  actionType: 'none' | 'url' | 'phone' | 'whatsapp';
  actionValue: string;
  startAt: Date | null;
  endAt: Date | null;
  isActive: boolean;
  sortOrder: number;
  impressions: number;
  clicks: number;
  createdAt: Date;
  updatedAt: Date;
}

const AdSchema = new Schema<IAd>(
  {
    clientName: { type: String, required: true, trim: true, maxlength: 80 },
    title: { type: String, default: '', trim: true, maxlength: 80 },
    subtitle: { type: String, default: '', trim: true, maxlength: 140 },
    imageUrl: { type: String, required: true, trim: true, maxlength: 500 },
    actionType: { type: String, enum: ['none', 'url', 'phone', 'whatsapp'], default: 'none' },
    actionValue: { type: String, default: '', trim: true, maxlength: 300 },
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
  },
  { timestamps: true }
);

AdSchema.index({ isActive: 1, sortOrder: 1 });

export const Ad: Model<IAd> = mongoose.models.Ad || mongoose.model<IAd>('Ad', AdSchema);
