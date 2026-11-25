import { z } from 'zod';
import { Booking, type IBooking } from '../../models/Booking.js';
import { LiveMessage } from '../../models/LiveMessage.js';
import type { IDoctor } from '../../models/Doctor.js';
import { Patient } from '../../models/Patient.js';
import { MINUTE_MS, istWeekStart } from '../../utils/time.js';
import { AppError } from '../http.js';
import { incrementCounter } from '../rateLimit.js';
import { sendMails } from '../email/mailer.js';
import { reportReadyMail } from '../email/templates.js';
import { applyTimeRules } from './bookings.js';
import { scanChatMessage } from './chatFilter.js';
import { getMarketplaceSettings } from './settings.js';

/**
 * Real-time chat between a patient and a real doctor. Vercel functions cannot
 * keep WebSockets open, so both apps poll for new messages every few seconds
 * (`after` = last message number they have). The doctor's first message
 * starts the consultation clock; the patient then has N minutes to reply.
 */
export const MESSAGE_MAX = 1000;

export const ChatMessageSchema = z.object({
  text: z.string().trim().min(1, 'Type a message').max(MESSAGE_MAX, `Keep each message under ${MESSAGE_MAX} characters`),
});

export const ReportSchema = z.object({
  diagnosis: z.string().trim().min(3, 'Write the diagnosis').max(1500),
  advice: z.string().trim().max(3000).default(''),
  medicines: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        dose: z.string().trim().max(60).default(''),
        frequency: z.string().trim().max(60).default(''),
        duration: z.string().trim().max(60).default(''),
        notes: z.string().trim().max(200).default(''),
      })
    )
    .max(15)
    .default([]),
  tests: z.array(z.string().trim().min(1).max(100)).max(15).default([]),
  followUpAdvice: z.string().trim().max(500).default(''),
});

type Side = 'doctor' | 'patient';

export const chatState = (b: IBooking) => ({
  status: b.status,
  slotStart: b.slotStart,
  slotEnd: b.slotEnd,
  doctorJoinedAt: b.doctorJoinedAt,
  replyBy: b.replyBy,
  patientRepliedAt: b.patientRepliedAt,
  chatEndsAt: b.chatEndsAt,
  chatEndedAt: b.chatEndedAt,
  hasReport: Boolean(b.report),
  serverTime: new Date(),
});

const messageView = (m: { seq: number; from: string; text: string; at: Date }) => ({ seq: m.seq, from: m.from, text: m.text, at: m.at });

export const getMessages = async (booking: IBooking, after: number) => {
  const current = await applyTimeRules(booking);
  const messages = await LiveMessage.find({ booking: current._id, seq: { $gt: Math.max(0, after) } })
    .sort({ seq: 1 })
    .limit(200)
    .lean();
  return { messages: messages.map(messageView), state: chatState(current) };
};

export const postMessage = async (booking: IBooking, from: Side, text: string) => {
  // Two messages per second at most per side (stops scripted flooding)
  if ((await incrementCounter(`chat:${booking._id}:${from}:${Math.floor(Date.now() / 1000)}`, 60_000)) > 2) {
    throw new AppError(429, 'You are sending messages too fast.', 'rate_limited');
  }
  const b = await applyTimeRules(booking);
  const now = new Date();
  let updated: IBooking | null = null;

  if (from === 'doctor') {
    if (b.status === 'confirmed') {
      if (now.getTime() < b.slotStart.getTime()) {
        throw new AppError(409, 'You can start the chat at the booked time.', 'too_early');
      }
      const s = await getMarketplaceSettings();
      // The first doctor message starts the consultation (only inside the joining window)
      updated = await Booking.findOneAndUpdate(
        { _id: b._id, status: 'confirmed', slotStart: { $lte: now, $gt: new Date(now.getTime() - s.doctorJoinMinutes * MINUTE_MS) } },
        {
          $set: {
            status: 'in_progress',
            doctorJoinedAt: now,
            replyBy: new Date(now.getTime() + s.patientReplyMinutes * MINUTE_MS),
            chatEndsAt: new Date(now.getTime() + b.consultMinutes * MINUTE_MS),
          },
          $inc: { msgSeq: 1 },
        },
        { new: true }
      );
    } else if (b.status === 'in_progress') {
      updated = await Booking.findOneAndUpdate({ _id: b._id, status: 'in_progress', chatEndsAt: { $gt: now } }, { $inc: { msgSeq: 1 } }, { new: true });
    }
  } else if (b.status === 'in_progress') {
    // The patient's first reply must arrive before the reply deadline
    updated = await Booking.findOneAndUpdate(
      {
        _id: b._id,
        status: 'in_progress',
        chatEndsAt: { $gt: now },
        $or: [{ patientRepliedAt: { $ne: null } }, { replyBy: { $gt: now } }],
      },
      { $inc: { msgSeq: 1 }, ...(b.patientRepliedAt ? {} : { $set: { patientRepliedAt: now } }) },
      { new: true }
    );
  } else if (b.status === 'confirmed') {
    throw new AppError(409, 'Please wait, the doctor will start the chat at the booked time.', 'wait_for_doctor');
  }

  if (!updated) throw new AppError(409, 'This chat is closed.', 'chat_closed');
  const scanned = scanChatMessage(text);
  const message = await LiveMessage.create({ booking: b._id, seq: updated.msgSeq, from, text: scanned.text, original: text, flags: scanned.flags, at: now });
  return { message: messageView(message), state: chatState(updated) };
};

