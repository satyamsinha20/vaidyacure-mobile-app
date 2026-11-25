import type { Response } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { AuditLog } from '../models/AuditLog.js';
import { Booking, BOOKING_STATUSES, type IBooking } from '../models/Booking.js';
import { Doctor } from '../models/Doctor.js';
import { LiveMessage } from '../models/LiveMessage.js';
import { MarketplaceSettings } from '../models/MarketplaceSettings.js';
import { Patient } from '../models/Patient.js';
import { AiDoctor } from '../models/AiDoctor.js';
import { WalletTopup } from '../models/Wallet.js';
import { paiseToRupees } from '../utils/money.js';
import { getClientIp } from '../services/rateLimit.js';
import { AppError, objectIdParam, parseInput, publicIdParam, route } from '../services/http.js';
import { EmailSchema } from '../services/patient/auth.js';
import { sendMails } from '../services/email/mailer.js';
import { doctorWelcomeMail } from '../services/email/templates.js';
import { getMarketplaceSettings, invalidateMarketplaceSettings } from '../services/marketplace/settings.js';
import {
  UPI_ID_PATTERN,
  UtrSchema,
  adminCancelBooking,
  applyTimeRules,
  approveBookingPayment,
  dismissRefund,
  markRefundPaid,
  rejectBookingPayment,
} from '../services/marketplace/bookings.js';
import {
  CreateDoctorSchema,
  PlanPaymentSchema,
  UpdateDoctorSchema,
  adminDoctorView,
  createDoctor,
  decideFeeRequest,
  readBankDetails,
  recordPlanPayment,
  resetDoctorPassword,
  updateDoctor,
} from '../services/marketplace/doctors.js';
import { approveTopup, rejectTopup, topupView } from '../services/marketplace/wallet.js';
import { adminEarnings, payoutOverview, settleDoctor, settlementHistory } from '../services/marketplace/payouts.js';
import { adminBookingView } from '../services/marketplace/views.js';

const adminOf = (req: AuthenticatedRequest) => req.admin!;

const audit = async (req: AuthenticatedRequest, action: string, target: string, details = '') => {
  await AuditLog.create({
    admin: adminOf(req)._id,
    adminEmail: adminOf(req).email,
    action,
    target,
    details: details.slice(0, 500),
    ip: getClientIp(req),
  }).catch(() => {});
};

const ReasonSchema = z.object({ reason: z.string().trim().min(3, 'Write a short reason').max(200) });

/* -------------------------------------------------------------------------- */
/* SETTINGS, EMAIL, CRON                                                      */
/* -------------------------------------------------------------------------- */
const SettingsSchema = z.object({
  commissionPercent: z.number().min(0).max(100),
  upiId: z.string().trim().regex(UPI_ID_PATTERN, 'UPI id looks wrong (e.g. vaidyacure@okaxis)').or(z.literal('')),
  upiName: z.string().trim().min(2).max(60),
  platformFeeInr: z.number().int().min(0).max(1000000),
  minLeadMinutes: z.number().int().min(0).max(2880),
  paymentWindowMinutes: z.number().int().min(5).max(240),
  bookingDaysAhead: z.number().int().min(1).max(60),
  slotGapMinutes: z.number().int().min(0).max(60),
  doctorJoinMinutes: z.number().int().min(1).max(30),
  patientReplyMinutes: z.number().int().min(1).max(30),
  patientNoShowKeepPercent: z.number().min(0).max(100),
  noShowAdminSharePercent: z.number().min(0).max(100),
  followUpHours: z.number().int().min(0).max(720),
  followUpFreeCount: z.number().int().min(0).max(10),
  refundHours: z.number().int().min(1).max(168),
});

export const getSettings = route(async (_req: AuthenticatedRequest, res: Response) => {
  res.json({ status: 'success', data: { settings: await getMarketplaceSettings() } });
});

export const updateSettings = route(async (req: AuthenticatedRequest, res: Response) => {
  const input = parseInput(SettingsSchema, req.body);
  await MarketplaceSettings.findOneAndUpdate({ key: 'global' }, { $set: input }, { upsert: true, runValidators: true });
  invalidateMarketplaceSettings();
  await audit(req, 'market.settings', 'global', JSON.stringify(input));
  res.json({ status: 'success', data: await getMarketplaceSettings() });
});

/* -------------------------------------------------------------------------- */
/* DOCTORS                                                                    */
/* -------------------------------------------------------------------------- */
export const listDoctors = route(async (_req: AuthenticatedRequest, res: Response) => {
  const doctors = await Doctor.find().sort({ createdAt: -1 });
  res.json({ status: 'success', data: doctors.map(adminDoctorView) });
});

