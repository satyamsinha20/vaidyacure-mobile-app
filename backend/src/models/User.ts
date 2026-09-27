import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IDeviceInfo {
  platform?: string; // 'android' | 'ios' | 'web'
  osVersion?: string;
  brand?: string;
  model?: string;
  appVersion?: string;
  userAgent?: string;
}

export interface IUser extends Document {
  name: string;
  email: string;
  age: number;
  gender: 'male' | 'female' | 'other';
  ipAddress: string;
  deviceInfo: IDeviceInfo;
  isRegistered: boolean;
  firstOpenedAt: Date;
  lastActiveAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, 'Please provide user name'],
      trim: true,
      maxlength: [80, 'Name cannot exceed 80 characters'],
    },
    email: {
      type: String,
      required: [true, 'Please provide user email'],
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email address',
      ],
      index: true,
    },
    age: {
      type: Number,
      required: [true, 'Please provide user age'],
      min: [1, 'Age must be at least 1'],
      max: [120, 'Age cannot exceed 120'],
    },
    gender: {
      type: String,
      required: [true, 'Please select gender'],
      enum: {
        values: ['male', 'female', 'other'],
        message: '{VALUE} is not a supported gender',
      },
    },
    ipAddress: {
      type: String,
      default: 'Unknown',
      trim: true,
    },
    deviceInfo: {
      platform: { type: String, default: 'unknown' },
      osVersion: { type: String, default: 'unknown' },
      brand: { type: String, default: 'unknown' },
      model: { type: String, default: 'unknown' },
      appVersion: { type: String, default: '1.0.0' },
      userAgent: { type: String, default: 'mobile-app' },
    },
    isRegistered: {
      type: Boolean,
      default: true,
    },
    firstOpenedAt: {
      type: Date,
      default: Date.now,
    },
    lastActiveAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: 'users',
    timestamps: true,
  }
);

export const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
