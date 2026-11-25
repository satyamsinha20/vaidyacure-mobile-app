import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ConsultError } from './consult/modelCall.js';

/** An error whose message is safe to show to the user, with an HTTP status and a machine-readable code */
export class AppError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export const appError = (status: number, message: string, code?: string) => new AppError(status, message, code);

/** Validates input with a zod schema; the first problem becomes a 400 error */
export const parseInput = <T extends z.ZodType>(schema: T, value: unknown): z.infer<T> => {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue?.path.filter((p) => typeof p === 'string' || typeof p === 'number').join('.');
    throw new AppError(400, issue ? `${field ? `${field}: ` : ''}${issue.message}` : 'Invalid input.', 'invalid_input');
  }
  return result.data;
};

/** 24 hex characters (MongoDB id) or 32 hex characters (public booking id) */
export const objectIdParam = z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id');
export const publicIdParam = z.string().regex(/^[a-f0-9]{32}$/, 'Not found');

export const sendError = (res: Response, error: unknown, label = 'api'): void => {
  if (error instanceof AppError || error instanceof ConsultError) {
    res.status(error.status).json({ status: 'error', code: error.code, message: error.message });
    return;
  }
  if ((error as { code?: number })?.code === 11000) {
    res.status(409).json({ status: 'error', code: 'conflict', message: 'This was just changed by someone else. Please refresh and try again.' });
    return;
  }
  console.error(`[${label}] unhandled error:`, error);
  res.status(500).json({ status: 'error', message: 'Something went wrong. Please try again.' });
};

/** Wraps an async route handler so every error becomes a clean JSON response */
export const route =
  <R extends Request>(fn: (req: R, res: Response) => Promise<void>, label?: string) =>
  async (req: R, res: Response, _next: NextFunction): Promise<void> => {
    try {
      await fn(req, res);
    } catch (error) {
      sendError(res, error, label);
    }
  };
