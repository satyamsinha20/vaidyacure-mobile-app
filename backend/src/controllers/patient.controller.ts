import type { Response } from 'express';
import { z } from 'zod';
import { AiDoctor } from '../models/AiDoctor.js';
import { Booking, type IBooking } from '../models/Booking.js';
import { Doctor } from '../models/Doctor.js';
import { Patient } from '../models/Patient.js';
import { getClientIp, getDeviceId } from '../services/rateLimit.js';
import { AppError, parseInput, publicIdParam, route } from '../services/http.js';
import {
  OtpRequestSchema,
  OtpVerifySchema,
  logoutPatient,
  patientView,
  requestLoginCode,
  verifyLoginCode,
  type PatientRequest,
} from '../services/patient/auth.js';
import {
  CreateBookingSchema,
  PaymentSchema,
  UPI_ID_PATTERN,
  applyTimeRules,
  cancelOwnBooking,
  createRealBooking,
  followUpStatus,
  getPatientBooking,
  submitBookingPayment,
} from '../services/marketplace/bookings.js';
import { AiBookingSchema, StartAiBookingSchema, createAiBooking, startAiBooking } from '../services/marketplace/aiBookings.js';
import { ChatMessageSchema, getMessages, postMessage } from '../services/marketplace/liveChat.js';
import { TopupSchema, requestTopup, topupView, walletOverview } from '../services/marketplace/wallet.js';
import { getMarketplaceSettings } from '../services/marketplace/settings.js';
import { maybeRunDueWork } from '../services/marketplace/tick.js';
import { doctorCard, patientBookingView } from '../services/marketplace/views.js';

const me = (req: PatientRequest) => req.patient!;

/* -------------------------------------------------------------------------- */
/* LOGIN                                                                      */
/* -------------------------------------------------------------------------- */
export const requestOtp = route(async (req: PatientRequest, res: Response) => {
  const { email } = parseInput(OtpRequestSchema, req.body);
  const data = await requestLoginCode(email, { ip: getClientIp(req), deviceId: getDeviceId(req) });
  res.json({ status: 'success', message: 'We sent a 6-digit code to your email.', data });
}, 'patient-auth');

export const verifyOtp = route(async (req: PatientRequest, res: Response) => {
  const { email, code } = parseInput(OtpVerifySchema, req.body);
  const data = await verifyLoginCode(email, code, { ip: getClientIp(req), deviceId: getDeviceId(req) });
  res.json({ status: 'success', data });
}, 'patient-auth');

export const logout = route(async (req: PatientRequest, res: Response) => {
  await logoutPatient(req.patientToken!);
  res.json({ status: 'success', message: 'Logged out.' });
});

/* -------------------------------------------------------------------------- */
/* PROFILE & WALLET                                                           */
/* -------------------------------------------------------------------------- */
export const getMe = route(async (req: PatientRequest, res: Response) => {
  res.json({ status: 'success', data: patientView(me(req)) });
});

const ProfileSchema = z.object({
  name: z.string().trim().max(60).optional(),
  upiId: z.string().trim().regex(UPI_ID_PATTERN, 'UPI id looks wrong (e.g. name@okaxis)').or(z.literal('')).optional(),
});

export const updateMe = route(async (req: PatientRequest, res: Response) => {
  const input = parseInput(ProfileSchema, req.body);
  // Only these two fields can ever be changed by the patient (never the wallet)
  const updated = await Patient.findByIdAndUpdate(me(req)._id, { $set: input }, { new: true, runValidators: true });
  res.json({ status: 'success', data: patientView(updated!) });
});

export const getWallet = route(async (req: PatientRequest, res: Response) => {
  const [wallet, settings] = await Promise.all([walletOverview(me(req)), getMarketplaceSettings()]);
  res.json({ status: 'success', data: { ...wallet, payTo: { upiId: settings.upiId, upiName: settings.upiName } } });
});

export const addTopup = route(async (req: PatientRequest, res: Response) => {
  const input = parseInput(TopupSchema, req.body);
  const topup = await requestTopup(me(req), input);
  res.status(201).json({ status: 'success', message: 'Request sent. Money is added after VaidyaCure checks the payment.', data: topupView(topup) });
});

