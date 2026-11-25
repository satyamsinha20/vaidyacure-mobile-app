import { z } from 'zod';
import { Consultation, type IConsultation } from '../../models/Consultation.js';
import { UnlockToken } from '../../models/UnlockToken.js';
import { Booking, type IBooking } from '../../models/Booking.js';
import { WalletTxn } from '../../models/Wallet.js';
import type { IPatient } from '../../models/Patient.js';
import { getAiSettings, getDoctorRuntime, type AiSettingsValues, type DoctorRuntime } from '../ai/configStore.js';
import { withTransaction } from '../db/transaction.js';
import { debitWallet } from '../marketplace/wallet.js';
import { isWithinHours, nextAvailableAt } from '../marketplace/availability.js';
import { rupeesToPaise } from '../../utils/money.js';
import { formatIst } from '../../utils/time.js';
import { findLibraryItems, keepOnlyLibraryRemedies, libraryPromptBlock } from './library.js';
import type { ChatMessage } from '../ai/llmClient.js';
import { scrubVendorMentions } from '../ai/vendorGuard.js';
import { DAILY_TTL_MS, incrementCounter, today } from '../rateLimit.js';
import { randomToken, sha256 } from '../../utils/secretBox.js';
import { DiagnosisModelOutputSchema, PatientSchema, type PatientInput } from '../diagnosis/schemas.js';
import { ANALYSIS_TASK, CLINICAL_SYSTEM_PROMPT, buildPatientData } from '../diagnosis/prompts.js';
import { ChatTurnSchema, buildChatSystemPrompt, greetingFor, identityLine } from './chatPrompt.js';
import { completeJson, ConsultError } from './modelCall.js';
import { buildReport, type ConsultReport } from './report.js';

const RECORD_TTL_MS = 24 * 60 * 60 * 1000;
const REPORT_GRACE_MS = 15 * 60 * 1000;
const REPORT_LOCK_MS = 4 * 60 * 1000;
export const MESSAGE_MAX_LENGTH = 600;

export const CONSULTATION_ID_PATTERN = /^[a-f0-9]{32}$/;

export const StartConsultationSchema = z.object({
  doctorId: z.string().regex(/^[a-f0-9]{24}$/, 'Invalid doctor.'),
  patient: PatientSchema,
  /** Free AI doctors: proof of watched ads */
  unlockToken: z.string().regex(/^[a-f0-9]{48}$/).optional(),
  /** Premium AI doctors: pay from the logged-in patient's wallet */
  payWithWallet: z.boolean().optional(),
  /** Sent again on a retry so the wallet is charged only once */
  requestId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/).optional(),
});

export const ConsultMessageSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'Please type your message.')
    .max(MESSAGE_MAX_LENGTH, `Please keep each message under ${MESSAGE_MAX_LENGTH} characters.`),
});

// Report output must contain an assessment whenever the input was accepted
const ReportOutputSchema = DiagnosisModelOutputSchema.refine(
  (value) => value.input_check.status !== 'ok' || value.assessment !== null,
  'Assessment missing'
);

const REPORT_SCHEMA_TEXT = JSON.stringify(
  JSON.parse(JSON.stringify(z.toJSONSchema(DiagnosisModelOutputSchema, { target: 'draft-7' })), (key, value) =>
    key === '$schema' ? undefined : value
  )
);

const toPatient = (c: Pick<IConsultation, 'patient'>): PatientInput => ({
  age: c.patient.age,
  gender: c.patient.gender,
  heightCm: c.patient.heightCm,
  weightKg: c.patient.weightKg,
  pregnancy: (c.patient.pregnancy as PatientInput['pregnancy']) || 'not_applicable',
});

/* -------------------------------------------------------------------------- */
/* START                                                                      */
/* -------------------------------------------------------------------------- */
export interface StartedConsultation {
  consultationId: string;
  endsAt: string;
  maxUserMessages: number;
  serverTime: string;
}

const startedView = (c: Pick<IConsultation, 'publicId' | 'endsAt' | 'maxUserMessages'>): StartedConsultation => ({
  consultationId: c.publicId,
  endsAt: c.endsAt.toISOString(),
  maxUserMessages: c.maxUserMessages,
  serverTime: new Date().toISOString(),
});

