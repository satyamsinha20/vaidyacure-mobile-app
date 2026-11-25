import mongoose, { Document, Schema, Model, Types } from 'mongoose';

/**
 * A logged-in app session. Only the SHA-256 of the random token is stored, so a
 * database leak cannot be replayed as a login. Expired sessions are deleted.
 */
export interface IPatientSession extends Document {
  tokenHash: string;
  patient: Types.ObjectId;
  deviceId: string;
  expiresAt: Date;
  createdAt: Date;
}

const PatientSessionSchema = new Schema<IPatientSession>(
  {
    tokenHash: { type: String, required: true, unique: true },
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    deviceId: { type: String, default: '' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

PatientSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PatientSession: Model<IPatientSession> =
  mongoose.models.PatientSession || mongoose.model<IPatientSession>('PatientSession', PatientSessionSchema);
