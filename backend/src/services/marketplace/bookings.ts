import { z } from 'zod';
import type { Types } from 'mongoose';
import { Booking, type BookingStatus, type IBooking } from '../../models/Booking.js';
import { Doctor, type IDoctor } from '../../models/Doctor.js';
import { Patient, type IPatient } from '../../models/Patient.js';
import { UtrRegistry } from '../../models/Wallet.js';
import { UsageCounter } from '../../models/UsageCounter.js';
import { FREE_PRICE, formatInr, patientNoShowSplit, priceForFee } from '../../utils/money.js';
import { DAY_MS, HOUR_MS, MINUTE_MS, formatIst, istWeekStart } from '../../utils/time.js';
import { randomToken } from '../../utils/secretBox.js';
import { AppError, objectIdParam, publicIdParam } from '../http.js';
import { sendMails } from '../email/mailer.js';
import * as mails from '../email/templates.js';
import { findSlot } from './availability.js';
import { getMarketplaceSettings } from './settings.js';
import type { MarketplaceValues } from '../../models/MarketplaceSettings.js';
import { refundAiBookingToWallet } from './wallet.js';

/* -------------------------------------------------------------------------- */
/* INPUT                                                                      */
/* -------------------------------------------------------------------------- */
export const UTR_PATTERN = /^\d{12}$/;
export const UPI_ID_PATTERN = /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z]{2,64}$/;

export const UtrSchema = z.string().trim().regex(UTR_PATTERN, 'Enter the 12-digit UPI reference number (UTR)');

export const PatientInfoSchema = z.object({
  name: z.string().trim().min(1, 'Enter the patient name').max(60),
  age: z.number().int().min(0).max(120),
  gender: z.enum(['male', 'female', 'other']),
  heightCm: z.number().min(40).max(250),
  weightKg: z.number().min(2).max(350),
  pregnancy: z.enum(['pregnant', 'breastfeeding', 'no', 'not_sure', 'not_applicable']).default('not_applicable'),
  problem: z.string().trim().min(3, 'Describe the health problem in a few words').max(500),
});

export const CreateBookingSchema = z.object({
  doctorId: objectIdParam,
  slotStart: z.iso.datetime(),
  patient: PatientInfoSchema,
  followUpOf: publicIdParam.optional(),
});

export const PaymentSchema = z.object({
  utr: UtrSchema,
  payerUpi: z.string().trim().regex(UPI_ID_PATTERN, 'Enter the UPI id you paid from, e.g. name@okaxis'),
});

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */
export const isDoctorBookable = (d: IDoctor, now = new Date()): boolean =>
  Boolean(
    d.isActive &&
      d.feeInr > 0 &&
      d.planValidUntil &&
      d.planValidUntil.getTime() > now.getTime() &&
      d.availability?.weekly?.length &&
      d.termsAcceptedAt &&
      !d.mustChangePassword
  );

const notFound = () => new AppError(404, 'Booking not found.', 'not_found');

export const STATUS_LABELS: Record<BookingStatus, string> = {
  awaiting_payment: 'waiting for payment',
  payment_review: 'waiting for payment check',
  confirmed: 'confirmed',
  in_progress: 'in progress',
  chat_ended: 'finished',
  completed: 'completed',
  doctor_no_show: 'closed (doctor did not join)',
  patient_no_show: 'closed (patient did not join)',
  cancelled: 'cancelled',
  payment_rejected: 'closed (payment rejected)',
  expired: 'expired',
  missed: 'missed',
};

/** Holds whose payment window ran out free their slot for others */
export const expireOldHolds = async (filter: Record<string, unknown> = {}, now = new Date()): Promise<void> => {
  await Booking.updateMany(
    { ...filter, status: 'awaiting_payment', holdUntil: { $lte: now } },
    { $set: { status: 'expired', slotLock: false, holdUntil: null } }
  );
};

/** A free follow-up that did not take place does not use up one of the free follow-ups */
const releaseFollowUp = async (b: IBooking) => {
  if (b.followUpOf) await Booking.updateOne({ _id: b.followUpOf, followUpsUsed: { $gt: 0 } }, { $inc: { followUpsUsed: -1 } });
};

