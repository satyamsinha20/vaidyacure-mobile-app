import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getJwtSecret } from '../../config/constants.js';
import { EmailOtp } from '../../models/EmailOtp.js';
import { Patient, type IPatient } from '../../models/Patient.js';
import { PatientSession } from '../../models/PatientSession.js';
import { randomToken, safeEqualHex, sha256 } from '../../utils/secretBox.js';
import { incrementCounter } from '../rateLimit.js';
import { sendMail } from '../email/mailer.js';
import { otpMail } from '../email/templates.js';
import { AppError } from '../http.js';
import { paiseToRupees } from '../../utils/money.js';

/**
 * Patient login with a 6-digit email code (OTP), then a random session token.
 *
 * - The code is stored only as an HMAC keyed with a server secret, so even a
 *   database leak cannot reveal or brute-force it offline.
 * - 5 wrong tries delete the code; requests are limited per email, IP and device.
 * - The code works once. The session token is stored only as SHA-256.
 */
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const RESEND_AFTER_MS = 45 * 1000;
const SESSION_TTL_MS = 60 * 24 * 60 * 60 * 1000;
const MAX_SESSIONS = 5;
const HOUR_MS = 60 * 60 * 1000;
export const SESSION_TOKEN_PATTERN = /^vcp_[a-f0-9]{64}$/;

const EMAIL_PATTERN = /^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}$/;

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(120, 'Email is too long')
  .regex(EMAIL_PATTERN, 'Please enter a valid email address');

export const OtpRequestSchema = z.object({ email: EmailSchema });
export const OtpVerifySchema = z.object({
  email: EmailSchema,
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from the email'),
});

const otpHash = (email: string, code: string) =>
  crypto.createHmac('sha256', getJwtSecret()).update(`patient-otp:v1:${email}:${code}`).digest('hex');

interface Who {
  ip: string;
  deviceId?: string;
}

const limit = async (key: string, max: number, message: string) => {
  if ((await incrementCounter(key, 2 * HOUR_MS)) > max) throw new AppError(429, message, 'rate_limited');
};

export const requestLoginCode = async (email: string, who: Who): Promise<{ expiresInSeconds: number }> => {
  // A too-early "resend" tap sends nothing, so it does not use up the hourly limit
  const existing = await EmailOtp.findOne({ email }).lean();
  if (existing && Date.now() - existing.sentAt.getTime() < RESEND_AFTER_MS) {
    throw new AppError(429, 'A code was just sent. Please wait a few seconds before asking again.', 'wait');
  }
  const hour = Math.floor(Date.now() / HOUR_MS);
  const tooMany = 'Too many login codes requested. Please try again in an hour.';
  await limit(`otp:req:email:${email}:${hour}`, 5, tooMany);
  await limit(`otp:req:ip:${who.ip}:${hour}`, 20, tooMany);
  if (who.deviceId) await limit(`otp:req:device:${who.deviceId}:${hour}`, 10, tooMany);

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const now = Date.now();
  await EmailOtp.findOneAndUpdate(
    { email },
    { $set: { codeHash: otpHash(email, code), attempts: 0, sentAt: new Date(now), expiresAt: new Date(now + OTP_TTL_MS) } },
    { upsert: true }
  );
  if (!(await sendMail(otpMail(email, code)))) {
    await EmailOtp.deleteOne({ email });
    throw new AppError(503, 'We could not send the email right now. Please try again in a few minutes.', 'email_unavailable');
  }
  return { expiresInSeconds: OTP_TTL_MS / 1000 };
};

export const patientView = (p: Pick<IPatient, '_id' | 'email' | 'name' | 'upiId' | 'walletPaise' | 'createdAt'>) => ({
  id: String(p._id),
  email: p.email,
  name: p.name,
  upiId: p.upiId,
  wallet: paiseToRupees(p.walletPaise),
  createdAt: p.createdAt,
});

