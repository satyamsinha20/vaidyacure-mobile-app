import { Request, Response } from 'express';
import { DiagnosisRequestSchema, type DiagnosisRequest } from '../services/diagnosis/schemas.js';
import { DiagnosisError, runAnalysis, runInterview } from '../services/diagnosis/engine.js';
import { consumeDailyQuota, type UsageKind } from '../services/diagnosis/usageLimiter.js';

const getClientIp = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || req.ip || 'unknown';
};

const getDeviceId = (req: Request): string | undefined => {
  const raw = req.headers['x-device-id'];
  if (typeof raw !== 'string') return undefined;
  const clean = raw.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64);
  return clean.length >= 8 ? clean : undefined;
};

/**
 * Validates the body and applies the daily quota. Sends the error response
 * itself and returns null when the request must not continue.
 */
const prepareRequest = async (req: Request, res: Response, kind: UsageKind): Promise<DiagnosisRequest | null> => {
  const parsed = DiagnosisRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    res.status(400).json({
      status: 'error',
      message: issue ? `${issue.path.join('.') || 'request'}: ${issue.message}` : 'Invalid request.',
    });
    return null;
  }

  const quota = await consumeDailyQuota(kind, getClientIp(req), getDeviceId(req));
  if (!quota.allowed) {
    res.status(429).json({ status: 'error', message: quota.message });
    return null;
  }
  return parsed.data;
};

const sendError = (res: Response, error: unknown): void => {
  if (error instanceof DiagnosisError) {
    res.status(error.status).json({ status: 'error', message: error.message });
    return;
  }
  console.error('[diagnosis] unhandled error:', error);
  res.status(500).json({ status: 'error', message: 'Something went wrong. Please try again.' });
};

/**
 * @desc    Next round of adaptive follow-up questions
 * @route   POST /api/diagnosis/interview
 * @access  Public (Mobile App), rate-limited
 */
export const interview = async (req: Request, res: Response): Promise<void> => {
  try {
    const request = await prepareRequest(req, res, 'interview');
    if (!request) return;
    const data = await runInterview(request);
    res.json({ status: 'success', data });
  } catch (error) {
    sendError(res, error);
  }
};

/**
 * @desc    Differential diagnosis, triage and remedies
 * @route   POST /api/diagnosis/analyze
 * @access  Public (Mobile App), rate-limited
 */
export const analyze = async (req: Request, res: Response): Promise<void> => {
  try {
    const request = await prepareRequest(req, res, 'analysis');
    if (!request) return;
    const data = await runAnalysis(request);
    res.json({ status: 'success', data });
  } catch (error) {
    sendError(res, error);
  }
};
