import type { Types } from 'mongoose';
import { Booking } from '../../models/Booking.js';
import { Doctor } from '../../models/Doctor.js';
import { Settlement } from '../../models/Settlement.js';
import { WalletTopup, WalletTxn } from '../../models/Wallet.js';
import { formatInr, paiseToRupees } from '../../utils/money.js';
import { DAY_MS, istWeekStart } from '../../utils/time.js';
import { withTransaction } from '../db/transaction.js';
import { AppError } from '../http.js';
import { sendMails } from '../email/mailer.js';
import { settlementPaidMail } from '../email/templates.js';

/**
 * Weekly payouts (Monday to Sunday, India time). Each completed consultation
 * (and the doctor's share of a patient no-show) is an earning in the week it
 * happened. After the week ends the admin pays the doctor and records the
 * UTR; the earnings are then linked to that settlement and can never be paid twice.
 * "Pay now" pays everything unpaid on any day, this week's earnings included.
 */
const unsettledFilter = (doctorId: Types.ObjectId, beforeWeek?: string) => ({
  doctor: doctorId,
  earnings: { $ne: null },
  'earnings.settlement': null,
  'earnings.doctorPaise': { $gt: 0 },
  ...(beforeWeek ? { 'earnings.weekStart': { $lt: beforeWeek } } : {}),
});

/** The doctor panel's Earnings page */
export const doctorEarnings = async (doctorId: Types.ObjectId) => {
  const currentWeek = istWeekStart(new Date());
  const [weeks, settlements] = await Promise.all([
    Booking.aggregate<{ _id: string; count: number; doctorPaise: number; settledPaise: number }>([
      { $match: { doctor: doctorId, earnings: { $ne: null } } },
      {
        $group: {
          _id: '$earnings.weekStart',
          count: { $sum: 1 },
          doctorPaise: { $sum: '$earnings.doctorPaise' },
          settledPaise: { $sum: { $cond: [{ $ne: ['$earnings.settlement', null] }, '$earnings.doctorPaise', 0] } },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 26 },
    ]),
    Settlement.find({ doctor: doctorId }).sort({ paidAt: -1 }).limit(50).lean(),
  ]);
  const total = weeks.reduce((sum, w) => sum + w.doctorPaise, 0);
  const settled = weeks.reduce((sum, w) => sum + w.settledPaise, 0);
  const payableNow = weeks.filter((w) => w._id < currentWeek).reduce((sum, w) => sum + (w.doctorPaise - w.settledPaise), 0);
  return {
    currentWeek,
    totals: { earned: paiseToRupees(total), settled: paiseToRupees(settled), pending: paiseToRupees(total - settled), payableNow: paiseToRupees(payableNow) },
    weeks: weeks.map((w) => ({
      weekStart: w._id,
      consultations: w.count,
      amount: paiseToRupees(w.doctorPaise),
      settled: paiseToRupees(w.settledPaise),
      pending: paiseToRupees(w.doctorPaise - w.settledPaise),
      isCurrent: w._id === currentWeek,
    })),
    settlements: settlements.map((s) => ({
      id: String(s._id),
      amount: paiseToRupees(s.amountPaise),
      consultations: s.bookings.length,
      weeks: s.weeks,
      utr: s.utr,
      note: s.note,
      paidAt: s.paidAt,
    })),
  };
};

/** Admin payout list: what each doctor is owed for weeks that have ended */
export const payoutOverview = async () => {
  const currentWeek = istWeekStart(new Date());
  const rows = await Booking.aggregate<{ _id: Types.ObjectId; payablePaise: number; count: number; runningPaise: number }>([
    { $match: { kind: 'real', earnings: { $ne: null }, 'earnings.settlement': null, 'earnings.doctorPaise': { $gt: 0 } } },
    {
      $group: {
        _id: '$doctor',
        payablePaise: { $sum: { $cond: [{ $lt: ['$earnings.weekStart', currentWeek] }, '$earnings.doctorPaise', 0] } },
        count: { $sum: { $cond: [{ $lt: ['$earnings.weekStart', currentWeek] }, 1, 0] } },
        runningPaise: { $sum: { $cond: [{ $gte: ['$earnings.weekStart', currentWeek] }, '$earnings.doctorPaise', 0] } },
      },
    },
  ]);
  const doctors = await Doctor.find({ _id: { $in: rows.map((r) => r._id) } })
    .select('name doctorCode bankHint bankUpdatedAt bankReviewedAt')
    .lean();
  return {
    currentWeek,
    doctors: rows
      .map((r) => {
        const d = doctors.find((x) => x._id.equals(r._id));
        return {
          doctorId: String(r._id),
          name: d?.name ?? 'Deleted doctor',
          doctorCode: d?.doctorCode ?? '',
          bankHint: d?.bankHint ?? '',
          bankChanged: Boolean(d?.bankUpdatedAt && (!d.bankReviewedAt || d.bankUpdatedAt > d.bankReviewedAt)),
          payable: paiseToRupees(r.payablePaise),
          consultations: r.count,
          thisWeek: paiseToRupees(r.runningPaise),
        };
      })
      .sort((a, b) => b.payable - a.payable),
  };
};

export const settleDoctor = async (adminEmail: string, doctorId: string, input: { utr: string; note: string; includeThisWeek?: boolean }) => {
  const doctor = await Doctor.findById(doctorId).select('name email');
  if (!doctor) throw new AppError(404, 'Doctor not found.');
  const currentWeek = istWeekStart(new Date());
  const settlement = await withTransaction(async (session) => {
    const due = await Booking.find(unsettledFilter(doctor._id, input.includeThisWeek ? undefined : currentWeek))
      .select('_id earnings')
      .session(session)
      .lean();
    if (!due.length) {
      throw new AppError(
        409,
        input.includeThisWeek ? 'Nothing to pay: this doctor has no unpaid earnings.' : 'Nothing to pay: there are no unpaid earnings from finished weeks.',
        'nothing_due'
      );
    }
    const amountPaise = due.reduce((sum, b) => sum + (b.earnings?.doctorPaise ?? 0), 0);
    const [created] = await Settlement.create(
      [
        {
          doctor: doctor._id,
          amountPaise,
          bookings: due.map((b) => b._id),
          weeks: Array.from(new Set(due.map((b) => b.earnings!.weekStart))).sort(),
          utr: input.utr,
          note: input.note,
          paidByEmail: adminEmail,
          paidAt: new Date(),
        },
      ],
      { session }
    );
    const linked = await Booking.updateMany(
      { _id: { $in: due.map((b) => b._id) }, 'earnings.settlement': null },
      { $set: { 'earnings.settlement': created._id } },
      { session }
    );
    // Someone settled part of these at the same moment: undo everything
    if (linked.modifiedCount !== due.length) throw new AppError(409, 'These earnings were just paid by someone else. Please refresh.', 'conflict');
    return created;
  });
  await sendMails([
    settlementPaidMail(doctor.email, { amount: formatInr(settlement.amountPaise), utr: settlement.utr, count: settlement.bookings.length }),
  ]);
  return settlement;
};

export const settlementHistory = async (limit = 100) => {
  const rows = await Settlement.find().sort({ paidAt: -1 }).limit(limit).populate<{ doctor: { name: string; doctorCode: string } | null }>('doctor', 'name doctorCode').lean();
  return rows.map((s) => ({
    id: String(s._id),
    doctorName: s.doctor?.name ?? 'Deleted doctor',
    doctorCode: s.doctor?.doctorCode ?? '',
    amount: paiseToRupees(s.amountPaise),
    consultations: s.bookings.length,
    weeks: s.weeks,
    utr: s.utr,
    note: s.note,
    paidByEmail: s.paidByEmail,
    paidAt: s.paidAt,
  }));
};

const sum = async (model: any, match: Record<string, unknown>, field: string): Promise<number> => {
  const [row] = await model.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: field } } }]);
  return row?.total ?? 0;
};

