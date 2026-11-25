import mongoose, { Document, Schema, Model, Types } from 'mongoose';

/**
 * A patient account in the mobile app, created on the first email OTP login.
 * Needed for anything that involves money or must survive a reinstall:
 * the wallet, doctor bookings, reports and follow-ups.
 */
export interface IPatient extends Document {
  _id: Types.ObjectId;
  email: string;
  name: string;
  /** Where refunds are sent (also saved from the last payment) */
  upiId: string;
  walletPaise: number;
  isBlocked: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const PatientSchema = new Schema<IPatient>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
    name: { type: String, default: '', trim: true, maxlength: 60 },
    upiId: { type: String, default: '', trim: true, maxlength: 64 },
    walletPaise: { type: Number, default: 0, min: 0 },
    isBlocked: { type: Boolean, default: false },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const Patient: Model<IPatient> = mongoose.models.Patient || mongoose.model<IPatient>('Patient', PatientSchema);