/** AI bookings reserve a place in the slot (each AI doctor has a capacity per slot) */
export const aiSlotKey = (aiDoctorId: Types.ObjectId | string, slotStart: Date) => `aislot:${String(aiDoctorId)}:${slotStart.toISOString()}`;

export const releaseAiSlot = async (b: IBooking) => {
  if (b.kind === 'ai' && b.aiDoctor) await UsageCounter.updateOne({ key: aiSlotKey(b.aiDoctor, b.slotStart), count: { $gt: 0 } }, { $inc: { count: -1 } });
};

const contactsOf = async (b: IBooking) => {
  const [patient, doctor] = await Promise.all([
    Patient.findById(b.patient).select('email').lean(),
    b.doctor ? Doctor.findById(b.doctor).select('email name').lean() : Promise.resolve(null),
  ]);
  return { patientEmail: patient?.email ?? '', doctorEmail: doctor?.email ?? '', doctorName: doctor?.name ?? 'your doctor' };
};

/* -------------------------------------------------------------------------- */
/* TIME RULES (run on every read, and by the scheduler)                       */
/* -------------------------------------------------------------------------- */
/**
 * Moves a booking forward when its time has come: unpaid holds expire, a
 * doctor who has not started within N minutes is a no-show (full refund), a
 * patient who has not replied within N minutes of the doctor's first message
 * is a no-show (partial refund), and chats close at their end time.
 * Every change is a conditional update, so it happens exactly once even when
 * several requests (or the scheduler) look at the same booking together.
 */
const applyOneRule = async (b: IBooking, s: MarketplaceValues, now: Date): Promise<IBooking | null> => {
  const t = now.getTime();
  // `won` is true only for the one request whose update applied (it alone sends the emails)
  const swap = async (from: BookingStatus, guard: Record<string, unknown>, update: Record<string, unknown>) => {
    const doc = await Booking.findOneAndUpdate({ _id: b._id, status: from, ...guard }, update, { new: true });
    if (doc) return { doc, won: true };
    return { doc: (await Booking.findById(b._id)) ?? b, won: false };
  };

  if (b.status === 'awaiting_payment' && b.holdUntil && b.holdUntil.getTime() <= t) {
    return (await swap('awaiting_payment', { holdUntil: { $lte: now } }, { $set: { status: 'expired', slotLock: false, holdUntil: null } })).doc;
  }

  if (b.kind === 'real' && b.status === 'payment_review' && b.slotStart.getTime() <= t) {
    const { doc: updated, won } = await swap('payment_review', {}, {
      $set: {
        status: 'expired',
        slotLock: false,
        refund: { status: 'due', amountPaise: b.price.totalPaise, reason: 'not_verified', dueBy: new Date(t + s.refundHours * HOUR_MS), utr: '', paidAt: null, paidByEmail: '' },
      },
    });
    if (won) {
      const c = await contactsOf(updated);
      await sendMails([mails.notVerifiedMail(c.patientEmail, { doctor: c.doctorName, when: formatIst(updated.slotStart) })]);
    }
    return updated;
  }

  if (b.kind === 'real' && b.status === 'confirmed' && b.slotStart.getTime() + s.doctorJoinMinutes * MINUTE_MS <= t) {
    const paid = b.price.totalPaise > 0;
    const { doc: updated, won } = await swap('confirmed', { doctorJoinedAt: null }, {
      $set: {
        status: 'doctor_no_show',
        ...(paid
          ? { refund: { status: 'due', amountPaise: b.price.totalPaise, reason: 'doctor_no_show', dueBy: new Date(t + s.refundHours * HOUR_MS), utr: '', paidAt: null, paidByEmail: '' } }
          : {}),
      },
    });
    if (won) {
      await releaseFollowUp(updated);
      const c = await contactsOf(updated);
      await sendMails([
        mails.doctorNoShowMail(c.patientEmail, {
          doctor: c.doctorName,
          when: formatIst(updated.slotStart),
          refund: paid ? formatInr(updated.price.totalPaise) : '',
          hours: s.refundHours,
        }),
      ]);
    }
    return updated;
  }

  if (b.status === 'in_progress' && !b.patientRepliedAt && b.replyBy && b.replyBy.getTime() <= t) {
    const split = patientNoShowSplit(b.price.totalPaise, s.patientNoShowKeepPercent, s.noShowAdminSharePercent);
    const { doc: updated, won } = await swap('in_progress', { patientRepliedAt: null, replyBy: { $lte: now } }, {
      $set: {
        status: 'patient_no_show',
        chatEndedAt: now,
        ...(split.refundPaise > 0
          ? { refund: { status: 'due', amountPaise: split.refundPaise, reason: 'patient_no_show', dueBy: new Date(t + s.refundHours * HOUR_MS), utr: '', paidAt: null, paidByEmail: '' } }
          : {}),
        ...(split.keptPaise > 0
          ? { earnings: { doctorPaise: split.doctorPaise, adminPaise: split.adminPaise, weekStart: istWeekStart(now), earnedAt: now, settlement: null } }
          : {}),
      },
    });
    if (won) {
      const c = await contactsOf(updated);
      await sendMails([
        mails.patientNoShowMail(c.patientEmail, {
          doctor: c.doctorName,
          when: formatIst(updated.slotStart),
          refund: split.refundPaise > 0 ? formatInr(split.refundPaise) : '',
          kept: formatInr(split.keptPaise),
          hours: s.refundHours,
        }),
      ]);
    }
    return updated;
  }

  if (b.status === 'in_progress' && b.chatEndsAt && b.chatEndsAt.getTime() <= t) {
    return (await swap('in_progress', { chatEndsAt: { $lte: now } }, { $set: { status: 'chat_ended', chatEndedAt: b.chatEndsAt } })).doc;
  }

  if (b.kind === 'ai' && b.status === 'confirmed' && !b.consultationId && b.slotEnd.getTime() <= t) {
    const { doc: updated, won } = await swap('confirmed', { consultationId: '' }, { $set: { status: 'missed', slotLock: false } });
    if (won) {
      await releaseAiSlot(updated);
      if (updated.unlock === 'wallet' && updated.price.totalPaise > 0) await refundAiBookingToWallet(updated);
    }
    return updated;
  }

  return null;
};

