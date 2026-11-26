import type { Response } from 'express';
import { z } from 'zod';
import { Booking, type IBooking } from '../models/Booking.js';
import { Doctor } from '../models/Doctor.js';
import { AppError, parseInput, publicIdParam, route } from '../services/http.js';
import { PasswordSchema, signDoctorToken, type DoctorRequest } from '../services/doctor/auth.js';
import { AvailabilityInputSchema, cleanAvailability } from '../services/marketplace/availability.js';
import { applyTimeRules } from '../services/marketplace/bookings.js';
import { BankSchema, FeeRequestSchema, saveBankDetails } from '../services/marketplace/doctors.js';
import { ChatMessageSchema, ReportSchema, consultationThread, endChat, getMessages, postMessage, sendReport } from '../services/marketplace/liveChat.js';
import { doctorEarnings } from '../services/marketplace/payouts.js';
import { getMarketplaceSettings } from '../services/marketplace/settings.js';
import { maybeRunDueWork } from '../services/marketplace/tick.js';
import { doctorBookingView } from '../services/marketplace/views.js';
import { priceForFee, paiseToRupees } from '../utils/money.js';
import { DAY_MS, istDateKey, istInstant } from '../utils/time.js';

const doc = (req: DoctorRequest) => req.doctor!;

/* -------------------------------------------------------------------------- */
/* ACCOUNT                                                                    */
/* -------------------------------------------------------------------------- */
export const getMe = route(async (req: DoctorRequest, res: Response) => {
  const d = doc(req);
  const s = await getMarketplaceSettings();
  res.json({
    status: 'success',
    data: {
      id: String(d._id),
      doctorCode: d.doctorCode,
      email: d.email,
      name: d.name,
      qualification: d.qualification,
      specialization: d.specialization,
      experienceYears: d.experienceYears,
      about: d.about,
      languages: d.languages,
      avatarColor: d.avatarColor,
      feeInr: d.feeInr,
      appPriceInr: paiseToRupees(priceForFee(d.feeInr, s.commissionPercent).totalPaise),
      commissionPercent: s.commissionPercent,
      requestedFeeInr: d.requestedFeeInr,
      consultMinutes: d.consultMinutes,
      availability: d.availability,
      planValidUntil: d.planValidUntil,
      bankHint: d.bankHint,
      bankUpdatedAt: d.bankUpdatedAt,
      mustChangePassword: d.mustChangePassword,
      termsAcceptedAt: d.termsAcceptedAt,
      rules: {
        doctorJoinMinutes: s.doctorJoinMinutes,
        patientReplyMinutes: s.patientReplyMinutes,
        patientNoShowKeepPercent: s.patientNoShowKeepPercent,
        followUpHours: s.followUpHours,
        followUpFreeCount: s.followUpFreeCount,
      },
    },
  });
});

const ChangePasswordSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: PasswordSchema });

export const changePassword = route(async (req: DoctorRequest, res: Response) => {
  const input = parseInput(ChangePasswordSchema, req.body);
  const doctor = await Doctor.findById(doc(req)._id).select('+password');
  if (!doctor || !(await doctor.comparePassword(input.currentPassword))) {
    throw new AppError(400, 'The current password is wrong.', 'wrong_password');
  }
  if (input.currentPassword === input.newPassword) throw new AppError(400, 'Choose a password different from the current one.');
  doctor.password = input.newPassword;
  doctor.mustChangePassword = false;
  doctor.tokenVersion += 1; // other logged-in devices are signed out
  await doctor.save();
  res.json({ status: 'success', message: 'Password changed.', token: signDoctorToken(doctor) });
});

export const acceptTerms = route(async (req: DoctorRequest, res: Response) => {
  if (doc(req).mustChangePassword) throw new AppError(403, 'Please set a new password first.', 'password_change_required');
  await Doctor.updateOne({ _id: doc(req)._id, termsAcceptedAt: null }, { $set: { termsAcceptedAt: new Date() } });
  res.json({ status: 'success', message: 'Thank you. Your panel is ready.' });
});

const ProfileSchema = z.object({
  about: z.string().trim().max(300).optional(),
  languages: z.array(z.string().trim().min(2).max(20)).max(8).optional(),
});

