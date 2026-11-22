import mongoose, { Document, Schema, Model } from 'mongoose';

/** Feedback sent from the mobile app (no personal data: only an anonymous device hash) */
export interface IFeedback extends Document {
  rating: 'excellent' | 'good' | 'average' | 'poor';
  message: string;
  deviceHash: string;
  platform: string;
  appVersion: string;
  status: 'new' | 'read' | 'resolved';
  createdAt: Date;
  updatedAt: Date;
}

const FeedbackSchema = new Schema<IFeedback>(
  {
    rating: { type: String, enum: ['excellent', 'good', 'average', 'poor'], required: true },
    message: { type: String, default: '', trim: true, maxlength: 1000 },
    deviceHash: { type: String, default: '' },
    platform: { type: String, default: '', maxlength: 20 },
    appVersion: { type: String, default: '', maxlength: 20 },
    status: { type: String, enum: ['new', 'read', 'resolved'], default: 'new', index: true },
  },
  { timestamps: true }
);

FeedbackSchema.index({ createdAt: -1 });

export const Feedback: Model<IFeedback> = mongoose.models.Feedback || mongoose.model<IFeedback>('Feedback', FeedbackSchema);
