import { z } from 'zod';
import type { ClientSession, Types } from 'mongoose';
import { Patient, type IPatient } from '../../models/Patient.js';
import { UtrRegistry, WalletTopup, WalletTxn, type WalletTxnKind } from '../../models/Wallet.js';
import type { IBooking } from '../../models/Booking.js';
import { formatInr, paiseToRupees, rupeesToPaise } from '../../utils/money.js';
import { withTransaction } from '../db/transaction.js';
import { AppError } from '../http.js';
import { incrementCounter } from '../rateLimit.js';
import { sendMails } from '../email/mailer.js';
import { topupApprovedMail, topupRejectedMail } from '../email/templates.js';

/**
 * The patient's VaidyaCure wallet (closed loop: money can only be spent on
 * premium AI consultations inside the app, never withdrawn). It is filled
 * by paying the admin's UPI and sending the UTR, which the admin verifies.
 * Every balance change happens in a transaction together with its ledger row.
 */
export const TopupSchema = z.object({
  amountInr: z.number().int('Enter a whole rupee amount').min(10, 'Minimum ₹10').max(5000, 'Maximum ₹5,000 at a time'),
  utr: z.string().trim().regex(/^\d{12}$/, 'Enter the 12-digit UPI reference number (UTR)'),
});

export const MAX_PENDING_TOPUPS = 3;

interface LedgerEntry {
  kind: WalletTxnKind;
  ref: string;
  note: string;
  idempotencyKey?: string;
}

/** Takes money out of the wallet; fails (and changes nothing) if the balance is too low */
export const debitWallet = async (session: ClientSession, patientId: Types.ObjectId, paise: number, entry: LedgerEntry) => {
  if (!Number.isInteger(paise) || paise <= 0) throw new AppError(400, 'Invalid amount.');
  const patient = await Patient.findOneAndUpdate(
    { _id: patientId, walletPaise: { $gte: paise } },
    { $inc: { walletPaise: -paise } },
    { new: true, session }
  );
  if (!patient) throw new AppError(402, 'Not enough money in your wallet. Please add money first.', 'wallet_low');
  await WalletTxn.create([{ patient: patientId, amountPaise: -paise, balanceAfterPaise: patient.walletPaise, ...entry }], { session });
  return patient.walletPaise;
};

export const creditWallet = async (session: ClientSession, patientId: Types.ObjectId, paise: number, entry: LedgerEntry) => {
  if (!Number.isInteger(paise) || paise <= 0) throw new AppError(400, 'Invalid amount.');
  const patient = await Patient.findOneAndUpdate({ _id: patientId }, { $inc: { walletPaise: paise } }, { new: true, session });
  if (!patient) throw new AppError(404, 'Patient not found.');
  await WalletTxn.create([{ patient: patientId, amountPaise: paise, balanceAfterPaise: patient.walletPaise, ...entry }], { session });
  return patient.walletPaise;
};

/** Gives back the price of a premium AI booking that never started (once only) */
export const refundAiBookingToWallet = async (booking: IBooking): Promise<void> => {
  try {
    await withTransaction((session) =>
      creditWallet(session, booking.patient, booking.price.totalPaise, {
        kind: 'ai_refund',
        ref: booking.publicId,
        note: 'Premium consultation not used',
        idempotencyKey: `ai-refund:${booking.publicId}`,
      })
    );
  } catch (error: any) {
    // Already refunded (unique idempotency key): nothing to do
    if (error?.code !== 11000) console.error('[wallet] AI booking refund failed:', error);
  }
};

/* -------------------------------------------------------------------------- */
/* PATIENT                                                                    */
/* -------------------------------------------------------------------------- */
export const requestTopup = async (patient: IPatient, input: z.infer<typeof TopupSchema>) => {
  const hour = Math.floor(Date.now() / 3_600_000);
  if ((await incrementCounter(`topup:req:${patient._id}:${hour}`, 2 * 3_600_000)) > 10) {
    throw new AppError(429, 'Too many requests. Please try again later.', 'rate_limited');
  }
  const pending = await WalletTopup.countDocuments({ patient: patient._id, status: 'pending' });
  if (pending >= MAX_PENDING_TOPUPS) {
    throw new AppError(429, 'You already have requests waiting for approval. Please wait for them first.', 'too_many_pending');
  }
  try {
    await UtrRegistry.create({ utr: input.utr, kind: 'topup', ref: String(patient._id) });
  } catch (error: any) {
    if (error?.code === 11000) throw new AppError(409, 'This UTR number has already been used. Please check it.', 'utr_used');
    throw error;
  }
  try {
    return await WalletTopup.create({ patient: patient._id, amountPaise: rupeesToPaise(input.amountInr), utr: input.utr });
  } catch (error) {
    await UtrRegistry.deleteOne({ utr: input.utr, kind: 'topup' });
    throw error;
  }
};

