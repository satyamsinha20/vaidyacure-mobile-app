import { Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { AiProvider } from '../models/AiProvider.js';
import { AiDoctor } from '../models/AiDoctor.js';
import { AiSettings } from '../models/AiSettings.js';
import { AuditLog } from '../models/AuditLog.js';
import { IS_PRODUCTION } from '../config/constants.js';
import { decryptSecret, encryptSecret, isEncryptionConfigured, secretHint } from '../utils/secretBox.js';
import { createChatCompletion, listProviderModels, FatalProviderError } from '../services/ai/llmClient.js';
import { ensureAiSeeded, getAiSettings, invalidateAiConfigCache } from '../services/ai/configStore.js';
import { getClientIp } from '../services/rateLimit.js';

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */
class AdminInputError extends Error {}

const fail = (res: Response, status: number, message: string) => res.status(status).json({ status: 'error', message });

const handle =
  (fn: (req: AuthenticatedRequest, res: Response) => Promise<void>) =>
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error instanceof AdminInputError) {
        fail(res, 400, error.message);
        return;
      }
      console.error('[ai-admin] error:', error instanceof Error ? error.message : error);
      fail(res, 500, 'Something went wrong. Please try again.');
    }
  };

const parse = <T extends z.ZodType>(schema: T, body: unknown): z.infer<T> => {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new AdminInputError(issue ? `${issue.path.join('.') || 'input'}: ${issue.message}` : 'Invalid input.');
  }
  return result.data;
};

const audit = async (req: AuthenticatedRequest, action: string, target: string, details = '') => {
  if (!req.admin) return;
  await AuditLog.create({
    admin: req.admin._id,
    adminEmail: req.admin.email,
    action,
    target,
    details: details.slice(0, 500),
    ip: getClientIp(req),
  }).catch(() => {});
};

const PRIVATE_HOST = /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i;

/** Only https URLs to public hosts, without credentials (plain http only for localhost in development) */
const normalizeBaseUrl = (raw: string): string => {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new AdminInputError('Base URL is not a valid URL.');
  }
  if (url.username || url.password) throw new AdminInputError('Base URL must not contain credentials.');
  const isLocal = /^(localhost|127\.0\.0\.1)$/.test(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal && !IS_PRODUCTION)) {
    throw new AdminInputError('Base URL must start with https://');
  }
  if (IS_PRODUCTION && PRIVATE_HOST.test(url.hostname)) throw new AdminInputError('Base URL must be a public address.');
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
};

const requireEncryption = () => {
  if (!isEncryptionConfigured()) {
    throw new AdminInputError('CONFIG_ENCRYPTION_KEY is not set on the server, so API keys cannot be stored securely.');
  }
};

const objectId = z.string().refine((v) => mongoose.isValidObjectId(v), 'Invalid id');
const optionalDate = z
  .string()
  .trim()
  .nullable()
  .optional()
  .refine((v) => !v || !Number.isNaN(new Date(v).getTime()), 'Invalid date');
const modelId = z.string().trim().min(1).max(120).regex(/^[\w.\-/:@]+$/, 'Model id contains invalid characters');

const loadCreds = async (providerId: string) => {
  const provider = await AiProvider.findById(providerId).select('+apiKey').lean();
  if (!provider) return null;
  return { provider, creds: { baseUrl: provider.baseUrl, apiKey: decryptSecret(provider.apiKey) } };
};

const modelsCache = new Map<string, { at: number; models: string[] }>();

/* -------------------------------------------------------------------------- */
/* STATUS                                                                     */
/* -------------------------------------------------------------------------- */
export const getStatus = handle(async (_req, res) => {
  await ensureAiSeeded();
  const [providers, doctors] = await Promise.all([AiProvider.countDocuments(), AiDoctor.countDocuments()]);
  res.json({ status: 'success', data: { encryptionConfigured: isEncryptionConfigured(), providers, doctors } });
});