/** A new consultation record with the doctor's own length and message limit (or the global ones) */
const newConsultation = (
  deviceId: string,
  runtime: DoctorRuntime,
  settings: AiSettingsValues,
  patient: PatientInput,
  extra: { account?: unknown; booking?: unknown; unlock: 'none' | 'ads' | 'wallet' | 'booking' }
) => {
  const now = Date.now();
  const seconds = runtime.doctor.consultMinutes ? runtime.doctor.consultMinutes * 60 : settings.consultationSeconds;
  return {
    publicId: randomToken(16),
    deviceId,
    doctor: runtime.doctor.id,
    tier: runtime.doctor.tier,
    account: extra.account ?? null,
    booking: extra.booking ?? null,
    unlock: extra.unlock,
    patient,
    messages: [{ role: 'doctor' as const, text: greetingFor(runtime.doctor.name, runtime.doctor.designation), at: new Date(now) }],
    maxUserMessages: runtime.doctor.maxUserMessages ?? settings.maxUserMessages,
    endsAt: new Date(now + seconds * 1000),
    expiresAt: new Date(now + RECORD_TTL_MS),
  };
};

/** A retried premium start (same requestId) returns the consultation that was already paid for */
const findPaidRetry = async (account: IPatient, requestId: string | undefined, deviceId: string) => {
  if (!requestId) return null;
  const txn = await WalletTxn.findOne({ idempotencyKey: `ai:${account._id}:${requestId}` }).lean();
  if (!txn) return null;
  return Consultation.findOne({ publicId: txn.ref, deviceId }).lean();
};

/**
 * Starts a consultation right now.
 * - library: free, no ads (daily limit per device)
 * - free:    needs an ad unlock token (and the daily limit)
 * - premium: paid from the logged-in patient's wallet, charged together with
 *            the consultation in one transaction
 */
export const startConsultation = async (
  deviceId: string,
  ip: string,
  input: z.infer<typeof StartConsultationSchema>,
  account: IPatient | null = null
): Promise<StartedConsultation> => {
  const settings = await getAiSettings();
  const runtime = await getDoctorRuntime(input.doctorId);
  if (!runtime) throw new ConsultError(404, 'This doctor is not available right now. Please choose another doctor.');
  const doctor = runtime.doctor;

  if (!doctor.alwaysAvailable && !isWithinHours(doctor.availability)) {
    const next = nextAvailableAt(doctor.availability);
    throw new ConsultError(
      409,
      next ? `${doctor.name} is available from ${formatIst(next)}. You can book that time.` : `${doctor.name} is not available right now.`,
      'not_available'
    );
  }

  // Checks that cost nothing come before any daily limit is used up
  if (doctor.tier === 'premium') {
    if (!settings.walletEnabled) throw new ConsultError(503, 'Premium consultations are not available right now.', 'premium_unavailable');
    if (!account) throw new ConsultError(401, 'Please log in to pay from your wallet.', 'login_required');
    if (!input.payWithWallet) throw new ConsultError(402, 'This is a premium consultation. Please pay from your wallet.', 'premium_required');
    const retry = await findPaidRetry(account, input.requestId, deviceId);
    if (retry) return startedView(retry);
  }
  if (doctor.tier === 'free' && !input.unlockToken) {
    throw new ConsultError(402, `Watch ${settings.adsRequired} short ads to talk to this doctor.`, 'ads_required');
  }

  const day = today();
  const globalCount = await incrementCounter(`consult:global:${day}`, DAILY_TTL_MS);
  if (globalCount > settings.globalConsultsPerDay) {
    throw new ConsultError(503, 'Our doctors are fully booked today. Please try again tomorrow.', 'busy');
  }

  if (doctor.tier === 'premium') {
    const count = await incrementCounter(`consult:premium:account:${account!._id}:${day}`, DAILY_TTL_MS);
    if (count > settings.premiumUnlocksPerDevicePerDay) {
      throw new ConsultError(429, "You have reached today's premium consultation limit. Please try again tomorrow.", 'limit_reached');
    }
  } else if (doctor.tier === 'library') {
    // The Library Doctor needs no ads, so it has a daily limit (ad-unlocked chats have none)
    const [deviceCount, ipCount] = await Promise.all([
      incrementCounter(`consult:free:device:${deviceId}:${day}`, DAILY_TTL_MS),
      incrementCounter(`consult:free:ip:${ip}:${day}`, DAILY_TTL_MS),
    ]);
    if (deviceCount > settings.freeConsultsPerDevicePerDay || ipCount > settings.freeConsultsPerDevicePerDay * 4) {
      throw new ConsultError(429, "You have used today's free Library Doctor chats. Watch ads to talk to another free doctor, or try again tomorrow.", 'limit_reached');
    }
  }

  if (doctor.tier === 'free') {
    // Single use, bound to this device, not expired - consumed atomically
    const token = await UnlockToken.findOneAndUpdate(
      { tokenHash: sha256(input.unlockToken!), deviceId, usedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { usedAt: new Date() } },
      { new: true }
    );
    if (!token) throw new ConsultError(402, 'Your ad unlock has expired or was already used. Please watch the ads again.', 'ads_required');
  }

  if (doctor.tier === 'premium') {
    const record = newConsultation(deviceId, runtime, settings, input.patient, { account: account!._id, unlock: 'wallet' });
    try {
      await withTransaction(async (session) => {
        await debitWallet(session, account!._id, rupeesToPaise(settings.premiumPriceInr), {
          kind: 'ai_chat',
          ref: record.publicId,
          note: `Premium consultation: ${doctor.name}`,
          ...(input.requestId ? { idempotencyKey: `ai:${account!._id}:${input.requestId}` } : {}),
        });
        await Consultation.create([record], { session });
      });
    } catch (error: any) {
      // A parallel retry with the same requestId already paid: return that consultation
      if (error?.code === 11000) {
        const retry = await findPaidRetry(account!, input.requestId, deviceId);
        if (retry) return startedView(retry);
      }
      throw error;
    }
    return startedView(record);
  }

  const consultation = await Consultation.create(
    newConsultation(deviceId, runtime, settings, input.patient, { account: account?._id ?? null, unlock: doctor.tier === 'free' ? 'ads' : 'none' })
  );
  return startedView(consultation);
};

