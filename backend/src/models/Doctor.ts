import mongoose, { Document, Schema, Model, Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import type { EncryptedSecret } from '../utils/secretBox.js';
import { AvailabilitySchema, EMPTY_AVAILABILITY, type IAvailability } from './availability.js';

/**
 * A real (human) doctor. Separate from Admin accounts on purpose: a doctor
 * login can never pass an admin permission check, whatever its role says.
 * The admin creates the account after the yearly platform fee is paid.
 */
export interface IPlanPayment {
  amountInr: number;
  utr: string;
  paidOn: Date;
  validUntil: Date;
  recordedBy: string;
}

export interface IDoctor extends Document {
  _id: Types.ObjectId;
  /** The doctor's only number (registration number), made by the server: VC-DOC-000001 … */
  doctorCode: string;
  email: string;
  password?: string;
  mustChangePassword: boolean;
  /** Bumped on password change/reset or deactivation: old logins stop working */
  tokenVersion: number;
  name: string;
  qualification: string;
  specialization: string;
  experienceYears: number;
  about: string;
  languages: string[];
  avatarColor: string;
  /** The doctor's own fee in rupees (the app adds the platform commission on top) */
  feeInr: number;
  /** A fee change the doctor asked for, waiting for the admin */
  requestedFeeInr: number | null;
  consultMinutes: number;
  availability: IAvailability;
  planValidUntil: Date | null;
  planPayments: IPlanPayment[];
  /** Bank / UPI details, encrypted (AES-256-GCM); only the admin can read them */
  bankEnc: EncryptedSecret | null;
  bankHint: string;
  bankUpdatedAt: Date | null;
  bankReviewedAt: Date | null;
  isActive: boolean;
  termsAcceptedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const DoctorSchema = new Schema<IDoctor>(
  {
    doctorCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
    password: { type: String, required: true, minlength: 8, select: false },
    mustChangePassword: { type: Boolean, default: true },
    tokenVersion: { type: Number, default: 0 },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    qualification: { type: String, required: true, trim: true, maxlength: 80 },
    specialization: { type: String, required: true, trim: true, maxlength: 60 },
    experienceYears: { type: Number, default: 0, min: 0, max: 70 },
    about: { type: String, default: '', trim: true, maxlength: 300 },
    languages: [{ type: String, trim: true, maxlength: 20 }],
    avatarColor: { type: String, default: '#0E7490', match: /^#[0-9A-Fa-f]{6}$/ },
    feeInr: {
      type: Number,
      required: true,
      min: 0,
      max: 20000,
      validate: { validator: (v: number) => Number.isInteger(v) && v % 10 === 0, message: 'Fee must be a multiple of ₹10' },
    },
    requestedFeeInr: { type: Number, default: null },
    consultMinutes: { type: Number, default: 15, min: 10, max: 30 },
    availability: { type: AvailabilitySchema, default: () => ({ ...EMPTY_AVAILABILITY }) },
    planValidUntil: { type: Date, default: null },
    planPayments: [
      {
        _id: false,
        amountInr: { type: Number, required: true, min: 0 },
        utr: { type: String, default: '', trim: true, maxlength: 40 },
        paidOn: { type: Date, required: true },
        validUntil: { type: Date, required: true },
        recordedBy: { type: String, default: '' },
      },
    ],
    bankEnc: { type: Schema.Types.Mixed, default: null, select: false },
    bankHint: { type: String, default: '' },
    bankUpdatedAt: { type: Date, default: null },
    bankReviewedAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    termsAcceptedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

DoctorSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  try {
    this.password = await bcrypt.hash(this.password, 10);
    next();
  } catch (error: any) {
    next(error);
  }
});

DoctorSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidate, this.password);
};

export const Doctor: Model<IDoctor> = mongoose.models.Doctor || mongoose.model<IDoctor>('Doctor', DoctorSchema);
