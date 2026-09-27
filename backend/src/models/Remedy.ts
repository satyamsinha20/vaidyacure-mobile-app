import mongoose, { Document, Schema } from 'mongoose';

export interface IRemedy extends Document {
  name: string;
  category: string;
  excerpt?: string;
  description: string;
  imageUrl?: string;
  symptoms: string[];
  uses?: string[];
  precautions?: string;
  dosage?: string;
  preparation?: string;
  variety?: string;
  habitat?: string;
  lifespan?: string;
  notes?: string;
  status: 'Verified' | 'Pending' | 'Draft';
  addedBy: string;
  addedOn: string;
  createdAt: Date;
  updatedAt: Date;
}

const RemedySchema = new Schema<IRemedy>(
  {
    name: {
      type: String,
      required: [true, 'Please provide remedy name'],
      trim: true,
    },
    category: {
      type: String,
      required: [true, 'Please provide category'],
      trim: true,
      lowercase: true,
      index: true,
    },
    excerpt: {
      type: String,
      trim: true,
      default: '',
    },
    description: {
      type: String,
      required: [true, 'Please provide description'],
      trim: true,
    },
    imageUrl: {
      type: String,
      trim: true,
      default: '',
    },
    symptoms: {
      type: [String],
      default: [],
    },
    uses: {
      type: [String],
      default: [],
    },
    precautions: {
      type: String,
      trim: true,
      default: '',
    },
    dosage: {
      type: String,
      trim: true,
      default: '',
    },
    preparation: {
      type: String,
      trim: true,
      default: '',
    },
    variety: {
      type: String,
      trim: true,
      default: '',
    },
    habitat: {
      type: String,
      trim: true,
      default: '',
    },
    lifespan: {
      type: String,
      trim: true,
      default: '',
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['Verified', 'Pending', 'Draft'],
      default: 'Draft',
    },
    addedBy: {
      type: String,
      default: 'Admin',
    },
    addedOn: {
      type: String,
      default: () => {
        const d = new Date();
        return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
      },
    },
  },
  {
    timestamps: true,
  }
);

export const Remedy = mongoose.model<IRemedy>('Remedy', RemedySchema);
