import mongoose, { Document, Schema, Model, Types } from 'mongoose';

/**
 * Server-side state of one consultation. Keeping the transcript here (instead of
 * trusting the app) stops clients from injecting fake doctor messages or
 * bypassing the time and message limits. Deleted automatically after 24 hours;
 * the user's saved history lives only on their device.
 */
export interface IConsultMessage {
  role: 'user' | 'doctor';
  text: string;
  at: Date;
}

export interface IConsultation extends Document {
  publicId: string;
  deviceId: string;
  doctor: Types.ObjectId;
  tier: 'free' | 'premium';
  patient: {
    age: number;
    gender: 'male' | 'female' | 'other';
    heightCm: number;
    weightKg: number;
    pregnancy: string;
  };
  messages: IConsultMessage[];
  userMessageCount: number;
  maxUserMessages: number;
  status: 'active' | 'completed';
  emergency: boolean;
  startedAt: Date;
  endsAt: Date;
  report: unknown;
  reportStartedAt: Date | null;
  reportGeneratedAt: Date | null;
  expiresAt: Date;
}

const ConsultationSchema = new Schema<IConsultation>({
  publicId: { type: String, required: true, unique: true },
  deviceId: { type: String, required: true, index: true },
  doctor: { type: Schema.Types.ObjectId, ref: 'AiDoctor', required: true },
  tier: { type: String, enum: ['free', 'premium'], required: true },
  patient: {
    age: Number,
    gender: String,
    heightCm: Number,
    weightKg: Number,
    pregnancy: String,
  },
  messages: [
    {
      _id: false,
      role: { type: String, enum: ['user', 'doctor'], required: true },
      text: { type: String, required: true },
      at: { type: Date, default: Date.now },
    },
  ],
  userMessageCount: { type: Number, default: 0 },
  maxUserMessages: { type: Number, required: true },
  status: { type: String, enum: ['active', 'completed'], default: 'active' },
  emergency: { type: Boolean, default: false },
  startedAt: { type: Date, default: Date.now },
  endsAt: { type: Date, required: true },
  report: { type: Schema.Types.Mixed, default: null },
  reportStartedAt: { type: Date, default: null },
  reportGeneratedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
});

ConsultationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Consultation: Model<IConsultation> =
  mongoose.models.Consultation || mongoose.model<IConsultation>('Consultation', ConsultationSchema);
