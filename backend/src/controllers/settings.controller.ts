import type { Response } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { AuditLog } from '../models/AuditLog.js';
import { EmailSettings, DEFAULT_EMAIL } from '../models/EmailSettings.js';
import { EmailTemplate } from '../models/EmailTemplate.js';
import { MarketplaceSettings } from '../models/MarketplaceSettings.js';
import { encryptSecret, isEncryptionConfigured, randomToken, secretHint, sha256 } from '../utils/secretBox.js';
import { getClientIp } from '../services/rateLimit.js';
import { AppError, parseInput, route } from '../services/http.js';
import { EmailSchema } from '../services/patient/auth.js';
import { invalidateMailer, isEmailReady, sendTestMail } from '../services/email/mailer.js';
import {
  SAMPLE_VALUES,
  TEMPLATE_DEFS,
  TEMPLATE_KEYS,
  checkTemplate,
  invalidateTemplates,
  isTemplateKey,
  renderTemplate,
  type TemplateDef,
} from '../services/email/templates.js';

/**
 * Admin panel > Settings (super admin only): SMTP account, reminder (cron)
 * URL and the text of every email. API keys and search settings use the
 * existing /api/admin/ai endpoints.
 */
const audit = async (req: AuthenticatedRequest, action: string, target: string, details = '') => {
  await AuditLog.create({
    admin: req.admin!._id,
    adminEmail: req.admin!.email,
    action,
    target,
    details: details.slice(0, 500),
    ip: getClientIp(req),
  }).catch(() => {});
};

/* -------------------------------------------------------------------------- */
/* SMTP                                                                       */
/* -------------------------------------------------------------------------- */
export const getEmail = route(async (_req: AuthenticatedRequest, res: Response) => {
  const [email, cron] = await Promise.all([
    EmailSettings.findOne({ key: 'global' }).lean(),
    MarketplaceSettings.findOne({ key: 'global' }).select('+cronKeyHash').lean(),
  ]);
  res.json({
    status: 'success',
    data: {
      enabled: email?.enabled ?? DEFAULT_EMAIL.enabled,
      host: email?.host ?? DEFAULT_EMAIL.host,
      port: email?.port ?? DEFAULT_EMAIL.port,
      secure: email?.secure ?? DEFAULT_EMAIL.secure,
      user: email?.user ?? '',
      hasPassword: Boolean(email?.passHint),
      passHint: email?.passHint ?? '',
      fromName: email?.fromName ?? DEFAULT_EMAIL.fromName,
      fromEmail: email?.fromEmail ?? '',
      ready: await isEmailReady(),
      cronConfigured: Boolean(cron?.cronKeyHash || process.env.CRON_SECRET),
      encryptionConfigured: isEncryptionConfigured(),
    },
  });
});

const EmailInputSchema = z.object({
  enabled: z.boolean(),
  host: z.string().trim().min(3).max(120).regex(/^[a-zA-Z0-9.-]+$/, 'Host looks wrong'),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().trim().max(120),
  password: z.string().trim().min(8).max(200).optional(),
  fromName: z.string().trim().min(2).max(60),
  fromEmail: EmailSchema.or(z.literal('')),
  removePassword: z.boolean().optional(),
});

export const updateEmail = route(async (req: AuthenticatedRequest, res: Response) => {
  const input = parseInput(EmailInputSchema, req.body);
  if (input.password && !isEncryptionConfigured()) {
    throw new AppError(400, 'CONFIG_ENCRYPTION_KEY is not set on the server, so the password cannot be stored securely.');
  }
  const $set: Record<string, unknown> = {
    enabled: input.enabled,
    host: input.host,
    port: input.port,
    secure: input.secure,
    user: input.user,
    fromName: input.fromName,
    fromEmail: input.fromEmail,
  };
  // Gmail shows app passwords with spaces ("abcd efgh ijkl mnop"); SMTP needs them without
  const password = input.password?.replace(/\s+/g, '');
  if (password) {
    $set.pass = encryptSecret(password, 'email-password');
    $set.passHint = secretHint(password);
  } else if (input.removePassword) {
    $set.pass = null;
    $set.passHint = '';
  }
  await EmailSettings.findOneAndUpdate({ key: 'global' }, { $set }, { upsert: true, runValidators: true });
  invalidateMailer();
  await audit(req, 'email.update', input.user, password ? 'password changed' : input.removePassword ? 'password removed' : '');
  res.json({ status: 'success', message: 'Email settings saved.' });
});