export const applyTimeRules = async (booking: IBooking, now = new Date()): Promise<IBooking> => {
  const s = await getMarketplaceSettings();
  let current = booking;
  // A booking can pass several rules at once (e.g. confirmed → doctor no-show), at most a few
  for (let i = 0; i < 4; i++) {
    const next = await applyOneRule(current, s, now);
    if (!next) break;
    current = next;
  }
  return current;
};

/* -------------------------------------------------------------------------- */
/* PATIENT: BOOK, PAY, CANCEL                                                 */
/* -------------------------------------------------------------------------- */
export const getPatientBooking = async (patient: IPatient, publicId: string): Promise<IBooking> => {
  if (!/^[a-f0-9]{32}$/.test(publicId)) throw notFound();
  const booking = await Booking.findOne({ publicId, patient: patient._id });
  if (!booking) throw notFound();
  return applyTimeRules(booking);
};

/** Free follow-ups left on a completed, paid consultation */
export const followUpStatus = (root: IBooking, s: MarketplaceValues, now = new Date()) => {
  if (root.kind !== 'real' || root.followUpOf || root.status !== 'completed' || root.price.totalPaise <= 0) return null;
  const base = root.chatEndedAt ?? root.slotEnd;
  const until = new Date(base.getTime() + s.followUpHours * HOUR_MS);
  return { used: root.followUpsUsed, limit: s.followUpFreeCount, until, open: until.getTime() > now.getTime() && root.followUpsUsed < s.followUpFreeCount };
};