/** Starts the consultation of a confirmed AI booking (already unlocked or paid when booking) */
export const startBookedConsultation = async (
  deviceId: string,
  booking: IBooking,
  patient: PatientInput,
  account: IPatient
): Promise<StartedConsultation> => {
  const settings = await getAiSettings();
  const runtime = await getDoctorRuntime(String(booking.aiDoctor));
  if (!runtime) throw new ConsultError(503, 'The doctor is not available right now. Please try again in a minute.');
  const record = newConsultation(deviceId, runtime, settings, patient, { account: account._id, booking: booking._id, unlock: 'booking' });
  // One consultation per booking: claim it first
  const claimed = await Booking.findOneAndUpdate(
    { _id: booking._id, status: 'confirmed', consultationId: '' },
    { $set: { status: 'completed', consultationId: record.publicId } },
    { new: true }
  );
  if (!claimed) throw new ConsultError(409, 'This booking has already been used.', 'booking_used');
  try {
    await Consultation.create(record);
  } catch (error) {
    await Booking.updateOne({ _id: booking._id, consultationId: record.publicId }, { $set: { status: 'confirmed', consultationId: '' } });
    throw error;
  }
  return startedView(record);
};

/* -------------------------------------------------------------------------- */
/* CHAT MESSAGE                                                               */
/* -------------------------------------------------------------------------- */
export const sendConsultMessage = async (deviceId: string, consultationId: string, text: string) => {
  const now = new Date();
  // Atomic: only while active, before the end time and under the message limit
  const consultation = await Consultation.findOneAndUpdate(
    {
      publicId: consultationId,
      deviceId,
      status: 'active',
      endsAt: { $gt: now },
      $expr: { $lt: ['$userMessageCount', '$maxUserMessages'] },
    },
    { $inc: { userMessageCount: 1 }, $push: { messages: { role: 'user', text, at: now } } },
    { new: true }
  ).lean();

  if (!consultation) {
    const existing = await Consultation.findOne({ publicId: consultationId, deviceId }).lean();
    if (!existing) throw new ConsultError(404, 'Consultation not found.');
    if (existing.status === 'completed') throw new ConsultError(409, 'This consultation has ended.', 'ended');
    if (existing.endsAt.getTime() <= now.getTime()) {
      throw new ConsultError(409, 'Consultation time is over. Tap "Get report" for your assessment.', 'time_over');
    }
    throw new ConsultError(409, 'Message limit reached. Tap "Get report" for your assessment.', 'message_limit');
  }

  const rollback = () =>
    Consultation.updateOne({ _id: consultation._id }, { $inc: { userMessageCount: -1 }, $pop: { messages: 1 } }).catch(() => {});

  const runtime = await getDoctorRuntime(String(consultation.doctor));
  if (!runtime) {
    await rollback();
    throw new ConsultError(503, 'The doctor is not available right now. Please try again in a minute.');
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: buildChatSystemPrompt(runtime.doctor.name, runtime.doctor.designation) },
    { role: 'user', content: buildPatientData(toPatient(consultation), 'The consultation messages follow.', '') },
    ...consultation.messages.map(
      (m): ChatMessage => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })
    ),
  ];

  let turn;
  try {
    turn = await completeJson(runtime, {
      label: 'chat',
      schema: ChatTurnSchema,
      messages,
      maxTokens: 700,
      timeoutMs: 45_000,
      temperature: 0.4,
    });
  } catch (error) {
    await rollback();
    throw error;
  }

  const reply = scrubVendorMentions(turn.reply.trim().slice(0, 900), identityLine(runtime.doctor.name));
  await Consultation.updateOne(
    { _id: consultation._id },
    {
      $push: { messages: { role: 'doctor', text: reply, at: new Date() } },
      ...(turn.emergency ? { $set: { emergency: true } } : {}),
    }
  );

  return {
    reply,
    readyForReport: turn.ready_for_report || turn.emergency,
    emergency: turn.emergency,
    offTopic: turn.off_topic,
    remainingMessages: Math.max(0, consultation.maxUserMessages - consultation.userMessageCount),
    endsAt: consultation.endsAt.toISOString(),
  };
};

