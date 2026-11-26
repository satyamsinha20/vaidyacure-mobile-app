import { EmailTemplate } from '../../models/EmailTemplate.js';
import type { MailInput } from './mailer.js';

/**
 * Every email VaidyaCure sends, with a default text the admin can change in
 * Settings > SMTP. Texts use {{placeholders}} that are filled in when sending.
 *
 * - Values are always HTML-escaped and the admin's text is escaped too, so a
 *   template can never inject HTML or scripts into an email.
 * - There is deliberately no placeholder for diagnoses or reports: medical
 *   details never go into emails ("your report is ready, open the app").
 */
export interface TemplateDef {
  name: string;
  description: string;
  placeholders: Record<string, string>;
  required: string[];
  subject: string;
  body: string;
}

const DOCTOR = { doctor: "Doctor's name" };
const TIME = { time: 'Consultation time (India)' };

export const TEMPLATE_DEFS = {
  otp: {
    name: 'Login code',
    description: 'Sent when a patient logs in to the app with their email.',
    placeholders: { code: '6-digit login code' },
    required: ['code'],
    subject: '{{code}} is your VaidyaCure login code',
    body: 'Your VaidyaCure login code is:\n{{code}}\n\nIt is valid for 10 minutes. Never share it with anyone, not even VaidyaCure staff.\n\nIf you did not try to log in, you can ignore this email.',
  },
  booking_confirmed_patient: {
    name: 'Booking confirmed (patient)',
    description: 'After the admin verifies the payment, or when a free follow-up is booked.',
    placeholders: { ...DOCTOR, ...TIME, paymentLine: '"Paid: ₹550" or "This is a free follow-up."' },
    required: [],
    subject: 'Booking confirmed with {{doctor}}',
    body: 'Your consultation is confirmed.\n\nDoctor: {{doctor}}\nTime: {{time}} (India time)\n{{paymentLine}}\n\nOpen the VaidyaCure app a few minutes early. The doctor will start the chat, and you need to reply within 5 minutes.',
  },
  booking_confirmed_doctor: {
    name: 'New booking (doctor)',
    description: 'Tells the doctor about a new confirmed consultation.',
    placeholders: { patient: "Patient's name", ...TIME, bookingLine: 'Paid booking or free follow-up' },
    required: [],
    subject: 'New consultation: {{time}}',
    body: 'You have a new confirmed consultation.\n\nPatient: {{patient}}\nTime: {{time}} (India time)\n{{bookingLine}}\n\nPlease start the chat from your VaidyaCure doctor panel within 5 minutes of the start time.',
  },
  payment_rejected: {
    name: 'Payment rejected',
    description: 'When the admin cannot verify a booking payment.',
    placeholders: { ...DOCTOR, ...TIME, reason: 'Reason written by the admin' },
    required: [],
    subject: 'Payment could not be verified',
    body: 'We could not verify your payment.\n\nBooking: {{doctor}}, {{time}}\nReason: {{reason}}\n\nIf money was deducted, please contact VaidyaCure support with your UTR number.',
  },
  reminder_patient: {
    name: 'Reminder 15 minutes before (patient)',
    description: 'Needs the reminder URL (cron) to be set up.',
    placeholders: { ...DOCTOR, ...TIME },
    required: [],
    subject: 'Reminder: consultation at {{time}}',
    body: 'Your consultation starts soon.\n\nDoctor: {{doctor}}\nTime: {{time}} (India time)\n\nPlease open the VaidyaCure app and wait for the doctor.',
  },
  reminder_doctor: {
    name: 'Reminder 15 minutes before (doctor)',
    description: 'Needs the reminder URL (cron) to be set up.',
    placeholders: { patient: "Patient's name", ...TIME },
    required: [],
    subject: 'Reminder: consultation at {{time}}',
    body: 'Your consultation starts soon.\n\nPatient: {{patient}}\nTime: {{time}} (India time)\n\nPlease open your doctor panel and start the chat on time.',
  },
  start_patient: {
    name: '"It is time" (patient)',
    description: 'At the start time of the consultation.',
    placeholders: { ...DOCTOR },
    required: [],
    subject: 'Consultation time now',
    body: '{{doctor}} will start the chat now. Open the VaidyaCure app and reply within 5 minutes of the doctor\'s first message.',
  },
  start_doctor: {
    name: '"It is time" (doctor)',
    description: 'At the start time of the consultation.',
    placeholders: { patient: "Patient's name" },
    required: [],
    subject: 'Consultation time now',
    body: 'Your patient {{patient}} is waiting. Start the chat from the doctor panel within 5 minutes, otherwise the patient gets a full refund.',
  },
  doctor_no_show: {
    name: 'Doctor did not join',
    description: 'Sent to the patient when the doctor did not start in time.',
    placeholders: { ...DOCTOR, ...TIME, refundLine: 'What happens with the money' },
    required: [],
    subject: 'Sorry, the doctor did not join',
    body: 'The doctor did not join your consultation.\n\nBooking: {{doctor}}, {{time}}\n{{refundLine}}',
  },
  patient_no_show: {
    name: 'Patient did not reply',
    description: 'Sent to the patient who did not reply in time.',
    placeholders: { ...DOCTOR, ...TIME, refundLine: 'What happens with the money' },
    required: [],
    subject: 'You missed your consultation',
    body: 'You did not reply in time.\n\nBooking: {{doctor}}, {{time}}\n{{refundLine}}',
  },
  report_ready: {
    name: 'Report ready',
    description: 'No medical details are ever included; the patient reads the report in the app.',
    placeholders: { ...DOCTOR },
    required: [],
    subject: 'Your report from {{doctor}} is ready',
    body: '{{doctor}} has sent your consultation report.\n\nOpen the VaidyaCure app > Appointments to read it. For your privacy, medical details are not sent by email.',
  },
  refund_paid: {
    name: 'Refund sent',
    description: 'After the admin records a refund.',
    placeholders: { amount: 'Refund amount', utr: 'Bank reference' },
    required: [],
    subject: 'Refund of {{amount}} sent',
    body: 'Your refund has been sent.\n\nAmount: {{amount}}\nBank reference (UTR): {{utr}}',
  },
  booking_cancelled: {
    name: 'Booking cancelled',
    description: 'When the admin cancels a booking.',
    placeholders: { ...DOCTOR, ...TIME, reason: 'Reason written by the admin', refundLine: 'Refund information' },
    required: [],
    subject: 'Your consultation was cancelled',
    body: 'Your consultation was cancelled.\n\nBooking: {{doctor}}, {{time}}\nReason: {{reason}}\n{{refundLine}}',
  },
  payment_not_verified: {
    name: 'Payment not verified in time',
    description: 'When a payment was still unchecked at the consultation time.',
    placeholders: { ...DOCTOR, ...TIME },
    required: [],
    subject: 'Payment not verified in time',
    body: 'Your booking could not be confirmed.\n\nBooking: {{doctor}}, {{time}}\nWe could not verify your payment before the consultation time. If money was deducted, it will be refunded within 24 hours.',
  },
  topup_approved: {
    name: 'Wallet money added',
    description: 'After the admin approves a wallet top-up.',
    placeholders: { amount: 'Amount added', balance: 'New wallet balance' },
    required: [],
    subject: '{{amount}} added to your wallet',
    body: 'Money was added to your VaidyaCure wallet.\n\nAdded: {{amount}}\nWallet balance: {{balance}}',
  },
  topup_rejected: {
    name: 'Wallet top-up rejected',
    description: 'When the admin rejects a wallet top-up.',
    placeholders: { amount: 'Requested amount', reason: 'Reason written by the admin' },
    required: [],
    subject: 'Wallet top-up not approved',
    body: 'We could not add money to your wallet.\n\nRequest: {{amount}}\nReason: {{reason}}\n\nIf money was deducted, please contact VaidyaCure support with your UTR number.',
  },
  payout_sent: {
    name: 'Payout sent (doctor)',
    description: 'After the admin pays a doctor for finished weeks.',
    placeholders: { amount: 'Amount paid', utr: 'Bank reference', count: 'Number of consultations' },
    required: [],
    subject: 'Payout of {{amount}} sent',
    body: 'Your VaidyaCure payout has been sent.\n\nAmount: {{amount}} for {{count}} consultations\nBank reference (UTR): {{utr}}\n\nYou can see the details in your doctor panel > Earnings.',
  },
  doctor_welcome: {
    name: 'Doctor account created',
    description: 'Never contains the password (the admin shares it privately).',
    placeholders: { name: "Doctor's name", doctorCode: 'Registration number (e.g. VC-DOC-000001)', panelUrl: 'Login page link' },
    required: [],
    subject: 'Your VaidyaCure doctor account is ready',
    body: 'Welcome, {{name}}.\n\nYour registration number is {{doctorCode}}. Log in with this email address.\nYour temporary password will be shared with you by the VaidyaCure admin. You must change it on your first login.\n\nDoctor panel: {{panelUrl}}',
  },
} satisfies Record<string, TemplateDef>;

