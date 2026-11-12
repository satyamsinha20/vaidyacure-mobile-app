import { z } from 'zod';
import { Consultation, type IConsultation } from '../../models/Consultation.js';
import { UnlockToken } from '../../models/UnlockToken.js';
import { getAiSettings, getDoctorRuntime } from '../ai/configStore.js';
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
  unlockToken: z.string().regex(/^[a-f0-9]{48}$/).optional(),
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
export const startConsultation = async (
  deviceId: string,
  ip: string,
  input: z.infer<typeof StartConsultationSchema>
) => {
  const settings = await getAiSettings();
  const runtime = await getDoctorRuntime(input.doctorId);
  if (!runtime) throw new ConsultError(404, 'This doctor is not available right now. Please choose another doctor.');

  const day = today();
  const globalCount = await incrementCounter(`consult:global:${day}`, DAILY_TTL_MS);
  if (globalCount > settings.globalConsultsPerDay) {
    throw new ConsultError(503, 'Our doctors are fully booked today. Please try again tomorrow.', 'busy');
  }

  if (runtime.doctor.tier === 'free') {
    const [deviceCount, ipCount] = await Promise.all([
      incrementCounter(`consult:free:device:${deviceId}:${day}`, DAILY_TTL_MS),
      incrementCounter(`consult:free:ip:${ip}:${day}`, DAILY_TTL_MS),
    ]);
    if (deviceCount > settings.freeConsultsPerDevicePerDay || ipCount > settings.freeConsultsPerDevicePerDay * 4) {
      throw new ConsultError(429, "You have used today's free consultations. Please try again tomorrow.", 'limit_reached');
    }
  } else {
    if (!input.unlockToken) {
      throw new ConsultError(402, 'This is a premium consultation. Please unlock it to continue.', 'premium_required');
    }
    // Single use, bound to this device, not expired - consumed atomically
    const token = await UnlockToken.findOneAndUpdate(
      { tokenHash: sha256(input.unlockToken), deviceId, usedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { usedAt: new Date() } },
      { new: true }
    );
    if (!token) {
      throw new ConsultError(402, 'Your premium unlock has expired or was already used. Please unlock again.', 'premium_required');
    }
  }

  const now = Date.now();
  const consultation = await Consultation.create({
    publicId: randomToken(16),
    deviceId,
    doctor: runtime.doctor.id,
    tier: runtime.doctor.tier,
    patient: input.patient,
    messages: [{ role: 'doctor', text: greetingFor(runtime.doctor.name, runtime.doctor.designation), at: new Date(now) }],
    maxUserMessages: settings.maxUserMessages,
    endsAt: new Date(now + settings.consultationSeconds * 1000),
    expiresAt: new Date(now + RECORD_TTL_MS),
  });

  return {
    consultationId: consultation.publicId,
    endsAt: consultation.endsAt.toISOString(),
    maxUserMessages: consultation.maxUserMessages,
    serverTime: new Date(now).toISOString(),
  };
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

    const output = await completeJson(runtime, {
      label: 'report',
      schema: ReportOutputSchema,
      messages: [
        { role: 'system', content: CLINICAL_SYSTEM_PROMPT },
        {
          role: 'user',
          content:
            `${buildPatientData(patient, 'Consultation transcript (patient and doctor messages):', transcript)}\n\n${ANALYSIS_TASK}\n\n` +
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

    const report = buildReport(output.assessment!, patient);
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