export const createRealBooking = async (patient: IPatient, input: z.infer<typeof CreateBookingSchema>): Promise<IBooking> => {
  const s = await getMarketplaceSettings();
  const now = new Date();
  const doctor = await Doctor.findById(input.doctorId);
  if (!doctor || !isDoctorBookable(doctor, now)) {
    throw new AppError(404, 'This doctor is not taking bookings right now.', 'doctor_unavailable');
  }
  const slot = findSlot(doctor.availability, new Date(input.slotStart), doctor.consultMinutes, s.slotGapMinutes);
  if (!slot) throw new AppError(400, 'Please pick one of the available times.', 'invalid_slot');

  let root: IBooking | null = null;
  if (input.followUpOf) {
    root = await Booking.findOne({ publicId: input.followUpOf, patient: patient._id });
    const status = root ? followUpStatus(root, s, now) : null;
    if (!root || !status || !root.doctor?.equals(doctor._id)) {
      throw new AppError(400, 'A free follow-up is only possible with the same doctor after a completed consultation.', 'follow_up_invalid');
    }
    if (!status.open) throw new AppError(409, 'The free follow-ups for this consultation are used up or over.', 'follow_up_used');
    if (slot.start.getTime() > status.until.getTime()) {
      throw new AppError(400, `Free follow-ups must take place by ${formatIst(status.until)}.`, 'follow_up_too_late');
    }
  }

  const leadMinutes = root ? 10 : s.minLeadMinutes;
  if (slot.start.getTime() < now.getTime() + leadMinutes * MINUTE_MS) {
    throw new AppError(400, `Please pick a time at least ${leadMinutes} minutes from now.`, 'too_soon');
  }
  if (slot.start.getTime() > now.getTime() + s.bookingDaysAhead * DAY_MS) {
    throw new AppError(400, `Bookings open ${s.bookingDaysAhead} days ahead. Please pick an earlier date.`, 'too_far');
  }
  if (!doctor.planValidUntil || doctor.planValidUntil.getTime() < slot.end.getTime()) {
    throw new AppError(400, 'This doctor is not taking bookings for that date.', 'doctor_unavailable');
  }

  const open = await Booking.countDocuments({ patient: patient._id, status: { $in: ['awaiting_payment', 'payment_review'] } });
  if (open >= 3) throw new AppError(429, 'Please finish the payment of your other bookings first.', 'too_many_open');

  await expireOldHolds({ doctor: doctor._id, slotStart: slot.start }, now);

  if (root) {
    const reserved = await Booking.findOneAndUpdate(
      { _id: root._id, followUpsUsed: { $lt: s.followUpFreeCount } },
      { $inc: { followUpsUsed: 1 } }
    );
    if (!reserved) throw new AppError(409, 'The free follow-ups for this consultation are used up.', 'follow_up_used');
  }

  try {
    const booking = await Booking.create({
      publicId: randomToken(16),
      patient: patient._id,
      kind: 'real',
      doctor: doctor._id,
      slotStart: slot.start,
      slotEnd: slot.end,
      consultMinutes: doctor.consultMinutes,
      status: root ? 'confirmed' : 'awaiting_payment',
      slotLock: true,
      holdUntil: root ? null : new Date(now.getTime() + s.paymentWindowMinutes * MINUTE_MS),
      price: root ? FREE_PRICE : priceForFee(doctor.feeInr, s.commissionPercent),
      unlock: root ? 'follow_up' : 'upi',
      followUpOf: root?._id ?? null,
      patientInfo: input.patient,
    });
    if (root) {
      await sendMails([
        mails.bookingConfirmedPatientMail(patient.email, { doctor: doctor.name, when: formatIst(booking.slotStart), amount: '', followUp: true }),
        mails.bookingConfirmedDoctorMail(doctor.email, { patient: booking.patientInfo.name, when: formatIst(booking.slotStart), followUp: true }),
      ]);
    }
    return booking;
  } catch (error: any) {
    if (root) await Booking.updateOne({ _id: root._id, followUpsUsed: { $gt: 0 } }, { $inc: { followUpsUsed: -1 } });
    if (error?.code === 11000) {
      throw new AppError(409, 'Sorry, this time was just booked by someone else. Please pick another time.', 'slot_taken');
    }
    throw error;
  }
};

