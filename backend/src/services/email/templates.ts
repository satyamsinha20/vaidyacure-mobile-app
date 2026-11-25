import type { MailInput } from './mailer.js';

/**
 * Email texts. Medical details never go into emails (only "your report is
 * ready, open the app"), and every value from users is HTML-escaped.
 */
const esc = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const page = (title: string, paragraphs: string[]) =>
  `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:18px;color:#123D24">` +
  `<h2 style="color:#157347;margin:0 0 14px;font-size:20px">${esc(title)}</h2>` +
  paragraphs.map((p) => `<p style="font-size:14px;line-height:21px;margin:0 0 10px">${p}</p>`).join('') +
  `<p style="color:#70887A;font-size:12px;margin-top:22px">VaidyaCure · This is an automatic email, please do not reply.</p></div>`;

const mail = (to: string, subject: string, title: string, lines: string[]): MailInput => ({
  to,
  subject,
  text: [title, '', ...lines, '', 'VaidyaCure'].join('\n'),
  html: page(title, lines.map(esc)),
});

export const otpMail = (to: string, code: string): MailInput => ({
  to,
  subject: `${code} is your VaidyaCure login code`,
  text: `Your VaidyaCure login code is ${code}.\nIt is valid for 10 minutes. Never share it with anyone, not even VaidyaCure staff.`,
  html: page('Your login code', [
    `<span style="font-size:30px;font-weight:bold;letter-spacing:8px">${esc(code)}</span>`,
    'It is valid for 10 minutes. Never share it with anyone, not even VaidyaCure staff.',
    'If you did not try to log in, you can ignore this email.',
  ]),
});

export const bookingConfirmedPatientMail = (to: string, a: { doctor: string; when: string; amount: string; followUp: boolean }) =>
  mail(to, `Booking confirmed with ${a.doctor}`, 'Your consultation is confirmed', [
    `Doctor: ${a.doctor}`,
    `Time: ${a.when} (India time)`,
    a.followUp ? 'This is a free follow-up.' : `Paid: ${a.amount}`,
    'Open the VaidyaCure app a few minutes early. The doctor will start the chat, and you need to reply within 5 minutes.',
  ]);

export const bookingConfirmedDoctorMail = (to: string, a: { patient: string; when: string; followUp: boolean }) =>
  mail(to, `New consultation: ${a.when}`, 'New confirmed consultation', [
    `Patient: ${a.patient}`,
    `Time: ${a.when} (India time)`,
    a.followUp ? 'This is a free follow-up of an earlier consultation.' : 'The payment has been verified by VaidyaCure.',
    'Please start the chat from your VaidyaCure doctor panel within 5 minutes of the start time.',
  ]);

export const paymentRejectedMail = (to: string, a: { doctor: string; when: string; reason: string }) =>
  mail(to, 'Payment could not be verified', 'We could not verify your payment', [
    `Booking: ${a.doctor}, ${a.when}`,
    `Reason: ${a.reason}`,
    'If money was deducted, please contact VaidyaCure support with your UTR number.',
  ]);

export const reminderMail = (to: string, a: { other: string; when: string; forDoctor: boolean }) =>
  mail(to, `Reminder: consultation at ${a.when}`, 'Your consultation starts soon', [
    `${a.forDoctor ? 'Patient' : 'Doctor'}: ${a.other}`,
    `Time: ${a.when} (India time)`,
    a.forDoctor ? 'Please open your doctor panel and start the chat on time.' : 'Please open the VaidyaCure app and wait for the doctor.',
  ]);

export const startNowMail = (to: string, a: { other: string; forDoctor: boolean }) =>
  mail(to, 'Consultation time now', 'It is time for your consultation', [
    a.forDoctor
      ? `Your patient ${a.other} is waiting. Start the chat from the doctor panel within 5 minutes, otherwise the patient gets a full refund.`
      : `${a.other} will start the chat now. Open the VaidyaCure app and reply within 5 minutes of the doctor's first message.`,
  ]);

export const doctorNoShowMail = (to: string, a: { doctor: string; when: string; refund: string; hours: number }) =>
  mail(to, 'Sorry, the doctor did not join', 'The doctor did not join your consultation', [
    `Booking: ${a.doctor}, ${a.when}`,
    a.refund ? `Your full payment of ${a.refund} will be refunded within ${a.hours} hours.` : 'You can book another time in the app.',
  ]);

export const patientNoShowMail = (to: string, a: { doctor: string; when: string; refund: string; kept: string; hours: number }) =>
  mail(to, 'You missed your consultation', 'You did not reply in time', [
    `Booking: ${a.doctor}, ${a.when}`,
    a.refund
      ? `The doctor waited for 5 minutes. As per the policy, ${a.kept} is kept and ${a.refund} will be refunded within ${a.hours} hours.`
      : 'The doctor waited for 5 minutes, so this free follow-up has been used.',
  ]);

export const reportReadyMail = (to: string, a: { doctor: string }) =>
  mail(to, `Your report from ${a.doctor} is ready`, 'Your report is ready', [
    `${a.doctor} has sent your consultation report.`,
    'Open the VaidyaCure app > Appointments to read it. For your privacy, medical details are not sent by email.',
  ]);

export const refundPaidMail = (to: string, a: { amount: string; utr: string }) =>
  mail(to, `Refund of ${a.amount} sent`, 'Your refund has been sent', [`Amount: ${a.amount}`, `Bank reference (UTR): ${a.utr}`]);

export const bookingCancelledMail = (to: string, a: { doctor: string; when: string; reason: string; refund: string; hours: number }) =>
  mail(to, 'Your consultation was cancelled', 'Your consultation was cancelled', [
    `Booking: ${a.doctor}, ${a.when}`,
    `Reason: ${a.reason}`,
    a.refund ? `Your payment of ${a.refund} will be refunded within ${a.hours} hours.` : '',
  ].filter(Boolean));

export const notVerifiedMail = (to: string, a: { doctor: string; when: string }) =>
  mail(to, 'Payment not verified in time', 'Your booking could not be confirmed', [
    `Booking: ${a.doctor}, ${a.when}`,
    'We could not verify your payment before the consultation time. If money was deducted, it will be refunded within 24 hours.',
  ]);

export const topupApprovedMail = (to: string, a: { amount: string; balance: string }) =>
  mail(to, `${a.amount} added to your wallet`, 'Money added to your wallet', [`Added: ${a.amount}`, `Wallet balance: ${a.balance}`]);

export const topupRejectedMail = (to: string, a: { amount: string; reason: string }) =>
  mail(to, 'Wallet top-up not approved', 'We could not add money to your wallet', [
    `Request: ${a.amount}`,
    `Reason: ${a.reason}`,
    'If money was deducted, please contact VaidyaCure support with your UTR number.',
  ]);

export const settlementPaidMail = (to: string, a: { amount: string; utr: string; count: number }) =>
  mail(to, `Payout of ${a.amount} sent`, 'Your VaidyaCure payout has been sent', [
    `Amount: ${a.amount} for ${a.count} consultation${a.count === 1 ? '' : 's'}`,
    `Bank reference (UTR): ${a.utr}`,
    'You can see the details in your doctor panel > Earnings.',
  ]);

export const doctorWelcomeMail = (to: string, a: { name: string; doctorCode: string; panelUrl: string }) =>
  mail(to, 'Your VaidyaCure doctor account is ready', `Welcome, ${a.name}`, [
    `Your doctor ID is ${a.doctorCode}. You can log in with this ID or this email address.`,
    'Your temporary password will be shared with you by the VaidyaCure admin. You must change it on your first login.',
    `Doctor panel: ${a.panelUrl}`,
  ]);