export const addDoctor = route(async (req: AuthenticatedRequest, res: Response) => {
  const input = parseInput(CreateDoctorSchema, req.body);
  const { doctor, password } = await createDoctor(adminOf(req).email, input);
  await audit(req, 'doctor.create', `${doctor.doctorCode} ${doctor.name}`, `plan until ${doctor.planValidUntil?.toISOString().slice(0, 10)}`);
  const panelUrl = (process.env.ADMIN_PANEL_URL || 'https://admin-panel-fawn-sigma-31.vercel.app').replace(/\/+$/, '');
  await sendMails([doctorWelcomeMail(doctor.email, { name: doctor.name, doctorCode: doctor.doctorCode, panelUrl: `${panelUrl}/login` })]);
  res.status(201).json({
    status: 'success',
    message: 'Doctor created. Share the login ID and temporary password with the doctor; the password is shown only now.',
    data: { doctor: adminDoctorView(doctor), login: { doctorCode: doctor.doctorCode, email: doctor.email, password } },
  });
});

export const editDoctor = route(async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInput(objectIdParam, req.params.id);
  const input = parseInput(UpdateDoctorSchema, req.body);
  const doctor = await updateDoctor(id, input);
  await audit(req, 'doctor.update', `${doctor.doctorCode} ${doctor.name}`, Object.keys(input).join(','));
  res.json({ status: 'success', data: adminDoctorView(doctor) });
});

export const resetPassword = route(async (req: AuthenticatedRequest, res: Response) => {
  const { doctor, password } = await resetDoctorPassword(parseInput(objectIdParam, req.params.id));
  await audit(req, 'doctor.reset_password', `${doctor.doctorCode} ${doctor.name}`);
  res.json({ status: 'success', data: { doctor: adminDoctorView(doctor), login: { doctorCode: doctor.doctorCode, email: doctor.email, password } } });
});

export const addPlanPayment = route(async (req: AuthenticatedRequest, res: Response) => {
  const input = parseInput(PlanPaymentSchema, req.body);
  const doctor = await recordPlanPayment(adminOf(req).email, parseInput(objectIdParam, req.params.id), input);
  await audit(req, 'doctor.plan', `${doctor.doctorCode} ${doctor.name}`, `₹${input.amountInr} until ${doctor.planValidUntil?.toISOString().slice(0, 10)}`);
  res.json({ status: 'success', data: adminDoctorView(doctor) });
});

export const decideFee = route(async (req: AuthenticatedRequest, res: Response) => {
  const approve = req.params.decision === 'approve';
  const doctor = await decideFeeRequest(parseInput(objectIdParam, req.params.id), approve);
  await audit(req, approve ? 'doctor.fee_approve' : 'doctor.fee_reject', `${doctor.doctorCode} ${doctor.name}`, `fee ₹${doctor.feeInr}`);
  res.json({ status: 'success', data: adminDoctorView(doctor) });
});

export const getBank = route(async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInput(objectIdParam, req.params.id);
  const bank = await readBankDetails(id);
  await audit(req, 'doctor.bank_view', id);
  res.json({ status: 'success', data: bank });
});

export const markBankReviewed = route(async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInput(objectIdParam, req.params.id);
  await Doctor.updateOne({ _id: id }, { $set: { bankReviewedAt: new Date() } });
  res.json({ status: 'success' });
});

/* -------------------------------------------------------------------------- */
/* BOOKINGS, PAYMENTS, REFUNDS                                                */
/* -------------------------------------------------------------------------- */
const decorate = async (bookings: IBooking[]) => {
  const [patients, doctors, aiDoctors] = await Promise.all([
    Patient.find({ _id: { $in: bookings.map((b) => b.patient) } }).select('email').lean(),
    Doctor.find({ _id: { $in: bookings.filter((b) => b.doctor).map((b) => b.doctor) } }).select('name doctorCode').lean(),
    AiDoctor.find({ _id: { $in: bookings.filter((b) => b.aiDoctor).map((b) => b.aiDoctor) } }).select('name').lean(),
  ]);
  return bookings.map((b) => {
    const doctor = b.doctor ? doctors.find((d) => d._id.equals(b.doctor!)) : null;
    return adminBookingView(b, {
      patientEmail: patients.find((p) => p._id.equals(b.patient))?.email,
      doctorName: doctor?.name,
      doctorCode: doctor?.doctorCode,
      aiDoctorName: b.aiDoctor ? aiDoctors.find((d) => d._id.equals(b.aiDoctor!))?.name : undefined,
    });
  });
};

