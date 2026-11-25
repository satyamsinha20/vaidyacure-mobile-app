import { Request, Response } from 'express';
import { getAiSettings, listPublicDoctors } from '../services/ai/configStore.js';
import { sendError as sendAppError } from '../services/http.js';
import type { PatientRequest } from '../services/patient/auth.js';
import { hasAnyHours, isWithinHours, nextAvailableAt } from '../services/marketplace/availability.js';
import { aiDoctorSlots } from '../services/marketplace/aiBookings.js';
import { isDateKey, istDateKey } from '../utils/time.js';
import {
  CONSULTATION_ID_PATTERN,
  ConsultMessageSchema,
  StartConsultationSchema,
  generateConsultReport,
  sendConsultMessage,
  startConsultation,
} from '../services/consult/consultService.js';
import { recordAdReward } from '../services/consult/premiumService.js';
import { getClientIp, getDeviceId } from '../services/rateLimit.js';

const sendError = (res: Response, error: unknown): void => sendAppError(res, error, 'consult');

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
    const now = new Date();
    const defaultMinutes = Math.max(1, Math.round(settings.consultationSeconds / 60));
    res.json({
      status: 'success',
      data: {
        doctors: doctors.map(({ availability, alwaysAvailable, consultMinutes, ...d }) => {
          const hasHours = !alwaysAvailable && hasAnyHours(availability);
          const availableNow = alwaysAvailable || (hasHours && isWithinHours(availability, now));
          return {
            ...d,
            consultMinutes: consultMinutes ?? defaultMinutes,
            availableNow,
            nextAvailableAt: availableNow ? null : hasHours ? nextAvailableAt(availability, now) : null,
            // Doctors with fixed hours can be booked for a later time
            bookable: hasHours,
            hours: hasHours ? availability.weekly : [],
          };
        }),
        rules: {
          premiumPriceInr: settings.premiumPriceInr,
          adsRequired: settings.adsRequired,
          consultationSeconds: settings.consultationSeconds,
          maxUserMessages: settings.maxUserMessages,
          walletEnabled: settings.walletEnabled,
          adsMode: settings.adsMode,
        },
      },
    });
  } catch (error) {
    sendError(res, error);
  }
};

/**
 * @desc    Free and full times of an AI doctor with fixed hours
 * @route   GET /api/consult/doctors/:id/slots?date=YYYY-MM-DD
 */
export const getDoctorSlots = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id ?? '');
    if (!/^[a-f0-9]{24}$/.test(id)) {
      res.status(404).json({ status: 'error', message: 'Doctor not found.' });
      return;
    }
    const date = typeof req.query.date === 'string' && isDateKey(req.query.date) ? req.query.date : istDateKey();
    res.json({ status: 'success', data: await aiDoctorSlots(id, date) });
  } catch (error) {
    sendError(res, error);
  }
};

/**
 * @route   POST /api/consult/start
 * @access  Public (Mobile App), limited per device/IP; free doctors need ads, premium needs a logged-in wallet
 */
export const start = async (req: PatientRequest, res: Response): Promise<void> => {
  try {
    const deviceId = requireDevice(req, res);
    if (!deviceId) return;
    const parsed = StartConsultationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ status: 'error', message: parsed.error.issues[0]?.message ?? 'Invalid request.' });
      return;
    }
    const data = await startConsultation(deviceId, getClientIp(req), parsed.data, req.patient ?? null);
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
 * @route   POST /api/consult/premium/purchase  (removed: premium is paid from the wallet now)
 */
export const premiumPurchase = async (_req: Request, res: Response): Promise<void> => {
  res.status(410).json({ status: 'error', code: 'use_wallet', message: 'Premium consultations are now paid from your VaidyaCure wallet. Please update the app.' });
};

/**
 * @route   POST /api/consult/ads/reward  (TEST mode: no real ads yet) - unlocks a free AI doctor
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
