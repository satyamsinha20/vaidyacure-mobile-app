import type { IBooking } from '../../models/Booking.js';
import type { IDoctor } from '../../models/Doctor.js';
import { paiseToRupees } from '../../utils/money.js';

/**
 * What each side may see of a booking. Patients never see the doctor's
 * contact or bank details; doctors never see the patient's email or the
 * payment; only the admin view has everything.
 */
export interface DoctorCard {
  id: string;
  name: string;
  qualification: string;
  specialization: string;
  /** The doctor's VaidyaCure number (VC-DOC-000001) */
  registrationNumber: string;
  experienceYears: number;
  about: string;
  languages: string[];
  avatarColor: string;
  consultMinutes: number;
}

export const doctorCard = (d: IDoctor): DoctorCard => ({
  id: String(d._id),
  name: d.name,
  qualification: d.qualification,
  specialization: d.specialization,
  registrationNumber: d.doctorCode,
  experienceYears: d.experienceYears,
  about: d.about,
  languages: d.languages,
  avatarColor: d.avatarColor,
  consultMinutes: d.consultMinutes,
});

export interface AiDoctorCard {
  id: string;
  name: string;
  designation: string;
  avatarColor: string;
  tier: string;
}

const priceView = (b: IBooking) => ({
  fee: paiseToRupees(b.price.feePaise),
  commission: paiseToRupees(b.price.commissionPaise),
  total: paiseToRupees(b.price.totalPaise),
});

const chatView = (b: IBooking) => ({
  doctorJoinedAt: b.doctorJoinedAt,
  replyBy: b.replyBy,
  patientRepliedAt: b.patientRepliedAt,
  chatEndsAt: b.chatEndsAt,
  chatEndedAt: b.chatEndedAt,
});

const refundView = (b: IBooking) =>
  b.refund?.status && b.refund.status !== 'none'
    ? {
        status: b.refund.status,
        amount: paiseToRupees(b.refund.amountPaise),
        reason: b.refund.reason,
        dueBy: b.refund.dueBy,
        utr: b.refund.status === 'paid' ? b.refund.utr : '',
        paidAt: b.refund.paidAt,
      }
    : null;

export const reportView = (b: IBooking) => (b.report ? { ...b.report } : null);

export const patientBookingView = (
  b: IBooking,
  extra: { doctor?: DoctorCard | null; aiDoctor?: AiDoctorCard | null; followUps?: { used: number; limit: number; until: Date } | null; rootId?: string | null; withReport?: boolean }
) => ({
  id: b.publicId,
  kind: b.kind,
  status: b.status,
  doctor: extra.doctor ?? null,
  aiDoctor: extra.aiDoctor ?? null,
  slotStart: b.slotStart,
  slotEnd: b.slotEnd,
  consultMinutes: b.consultMinutes,
  price: priceView(b),
  unlock: b.unlock,
  holdUntil: b.holdUntil,
  payment: {
    utr: b.payment.utr,
    payerUpi: b.payment.payerUpi,
    submittedAt: b.payment.submittedAt,
    verifiedAt: b.payment.verifiedAt,
    rejectReason: b.payment.rejectReason,
  },
  refund: refundView(b),
  isFollowUp: Boolean(b.followUpOf),
  followUpOfId: extra.rootId ?? null,
  followUps: extra.followUps ?? null,
  // The patient's own details for this booking (reused for follow-ups)
  patient: b.kind === 'real' ? b.patientInfo : null,
  chat: chatView(b),
  hasReport: Boolean(b.report),
  report: extra.withReport ? reportView(b) : null,
  consultationId: b.consultationId || null,
  cancelReason: b.cancelReason,
  createdAt: b.createdAt,
});

export const doctorBookingView = (b: IBooking, extra: { rootId?: string | null; withReport?: boolean } = {}) => ({
  id: b.publicId,
  status: b.status,
  slotStart: b.slotStart,
  slotEnd: b.slotEnd,
  consultMinutes: b.consultMinutes,
  patient: {
    name: b.patientInfo.name,
    age: b.patientInfo.age,
    gender: b.patientInfo.gender,
    heightCm: b.patientInfo.heightCm,
    weightKg: b.patientInfo.weightKg,
    pregnancy: b.patientInfo.pregnancy,
    problem: b.patientInfo.problem,
  },
  isFollowUp: Boolean(b.followUpOf),
  followUpOfId: extra.rootId ?? null,
  chat: chatView(b),
  hasReport: Boolean(b.report),
  report: extra.withReport ? reportView(b) : null,
  earnings: b.earnings ? { amount: paiseToRupees(b.earnings.doctorPaise), weekStart: b.earnings.weekStart, settled: Boolean(b.earnings.settlement) } : null,
});

export const adminBookingView = (
  b: IBooking,
  extra: { patientEmail?: string; doctorName?: string; doctorCode?: string; aiDoctorName?: string }
) => ({
  id: b.publicId,
  kind: b.kind,
  status: b.status,
  patientEmail: extra.patientEmail ?? '',
  patientName: b.patientInfo.name,
  doctorName: extra.doctorName ?? extra.aiDoctorName ?? '',
  doctorCode: extra.doctorCode ?? '',
  slotStart: b.slotStart,
  slotEnd: b.slotEnd,
  price: priceView(b),
  unlock: b.unlock,
  holdUntil: b.holdUntil,
  payment: b.payment,
  refund: refundView(b),
  isFollowUp: Boolean(b.followUpOf),
  chat: chatView(b),
  messages: b.msgSeq,
  hasReport: Boolean(b.report),
  earnings: b.earnings
    ? {
        doctor: paiseToRupees(b.earnings.doctorPaise),
        admin: paiseToRupees(b.earnings.adminPaise),
        weekStart: b.earnings.weekStart,
        settled: Boolean(b.earnings.settlement),
      }
    : null,
  cancelReason: b.cancelReason,
  createdAt: b.createdAt,
});
