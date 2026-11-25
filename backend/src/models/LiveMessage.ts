import mongoose, { Document, Schema, Model, Types } from 'mongoose';

/**
 * One message of a real-doctor chat. Patient and doctor see `text`, in which
 * phone numbers, emails, UPI ids and account numbers are hidden. The admin's
 * safety log also sees `original` and the flags.
 */
export interface ILiveMessage extends Document {
  booking: Types.ObjectId;
  seq: number;
  from: 'patient' | 'doctor' | 'system';
  text: string;
  original: string;
  flags: string[];
  at: Date;
}

const LiveMessageSchema = new Schema<ILiveMessage>(
  {
    booking: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    seq: { type: Number, required: true },
    from: { type: String, enum: ['patient', 'doctor', 'system'], required: true },
    text: { type: String, required: true, maxlength: 1200 },
    original: { type: String, default: '', select: false },
    flags: [{ type: String }],
    at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

LiveMessageSchema.index({ booking: 1, seq: 1 }, { unique: true });

export const LiveMessage: Model<ILiveMessage> =
  mongoose.models.LiveMessage || mongoose.model<ILiveMessage>('LiveMessage', LiveMessageSchema);