/* -------------------------------------------------------------------------- */
/* PROVIDERS                                                                  */
/* -------------------------------------------------------------------------- */
const ProviderCreateSchema = z.object({
  name: z.string().trim().min(2).max(60),
  baseUrl: z.string().trim().min(8).max(300),
  apiKey: z.string().trim().min(8).max(500),
  isActive: z.boolean().optional(),
  expiresAt: optionalDate,
  notes: z.string().trim().max(300).optional(),
});
const ProviderUpdateSchema = ProviderCreateSchema.partial().extend({ apiKey: z.string().trim().max(500).optional() });

const providerView = (p: any, doctorsCount = 0) => ({
  id: String(p._id),
  name: p.name,
  baseUrl: p.baseUrl,
  keyHint: p.keyHint,
  isActive: p.isActive,
  expiresAt: p.expiresAt,
  notes: p.notes,
  doctorsCount,
  updatedAt: p.updatedAt,
});

export const listProviders = handle(async (_req, res) => {
  await ensureAiSeeded();
  const providers = await AiProvider.find().sort({ createdAt: 1 }).lean();
  const counts = await AiDoctor.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([
    { $group: { _id: '$provider', n: { $sum: 1 } } },
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c.n]));
  res.json({ status: 'success', data: providers.map((p) => providerView(p, byId.get(String(p._id)) ?? 0)) });
});

export const createProvider = handle(async (req, res) => {
  requireEncryption();
  const input = parse(ProviderCreateSchema, req.body);
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  if (await AiProvider.exists({ name: input.name })) throw new AdminInputError('A provider with this name already exists.');
  const provider = await AiProvider.create({
    name: input.name,
    baseUrl,
    apiKey: encryptSecret(input.apiKey),
    keyHint: secretHint(input.apiKey),
    isActive: input.isActive ?? true,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    notes: input.notes ?? '',
  });
  invalidateAiConfigCache();
  await audit(req, 'provider.create', provider.name, baseUrl);
  res.status(201).json({ status: 'success', data: providerView(provider.toObject()) });
});

export const updateProvider = handle(async (req, res) => {
  const id = parse(objectId, req.params.id);
  const input = parse(ProviderUpdateSchema, req.body);
  const provider = await AiProvider.findById(id);
  if (!provider) return void fail(res, 404, 'Provider not found.');

  const changes: string[] = [];
  if (input.baseUrl !== undefined) {
    const baseUrl = normalizeBaseUrl(input.baseUrl);
    if (baseUrl !== provider.baseUrl) {
      // Changing where requests go must come with a fresh key: an attacker with a
      // stolen admin session cannot redirect the stored key to their own server
      if (!input.apiKey) throw new AdminInputError('Please enter the API key again when changing the base URL.');
      provider.baseUrl = baseUrl;
      changes.push('baseUrl');
    }
  }
  if (input.apiKey) {
    requireEncryption();
    provider.apiKey = encryptSecret(input.apiKey);
    provider.keyHint = secretHint(input.apiKey);
    changes.push('apiKey');
  }
  if (input.name !== undefined && input.name !== provider.name) {
    if (await AiProvider.exists({ name: input.name, _id: { $ne: provider._id } })) {
      throw new AdminInputError('A provider with this name already exists.');
    }
    provider.name = input.name;
    changes.push('name');
  }
  if (input.isActive !== undefined) {
    provider.isActive = input.isActive;
    changes.push(`isActive=${input.isActive}`);
  }
  if (input.expiresAt !== undefined) {
    provider.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    changes.push('expiresAt');
  }
  if (input.notes !== undefined) provider.notes = input.notes;

  await provider.save();
  invalidateAiConfigCache();
  await audit(req, 'provider.update', provider.name, changes.join(', '));
  res.json({ status: 'success', data: providerView(provider.toObject()) });
});

export const deleteProvider = handle(async (req, res) => {
  const id = parse(objectId, req.params.id);
  const inUse = await AiDoctor.countDocuments({ $or: [{ provider: id }, { fallbackProvider: id }] });
  if (inUse > 0) return void fail(res, 409, `This provider is used by ${inUse} doctor(s). Move them to another provider first.`);
  const provider = await AiProvider.findByIdAndDelete(id);
  if (!provider) return void fail(res, 404, 'Provider not found.');
  invalidateAiConfigCache();
  await audit(req, 'provider.delete', provider.name);
  res.json({ status: 'success', message: 'Provider deleted.' });
});

