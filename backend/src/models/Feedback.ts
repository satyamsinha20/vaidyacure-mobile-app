import mongoose, { Document, Schema, Model } from 'mongoose';

/**
 * Feedback sent from the mobile app. No personal data: the install id, the
 * phone's persistent id and the network address are stored only as hashes,
 * to allow one feedback per phone and network each week.
 */
export interface IFeedback extends Document {
  rating: 'excellent' | 'good' | 'average' | 'poor';
  message: string;
  deviceHash: string;
  deviceKeyHash: string;
  ipHash: string;
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
    deviceKeyHash: { type: String, default: '' },
    ipHash: { type: String, default: '' },
    platform: { type: String, default: '', maxlength: 20 },
    appVersion: { type: String, default: '', maxlength: 20 },
    status: { type: String, enum: ['new', 'read', 'resolved'], default: 'new', index: true },
  },
  { timestamps: true }
);

FeedbackSchema.index({ createdAt: -1 });
// "Has this phone or network sent feedback in the last week?"
FeedbackSchema.index({ deviceHash: 1, createdAt: -1 });
FeedbackSchema.index({ deviceKeyHash: 1, createdAt: -1 });
FeedbackSchema.index({ ipHash: 1, createdAt: -1 });

export const Feedback: Model<IFeedback> = mongoose.models.Feedback || mongoose.model<IFeedback>('Feedback', FeedbackSchema);