export const testEmail = route(async (req: AuthenticatedRequest, res: Response) => {
  const { to } = parseInput(z.object({ to: EmailSchema }), req.body);
  res.json({ status: 'success', data: await sendTestMail(to) });
});

/** A new secret URL for an external cron service (the key is shown once) */
export const createCronKey = route(async (req: AuthenticatedRequest, res: Response) => {
  const key = randomToken(24);
  await MarketplaceSettings.findOneAndUpdate({ key: 'global' }, { $set: { cronKeyHash: sha256(key) } }, { upsert: true });
  await audit(req, 'cron.key', 'global');
  res.json({ status: 'success', data: { key } });
});

/* -------------------------------------------------------------------------- */
/* EMAIL TEMPLATES                                                            */
/* -------------------------------------------------------------------------- */
export const listTemplates = route(async (_req: AuthenticatedRequest, res: Response) => {
  const custom = await EmailTemplate.find().lean();
  res.json({
    status: 'success',
    data: TEMPLATE_KEYS.map((key) => {
      const def: TemplateDef = TEMPLATE_DEFS[key];
      const saved = custom.find((c) => c.key === key);
      return {
        key,
        name: def.name,
        description: def.description,
        placeholders: Object.entries(def.placeholders).map(([name, description]) => ({ name, description })),
        required: def.required,
        defaults: { subject: def.subject, body: def.body },
        custom: saved ? { subject: saved.subject, body: saved.body } : null,
        updatedAt: saved?.updatedAt ?? null,
        updatedByEmail: saved?.updatedByEmail ?? '',
      };
    }),
  });
});

const TemplateInputSchema = z.object({
  subject: z.string().trim().min(3, 'Write a subject').max(150),
  body: z.string().trim().min(10, 'Write the email text').max(3000),
});

const templateKey = (raw: unknown) => {
  const key = String(raw ?? '');
  if (!isTemplateKey(key)) throw new AppError(404, 'Unknown email.');
  return key;
};

export const saveTemplate = route(async (req: AuthenticatedRequest, res: Response) => {
  const key = templateKey(req.params.key);
  const input = parseInput(TemplateInputSchema, req.body);
  const problem = checkTemplate(key, input.subject, input.body);
  if (problem) throw new AppError(400, problem);
  await EmailTemplate.findOneAndUpdate(
    { key },
    { $set: { subject: input.subject, body: input.body, updatedByEmail: req.admin!.email } },
    { upsert: true, runValidators: true }
  );
  invalidateTemplates();
  await audit(req, 'email_template.update', key);
  res.json({ status: 'success', message: 'Email text saved.' });
});

export const resetTemplate = route(async (req: AuthenticatedRequest, res: Response) => {
  const key = templateKey(req.params.key);
  await EmailTemplate.deleteOne({ key });
  invalidateTemplates();
  await audit(req, 'email_template.reset', key);
  res.json({ status: 'success', message: 'Back to the default text.' });
});

/** Shows the email with example values, before saving */
export const previewTemplate = route(async (req: AuthenticatedRequest, res: Response) => {
  const key = templateKey(req.params.key);
  const input = parseInput(TemplateInputSchema, req.body);
  const problem = checkTemplate(key, input.subject, input.body);
  if (problem) throw new AppError(400, problem);
  res.json({ status: 'success', data: renderTemplate(input.subject, input.body, SAMPLE_VALUES) });
});