export const topupView = (t: { _id: unknown; amountPaise: number; creditedPaise: number; utr: string; status: string; rejectReason: string; createdAt: Date; reviewedAt: Date | null }) => ({
  id: String(t._id),
  amount: paiseToRupees(t.amountPaise),
  credited: paiseToRupees(t.creditedPaise),
  utr: t.utr,
  status: t.status,
  rejectReason: t.rejectReason,
  createdAt: t.createdAt,
  reviewedAt: t.reviewedAt,
});

export const walletOverview = async (patient: IPatient) => {
  const [txns, topups, fresh] = await Promise.all([
    WalletTxn.find({ patient: patient._id }).sort({ createdAt: -1 }).limit(40).lean(),
    WalletTopup.find({ patient: patient._id }).sort({ createdAt: -1 }).limit(20).lean(),
    Patient.findById(patient._id).select('walletPaise').lean(),
  ]);
  return {
    balance: paiseToRupees(fresh?.walletPaise ?? 0),
    transactions: txns.map((t) => ({
      id: String(t._id),
      kind: t.kind,
      amount: paiseToRupees(t.amountPaise),
      balanceAfter: paiseToRupees(t.balanceAfterPaise),
      note: t.note,
      createdAt: t.createdAt,
    })),
    topups: topups.map(topupView),
  };
};

/* -------------------------------------------------------------------------- */
/* ADMIN                                                                      */
/* -------------------------------------------------------------------------- */
export const approveTopup = async (adminId: Types.ObjectId, adminEmail: string, topupId: string, creditInr?: number) => {
  const result = await withTransaction(async (session) => {
    const pending = await WalletTopup.findOne({ _id: topupId, status: 'pending' }).session(session);
    if (!pending) throw new AppError(409, 'This request was already reviewed.', 'already_reviewed');
    const credited = creditInr !== undefined ? rupeesToPaise(creditInr) : pending.amountPaise;
    if (credited <= 0 || credited > rupeesToPaise(5000)) throw new AppError(400, 'Credit between ₹1 and ₹5,000.');
    const topup = await WalletTopup.findOneAndUpdate(
      { _id: topupId, status: 'pending' },
      { $set: { status: 'approved', creditedPaise: credited, reviewedBy: adminId, reviewedByEmail: adminEmail, reviewedAt: new Date() } },
      { new: true, session }
    );
    if (!topup) throw new AppError(409, 'This request was already reviewed.', 'already_reviewed');
    const balance = await creditWallet(session, topup.patient, credited, {
      kind: 'topup',
      ref: String(topup._id),
      note: `UPI top-up (UTR ${topup.utr})`,
      idempotencyKey: `topup:${topup._id}`,
    });
    return { topup, balance };
  });
  const patient = await Patient.findById(result.topup.patient).select('email').lean();
  await sendMails([
    patient && topupApprovedMail(patient.email, { amount: formatInr(result.topup.creditedPaise), balance: formatInr(result.balance) }),
  ]);
  return result.topup;
};

export const rejectTopup = async (adminId: Types.ObjectId, adminEmail: string, topupId: string, reason: string) => {
  const topup = await WalletTopup.findOneAndUpdate(
    { _id: topupId, status: 'pending' },
    { $set: { status: 'rejected', rejectReason: reason, reviewedBy: adminId, reviewedByEmail: adminEmail, reviewedAt: new Date() } },
    { new: true }
  );
  if (!topup) throw new AppError(409, 'This request was already reviewed.', 'already_reviewed');
  const patient = await Patient.findById(topup.patient).select('email').lean();
  await sendMails([patient && topupRejectedMail(patient.email, { amount: formatInr(topup.amountPaise), reason })]);
  return topup;
};
