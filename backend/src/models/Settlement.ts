import mongoose, { Document, Schema, Model, Types } from 'mongoose';

/** A weekly payout the admin sent to a doctor, with the bank reference (UTR) */
export interface ISettlement extends Document {
  _id: Types.ObjectId;
  doctor: Types.ObjectId;
  amountPaise: number;
  bookings: Types.ObjectId[];
  weeks: string[];
  utr: string;
  note: string;
  paidByEmail: string;
  paidAt: Date;
}

const SettlementSchema = new Schema<ISettlement>(
  {
    doctor: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true, index: true },
    amountPaise: { type: Number, required: true, min: 1 },
    bookings: [{ type: Schema.Types.ObjectId, ref: 'Booking' }],
    weeks: [{ type: String }],
    utr: { type: String, required: true, trim: true, maxlength: 40 },
    note: { type: String, default: '', maxlength: 200 },
    paidByEmail: { type: String, default: '' },
    paidAt: { type: Date, required: true },
  },
  { versionKey: false }
);

export const Settlement: Model<ISettlement> =
  mongoose.models.Settlement || mongoose.model<ISettlement>('Settlement', SettlementSchema);