export type TemplateKey = keyof typeof TEMPLATE_DEFS;
export const TEMPLATE_KEYS = Object.keys(TEMPLATE_DEFS) as TemplateKey[];
export const isTemplateKey = (key: string): key is TemplateKey => key in TEMPLATE_DEFS;

/** Values used for the admin's preview */
export const SAMPLE_VALUES: Record<string, string> = {
  code: '482913',
  doctor: 'Dr. Neha Singh',
  patient: 'Ravi Kumar',
  time: '26 Nov 2026, 10:30 am',
  amount: '₹550',
  balance: '₹150',
  utr: '412345678901',
  count: '5',
  reason: 'The amount did not match',
  name: 'Dr. Neha Singh',
  doctorCode: 'VC-DOC-000001',
  panelUrl: 'https://admin-panel-fawn-sigma-31.vercel.app/login',
  paymentLine: 'Paid: ₹550',
  bookingLine: 'The payment has been verified by VaidyaCure.',
  refundLine: 'Your full payment of ₹550 will be refunded within 24 hours.',
};

/* -------------------------------------------------------------------------- */
/* VALIDATION (admin edits)                                                   */
/* -------------------------------------------------------------------------- */
const PLACEHOLDER = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;

/** Returns a problem with the text, or null when it can be saved */
export const checkTemplate = (key: TemplateKey, subject: string, body: string): string | null => {
  const def: TemplateDef = TEMPLATE_DEFS[key];
  const allowed = Object.keys(def.placeholders);
  for (const text of [subject, body]) {
    for (const match of text.matchAll(PLACEHOLDER)) {
      if (!allowed.includes(match[1])) {
        return `{{${match[1]}}} cannot be used here. Allowed: ${allowed.map((a) => `{{${a}}}`).join(', ') || 'none'}.`;
      }
    }
    // Leftover braces usually mean a typo in a placeholder
    if (/\{\{|\}\}/.test(text.replace(PLACEHOLDER, ''))) return 'A placeholder is not written correctly. Use {{name}}.';
  }
  for (const name of def.required) {
    if (!new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`).test(`${subject}\n${body}`)) return `This email must contain {{${name}}}.`;
  }
  return null;
};

/* -------------------------------------------------------------------------- */
/* RENDERING                                                                  */
/* -------------------------------------------------------------------------- */
const esc = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const fillText = (text: string, vars: Record<string, string>) => text.replace(PLACEHOLDER, (_m, name: string) => vars[name] ?? '');

/** HTML from the plain text: everything escaped, the login code shown large */
const fillHtml = (text: string, vars: Record<string, string>) =>
  text
    .split(/(\{\{\s*[a-zA-Z]+\s*\}\})/)
    .map((part) => {
      const match = part.match(/^\{\{\s*([a-zA-Z]+)\s*\}\}$/);
      if (!match) return esc(part);
      const value = esc(vars[match[1]] ?? '');
      return match[1] === 'code' ? `<span style="font-size:30px;font-weight:bold;letter-spacing:8px">${value}</span>` : value;
    })
    .join('');

const page = (bodyHtml: string) =>
  `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:18px;color:#123D24">` +
  `<p style="color:#157347;font-weight:bold;font-size:18px;margin:0 0 14px">VaidyaCure</p>` +
  bodyHtml
    .split(/\n{2,}/)
    .map((para) => `<p style="font-size:14px;line-height:21px;margin:0 0 12px">${para.replace(/\n/g, '<br>')}</p>`)
    .join('') +
  `<p style="color:#70887A;font-size:12px;margin-top:22px">This is an automatic email from VaidyaCure. Please do not reply.</p></div>`;

const CACHE_MS = 60_000;
let cache: { at: number; byKey: Map<string, { subject: string; body: string }> } | null = null;

export const invalidateTemplates = (): void => {
  cache = null;
};

const customTemplates = async () => {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.byKey;
  const rows = await EmailTemplate.find().lean();
  cache = { at: Date.now(), byKey: new Map(rows.map((r) => [r.key, { subject: r.subject, body: r.body }])) };
  return cache.byKey;
};

export const renderTemplate = (subject: string, body: string, vars: Record<string, string>) => ({
  subject: fillText(subject, vars).replace(/[\r\n]+/g, ' ').trim(),
  text: `${fillText(body, vars)}\n\nVaidyaCure`,
  html: page(fillHtml(body, vars)),
});

/** The email for `key`, using the admin's text if there is one (falls back to the default on any error) */
export const renderMail = async (key: TemplateKey, to: string, vars: Record<string, string>): Promise<MailInput> => {
  const def: TemplateDef = TEMPLATE_DEFS[key];
  let custom: { subject: string; body: string } | undefined;
  try {
    custom = (await customTemplates()).get(key);
  } catch {
    custom = undefined;
  }
  const chosen = custom && !checkTemplate(key, custom.subject, custom.body) ? custom : def;
  return { to, ...renderTemplate(chosen.subject, chosen.body, vars) };
};

/* -------------------------------------------------------------------------- */
/* THE EMAILS (used by bookings, payments, payouts …)                         */
/* -------------------------------------------------------------------------- */
export const otpMail = (to: string, code: string) => renderMail('otp', to, { code });

export const bookingConfirmedPatientMail = (to: string, a: { doctor: string; when: string; amount: string; followUp: boolean }) =>
  renderMail('booking_confirmed_patient', to, {
    doctor: a.doctor,
    time: a.when,
    paymentLine: a.followUp ? 'This is a free follow-up.' : `Paid: ${a.amount}`,
  });

export const bookingConfirmedDoctorMail = (to: string, a: { patient: string; when: string; followUp: boolean }) =>
  renderMail('booking_confirmed_doctor', to, {
    patient: a.patient,
    time: a.when,
    bookingLine: a.followUp ? 'This is a free follow-up of an earlier consultation.' : 'The payment has been verified by VaidyaCure.',
  });

export const paymentRejectedMail = (to: string, a: { doctor: string; when: string; reason: string }) =>
  renderMail('payment_rejected', to, { doctor: a.doctor, time: a.when, reason: a.reason });

export const reminderMail = (to: string, a: { other: string; when: string; forDoctor: boolean }) =>
  a.forDoctor
    ? renderMail('reminder_doctor', to, { patient: a.other, time: a.when })
    : renderMail('reminder_patient', to, { doctor: a.other, time: a.when });

export const startNowMail = (to: string, a: { other: string; forDoctor: boolean }) =>
  a.forDoctor ? renderMail('start_doctor', to, { patient: a.other }) : renderMail('start_patient', to, { doctor: a.other });

export const doctorNoShowMail = (to: string, a: { doctor: string; when: string; refund: string; hours: number }) =>
  renderMail('doctor_no_show', to, {
    doctor: a.doctor,
    time: a.when,
    refundLine: a.refund ? `Your full payment of ${a.refund} will be refunded within ${a.hours} hours.` : 'You can book another time in the app.',
  });

export const patientNoShowMail = (to: string, a: { doctor: string; when: string; refund: string; kept: string; hours: number }) =>
  renderMail('patient_no_show', to, {
    doctor: a.doctor,
    time: a.when,
    refundLine: a.refund
      ? `The doctor waited for 5 minutes. As per the policy, ${a.kept} is kept and ${a.refund} will be refunded within ${a.hours} hours.`
      : 'The doctor waited for 5 minutes, so this free follow-up has been used.',
  });

export const reportReadyMail = (to: string, a: { doctor: string }) => renderMail('report_ready', to, { doctor: a.doctor });

export const refundPaidMail = (to: string, a: { amount: string; utr: string }) => renderMail('refund_paid', to, { amount: a.amount, utr: a.utr });

export const bookingCancelledMail = (to: string, a: { doctor: string; when: string; reason: string; refund: string; hours: number }) =>
  renderMail('booking_cancelled', to, {
    doctor: a.doctor,
    time: a.when,
    reason: a.reason,
    refundLine: a.refund ? `Your payment of ${a.refund} will be refunded within ${a.hours} hours.` : '',
  });

export const notVerifiedMail = (to: string, a: { doctor: string; when: string }) => renderMail('payment_not_verified', to, { doctor: a.doctor, time: a.when });

export const topupApprovedMail = (to: string, a: { amount: string; balance: string }) => renderMail('topup_approved', to, { amount: a.amount, balance: a.balance });

export const topupRejectedMail = (to: string, a: { amount: string; reason: string }) => renderMail('topup_rejected', to, { amount: a.amount, reason: a.reason });

export const settlementPaidMail = (to: string, a: { amount: string; utr: string; count: number }) =>
  renderMail('payout_sent', to, { amount: a.amount, utr: a.utr, count: String(a.count) });

export const doctorWelcomeMail = (to: string, a: { name: string; doctorCode: string; panelUrl: string }) =>
  renderMail('doctor_welcome', to, { name: a.name, doctorCode: a.doctorCode, panelUrl: a.panelUrl });
