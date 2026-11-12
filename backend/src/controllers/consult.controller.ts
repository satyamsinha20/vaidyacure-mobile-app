import { Request, Response } from 'express';
import { getAiSettings, listPublicDoctors } from '../services/ai/configStore.js';
import {
  CONSULTATION_ID_PATTERN,
  ConsultMessageSchema,
  StartConsultationSchema,
  generateConsultReport,
  sendConsultMessage,
  startConsultation,
} from '../services/consult/consultService.js';
import { ConsultError } from '../services/consult/modelCall.js';
import { purchasePremiumTest, recordAdReward } from '../services/consult/premiumService.js';
import { getClientIp, getDeviceId } from '../services/rateLimit.js';

const sendError = (res: Response, error: unknown): void => {
  if (error instanceof ConsultError) {
    res.status(error.status).json({ status: 'error', code: error.code, message: error.message });
    return;
  }
  console.error('[consult] unhandled error:', error);
  res.status(500).json({ status: 'error', message: 'Something went wrong. Please try again.' });
};

const requireDevice = (req: Request, res: Response): string | null => {
  const deviceId = getDeviceId(req);
  if (!deviceId) {
    res.status(400).json({ status: 'error', message: 'Please update the app and try again.' });
    return null;
  }
  return deviceId;
};

const requireConsultationId = (req: Request, res: Response): string | null => {
  const id = String(req.params.id ?? '');
  if (!CONSULTATION_ID_PATTERN.test(id)) {
    res.status(404).json({ status: 'error', message: 'Consultation not found.' });
    return null;
  }
  return id;
};

/**
 * @desc    Doctors shown in the app and the consultation/premium rules
 * @route   GET /api/consult/doctors
 * @access  Public (Mobile App)
 */
export const getDoctors = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [doctors, settings] = await Promise.all([listPublicDoctors(), getAiSettings()]);
    res.json({
      status: 'success',
      data: {
        doctors,
        rules: {
          premiumPriceInr: settings.premiumPriceInr,
          premiumAdsRequired: settings.premiumAdsRequired,
          consultationSeconds: settings.consultationSeconds,
          maxUserMessages: settings.maxUserMessages,
          paymentMode: settings.paymentMode,
          adsMode: settings.adsMode,
        },
      },
    });
  } catch (error) {
    sendError(res, error);
  }
};

/**
 * @route   POST /api/consult/start
 * @access  Public (Mobile App), limited per device/IP, premium needs an unlock token
 */
export const start = async (req: Request, res: Response): Promise<void> => {
  try {
    const deviceId = requireDevice(req, res);
    if (!deviceId) return;
    const parsed = StartConsultationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ status: 'error', message: parsed.error.issues[0]?.message ?? 'Invalid request.' });
      return;
    }
    const data = await startConsultation(deviceId, getClientIp(req), parsed.data);
    res.status(201).json({ status: 'success', data });
  } catch (error) {
    sendError(res, error);
  }
};

/**
 * @route   POST /api/consult/:id/message
 * @access  Public (Mobile App), only the device that started the consultation
 */
export const message = async (req: Request, res: Response): Promise<void> => {
  try {
    const deviceId = requireDevice(req, res);
    if (!deviceId) return;
    const id = requireConsultationId(req, res);
    if (!id) return;
    const parsed = ConsultMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ status: 'error', message: parsed.error.issues[0]?.message ?? 'Invalid message.' });
      return;
    }
    const data = await sendConsultMessage(deviceId, id, parsed.data.text);
    res.json({ status: 'success', data });
  } catch (error) {
    sendError(res, error);
  }
};

/**
 * @route   POST /api/consult/:id/report
 * @access  Public (Mobile App), only the device that started the consultation
 */
export const report = async (req: Request, res: Response): Promise<void> => {
  try {
    const deviceId = requireDevice(req, res);
    if (!deviceId) return;
    const id = requireConsultationId(req, res);
    if (!id) return;
    const data = await generateConsultReport(deviceId, id);
    res.json({ status: 'success', data });
  } catch (error) {
    sendError(res, error);
  }
};

/**
 * @route   POST /api/consult/premium/purchase   (TEST mode: no real payment yet)
 */
export const premiumPurchase = async (req: Request, res: Response): Promise<void> => {
  try {
    const deviceId = requireDevice(req, res);
    if (!deviceId) return;
    const data = await purchasePremiumTest(deviceId, getClientIp(req));
    res.json({ status: 'success', data });
  } catch (error) {
    sendError(res, error);
  }
};

/**
 * @route   POST /api/consult/premium/ad-reward  (TEST mode: no real ads yet)
 */
export const premiumAdReward = async (req: Request, res: Response): Promise<void> => {
  try {
    const deviceId = requireDevice(req, res);
    if (!deviceId) return;
    const data = await recordAdReward(deviceId);
    res.json({ status: 'success', data });
  } catch (error) {
    sendError(res, error);
  }
};
