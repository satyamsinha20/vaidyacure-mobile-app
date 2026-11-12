import mongoose, { Document, Schema, Model, Types } from 'mongoose';

/**
 * A consultant persona shown in the mobile app. Which provider and model power
 * it is server-side configuration only and is never sent to the app.
 */
export interface IAiDoctor extends Document {
  _id: Types.ObjectId;
  name: string;
  designation: string;
  about: string;
  tier: 'free' | 'premium';
  provider: Types.ObjectId;
  modelId: string;
  fallbackProvider: Types.ObjectId | null;
  fallbackModel: string;
  avatarColor: string;
  isActive: boolean;
  sortOrder: number;
  estimatedCostInr: number;
  createdAt: Date;
  updatedAt: Date;
}

const AiDoctorSchema = new Schema<IAiDoctor>(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    designation: { type: String, required: true, trim: true, maxlength: 60 },
    about: { type: String, default: '', trim: true, maxlength: 200 },
    tier: { type: String, enum: ['free', 'premium'], default: 'free' },
    provider: { type: Schema.Types.ObjectId, ref: 'AiProvider', required: true },
    modelId: { type: String, required: true, trim: true, maxlength: 120 },
    fallbackProvider: { type: Schema.Types.ObjectId, ref: 'AiProvider', default: null },
    fallbackModel: { type: String, default: '', trim: true, maxlength: 120 },
    avatarColor: { type: String, default: '#157347', match: /^#[0-9A-Fa-f]{6}$/ },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    estimatedCostInr: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

export const AiDoctor: Model<IAiDoctor> = mongoose.models.AiDoctor || mongoose.model<IAiDoctor>('AiDoctor', AiDoctorSchema);
