import mongoose, { Document, Schema, Model, Types } from 'mongoose';
import type { EncryptedSecret } from '../utils/secretBox.js';

/**
 * An OpenAI-compatible chat completions provider. The API key is stored only
 * in encrypted form and is never selected by default or sent to any client.
 */
export interface IAiProvider extends Document {
  _id: Types.ObjectId;
  name: string;
  baseUrl: string;
  apiKey: EncryptedSecret;
  keyHint: string;
  isActive: boolean;
  expiresAt: Date | null;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

const EncryptedSecretSchema = new Schema<EncryptedSecret>(
  {
    iv: { type: String, required: true },
    tag: { type: String, required: true },
    data: { type: String, required: true },
  },
  { _id: false }
);

const AiProviderSchema = new Schema<IAiProvider>(
  {
    name: { type: String, required: true, trim: true, maxlength: 60, unique: true },
    baseUrl: { type: String, required: true, trim: true, maxlength: 300 },
    apiKey: { type: EncryptedSecretSchema, required: true, select: false },
    keyHint: { type: String, default: '••••' },
    isActive: { type: Boolean, default: true },
    expiresAt: { type: Date, default: null },
    notes: { type: String, default: '', maxlength: 300 },
  },
  { timestamps: true }
);

export const AiProvider: Model<IAiProvider> =
  mongoose.models.AiProvider || mongoose.model<IAiProvider>('AiProvider', AiProviderSchema);
