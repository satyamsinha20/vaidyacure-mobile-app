import dotenv from 'dotenv';

dotenv.config();

export const IS_PRODUCTION = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);

export const ENV = {
  PORT: process.env.PORT || '5000',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/vaidyacure',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:3003',
  NODE_ENV: process.env.NODE_ENV || 'development',
} as const;

// This value was committed to the public repository earlier, so it must never be accepted
const LEAKED_JWT_SECRET = 'vaidyacure_super_secret_jwt_key_2026_secured';
const DEV_ONLY_JWT_SECRET = 'local-development-only-jwt-secret-do-not-use';

export class ServerConfigError extends Error {}

/**
 * Secret used to sign admin sessions. In production a strong JWT_SECRET env var is
 * mandatory: without it anyone could forge admin tokens, so auth fails closed.
 */
export const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret && secret !== LEAKED_JWT_SECRET && secret.length >= 16) return secret;
  if (IS_PRODUCTION) {
    throw new ServerConfigError('JWT_SECRET is missing or too weak. Set a long random JWT_SECRET in the server environment.');
  }
  return DEV_ONLY_JWT_SECRET;
};

export const ADMIN_ROLES = {
  SUPERADMIN: 'superadmin',
  MODERATOR: 'moderator',
  EDITOR: 'editor',
  VIEWER: 'viewer',
} as const;

export type AdminRole = typeof ADMIN_ROLES[keyof typeof ADMIN_ROLES];