export const listBookings = route(async (req: AuthenticatedRequest, res: Response) => {
  const filter: Record<string, unknown> = {};
  const status = String(req.query.status ?? '');
  if ((BOOKING_STATUSES as readonly string[]).includes(status)) filter.status = status;
  if (req.query.kind === 'real' || req.query.kind === 'ai') filter.kind = req.query.kind;
  if (typeof req.query.doctor === 'string' && /^[a-f0-9]{24}$/.test(req.query.doctor)) filter.doctor = req.query.doctor;
  const bookings = await Booking.find(filter).sort({ slotStart: -1 }).limit(200);
  res.json({ status: 'success', data: await decorate(bookings) });
});

export const paymentsToVerify = route(async (_req: AuthenticatedRequest, res: Response) => {
  const pending = await Booking.find({ kind: 'real', status: 'payment_review' }).sort({ slotStart: 1 }).limit(200);
  const fresh = await Promise.all(pending.map((b) => applyTimeRules(b)));
  res.json({ status: 'success', data: await decorate(fresh.filter((b) => b.status === 'payment_review')) });
});

export const approvePayment = route(async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInput(publicIdParam, req.params.id);
  const booking = await approveBookingPayment(adminOf(req).email, id);
  await audit(req, 'booking.payment_approve', id, `UTR ${booking.payment.utr} · ₹${paiseToRupees(booking.price.totalPaise)}`);
  res.json({ status: 'success', data: (await decorate([booking]))[0] });
});

export const rejectPayment = route(async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInput(publicIdParam, req.params.id);
  const { reason } = parseInput(ReasonSchema, req.body);
  const booking = await rejectBookingPayment(adminOf(req).email, id, reason);
  await audit(req, 'booking.payment_reject', id, reason);
  res.json({ status: 'success', data: (await decorate([booking]))[0] });
});

export const cancelBooking = route(async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInput(publicIdParam, req.params.id);
  const { reason } = parseInput(ReasonSchema, req.body);
  const booking = await adminCancelBooking(adminOf(req).email, id, reason);
  await audit(req, 'booking.cancel', id, reason);
  res.json({ status: 'success', data: (await decorate([booking]))[0] });
});

export const listRefunds = route(async (req: AuthenticatedRequest, res: Response) => {
  const status = req.query.status === 'paid' ? 'paid' : 'due';
  const bookings = await Booking.find({ 'refund.status': status })
    .sort(status === 'due' ? { 'refund.dueBy': 1 } : { 'refund.paidAt': -1 })
    .limit(200);
  const patients = await Patient.find({ _id: { $in: bookings.map((b) => b.patient) } }).select('email upiId').lean();
  const views = await decorate(bookings);
  res.json({
    status: 'success',
    data: views.map((v, i) => {
      const p = patients.find((x) => x._id.equals(bookings[i].patient));
      // Refund goes back to the UPI id the patient paid from (or their saved one)
      return { ...v, refundTo: bookings[i].payment.payerUpi || p?.upiId || '' };
    }),
  });
});

export const refundPaid = route(async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInput(publicIdParam, req.params.id);
  const { utr } = parseInput(z.object({ utr: UtrSchema }), req.body);
  const booking = await markRefundPaid(adminOf(req).email, id, utr);
  await audit(req, 'refund.paid', id, `UTR ${utr} · ₹${paiseToRupees(booking.refund.amountPaise)}`);
  res.json({ status: 'success', data: (await decorate([booking]))[0] });
});

export const refundDismiss = route(async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInput(publicIdParam, req.params.id);
  const booking = await dismissRefund(adminOf(req).email, id);
  await audit(req, 'refund.dismiss', id, 'payment never received');
  res.json({ status: 'success', data: (await decorate([booking]))[0] });
});

/* -------------------------------------------------------------------------- */
/* WALLET TOP-UPS                                                             */
/* -------------------------------------------------------------------------- */
export const listTopups = route(async (req: AuthenticatedRequest, res: Response) => {
  const status = ['pending', 'approved', 'rejected'].includes(String(req.query.status)) ? String(req.query.status) : 'pending';
  const topups = await WalletTopup.find({ status }).sort({ createdAt: status === 'pending' ? 1 : -1 }).limit(200).lean();
  const patients = await Patient.find({ _id: { $in: topups.map((t) => t.patient) } }).select('email walletPaise').lean();
  res.json({
    status: 'success',
    data: topups.map((t) => {
      const p = patients.find((x) => x._id.equals(t.patient));
      return { ...topupView(t), patientEmail: p?.email ?? '', walletBalance: paiseToRupees(p?.walletPaise ?? 0), reviewedByEmail: t.reviewedByEmail };
    }),
  });
});

