import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ENV, getJwtSecret, ServerConfigError } from '../../config/constants.js';
import { Doctor, type IDoctor } from '../../models/Doctor.js';

/**
 * Real doctors log in on the admin panel's login page but get their own token
 * type ("doctor"). Admin routes reject it and doctor routes reject admin
 * tokens. Changing or resetting the password invalidates older logins.
 */
interface DoctorJwt {
  id: string;
  typ: string;
  ver: number;
}

export interface DoctorRequest extends Request {
  doctor?: IDoctor;
}

export const signDoctorToken = (doctor: Pick<IDoctor, '_id' | 'tokenVersion'>): string =>
  jwt.sign({ id: String(doctor._id), typ: 'doctor', ver: doctor.tokenVersion }, getJwtSecret(), {
    algorithm: 'HS256',
    expiresIn: ENV.JWT_EXPIRES_IN as any,
  });

const unauthorized = (res: Response, message = 'Please log in again.') =>
  res.status(401).json({ status: 'error', code: 'login_required', message });

export const authenticateDoctor = async (req: DoctorRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const header = req.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) return void unauthorized(res);
    const decoded = jwt.verify(header.slice(7).trim(), getJwtSecret(), { algorithms: ['HS256'] }) as DoctorJwt;
    if (decoded?.typ !== 'doctor' || typeof decoded.id !== 'string' || !/^[a-f0-9]{24}$/.test(decoded.id)) {
      return void unauthorized(res);
    }
    const doctor = await Doctor.findById(decoded.id);
    if (!doctor || !doctor.isActive || doctor.tokenVersion !== decoded.ver) {
      return void unauthorized(res, 'Your session has ended or the account was disabled. Please log in again.');
    }
    req.doctor = doctor;
    next();
  } catch (error) {
    if (error instanceof ServerConfigError) {
      res.status(500).json({ status: 'error', message: 'Server security is not configured. Contact the administrator.' });
      return;
    }
    unauthorized(res);
  }
};

/** Everything except the password/terms screens needs a changed password and accepted terms */
export const requireReadyDoctor = (req: DoctorRequest, res: Response, next: NextFunction): void => {
  if (req.doctor?.mustChangePassword) {
    res.status(403).json({ status: 'error', code: 'password_change_required', message: 'Please set a new password first.' });
    return;
  }
  if (!req.doctor?.termsAcceptedAt) {
    res.status(403).json({ status: 'error', code: 'terms_required', message: 'Please accept the doctor terms first.' });
    return;
  }
  next();
};

export const PasswordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use at most 72 characters')
  .regex(/[A-Za-z]/, 'Use at least one letter')
  .regex(/\d/, 'Use at least one number');

// No 0/O, 1/l/I: easy to read out to a doctor over the phone
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';

/** A random 12-character temporary password with letters and digits */
export const generateTempPassword = (): string => {
  const all = LETTERS + DIGITS;
  const chars = [LETTERS[crypto.randomInt(LETTERS.length)], DIGITS[crypto.randomInt(DIGITS.length)]];
  while (chars.length < 12) chars.push(all[crypto.randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};

/** A unique login id such as DR4821 */
export const generateDoctorCode = async (): Promise<string> => {
  for (let i = 0; i < 20; i++) {
    const code = `DR${crypto.randomInt(1000, 10000)}`;
    if (!(await Doctor.exists({ doctorCode: code }))) return code;
  }
  return `DR${crypto.randomInt(100000, 1000000)}`;
};
