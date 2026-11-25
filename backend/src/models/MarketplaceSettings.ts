import mongoose, { Document, Schema, Model } from 'mongoose';

/** Rules for real-doctor bookings, payments, refunds and payouts (one document, key "global") */
export const DEFAULT_MARKETPLACE = {
  commissionPercent: 10,
  /** The admin's UPI id that patients pay to */
  upiId: '',
  upiName: 'VaidyaCure',
  platformFeeInr: 0,
  minLeadMinutes: 60,
  paymentWindowMinutes: 30,
  bookingDaysAhead: 14,
  slotGapMinutes: 5,
  doctorJoinMinutes: 5,
  patientReplyMinutes: 5,
  patientNoShowKeepPercent: 30,
  noShowAdminSharePercent: 10,
  followUpHours: 120,
  followUpFreeCount: 3,
  refundHours: 24,
};

export type MarketplaceValues = typeof DEFAULT_MARKETPLACE;

export interface IMarketplaceSettings extends Document, MarketplaceValues {
  key: string;
  /** SHA-256 of the key that lets an external cron service run due work */
  cronKeyHash: string;
  updatedAt: Date;
}

const n = (value: number, min: number, max: number) => ({ type: Number, default: value, min, max });
const d = DEFAULT_MARKETPLACE;

const MarketplaceSettingsSchema = new Schema<IMarketplaceSettings>(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    commissionPercent: n(d.commissionPercent, 0, 100),
    upiId: { type: String, default: '', trim: true, maxlength: 64 },
    upiName: { type: String, default: d.upiName, trim: true, maxlength: 60 },
    platformFeeInr: n(d.platformFeeInr, 0, 1000000),
    minLeadMinutes: n(d.minLeadMinutes, 0, 2880),
    paymentWindowMinutes: n(d.paymentWindowMinutes, 5, 240),
    bookingDaysAhead: n(d.bookingDaysAhead, 1, 60),
    slotGapMinutes: n(d.slotGapMinutes, 0, 60),
    doctorJoinMinutes: n(d.doctorJoinMinutes, 1, 30),
    patientReplyMinutes: n(d.patientReplyMinutes, 1, 30),
    patientNoShowKeepPercent: n(d.patientNoShowKeepPercent, 0, 100),
    noShowAdminSharePercent: n(d.noShowAdminSharePercent, 0, 100),
    followUpHours: n(d.followUpHours, 0, 720),
    followUpFreeCount: n(d.followUpFreeCount, 0, 10),
    refundHours: n(d.refundHours, 1, 168),
    cronKeyHash: { type: String, default: '', select: false },
  },
  { timestamps: true }
);

export const MarketplaceSettings: Model<IMarketplaceSettings> =
  mongoose.models.MarketplaceSettings ||
  mongoose.model<IMarketplaceSettings>('MarketplaceSettings', MarketplaceSettingsSchema);