export const approveWalletTopup = route(async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInput(objectIdParam, req.params.id);
  const { amountInr } = parseInput(z.object({ amountInr: z.number().int().min(1).max(5000).optional() }), req.body ?? {});
  const topup = await approveTopup(adminOf(req)._id, adminOf(req).email, id, amountInr);
  await audit(req, 'topup.approve', id, `UTR ${topup.utr} · ₹${paiseToRupees(topup.creditedPaise)}`);
  res.json({ status: 'success', data: topupView(topup) });
});

export const rejectWalletTopup = route(async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInput(objectIdParam, req.params.id);
  const { reason } = parseInput(ReasonSchema, req.body);
  const topup = await rejectTopup(adminOf(req)._id, adminOf(req).email, id, reason);
  await audit(req, 'topup.reject', id, reason);
  res.json({ status: 'success', data: topupView(topup) });
});

/* -------------------------------------------------------------------------- */
/* PAYOUTS & EARNINGS                                                         */
/* -------------------------------------------------------------------------- */
export const getPayouts = route(async (_req: AuthenticatedRequest, res: Response) => {
  res.json({ status: 'success', data: { ...(await payoutOverview()), history: await settlementHistory(50) } });
});

export const settle = route(async (req: AuthenticatedRequest, res: Response) => {
  const doctorId = parseInput(objectIdParam, req.params.doctorId);
  const input = parseInput(z.object({ utr: z.string().trim().min(6).max(40), note: z.string().trim().max(200).default('') }), req.body);
  const settlement = await settleDoctor(adminOf(req).email, doctorId, input);
  await audit(req, 'payout.settle', doctorId, `UTR ${input.utr} · ₹${paiseToRupees(settlement.amountPaise)}`);
  res.json({ status: 'success', data: { id: String(settlement._id), amount: paiseToRupees(settlement.amountPaise), consultations: settlement.bookings.length } });
});

export const getEarnings = route(async (req: AuthenticatedRequest, res: Response) => {
  const range = req.query.range === 'all' ? 'all' : req.query.range === 'month' ? 'month' : 'week';
  res.json({ status: 'success', data: await adminEarnings(range) });
});

/** Counts for the admin's badges and dashboard */
export const summary = route(async (_req: AuthenticatedRequest, res: Response) => {
  const [paymentsToCheck, topupsPending, refundsDue, feeRequests, bankChanges, flaggedChats] = await Promise.all([
    Booking.countDocuments({ kind: 'real', status: 'payment_review' }),
    WalletTopup.countDocuments({ status: 'pending' }),
    Booking.countDocuments({ 'refund.status': 'due' }),
    Doctor.countDocuments({ requestedFeeInr: { $ne: null } }),
    Doctor.countDocuments({ bankUpdatedAt: { $ne: null }, $expr: { $or: [{ $eq: ['$bankReviewedAt', null] }, { $gt: ['$bankUpdatedAt', '$bankReviewedAt'] }] } }),
    LiveMessage.distinct('booking', { 'flags.0': { $exists: true }, at: { $gte: new Date(Date.now() - 7 * 86_400_000) } }).then((ids) => ids.length),
  ]);
  res.json({ status: 'success', data: { paymentsToCheck, topupsPending, refundsDue, feeRequests, bankChanges, flaggedChats } });
});

/* -------------------------------------------------------------------------- */
/* CHAT SAFETY LOG                                                            */
/* -------------------------------------------------------------------------- */
export const listChats = route(async (req: AuthenticatedRequest, res: Response) => {
  const flaggedOnly = req.query.flagged === '1';
  const flaggedIds = await LiveMessage.distinct('booking', { 'flags.0': { $exists: true } });
  const filter: Record<string, unknown> = { kind: 'real', msgSeq: { $gt: 0 } };
  if (flaggedOnly) filter._id = { $in: flaggedIds };
  const bookings = await Booking.find(filter).sort({ slotStart: -1 }).limit(200);
  const flagged = new Set(flaggedIds.map(String));
  const views = await decorate(bookings);
  res.json({ status: 'success', data: views.map((v, i) => ({ ...v, flagged: flagged.has(String(bookings[i]._id)) })) });
});

export const getChat = route(async (req: AuthenticatedRequest, res: Response) => {
  const id = parseInput(publicIdParam, req.params.id);
  const booking = await Booking.findOne({ publicId: id, kind: 'real' });
  if (!booking) throw new AppError(404, 'Chat not found.');
  const messages = await LiveMessage.find({ booking: booking._id }).select('+original').sort({ seq: 1 }).lean();
  // Every opening of a private chat is recorded
  await audit(req, 'chat.view', id);
  res.json({
    status: 'success',
    data: {
      booking: (await decorate([booking]))[0],
      report: booking.report,
      messages: messages.map((m) => ({ seq: m.seq, from: m.from, text: m.original || m.text, shown: m.text, flags: m.flags, at: m.at })),
    },
  });
});

