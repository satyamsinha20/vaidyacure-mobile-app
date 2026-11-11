import { Request, Response } from 'express';
import { DiagnosisRequestSchema } from '../services/diagnosis/schemas.js';
import { DiagnosisError, runAnalysis } from '../services/diagnosis/engine.js';
import { consumeDailyQuota } from '../services/diagnosis/usageLimiter.js';

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
 * @desc    Check the patient's problem description, then return triage,
 *          possible conditions and remedies (one AI call)
 * @route   POST /api/diagnosis/analyze
 * @access  Public (Mobile App), rate-limited
 */
export const analyze = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = DiagnosisRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      // Problems with the description itself are answered without spending AI tokens
      if (issue?.path[0] === 'problem') {
        res.status(422).json({ status: 'error', code: 'too_vague', message: issue.message });
        return;
      }
      res.status(400).json({
        status: 'error',
        message: issue ? `${issue.path.join('.') || 'request'}: ${issue.message}` : 'Invalid request.',
      });
      return;
    }

    const quota = await consumeDailyQuota(getClientIp(req), getDeviceId(req));
    if (!quota.allowed) {
      res.status(429).json({ status: 'error', code: 'limit_reached', message: quota.message });
      return;
    }

    const data = await runAnalysis(parsed.data);
    res.json({ status: 'success', data });
  } catch (error) {
    if (error instanceof DiagnosisError) {
      res.status(error.status).json({ status: 'error', code: error.code, message: error.message });
      return;
    }
    console.error('[diagnosis] unhandled error:', error);
    res.status(500).json({ status: 'error', message: 'Something went wrong. Please try again.' });
  }
};
