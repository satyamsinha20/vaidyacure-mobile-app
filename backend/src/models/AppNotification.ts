import mongoose, { Document, Schema, Model, Types } from 'mongoose';

/** In-app notification feed (new or updated remedies). Kept for 90 days. */
export interface IAppNotification extends Document {
  type: 'remedy_added' | 'remedy_updated';
  title: string;
  body: string;
  category: string;
  remedyId: Types.ObjectId | null;
  createdAt: Date;
}

const AppNotificationSchema = new Schema<IAppNotification>(
  {
    type: { type: String, enum: ['remedy_added', 'remedy_updated'], required: true },
    title: { type: String, required: true, maxlength: 120 },
    body: { type: String, default: '', maxlength: 300 },
    category: { type: String, default: '' },
    remedyId: { type: Schema.Types.ObjectId, ref: 'Remedy', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AppNotificationSchema.index({ createdAt: -1 });
AppNotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const AppNotification: Model<IAppNotification> =
  mongoose.models.AppNotification || mongoose.model<IAppNotification>('AppNotification', AppNotificationSchema);