export const updateProfile = route(async (req: DoctorRequest, res: Response) => {
  // Name, qualification, registration and fee are set by the admin only
  const input = parseInput(ProfileSchema, req.body);
  await Doctor.updateOne({ _id: doc(req)._id }, { $set: input }, { runValidators: true });
  res.json({ status: 'success', message: 'Profile saved.' });
});

export const updateAvailability = route(async (req: DoctorRequest, res: Response) => {
  const input = parseInput(AvailabilityInputSchema, req.body);
  const availability = cleanAvailability(input);
  await Doctor.updateOne({ _id: doc(req)._id }, { $set: { availability } });
  res.json({ status: 'success', message: 'Working hours saved. Already booked consultations stay as they are.', data: availability });
});

export const updateBank = route(async (req: DoctorRequest, res: Response) => {
  const input = parseInput(BankSchema, req.body);
  const hint = await saveBankDetails(doc(req), input);
  res.json({ status: 'success', message: 'Payment details saved. The admin will see them before the next payout.', data: { bankHint: hint } });
});

export const requestFee = route(async (req: DoctorRequest, res: Response) => {
  const { feeInr } = parseInput(FeeRequestSchema, req.body);
  if (feeInr === doc(req).feeInr) throw new AppError(400, 'This is already your fee.');
  await Doctor.updateOne({ _id: doc(req)._id }, { $set: { requestedFeeInr: feeInr } });
  res.json({ status: 'success', message: 'Fee change sent to the admin for approval.' });
});

/* -------------------------------------------------------------------------- */
/* CONSULTATIONS                                                              */
/* -------------------------------------------------------------------------- */
const rootIdsOf = async (bookings: IBooking[]) => {
  const ids = bookings.filter((b) => b.followUpOf).map((b) => b.followUpOf!);
  if (!ids.length) return new Map<string, string>();
  const roots = await Booking.find({ _id: { $in: ids } }).select('publicId').lean();
  return new Map(roots.map((r) => [String(r._id), r.publicId]));
};

const ownBooking = async (req: DoctorRequest): Promise<IBooking> => {
  const publicId = parseInput(publicIdParam, req.params.id);
  const booking = await Booking.findOne({ publicId, doctor: doc(req)._id, kind: 'real' });
  if (!booking) throw new AppError(404, 'Consultation not found.', 'not_found');
  return applyTimeRules(booking);
};

// Statuses a doctor sees (unpaid holds and rejected payments are not theirs to see)
const VISIBLE = ['confirmed', 'in_progress', 'chat_ended', 'completed', 'doctor_no_show', 'patient_no_show', 'cancelled'];

export const listBookings = route(async (req: DoctorRequest, res: Response) => {
  await maybeRunDueWork();
  const scope = String(req.query.scope ?? 'upcoming');
  const now = new Date();
  const filter: Record<string, unknown> = { doctor: doc(req)._id, kind: 'real', status: { $in: VISIBLE } };
  if (scope === 'today') {
    const key = istDateKey(now);
    filter.slotStart = { $gte: istInstant(key, '00:00'), $lt: new Date(istInstant(key, '00:00').getTime() + DAY_MS) };
  } else if (scope === 'past') {
    filter.slotStart = { $lt: now };
  } else {
    filter.$or = [{ slotStart: { $gte: new Date(now.getTime() - 60 * 60 * 1000) } }, { status: { $in: ['in_progress', 'chat_ended'] } }];
  }
  const bookings = await Booking.find(filter)
    .sort({ slotStart: scope === 'past' ? -1 : 1 })
    .limit(100);
  const fresh = await Promise.all(bookings.map((b) => (['confirmed', 'in_progress'].includes(b.status) ? applyTimeRules(b) : b)));
  const roots = await rootIdsOf(fresh);
  res.json({ status: 'success', data: fresh.map((b) => doctorBookingView(b, { rootId: b.followUpOf ? roots.get(String(b.followUpOf)) : null })) });
});

export const getBooking = route(async (req: DoctorRequest, res: Response) => {
  const booking = await ownBooking(req);
  const roots = await rootIdsOf([booking]);
  res.json({
    status: 'success',
    data: {
      booking: doctorBookingView(booking, { rootId: booking.followUpOf ? roots.get(String(booking.followUpOf)) : null, withReport: true }),
      thread: await consultationThread(doc(req), booking),
    },
  });
});

