import mongoose, { Document, Schema, Model, Types } from 'mongoose';

/* -------------------------------------------------------------------------- */
/* LEDGER: every change to a wallet balance, never edited or deleted          */
/* -------------------------------------------------------------------------- */
export type WalletTxnKind = 'topup' | 'ai_chat' | 'ai_refund' | 'adjust';

export interface IWalletTxn extends Document {
  patient: Types.ObjectId;
  kind: WalletTxnKind;
  /** Positive = added to the wallet, negative = spent */
  amountPaise: number;
  balanceAfterPaise: number;
  ref: string;
  note: string;
  /** Makes a retried request (or a double tap) charge only once */
  idempotencyKey?: string;
  createdAt: Date;
}

const WalletTxnSchema = new Schema<IWalletTxn>(
  {
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    kind: { type: String, enum: ['topup', 'ai_chat', 'ai_refund', 'adjust'], required: true },
    amountPaise: { type: Number, required: true },
    balanceAfterPaise: { type: Number, required: true },
    ref: { type: String, default: '' },
    note: { type: String, default: '', maxlength: 200 },
    idempotencyKey: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

WalletTxnSchema.index({ idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });
WalletTxnSchema.index({ kind: 1, createdAt: -1 });

export const WalletTxn: Model<IWalletTxn> = mongoose.models.WalletTxn || mongoose.model<IWalletTxn>('WalletTxn', WalletTxnSchema);

/* -------------------------------------------------------------------------- */
/* TOP-UP REQUESTS: patient paid the admin's UPI and asks for the credit      */
/* -------------------------------------------------------------------------- */
export interface IWalletTopup extends Document {
  _id: Types.ObjectId;
  patient: Types.ObjectId;
  amountPaise: number;
  /** What the admin actually credited (can differ if the patient paid a different amount) */
  creditedPaise: number;
  utr: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectReason: string;
  reviewedBy: Types.ObjectId | null;
  reviewedByEmail: string;
  reviewedAt: Date | null;
  createdAt: Date;
}

const WalletTopupSchema = new Schema<IWalletTopup>(
  {
    patient: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    amountPaise: { type: Number, required: true, min: 1 },
    creditedPaise: { type: Number, default: 0, min: 0 },
    utr: { type: String, required: true, unique: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    rejectReason: { type: String, default: '', maxlength: 200 },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
    reviewedByEmail: { type: String, default: '' },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const WalletTopup: Model<IWalletTopup> =
  mongoose.models.WalletTopup || mongoose.model<IWalletTopup>('WalletTopup', WalletTopupSchema);

/* -------------------------------------------------------------------------- */
/* UTR REGISTRY: one bank transaction can be claimed only once, anywhere      */
/* -------------------------------------------------------------------------- */
export interface IUtrRegistry extends Document {
  utr: string;
  kind: 'booking' | 'topup';
  ref: string;
  createdAt: Date;
}

const UtrRegistrySchema = new Schema<IUtrRegistry>(
  {
    utr: { type: String, required: true, unique: true },
    kind: { type: String, enum: ['booking', 'topup'], required: true },
    ref: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const UtrRegistry: Model<IUtrRegistry> =
  mongoose.models.UtrRegistry || mongoose.model<IUtrRegistry>('UtrRegistry', UtrRegistrySchema);