export const testProvider = handle(async (req, res) => {
  const id = parse(objectId, req.params.id);
  const loaded = await loadCreds(id);
  if (!loaded) return void fail(res, 404, 'Provider not found.');
  const started = Date.now();
  try {
    const models = await listProviderModels(loaded.creds, 60_000);
    modelsCache.set(id, { at: Date.now(), models });
    res.json({ status: 'success', data: { ok: true, latencyMs: Date.now() - started, modelsCount: models.length } });
  } catch (error) {
    const status = error instanceof FatalProviderError ? error.status : undefined;
    res.json({
      status: 'success',
      data: { ok: false, latencyMs: Date.now() - started, message: status ? `Provider responded with HTTP ${status}.` : 'Could not reach the provider.' },
    });
  }
});

export const getProviderModels = handle(async (req, res) => {
  const id = parse(objectId, req.params.id);
  const cached = modelsCache.get(id);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) {
    res.json({ status: 'success', data: cached.models });
    return;
  }
  const loaded = await loadCreds(id);
  if (!loaded) return void fail(res, 404, 'Provider not found.');
  try {
    const models = await listProviderModels(loaded.creds, 60_000);
    modelsCache.set(id, { at: Date.now(), models });
    res.json({ status: 'success', data: models });
  } catch {
    fail(res, 502, 'Could not load models from this provider.');
  }
});

/* -------------------------------------------------------------------------- */
/* DOCTORS                                                                    */
/* -------------------------------------------------------------------------- */
const DoctorSchema = z.object({
  name: z.string().trim().min(2).max(60),
  designation: z.string().trim().min(2).max(60),
  about: z.string().trim().max(200).optional(),
  tier: z.enum(['free', 'premium']),
  providerId: objectId,
  model: modelId,
  fallbackProviderId: objectId.nullable().optional(),
  fallbackModel: z.union([modelId, z.literal('')]).optional(),
  avatarColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use a colour like #157347').optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  estimatedCostInr: z.number().min(0).max(1000).optional(),
});

const doctorView = (d: any) => ({
  id: String(d._id),
  name: d.name,
  designation: d.designation,
  about: d.about,
  tier: d.tier,
  providerId: d.provider ? String(d.provider._id ?? d.provider) : null,
  providerName: d.provider?.name ?? null,
  model: d.modelId,
  fallbackProviderId: d.fallbackProvider ? String(d.fallbackProvider._id ?? d.fallbackProvider) : null,
  fallbackModel: d.fallbackModel,
  avatarColor: d.avatarColor,
  isActive: d.isActive,
  sortOrder: d.sortOrder,
  estimatedCostInr: d.estimatedCostInr,
  updatedAt: d.updatedAt,
});

const doctorFields = async (input: z.infer<typeof DoctorSchema>) => {
  if (!(await AiProvider.exists({ _id: input.providerId }))) throw new AdminInputError('Selected provider does not exist.');
  if (input.fallbackProviderId && !(await AiProvider.exists({ _id: input.fallbackProviderId }))) {
    throw new AdminInputError('Selected fallback provider does not exist.');
  }
  const hasFallback = Boolean(input.fallbackProviderId && input.fallbackModel);
  return {
    name: input.name,
    designation: input.designation,
    about: input.about ?? '',
    tier: input.tier,
    provider: input.providerId,
    modelId: input.model,
    fallbackProvider: hasFallback ? input.fallbackProviderId : null,
    fallbackModel: hasFallback ? input.fallbackModel : '',
    avatarColor: input.avatarColor ?? '#157347',
    isActive: input.isActive ?? true,
    sortOrder: input.sortOrder ?? 0,
    estimatedCostInr: input.estimatedCostInr ?? 0,
  };
};

export const listDoctors = handle(async (_req, res) => {
  await ensureAiSeeded();
  const doctors = await AiDoctor.find().sort({ sortOrder: 1, createdAt: 1 }).populate('provider', 'name').lean();
  res.json({ status: 'success', data: doctors.map(doctorView) });
});

