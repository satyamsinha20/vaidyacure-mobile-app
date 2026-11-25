import { Booking, type IBooking } from '../../models/Booking.js';
import { Doctor } from '../../models/Doctor.js';
import { Patient } from '../../models/Patient.js';
import { MINUTE_MS, formatIst } from '../../utils/time.js';
import { incrementCounter } from '../rateLimit.js';
import { sendMails } from '../email/mailer.js';
import { reminderMail, startNowMail } from '../email/templates.js';
import { applyTimeRules } from './bookings.js';
import { getMarketplaceSettings } from './settings.js';

/**
 * Time-based work: expire holds, no-shows, chat end times, reminders and
 * "it's time now" emails. Correctness never depends on this running (every
 * read applies the same rules); it only makes emails go out on time. It runs
 * from an external cron (see /api/cron/tick) and, at most every 30 seconds,
 * piggy-backs on doctor/patient requests.
 */
const REMINDER_BEFORE_MS = 15 * MINUTE_MS;
const BATCH = 100;

const claimFlag = async (b: IBooking, flag: 'reminder' | 'start') =>
  Booking.findOneAndUpdate({ _id: b._id, status: 'confirmed', [`notified.${flag}`]: false }, { $set: { [`notified.${flag}`]: true } });

const emailsFor = async (b: IBooking) => {
  const [patient, doctor] = await Promise.all([
    Patient.findById(b.patient).select('email').lean(),
    Doctor.findById(b.doctor).select('email name').lean(),
  ]);
  return { patient, doctor };
};

export const runDueWork = async (now = new Date()) => {
  const s = await getMarketplaceSettings();
  const stats = { transitions: 0, reminders: 0, startAlerts: 0 };

  // 1. Bookings whose time rules may apply now
  const due = await Booking.find({
    $or: [
      { status: 'awaiting_payment', holdUntil: { $lte: now } },
      { status: 'payment_review', slotStart: { $lte: now } },
      { status: 'confirmed', kind: 'real', slotStart: { $lte: new Date(now.getTime() - s.doctorJoinMinutes * MINUTE_MS) } },
      { status: 'confirmed', kind: 'ai', slotEnd: { $lte: now } },
      { status: 'in_progress', patientRepliedAt: null, replyBy: { $lte: now } },
      { status: 'in_progress', chatEndsAt: { $lte: now } },
    ],
  }).limit(BATCH);
  for (const booking of due) {
    const after = await applyTimeRules(booking, now);
    if (after.status !== booking.status) stats.transitions++;
  }

  // 2. Reminder 15 minutes before
  const soon = await Booking.find({
    kind: 'real',
    status: 'confirmed',
    'notified.reminder': false,
    slotStart: { $gt: now, $lte: new Date(now.getTime() + REMINDER_BEFORE_MS) },
  }).limit(BATCH);
  for (const booking of soon) {
    if (!(await claimFlag(booking, 'reminder'))) continue;
    const { patient, doctor } = await emailsFor(booking);
    const when = formatIst(booking.slotStart);
    await sendMails([
      patient && reminderMail(patient.email, { other: doctor?.name ?? 'your doctor', when, forDoctor: false }),
      doctor && reminderMail(doctor.email, { other: booking.patientInfo.name, when, forDoctor: true }),
    ]);
    stats.reminders++;
  }

  // 3. "It's time" alert at the start
  const starting = await Booking.find({
    kind: 'real',
    status: 'confirmed',
    'notified.start': false,
    slotStart: { $lte: now, $gt: new Date(now.getTime() - s.doctorJoinMinutes * MINUTE_MS) },
  }).limit(BATCH);
  for (const booking of starting) {
    if (!(await claimFlag(booking, 'start'))) continue;
    const { patient, doctor } = await emailsFor(booking);
    await sendMails([
      doctor && startNowMail(doctor.email, { other: booking.patientInfo.name, forDoctor: true }),
      patient && startNowMail(patient.email, { other: doctor?.name ?? 'Your doctor', forDoctor: false }),
    ]);
    stats.startAlerts++;
  }
  return stats;
};

let lastLocalRun = 0;

/** Runs the due work at most once every 30 seconds across all server instances; never throws */
export const maybeRunDueWork = async (): Promise<void> => {
  const now = Date.now();
  if (now - lastLocalRun < 30_000) return;
  lastLocalRun = now;
  try {
    if ((await incrementCounter(`tick:${Math.floor(now / 30_000)}`, 120_000)) > 1) return;
    await runDueWork();
  } catch (error) {
    console.error('[tick] failed:', error instanceof Error ? error.message : error);
  }
};