export const readMessages = route(async (req: DoctorRequest, res: Response) => {
  const after = Math.max(0, Number.parseInt(String(req.query.after ?? '0'), 10) || 0);
  res.json({ status: 'success', data: await getMessages(await ownBooking(req), after) });
});

export const sendMessage = route(async (req: DoctorRequest, res: Response) => {
  const { text } = parseInput(ChatMessageSchema, req.body);
  res.status(201).json({ status: 'success', data: await postMessage(await ownBooking(req), 'doctor', text) });
});

export const endConsultation = route(async (req: DoctorRequest, res: Response) => {
  const booking = await endChat(doc(req), await ownBooking(req));
  res.json({ status: 'success', data: doctorBookingView(booking) });
});

export const submitReport = route(async (req: DoctorRequest, res: Response) => {
  const input = parseInput(ReportSchema, req.body);
  const booking = await sendReport(doc(req), await ownBooking(req), input);
  res.json({ status: 'success', message: 'Report sent to the patient.', data: doctorBookingView(booking, { withReport: true }) });
});

/** Patients this doctor has consulted (no contact details: only what the patient entered for the doctor) */
export const listPatients = route(async (req: DoctorRequest, res: Response) => {
  const rows = await Booking.aggregate<{
    _id: unknown;
    name: string;
    age: number;
    gender: string;
    consultations: number;
    lastAt: Date;
    bookings: Array<{ id: string; slotStart: Date; status: string; hasReport: boolean; problem: string }>;
  }>([
    { $match: { doctor: doc(req)._id, kind: 'real', status: { $in: ['in_progress', 'chat_ended', 'completed', 'patient_no_show'] } } },
    { $sort: { slotStart: -1 } },
    {
      $group: {
        _id: '$patient',
        name: { $first: '$patientInfo.name' },
        age: { $first: '$patientInfo.age' },
        gender: { $first: '$patientInfo.gender' },
        consultations: { $sum: 1 },
        lastAt: { $first: '$slotStart' },
        bookings: {
          $push: {
            id: '$publicId',
            slotStart: '$slotStart',
            status: '$status',
            hasReport: { $ne: ['$report', null] },
            problem: '$patientInfo.problem',
          },
        },
      },
    },
    { $sort: { lastAt: -1 } },
    { $limit: 200 },
  ]);
  res.json({
    status: 'success',
    data: rows.map((r, i) => ({ key: `P${i + 1}`, name: r.name, age: r.age, gender: r.gender, consultations: r.consultations, lastAt: r.lastAt, bookings: r.bookings.slice(0, 20) })),
  });
});

export const getEarnings = route(async (req: DoctorRequest, res: Response) => {
  res.json({ status: 'success', data: await doctorEarnings(doc(req)._id) });
});

export const dashboard = route(async (req: DoctorRequest, res: Response) => {
  await maybeRunDueWork();
  const now = new Date();
  const key = istDateKey(now);
  const dayStart = istInstant(key, '00:00');
  const d = doc(req);
  const [today, next, reportsPending, earnings] = await Promise.all([
    Booking.countDocuments({ doctor: d._id, kind: 'real', status: { $in: VISIBLE }, slotStart: { $gte: dayStart, $lt: new Date(dayStart.getTime() + DAY_MS) } }),
    Booking.findOne({ doctor: d._id, kind: 'real', status: { $in: ['confirmed', 'in_progress'] }, slotEnd: { $gte: now } }).sort({ slotStart: 1 }),
    Booking.countDocuments({ doctor: d._id, kind: 'real', status: 'chat_ended', report: null }),
    doctorEarnings(d._id),
  ]);
  res.json({
    status: 'success',
    data: {
      todayCount: today,
      next: next ? doctorBookingView(await applyTimeRules(next)) : null,
      reportsPending,
      earnings: earnings.totals,
      planValidUntil: d.planValidUntil,
      bookable: Boolean(d.isActive && d.planValidUntil && d.planValidUntil > now && d.availability.weekly.length && d.feeInr > 0),
      hasHours: d.availability.weekly.length > 0,
      hasBank: Boolean(d.bankHint),
    },
  });
});