export const createDoctor = handle(async (req, res) => {
  const input = parse(DoctorSchema, req.body);
  const doctor = await AiDoctor.create(await doctorFields(input));
  invalidateAiConfigCache();
  await audit(req, 'doctor.create', doctor.name, `${doctor.tier} · ${doctor.modelId}`);
  res.status(201).json({ status: 'success', data: doctorView(doctor.toObject()) });
});

export const updateDoctor = handle(async (req, res) => {
  const id = parse(objectId, req.params.id);
  const input = parse(DoctorSchema, req.body);
  const doctor = await AiDoctor.findByIdAndUpdate(id, { $set: await doctorFields(input) }, { new: true, runValidators: true }).lean();
  if (!doctor) return void fail(res, 404, 'Doctor not found.');
  invalidateAiConfigCache();
  await audit(req, 'doctor.update', doctor.name, `${doctor.tier} · ${doctor.modelId} · active=${doctor.isActive}`);
  res.json({ status: 'success', data: doctorView(doctor) });
});

export const deleteDoctor = handle(async (req, res) => {
  const id = parse(objectId, req.params.id);
  const doctor = await AiDoctor.findByIdAndDelete(id).lean();
  if (!doctor) return void fail(res, 404, 'Doctor not found.');
  invalidateAiConfigCache();
  await audit(req, 'doctor.delete', doctor.name);
  res.json({ status: 'success', message: 'Doctor deleted.' });
});

/** Sends one tiny message through the doctor's model to confirm it works */
export const testDoctor = handle(async (req, res) => {
  const id = parse(objectId, req.params.id);
  const doctor = await AiDoctor.findById(id).lean();
  if (!doctor) return void fail(res, 404, 'Doctor not found.');
  const loaded = await loadCreds(String(doctor.provider));
  if (!loaded) return void fail(res, 404, 'Provider not found.');
  try {
    const result = await createChatCompletion(loaded.creds, {
      model: doctor.modelId,
      messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
      maxTokens: 20,
      timeoutMs: 45_000,
    });
    res.json({ status: 'success', data: { ok: true, latencyMs: result.ms, reply: result.content.slice(0, 40) } });
  } catch (error) {
    const status = error instanceof FatalProviderError ? error.status : undefined;
    res.json({ status: 'success', data: { ok: false, message: status ? `Provider responded with HTTP ${status}.` : 'Could not reach the provider.' } });
  }
});

/* -------------------------------------------------------------------------- */
/* SETTINGS                                                                   */
/* -------------------------------------------------------------------------- */
const SettingsSchema = z.object({
  premiumPriceInr: z.number().int().min(1).max(5000),
  premiumAdsRequired: z.number().int().min(1).max(10),
  consultationSeconds: z.number().int().min(60).max(900),
  maxUserMessages: z.number().int().min(2).max(20),
  freeConsultsPerDevicePerDay: z.number().int().min(0).max(100),
  premiumUnlocksPerDevicePerDay: z.number().int().min(0).max(50),
  adUnlocksPerDevicePerDay: z.number().int().min(0).max(50),
  globalConsultsPerDay: z.number().int().min(0).max(100000),
  paymentMode: z.enum(['test', 'disabled']),
  adsMode: z.enum(['test', 'disabled']),
});

export const getSettings = handle(async (_req, res) => {
  res.json({ status: 'success', data: await getAiSettings() });
});

export const updateSettings = handle(async (req, res) => {
  const input = parse(SettingsSchema, req.body);
  await AiSettings.findOneAndUpdate({ key: 'global' }, { $set: input }, { upsert: true, runValidators: true });
  invalidateAiConfigCache();
  await audit(req, 'settings.update', 'global', JSON.stringify(input));
  res.json({ status: 'success', data: await getAiSettings() });
});

/* -------------------------------------------------------------------------- */
/* AUDIT LOG                                                                  */
/* -------------------------------------------------------------------------- */
export const listAudit = handle(async (_req, res) => {
  const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(100).lean();
  res.json({
    status: 'success',
    data: logs.map((l) => ({
      id: String(l._id),
      adminEmail: l.adminEmail,
      action: l.action,
      target: l.target,
      details: l.details,
      createdAt: l.createdAt,
    })),
  });
});
