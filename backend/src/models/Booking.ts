import mongoose, { Document, Schema, Model, Types } from 'mongoose';

/**
 * A scheduled consultation: with a real doctor (paid by UPI and verified by
 * the admin, or a free follow-up) or with an AI doctor (free, ads or wallet).
 * Prices are copied in when booking, so later fee changes never touch it.
 */
export const BOOKING_STATUSES = [
  'awaiting_payment', // slot held while the patient pays and enters the UTR
  'payment_review', // UTR submitted, admin is checking the bank
  'confirmed',
  'in_progress', // doctor sent the first message
  'chat_ended', // time over (or doctor ended it), report not sent yet
  'completed', // report sent (real) / consultation started (AI)
  'doctor_no_show',
  'patient_no_show',
  'cancelled',
  'payment_rejected',
  'expired', // hold ran out, or payment not verified before the slot
  'missed', // AI booking never started
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Statuses after which a booking can no longer change (apart from refunds and payouts) */
export const FINAL_STATUSES: BookingStatus[] = [
  'completed',
  'doctor_no_show',
  'patient_no_show',
  'cancelled',
  'payment_rejected',
  'expired',
  'missed',
];

export interface IPatientInfo {
  name: string;
  age: number;
  gender: 'male' | 'female' | 'other';
  heightCm: number;
  weightKg: number;
  pregnancy: string;
  problem: string;
}

export interface IMedicineLine {
  name: string;
  dose: string;
  frequency: string;
  duration: string;
  notes: string;
}

export interface IDoctorReport {
  diagnosis: string;
  advice: string;
  medicines: IMedicineLine[];
  /** Medicines written freely (e.g. "Paracetamol 650, 1 tablet morning and night") */
  medicinesText?: string;
  tests: string[];
  /** Tests written freely */
  testsText?: string;
  followUpAdvice: string;
  sentAt: Date;
  /** registrationNumber is the doctor's VaidyaCure number (VC-DOC-000001) */
  doctor: { name: string; qualification: string; specialization: string; registrationNumber: string };
}

export interface IRefund {
  status: 'none' | 'due' | 'paid';
  amountPaise: number;
  reason: '' | 'doctor_no_show' | 'patient_no_show' | 'admin_cancel' | 'not_verified';
  dueBy: Date | null;
  utr: string;
  paidAt: Date | null;
  paidByEmail: string;
}

export interface IEarnings {
  doctorPaise: number;
  adminPaise: number;
  /** Monday (India) of the payout week, "YYYY-MM-DD" */
  weekStart: string;
  earnedAt: Date;
  settlement: Types.ObjectId | null;
}

export interface IBooking extends Document {
  _id: Types.ObjectId;
  publicId: string;
  patient: Types.ObjectId;
  kind: 'real' | 'ai';
  doctor: Types.ObjectId | null;
  aiDoctor: Types.ObjectId | null;
  slotStart: Date;
  slotEnd: Date;
  consultMinutes: number;
  status: BookingStatus;
  /** True while this booking occupies the doctor's slot (unique per real doctor and time) */
  slotLock: boolean;
  holdUntil: Date | null;
  price: { feePaise: number; commissionPaise: number; totalPaise: number };
  unlock: 'upi' | 'wallet' | 'ads' | 'free' | 'follow_up';
  payment: {
    utr: string;
    payerUpi: string;
    submittedAt: Date | null;
    verifiedAt: Date | null;
    verifiedByEmail: string;
    rejectReason: string;
  };
  /** The paid consultation this free follow-up belongs to */
  followUpOf: Types.ObjectId | null;
  /** On a paid consultation: free follow-ups booked so far */
  followUpsUsed: number;
  patientInfo: IPatientInfo;
  doctorJoinedAt: Date | null;
  replyBy: Date | null;
  patientRepliedAt: Date | null;
  chatEndsAt: Date | null;
  chatEndedAt: Date | null;
  msgSeq: number;
  report: IDoctorReport | null;
  refund: IRefund;
  earnings: IEarnings | null;
  notified: { reminder: boolean; start: boolean };
  /** AI bookings: the consultation started from this booking */
  consultationId: string;
  cancelReason: string;
  createdAt: Date;
  updatedAt: Date;
}

const EarningsSchema = new Schema<IEarnings>(
  {
    doctorPaise: { type: Number, required: true, min: 0 },
    adminPaise: { type: Number, required: true, min: 0 },
    weekStart: { type: String, required: true },
    earnedAt: { type: Date, required: true },
    settlement: { type: Schema.Types.ObjectId, ref: 'Settlement', default: null },
  },
  { _id: false }
);

const BookingSchema = new Schema<IBooking>(
  {
    publicId: { type: String, required: true, unique: true },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true },
    kind: { type: String, enum: ['real', 'ai'], required: true },
    doctor: { type: Schema.Types.ObjectId, ref: 'Doctor', default: null },
    aiDoctor: { type: Schema.Types.ObjectId, ref: 'AiDoctor', default: null },
    slotStart: { type: Date, required: true },
    slotEnd: { type: Date, required: true },
    consultMinutes: { type: Number, required: true },
    status: { type: String, enum: BOOKING_STATUSES, required: true },
    slotLock: { type: Boolean, default: true },
    holdUntil: { type: Date, default: null },
    price: {
      feePaise: { type: Number, default: 0, min: 0 },
      commissionPaise: { type: Number, default: 0, min: 0 },
      totalPaise: { type: Number, default: 0, min: 0 },
    },
    unlock: { type: String, enum: ['upi', 'wallet', 'ads', 'free', 'follow_up'], required: true },
    payment: {
      utr: { type: String, default: '' },
      payerUpi: { type: String, default: '' },
      submittedAt: { type: Date, default: null },
      verifiedAt: { type: Date, default: null },
      verifiedByEmail: { type: String, default: '' },
      rejectReason: { type: String, default: '' },
    },
    followUpOf: { type: Schema.Types.ObjectId, ref: 'Booking', default: null },
    followUpsUsed: { type: Number, default: 0, min: 0 },
    patientInfo: {
      name: { type: String, default: '', maxlength: 60 },
      age: { type: Number, default: 0 },
      gender: { type: String, default: 'other' },
      heightCm: { type: Number, default: 0 },
      weightKg: { type: Number, default: 0 },
      pregnancy: { type: String, default: 'not_applicable' },
      problem: { type: String, default: '', maxlength: 500 },
    },
    doctorJoinedAt: { type: Date, default: null },
    replyBy: { type: Date, default: null },
    patientRepliedAt: { type: Date, default: null },
    chatEndsAt: { type: Date, default: null },
    chatEndedAt: { type: Date, default: null },
    msgSeq: { type: Number, default: 0 },
    report: { type: Schema.Types.Mixed, default: null },
    refund: {
      status: { type: String, enum: ['none', 'due', 'paid'], default: 'none' },
      amountPaise: { type: Number, default: 0, min: 0 },
      reason: { type: String, default: '' },
      dueBy: { type: Date, default: null },
      utr: { type: String, default: '' },
      paidAt: { type: Date, default: null },
      paidByEmail: { type: String, default: '' },
    },
    earnings: { type: EarningsSchema, default: null },
    notified: {
      reminder: { type: Boolean, default: false },
      start: { type: Boolean, default: false },
    },
    consultationId: { type: String, default: '' },
    cancelReason: { type: String, default: '', maxlength: 200 },
  },
  { timestamps: true }
);

// One active booking per real doctor and start time: double booking is impossible even under races
BookingSchema.index(
  { doctor: 1, slotStart: 1 },
  { unique: true, partialFilterExpression: { slotLock: true, kind: 'real' }, name: 'one_booking_per_slot' }
);
BookingSchema.index({ patient: 1, createdAt: -1 });
BookingSchema.index({ status: 1, slotStart: 1 });
BookingSchema.index({ doctor: 1, slotStart: -1 });
BookingSchema.index({ aiDoctor: 1, slotStart: 1 });
BookingSchema.index({ followUpOf: 1 });
BookingSchema.index({ 'refund.status': 1, 'refund.dueBy': 1 });
BookingSchema.index({ 'earnings.settlement': 1, doctor: 1 });

export const Booking: Model<IBooking> = mongoose.models.Booking || mongoose.model<IBooking>('Booking', BookingSchema);