/** Admin dashboard money summary for a period */
export const adminEarnings = async (range: 'week' | 'month' | 'all') => {
  const now = new Date();
  const from =
    range === 'week'
      ? new Date(`${istWeekStart(now)}T00:00:00+05:30`)
      : range === 'month'
      ? new Date(now.getTime() - 30 * DAY_MS)
      : new Date(0);
  const since = { $gte: from };
  const [bookingsPaid, topups, refundsPaid, refundsDue, commission, doctorShare, payoutsPaid, payoutsPending, aiChats, walletLiability] =
    await Promise.all([
      sum(Booking, { kind: 'real', 'payment.verifiedAt': since }, '$price.totalPaise'),
      sum(WalletTopup, { status: 'approved', reviewedAt: since }, '$creditedPaise'),
      sum(Booking, { 'refund.status': 'paid', 'refund.paidAt': since }, '$refund.amountPaise'),
      sum(Booking, { 'refund.status': 'due' }, '$refund.amountPaise'),
      sum(Booking, { earnings: { $ne: null }, 'earnings.earnedAt': since }, '$earnings.adminPaise'),
      sum(Booking, { earnings: { $ne: null }, 'earnings.earnedAt': since }, '$earnings.doctorPaise'),
      sum(Settlement, { paidAt: since }, '$amountPaise'),
      sum(Booking, { earnings: { $ne: null }, 'earnings.settlement': null }, '$earnings.doctorPaise'),
      sum(WalletTxn, { kind: 'ai_chat', createdAt: since }, '$amountPaise'),
      sum(WalletTxn, {}, '$amountPaise'),
    ]);
  const counts = await Booking.aggregate<{ _id: string; n: number }>([
    { $match: { kind: 'real', createdAt: since } },
    { $group: { _id: '$status', n: { $sum: 1 } } },
  ]);
  return {
    range,
    from,
    collected: { bookings: paiseToRupees(bookingsPaid), walletTopups: paiseToRupees(topups) },
    refunds: { paid: paiseToRupees(refundsPaid), due: paiseToRupees(refundsDue) },
    income: {
      commission: paiseToRupees(commission),
      premiumAi: paiseToRupees(-aiChats),
      total: paiseToRupees(commission - aiChats),
    },
    doctors: { earned: paiseToRupees(doctorShare), paid: paiseToRupees(payoutsPaid), pending: paiseToRupees(payoutsPending) },
    walletBalances: paiseToRupees(walletLiability),
    bookingsByStatus: Object.fromEntries(counts.map((c) => [c._id, c.n])),
  };
};