/* -------------------------------------------------------------------------- */
/* BOOKINGS                                                                   */
/* -------------------------------------------------------------------------- */
const decorate = async (bookings: IBooking[], withReport = false) => {
  const s = await getMarketplaceSettings();
  const doctorIds = bookings.filter((b) => b.doctor).map((b) => b.doctor!);
  const aiIds = bookings.filter((b) => b.aiDoctor).map((b) => b.aiDoctor!);
  const rootIds = bookings.filter((b) => b.followUpOf).map((b) => b.followUpOf!);
  const [doctors, aiDoctors, roots] = await Promise.all([
    doctorIds.length ? Doctor.find({ _id: { $in: doctorIds } }) : [],
    aiIds.length ? AiDoctor.find({ _id: { $in: aiIds } }).select('name designation avatarColor tier').lean() : [],
    rootIds.length ? Booking.find({ _id: { $in: rootIds } }).select('publicId').lean() : [],
  ]);
  return bookings.map((b) => {
    const doctor = b.doctor ? doctors.find((d) => d._id.equals(b.doctor!)) : null;
    const ai = b.aiDoctor ? aiDoctors.find((d) => d._id.equals(b.aiDoctor!)) : null;
    const follow = followUpStatus(b, s);
    return patientBookingView(b, {
      doctor: doctor ? doctorCard(doctor) : null,
      aiDoctor: ai ? { id: String(ai._id), name: ai.name, designation: ai.designation, avatarColor: ai.avatarColor, tier: ai.tier } : null,
      followUps: follow ? { used: follow.used, limit: follow.limit, until: follow.until } : null,
      rootId: b.followUpOf ? roots.find((r) => r._id.equals(b.followUpOf!))?.publicId ?? null : null,
      withReport,
    });
  });
};

export const listBookings = route(async (req: PatientRequest, res: Response) => {
  await maybeRunDueWork();
  const bookings = await Booking.find({ patient: me(req)._id, status: { $nin: ['expired'] } })
    .sort({ slotStart: -1 })
    .limit(60);
  // Bring time-sensitive ones up to date before showing them
  const fresh = await Promise.all(bookings.map((b) => (['awaiting_payment', 'payment_review', 'confirmed', 'in_progress'].includes(b.status) ? applyTimeRules(b) : b)));
  res.json({ status: 'success', data: await decorate(fresh) });
});

export const getBooking = route(async (req: PatientRequest, res: Response) => {
  const booking = await getPatientBooking(me(req), parseInput(publicIdParam, req.params.id));
  const [view] = await decorate([booking], true);
  res.json({ status: 'success', data: view });
});

export const createBooking = route(async (req: PatientRequest, res: Response) => {
  const input = parseInput(CreateBookingSchema, req.body);
  const booking = await createRealBooking(me(req), input);
  const settings = await getMarketplaceSettings();
  const [view] = await decorate([booking]);
  res.status(201).json({ status: 'success', data: { booking: view, payTo: { upiId: settings.upiId, upiName: settings.upiName } } });
});

export const createAiDoctorBooking = route(async (req: PatientRequest, res: Response) => {
  const input = parseInput(AiBookingSchema, req.body);
  const booking = await createAiBooking(me(req), getDeviceId(req), input);
  const [view] = await decorate([booking]);
  res.status(201).json({ status: 'success', data: view });
});

export const payBooking = route(async (req: PatientRequest, res: Response) => {
  const input = parseInput(PaymentSchema, req.body);
  const booking = await submitBookingPayment(me(req), parseInput(publicIdParam, req.params.id), input);
  const [view] = await decorate([booking]);
  res.json({ status: 'success', message: 'Payment details sent. Your booking is confirmed after VaidyaCure checks the payment.', data: view });
});

export const cancelBooking = route(async (req: PatientRequest, res: Response) => {
  const booking = await cancelOwnBooking(me(req), parseInput(publicIdParam, req.params.id));
  const [view] = await decorate([booking]);
  res.json({ status: 'success', data: view });
});

export const startAiDoctorBooking = route(async (req: PatientRequest, res: Response) => {
  const deviceId = getDeviceId(req);
  if (!deviceId) throw new AppError(400, 'Please update the app and try again.');
  const { patient } = parseInput(StartAiBookingSchema, req.body);
  const data = await startAiBooking(me(req), parseInput(publicIdParam, req.params.id), deviceId, patient);
  res.status(201).json({ status: 'success', data });
});

/* -------------------------------------------------------------------------- */
/* LIVE CHAT                                                                  */
/* -------------------------------------------------------------------------- */
const realBooking = async (req: PatientRequest) => {
  const booking = await getPatientBooking(me(req), parseInput(publicIdParam, req.params.id));
  if (booking.kind !== 'real') throw new AppError(404, 'Chat not found.', 'not_found');
  return booking;
};

export const readMessages = route(async (req: PatientRequest, res: Response) => {
  const after = Math.max(0, Number.parseInt(String(req.query.after ?? '0'), 10) || 0);
  const booking = await realBooking(req);
  res.json({ status: 'success', data: await getMessages(booking, after) });
});

export const sendMessage = route(async (req: PatientRequest, res: Response) => {
  const { text } = parseInput(ChatMessageSchema, req.body);
  const booking = await realBooking(req);
  res.status(201).json({ status: 'success', data: await postMessage(booking, 'patient', text) });
});