export const submitBookingPayment = async (patient: IPatient, publicId: string, input: z.infer<typeof PaymentSchema>): Promise<IBooking> => {
  const booking = await getPatientBooking(patient, publicId);
  if (booking.status !== 'awaiting_payment') {
    throw new AppError(409, `This booking is ${STATUS_LABELS[booking.status]}, so no payment is needed now.`, 'not_awaiting_payment');
  }
  try {
    await UtrRegistry.create({ utr: input.utr, kind: 'booking', ref: booking.publicId });
  } catch (error: any) {
    if (error?.code === 11000) throw new AppError(409, 'This UTR number has already been used. Please check it.', 'utr_used');
    throw error;
  }
  const now = new Date();
  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, status: 'awaiting_payment', holdUntil: { $gt: now } },
    {
      $set: {
        status: 'payment_review',
        holdUntil: null,
        'payment.utr': input.utr,
        'payment.payerUpi': input.payerUpi,
        'payment.submittedAt': now,
      },
    },
    { new: true }
  );
  if (!updated) {
    await UtrRegistry.deleteOne({ utr: input.utr, ref: booking.publicId });
    throw new AppError(409, 'The time to pay for this booking is over. Please book again.', 'hold_expired');
  }
  await Patient.updateOne({ _id: patient._id }, { $set: { upiId: input.payerUpi } });
  return updated;
};

/** Only an unpaid booking can be cancelled by the patient (after paying, support handles it) */
export const cancelOwnBooking = async (patient: IPatient, publicId: string): Promise<IBooking> => {
  const booking = await getPatientBooking(patient, publicId);
  const cancellable: BookingStatus[] = booking.kind === 'real' ? ['awaiting_payment'] : ['confirmed'];
  if (booking.kind === 'real' && booking.followUpOf && booking.status === 'confirmed') cancellable.push('confirmed');
  if (!cancellable.includes(booking.status)) {
    throw new AppError(409, 'This booking can no longer be cancelled here. Please contact support.', 'not_cancellable');
  }
  if (booking.kind === 'ai' && booking.slotStart.getTime() <= Date.now()) {
    throw new AppError(409, 'This consultation time has already started.', 'not_cancellable');
  }
  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, status: booking.status, consultationId: '' },
    { $set: { status: 'cancelled', slotLock: false, holdUntil: null, cancelReason: 'Cancelled by patient' } },
    { new: true }
  );
  if (!updated) throw new AppError(409, 'This booking was just updated. Please refresh.', 'conflict');
  await releaseFollowUp(updated);
  await releaseAiSlot(updated);
  if (updated.kind === 'ai' && updated.unlock === 'wallet' && updated.price.totalPaise > 0) await refundAiBookingToWallet(updated);
  return updated;
};

/* -------------------------------------------------------------------------- */
/* ADMIN: VERIFY PAYMENT, CANCEL, REFUND                                      */
/* -------------------------------------------------------------------------- */
export const approveBookingPayment = async (adminEmail: string, publicId: string): Promise<IBooking> => {
  const now = new Date();
  const updated = await Booking.findOneAndUpdate(
    { publicId, kind: 'real', status: 'payment_review', slotStart: { $gt: now } },
    { $set: { status: 'confirmed', 'payment.verifiedAt': now, 'payment.verifiedByEmail': adminEmail } },
    { new: true }
  );
  if (!updated) {
    const existing = await Booking.findOne({ publicId, kind: 'real' });
    if (!existing) throw notFound();
    const current = await applyTimeRules(existing, now);
    throw new AppError(409, `This booking is ${STATUS_LABELS[current.status]}. It cannot be approved now.`, 'not_in_review');
  }
  const c = await contactsOf(updated);
  await sendMails([
    mails.bookingConfirmedPatientMail(c.patientEmail, {
      doctor: c.doctorName,
      when: formatIst(updated.slotStart),
      amount: formatInr(updated.price.totalPaise),
      followUp: false,
    }),
    mails.bookingConfirmedDoctorMail(c.doctorEmail, { patient: updated.patientInfo.name, when: formatIst(updated.slotStart), followUp: false }),
  ]);
  return updated;
};

