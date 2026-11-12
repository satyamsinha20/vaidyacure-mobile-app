import mongoose, { Document, Schema, Model, Types } from 'mongoose';

/** Who changed which AI configuration and when (kept for 180 days, never contains secrets) */
export interface IAuditLog extends Document {
  admin: Types.ObjectId;
  adminEmail: string;
  action: string;
  target: string;
  details: string;
  ip: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    admin: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
    adminEmail: { type: String, required: true },
    action: { type: String, required: true },
    target: { type: String, default: '' },
    details: { type: String, default: '', maxlength: 500 },
    ip: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

export const AuditLog: Model<IAuditLog> = mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
