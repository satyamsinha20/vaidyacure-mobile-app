import { apiRequest } from '../lib/api';

/* Admin panel > Settings (super admin only): SMTP, reminder URL and email texts */

type Envelope<T> = { status: string; data: T; message?: string };
const BASE = '/admin/settings';

export interface SmtpConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  hasPassword: boolean;
  passHint: string;
  fromName: string;
  fromEmail: string;
  ready: boolean;
  cronConfigured: boolean;
  encryptionConfigured: boolean;
}

export interface SmtpInput {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  fromName: string;
  fromEmail: string;
  password?: string;
  removePassword?: boolean;
}

export interface EmailTemplateItem {
  key: string;
  name: string;
  description: string;
  placeholders: Array<{ name: string; description: string }>;
  required: string[];
  defaults: { subject: string; body: string };
  custom: { subject: string; body: string } | null;
  updatedAt: string | null;
  updatedByEmail: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const send = <T,>(method: string, path: string, body: unknown = {}) =>
  apiRequest<Envelope<T>>(`${BASE}${path}`, { method, body: JSON.stringify(body) });

export const settingsService = {
  getSmtp: async () => (await apiRequest<Envelope<SmtpConfig>>(`${BASE}/email`)).data,
  saveSmtp: (input: SmtpInput) => send('PUT', '/email', input),
  testSmtp: async (to: string) => (await send<{ ok: boolean; message: string }>('POST', '/email/test', { to })).data,
  createCronKey: async () => (await send<{ key: string }>('POST', '/cron-key')).data,

  listTemplates: async () => (await apiRequest<Envelope<EmailTemplateItem[]>>(`${BASE}/email-templates`)).data,
  saveTemplate: (key: string, subject: string, body: string) => send('PUT', `/email-templates/${encodeURIComponent(key)}`, { subject, body }),
  resetTemplate: (key: string) => apiRequest(`${BASE}/email-templates/${encodeURIComponent(key)}`, { method: 'DELETE' }),
  previewTemplate: async (key: string, subject: string, body: string) =>
    (await send<RenderedEmail>('POST', `/email-templates/${encodeURIComponent(key)}/preview`, { subject, body })).data,
};