export const rejectBookingPayment = async (adminEmail: string, publicId: string, reason: string): Promise<IBooking> => {
  const updated = await Booking.findOneAndUpdate(
    { publicId, kind: 'real', status: 'payment_review' },
    { $set: { status: 'payment_rejected', slotLock: false, 'payment.rejectReason': reason, 'payment.verifiedByEmail': adminEmail } },
    { new: true }
  );
  if (!updated) {
    if (!(await Booking.exists({ publicId }))) throw notFound();
    throw new AppError(409, 'This booking is not waiting for a payment check.', 'not_in_review');
  }
  const c = await contactsOf(updated);
  await sendMails([mails.paymentRejectedMail(c.patientEmail, { doctor: c.doctorName, when: formatIst(updated.slotStart), reason })]);
  return updated;
};

export const adminCancelBooking = async (adminEmail: string, publicId: string, reason: string): Promise<IBooking> => {
  const s = await getMarketplaceSettings();
  const existing = await Booking.findOne({ publicId, kind: 'real' });
  if (!existing) throw notFound();
  const booking = await applyTimeRules(existing);
  if (!['awaiting_payment', 'payment_review', 'confirmed'].includes(booking.status)) {
    throw new AppError(409, `This booking is ${STATUS_LABELS[booking.status]} and cannot be cancelled.`, 'not_cancellable');
  }
  const owesRefund = booking.status !== 'awaiting_payment' && booking.price.totalPaise > 0;
  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, status: booking.status },
    {
      $set: {
        status: 'cancelled',
        slotLock: false,
        holdUntil: null,
        cancelReason: reason,
        ...(owesRefund
          ? {
              refund: {
                status: 'due',
                amountPaise: booking.price.totalPaise,
                reason: 'admin_cancel',
                dueBy: new Date(Date.now() + s.refundHours * HOUR_MS),
                utr: '',
                paidAt: null,
                paidByEmail: '',
              },
            }
          : {}),
      },
    },
    { new: true }
  );
  if (!updated) throw new AppError(409, 'This booking was just updated. Please refresh.', 'conflict');
  await releaseFollowUp(updated);
  const c = await contactsOf(updated);
  await sendMails([
    mails.bookingCancelledMail(c.patientEmail, {
      doctor: c.doctorName,
      when: formatIst(updated.slotStart),
      reason,
      refund: owesRefund ? formatInr(updated.price.totalPaise) : '',
      hours: s.refundHours,
    }),
  ]);
  console.log(`[bookings] ${publicId} cancelled by ${adminEmail}`);
  return updated;
};

export const markRefundPaid = async (adminEmail: string, publicId: string, utr: string): Promise<IBooking> => {
  const updated = await Booking.findOneAndUpdate(
    { publicId, 'refund.status': 'due' },
    { $set: { 'refund.status': 'paid', 'refund.utr': utr, 'refund.paidAt': new Date(), 'refund.paidByEmail': adminEmail } },
    { new: true }
  );
  if (!updated) {
    if (!(await Booking.exists({ publicId }))) throw notFound();
    throw new AppError(409, 'There is no pending refund on this booking.', 'no_refund_due');
  }
  const c = await contactsOf(updated);
  await sendMails([mails.refundPaidMail(c.patientEmail, { amount: formatInr(updated.refund.amountPaise), utr })]);
  return updated;
};

/** "Not paid after all": the admin found no money for an unverified booking */
export const dismissRefund = async (adminEmail: string, publicId: string): Promise<IBooking> => {
  const updated = await Booking.findOneAndUpdate(
    { publicId, 'refund.status': 'due', 'refund.reason': 'not_verified' },
    { $set: { 'refund.status': 'none', 'refund.amountPaise': 0, 'refund.paidByEmail': adminEmail } },
    { new: true }
  );
  if (!updated) throw new AppError(409, 'Only refunds of payments that were never verified can be dismissed.', 'not_dismissable');
  return updated;
};
