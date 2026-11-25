import nodemailer from 'nodemailer';
import { EmailSettings } from '../../models/EmailSettings.js';
import { decryptSecret } from '../../utils/secretBox.js';

/**
 * Sends email through the SMTP account saved in the admin panel (Nodemailer).
 * Sending never throws: callers get `false` and the reason is logged, so a
 * failed email can never break a booking, refund or payout.
 */
export interface MailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

interface LoadedTransport {
  transporter: ReturnType<typeof nodemailer.createTransport>;
  from: string;
  at: number;
}

const CACHE_MS = 60_000;
let cache: LoadedTransport | null = null;
let testOutbox: MailInput[] | null = null;

/** Tests: collect emails in memory instead of sending them */
export const useTestOutbox = (outbox: MailInput[] | null): void => {
  testOutbox = outbox;
};

export const invalidateMailer = (): void => {
  cache = null;
};

const loadTransport = async (): Promise<LoadedTransport | null> => {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  const settings = await EmailSettings.findOne({ key: 'global' }).select('+pass').lean();
  if (!settings || !settings.enabled || !settings.user || !settings.pass) return null;
  let pass: string;
  try {
    pass = decryptSecret(settings.pass, 'email-password');
  } catch {
    console.error('[mail] could not decrypt the SMTP password (check CONFIG_ENCRYPTION_KEY)');
    return null;
  }
  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: { user: settings.user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  const name = (settings.fromName || 'VaidyaCure').replace(/["<>\r\n]/g, '');
  cache = { transporter, from: `"${name}" <${settings.fromEmail || settings.user}>`, at: Date.now() };
  return cache;
};

export const isEmailReady = async (): Promise<boolean> => testOutbox !== null || (await loadTransport()) !== null;

const oneLine = (value: string) => value.replace(/[\r\n]+/g, ' ').trim();

export const sendMail = async (mail: MailInput): Promise<boolean> => {
  const message = { ...mail, subject: oneLine(mail.subject).slice(0, 160), to: oneLine(mail.to) };
  if (testOutbox) {
    testOutbox.push(message);
    return true;
  }
  try {
    const loaded = await loadTransport();
    if (!loaded) {
      console.warn('[mail] email is not set up in the admin panel; skipped:', message.subject);
      return false;
    }
    await loaded.transporter.sendMail({ from: loaded.from, ...message });
    return true;
  } catch (error) {
    console.error('[mail] sending failed:', error instanceof Error ? error.message : error);
    return false;
  }
};

/** Sends several emails at once; never throws */
export const sendMails = async (mails: Array<MailInput | null | undefined>): Promise<void> => {
  await Promise.allSettled(mails.filter((m): m is MailInput => Boolean(m && m.to)).map(sendMail));
};

/** Admin "Send test email" button: reports the real SMTP error */
export const sendTestMail = async (to: string): Promise<{ ok: boolean; message: string }> => {
  cache = null;
  const loaded = await loadTransport();
  if (!loaded) return { ok: false, message: 'Save the email address and app password first.' };
  try {
    await loaded.transporter.sendMail({
      from: loaded.from,
      to: oneLine(to),
      subject: 'VaidyaCure test email',
      text: 'Email from VaidyaCure is working.',
    });
    return { ok: true, message: `Test email sent to ${to}.` };
  } catch (error) {
    const text = error instanceof Error ? error.message : 'Unknown error';
    // SMTP errors can echo the username but never the password
    return { ok: false, message: `Could not send: ${text.slice(0, 200)}` };
  }
};
