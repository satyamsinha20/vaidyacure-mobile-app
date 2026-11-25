import mongoose, { Document, Schema, Model, Types } from 'mongoose';
import { AvailabilitySchema, EMPTY_AVAILABILITY, type IAvailability } from './availability.js';

/**
 * library: free, no ads, recommends only remedies from the VaidyaCure library
 * free:    unlocked by watching ads
 * premium: paid from the patient's wallet
 */
export type AiDoctorTier = 'library' | 'free' | 'premium';

/**
 * A consultant persona shown in the mobile app. Which provider and model power
 * it is server-side configuration only and is never sent to the app.
 */
export interface IAiDoctor extends Document {
  _id: Types.ObjectId;
  name: string;
  designation: string;
  about: string;
  tier: AiDoctorTier;
  provider: Types.ObjectId;
  modelId: string;
  fallbackProvider: Types.ObjectId | null;
  fallbackModel: string;
  avatarColor: string;
  isActive: boolean;
  sortOrder: number;
  estimatedCostInr: number;
  /** Chat length and message limit for this doctor (null = the global setting) */
  consultMinutes: number | null;
  maxUserMessages: number | null;
  /** When false, the doctor can only be consulted inside `availability` (or by booking a slot) */
  alwaysAvailable: boolean;
  availability: IAvailability;
  /** How many patients can book the same slot */
  slotCapacity: number;
  createdAt: Date;
  updatedAt: Date;
}

const AiDoctorSchema = new Schema<IAiDoctor>(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    designation: { type: String, required: true, trim: true, maxlength: 60 },
    about: { type: String, default: '', trim: true, maxlength: 200 },
    tier: { type: String, enum: ['library', 'free', 'premium'], default: 'free' },
    provider: { type: Schema.Types.ObjectId, ref: 'AiProvider', required: true },
    modelId: { type: String, required: true, trim: true, maxlength: 120 },
    fallbackProvider: { type: Schema.Types.ObjectId, ref: 'AiProvider', default: null },
    fallbackModel: { type: String, default: '', trim: true, maxlength: 120 },
    avatarColor: { type: String, default: '#157347', match: /^#[0-9A-Fa-f]{6}$/ },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    estimatedCostInr: { type: Number, default: 0, min: 0 },
    consultMinutes: { type: Number, default: null, min: 1, max: 30 },
    maxUserMessages: { type: Number, default: null, min: 2, max: 30 },
    alwaysAvailable: { type: Boolean, default: true },
    availability: { type: AvailabilitySchema, default: () => ({ ...EMPTY_AVAILABILITY }) },
    slotCapacity: { type: Number, default: 20, min: 1, max: 500 },
  },
  { timestamps: true }
);

export const AiDoctor: Model<IAiDoctor> = mongoose.models.AiDoctor || mongoose.model<IAiDoctor>('AiDoctor', AiDoctorSchema);
