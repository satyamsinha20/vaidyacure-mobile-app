import crypto from 'crypto';

/**
 * AES-256-GCM encryption for secrets stored in MongoDB (AI provider API keys).
 * The 32-byte master key lives only in the CONFIG_ENCRYPTION_KEY env var (base64),
 * so a database leak alone never exposes a usable key.
 */
export interface EncryptedSecret {
  iv: string;
  tag: string;
  data: string;
}

const ALGORITHM = 'aes-256-gcm';

/**
 * What a secret is for. It is bound into the ciphertext (AES-GCM additional
 * data), so a value encrypted for one purpose cannot be swapped into another
 * field and decrypted there.
 */
export type SecretPurpose = 'ai-provider-key' | 'email-password' | 'doctor-bank';
const aadFor = (purpose: SecretPurpose) => Buffer.from(`vaidyacure:${purpose}:v1`);

export class EncryptionNotConfiguredError extends Error {
  constructor() {
    super('CONFIG_ENCRYPTION_KEY is missing or invalid (expected 32 random bytes, base64-encoded).');
  }
}

const getMasterKey = (): Buffer => {
  const raw = process.env.CONFIG_ENCRYPTION_KEY?.trim();
  if (!raw) throw new EncryptionNotConfiguredError();
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new EncryptionNotConfiguredError();
  return key;
};

export const isEncryptionConfigured = (): boolean => {
  try {
    getMasterKey();
    return true;
  } catch {
    return false;
  }
};

export const encryptSecret = (plainText: string, purpose: SecretPurpose = 'ai-provider-key'): EncryptedSecret => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getMasterKey(), iv);
  cipher.setAAD(aadFor(purpose));
  const data = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
};

export const decryptSecret = (secret: EncryptedSecret, purpose: SecretPurpose = 'ai-provider-key'): string => {
  const decipher = crypto.createDecipheriv(ALGORITHM, getMasterKey(), Buffer.from(secret.iv, 'base64'));
  decipher.setAAD(aadFor(purpose));
  decipher.setAuthTag(Buffer.from(secret.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(secret.data, 'base64')), decipher.final()]).toString('utf8');
};

/** Short, non-reversible hint shown in the admin panel instead of the key */
export const secretHint = (plainText: string): string => {
  const clean = plainText.trim();
  if (clean.length <= 8) return '••••';
  return `${clean.slice(0, 4)}••••${clean.slice(-4)}`;
};

export const sha256 = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');

/** Constant-time comparison of two hex digests (avoids timing leaks on secret checks) */
export const safeEqualHex = (a: string, b: string): boolean => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || a.length % 2 !== 0) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
};

export const randomToken = (bytes = 24): string => crypto.randomBytes(bytes).toString('hex');