/** The doctor can end early, but only after the patient has joined (otherwise the no-show rule decides) */
export const endChat = async (doctor: IDoctor, booking: IBooking) => {
  const b = await applyTimeRules(booking);
  if (b.status === 'chat_ended') return b;
  const updated = await Booking.findOneAndUpdate(
    { _id: b._id, doctor: doctor._id, status: 'in_progress', patientRepliedAt: { $ne: null } },
    { $set: { status: 'chat_ended', chatEndedAt: new Date() } },
    { new: true }
  );
  if (!updated) throw new AppError(409, 'The chat can be ended after the patient has replied.', 'cannot_end');
  return updated;
};

/** The doctor's report completes the consultation and adds the fee to this week's earnings */
export const sendReport = async (doctor: IDoctor, booking: IBooking, input: z.infer<typeof ReportSchema>) => {
  const b = await applyTimeRules(booking);
  if (b.report) throw new AppError(409, 'The report has already been sent.', 'report_sent');
  if (!['chat_ended', 'in_progress'].includes(b.status) || !b.patientRepliedAt) {
    throw new AppError(409, 'A report can be sent after a consultation in which the patient took part.', 'cannot_report');
  }
  const now = new Date();
  const paid = b.price.totalPaise > 0;
  const updated = await Booking.findOneAndUpdate(
    { _id: b._id, doctor: doctor._id, status: { $in: ['chat_ended', 'in_progress'] }, report: null, patientRepliedAt: { $ne: null } },
    {
      $set: {
        status: 'completed',
        chatEndedAt: b.chatEndedAt ?? now,
        report: {
          ...input,
          sentAt: now,
          doctor: {
            name: doctor.name,
            qualification: doctor.qualification,
            specialization: doctor.specialization,
            registrationNumber: doctor.registrationNumber,
            registrationCouncil: doctor.registrationCouncil,
          },
        },
        earnings: paid
          ? { doctorPaise: b.price.feePaise, adminPaise: b.price.commissionPaise, weekStart: istWeekStart(now), earnedAt: now, settlement: null }
          : null,
      },
    },
    { new: true }
  );
  if (!updated) throw new AppError(409, 'This consultation was just updated. Please refresh.', 'conflict');
  const patient = await Patient.findById(updated.patient).select('email').lean();
  await sendMails([patient && reportReadyMail(patient.email, { doctor: doctor.name })]);
  return updated;
};

/** Earlier consultations (and their chats/reports) in the same follow-up chain, for the doctor */
export const consultationThread = async (doctor: IDoctor, booking: IBooking) => {
  const rootId = booking.followUpOf ?? booking._id;
  const bookings = await Booking.find({ doctor: doctor._id, $or: [{ _id: rootId }, { followUpOf: rootId }] })
    .sort({ slotStart: 1 })
    .lean<IBooking[]>();
  const messages = await LiveMessage.find({ booking: { $in: bookings.map((b) => b._id) } })
    .sort({ seq: 1 })
    .lean();
  return bookings.map((b) => ({
    id: b.publicId,
    status: b.status,
    slotStart: b.slotStart,
    isFollowUp: Boolean(b.followUpOf),
    problem: b.patientInfo.problem,
    report: b.report,
    messages: messages.filter((m) => m.booking.equals(b._id)).map(messageView),
  }));
};