/* -------------------------------------------------------------------------- */
/* REPORT                                                                     */
/* -------------------------------------------------------------------------- */
export const generateConsultReport = async (deviceId: string, consultationId: string): Promise<ConsultReport> => {
  const consultation = await Consultation.findOne({ publicId: consultationId, deviceId }).lean();
  if (!consultation) throw new ConsultError(404, 'Consultation not found.');
  if (consultation.report) return consultation.report as ConsultReport;
  if (consultation.userMessageCount === 0) {
    throw new ConsultError(400, 'Please describe your health problem to the doctor first.', 'no_messages');
  }
  if (Date.now() > consultation.endsAt.getTime() + REPORT_GRACE_MS) {
    throw new ConsultError(409, 'This consultation has expired. Please start a new one.', 'expired');
  }

  // Only one report generation at a time per consultation (prevents double billing)
  const locked = await Consultation.findOneAndUpdate(
    {
      _id: consultation._id,
      report: null,
      $or: [{ reportStartedAt: null }, { reportStartedAt: { $lt: new Date(Date.now() - REPORT_LOCK_MS) } }],
    },
    { $set: { reportStartedAt: new Date() } }
  );
  if (!locked) throw new ConsultError(409, 'Your report is being prepared. Please wait a moment.', 'report_in_progress');

  const unlock = () => Consultation.updateOne({ _id: consultation._id, report: null }, { $set: { reportStartedAt: null } }).catch(() => {});

  try {
    const runtime = await getDoctorRuntime(String(consultation.doctor));
    if (!runtime) throw new ConsultError(503, 'The doctor is not available right now. Please try again in a minute.');

    const patient = toPatient(consultation);
    const transcript = consultation.messages
      .map((m) => `${m.role === 'user' ? 'Patient' : 'Doctor'}: ${m.text}`)
      .join('\n');

    // Library Doctor: only remedies from the VaidyaCure library
    const isLibrary = consultation.tier === 'library';
    const libraryItems = isLibrary
      ? await findLibraryItems(consultation.messages.filter((m) => m.role === 'user').map((m) => m.text).join('\n'))
      : [];

    const output = await completeJson(runtime, {
      label: 'report',
      schema: ReportOutputSchema,
      messages: [
        { role: 'system', content: CLINICAL_SYSTEM_PROMPT },
        {
          role: 'user',
          content:
            `${buildPatientData(patient, 'Consultation transcript (patient and doctor messages):', transcript)}\n\n${ANALYSIS_TASK}\n\n` +
            (isLibrary ? `${libraryPromptBlock(libraryItems)}\n\n` : '') +
            'Reply with ONLY a JSON object (no markdown) that matches this JSON schema exactly, with every field present:\n' +
            REPORT_SCHEMA_TEXT,
        },
      ],
      maxTokens: 8000,
      timeoutMs: 120_000,
    });

    if (output.input_check.status !== 'ok') {
      await unlock();
      throw new ConsultError(
        422,
        output.input_check.message.trim() || 'Please describe your health problem to the doctor first.',
        output.input_check.status
      );
    }

    const built = buildReport(output.assessment!, patient);
    const report = isLibrary ? keepOnlyLibraryRemedies(built, libraryItems) : built;
    await Consultation.updateOne(
      { _id: consultation._id },
      { $set: { report, reportGeneratedAt: new Date(), status: 'completed' } }
    );
    return report;
  } catch (error) {
    await unlock();
    throw error;
  }
};
