import dotenv from 'dotenv';

dotenv.config();

export const ENV = {
  PORT: process.env.PORT || '5000',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/vaidyacure',
  JWT_SECRET: process.env.JWT_SECRET || 'vaidyacure_super_secret_jwt_key_2026_secured',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:3003',
  NODE_ENV: process.env.NODE_ENV || 'development',
} as const;

export const ADMIN_ROLES = {
  SUPERADMIN: 'superadmin',
  MODERATOR: 'moderator',
  EDITOR: 'editor',
  VIEWER: 'viewer',
} as const;

export type AdminRole = typeof ADMIN_ROLES[keyof typeof ADMIN_ROLES];