export const verifyLoginCode = async (email: string, code: string, who: Who) => {
  const hour = Math.floor(Date.now() / HOUR_MS);
  await limit(`otp:verify:ip:${who.ip}:${hour}`, 40, 'Too many attempts. Please try again in an hour.');

  // Count the attempt before checking the code, atomically (parallel guesses cannot exceed the limit)
  const otp = await EmailOtp.findOneAndUpdate(
    { email, expiresAt: { $gt: new Date() }, attempts: { $lt: OTP_MAX_ATTEMPTS } },
    { $inc: { attempts: 1 } },
    { new: true }
  ).lean();
  if (!otp) throw new AppError(400, 'This code has expired. Please ask for a new code.', 'otp_expired');

  if (!safeEqualHex(otp.codeHash, otpHash(email, code))) {
    const left = OTP_MAX_ATTEMPTS - otp.attempts;
    if (left <= 0) {
      await EmailOtp.deleteOne({ _id: otp._id });
      throw new AppError(400, 'Too many wrong codes. Please ask for a new code.', 'otp_expired');
    }
    throw new AppError(400, `Wrong code. ${left} ${left === 1 ? 'try' : 'tries'} left.`, 'otp_wrong');
  }

  // Single use: only the request that deletes the code may log in
  const removed = await EmailOtp.deleteOne({ _id: otp._id, codeHash: otp.codeHash });
  if (removed.deletedCount !== 1) throw new AppError(400, 'This code has expired. Please ask for a new code.', 'otp_expired');

  let patient: IPatient | null;
  try {
    patient = await Patient.findOneAndUpdate(
      { email },
      { $setOnInsert: { email }, $set: { lastLoginAt: new Date() } },
      { upsert: true, new: true }
    );
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
    patient = await Patient.findOneAndUpdate({ email }, { $set: { lastLoginAt: new Date() } }, { new: true });
  }
  if (!patient) throw new AppError(500, 'Could not log in. Please try again.');
  if (patient.isBlocked) throw new AppError(403, 'This account has been blocked. Please contact VaidyaCure support.', 'blocked');

  const token = `vcp_${randomToken(32)}`;
  await PatientSession.create({
    tokenHash: sha256(token),
    patient: patient._id,
    deviceId: who.deviceId ?? '',
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  // Keep only the newest sessions of this account
  const old = await PatientSession.find({ patient: patient._id }).sort({ createdAt: -1 }).skip(MAX_SESSIONS).select('_id').lean();
  if (old.length) await PatientSession.deleteMany({ _id: { $in: old.map((s) => s._id) } });

  return { token, patient: patientView(patient) };
};

export const logoutPatient = async (token: string): Promise<void> => {
  await PatientSession.deleteOne({ tokenHash: sha256(token) });
};

/* -------------------------------------------------------------------------- */
/* MIDDLEWARE                                                                 */
/* -------------------------------------------------------------------------- */
export interface PatientRequest extends Request {
  patient?: IPatient;
  patientToken?: string;
}

const bearer = (req: Request): string | null => {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim();
};

const loadPatient = async (token: string): Promise<IPatient | null> => {
  if (!SESSION_TOKEN_PATTERN.test(token)) return null;
  const session = await PatientSession.findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date() } }).lean();
  if (!session) return null;
  const patient = await Patient.findById(session.patient);
  return patient && !patient.isBlocked ? patient : null;
};

const loginRequired = (res: Response) =>
  res.status(401).json({ status: 'error', code: 'login_required', message: 'Please log in with your email to continue.' });

/** Requires a logged-in patient */
export const authenticatePatient = async (req: PatientRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = bearer(req);
    const patient = token ? await loadPatient(token) : null;
    if (!patient) return void loginRequired(res);
    req.patient = patient;
    req.patientToken = token!;
    next();
  } catch (error) {
    next(error);
  }
};

/** Attaches the patient when a valid token is sent; an invalid token is still an error */
export const optionalPatient = async (req: PatientRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = bearer(req);
    if (!token) return next();
    const patient = await loadPatient(token);
    if (!patient) return void loginRequired(res);
    req.patient = patient;
    req.patientToken = token;
    next();
  } catch (error) {
    next(error);
  }
};
