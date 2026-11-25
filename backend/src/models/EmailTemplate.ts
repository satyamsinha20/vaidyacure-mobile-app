import mongoose, { Document, Schema, Model } from 'mongoose';

/** An admin-edited email text. When there is none, the built-in default text is used. */
export interface IEmailTemplate extends Document {
  key: string;
  subject: string;
  body: string;
  updatedByEmail: string;
  updatedAt: Date;
}

const EmailTemplateSchema = new Schema<IEmailTemplate>(
  {
    key: { type: String, required: true, unique: true },
    subject: { type: String, required: true, maxlength: 150 },
    body: { type: String, required: true, maxlength: 3000 },
    updatedByEmail: { type: String, default: '' },
  },
  { timestamps: true }
);

export const EmailTemplate: Model<IEmailTemplate> =
  mongoose.models.EmailTemplate || mongoose.model<IEmailTemplate>('EmailTemplate', EmailTemplateSchema);
