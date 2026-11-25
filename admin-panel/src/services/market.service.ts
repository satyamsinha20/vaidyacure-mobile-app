import { apiRequest } from '../lib/api';
import type { Availability } from '@/components/market/ui';

/* Admin (super admin only): real doctors, payments, refunds, payouts, email and chat log */

type Envelope<T> = { status: string; data: T; message?: string };
const BASE = '/admin/market';
const get = async <T,>(path: string) => (await apiRequest<Envelope<T>>(`${BASE}${path}`)).data;
const send = async <T,>(method: string, path: string, body: unknown = {}) =>
  apiRequest<Envelope<T>>(`${BASE}${path}`, { method, body: JSON.stringify(body) });

export interface MarketSettings {
  commissionPercent: number;
  upiId: string;
  upiName: string;
  platformFeeInr: number;
  minLeadMinutes: number;
  paymentWindowMinutes: number;
  bookingDaysAhead: number;
  slotGapMinutes: number;
  doctorJoinMinutes: number;
  patientReplyMinutes: number;
  patientNoShowKeepPercent: number;
  noShowAdminSharePercent: number;
  followUpHours: number;
  followUpFreeCount: number;
  refundHours: number;
}

export interface EmailConfig {
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
}

export interface MarketSettingsResponse {
  settings: MarketSettings;
  email: EmailConfig;
  cronConfigured: boolean;
  encryptionConfigured: boolean;
}

export interface PlanPayment {
  amountInr: number;
  utr: string;
  paidOn: string;
  validUntil: string;
  recordedBy: string;
}

export interface RealDoctor {
  id: string;
  doctorCode: string;
  email: string;
  name: string;
  qualification: string;
  specialization: string;
  registrationNumber: string;
  registrationCouncil: string;
  experienceYears: number;
  about: string;
  languages: string[];
  avatarColor: string;
  consultMinutes: number;
  feeInr: number;
  requestedFeeInr: number | null;
  availability: Availability;
  planValidUntil: string | null;
  planPayments: PlanPayment[];
  bankHint: string;
  bankUpdatedAt: string | null;
  bankChanged: boolean;
  isActive: boolean;
  mustChangePassword: boolean;
  termsAcceptedAt: string | null;
  lastLoginAt: string | null;
  bookable: boolean;
  createdAt: string;
}

export interface DoctorProfileInput {
  name: string;
  email: string;
  qualification: string;
  specialization: string;
  registrationNumber: string;
  registrationCouncil: string;
  experienceYears: number;
  about: string;
  languages: string[];
  avatarColor: string;
  feeInr: number;
  consultMinutes: number;
}

export interface DoctorLogin {
  doctorCode: string;
  email: string;
  password: string;
}

export interface BankDetails {
  accountName: string;
  accountNumber: string;
  ifsc: string;
  bankName: string;
  upiId: string;
}

export interface AdminBooking {
  id: string;
  kind: 'real' | 'ai';
  status: string;
  patientEmail: string;
  patientName: string;
  doctorName: string;
  doctorCode: string;
  slotStart: string;
  slotEnd: string;
  price: { fee: number; commission: number; total: number };
  unlock: string;
  holdUntil: string | null;
  payment: { utr: string; payerUpi: string; submittedAt: string | null; verifiedAt: string | null; verifiedByEmail: string; rejectReason: string };
  refund: { status: string; amount: number; reason: string; dueBy: string | null; utr: string; paidAt: string | null } | null;
  isFollowUp: boolean;
  messages: number;
  hasReport: boolean;
  earnings: { doctor: number; admin: number; weekStart: string; settled: boolean } | null;
  cancelReason: string;
  createdAt: string;
  refundTo?: string;
  flagged?: boolean;
}

export interface Topup {
  id: string;
  amount: number;
  credited: number;
  utr: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectReason: string;
  createdAt: string;
  reviewedAt: string | null;
  patientEmail: string;
  walletBalance: number;
  reviewedByEmail: string;
}

export interface PayoutRow {
  doctorId: string;
  name: string;
  doctorCode: string;
  bankHint: string;
  bankChanged: boolean;
  payable: number;
  consultations: number;
  thisWeek: number;
}

export interface SettlementRow {
  id: string;
  doctorName: string;
  doctorCode: string;
  amount: number;
  consultations: number;
  weeks: string[];
  utr: string;
  note: string;
  paidByEmail: string;
  paidAt: string;
}

export interface Earnings {
  range: 'week' | 'month' | 'all';
  from: string;
  collected: { bookings: number; walletTopups: number };
  refunds: { paid: number; due: number };
  income: { commission: number; premiumAi: number; total: number };
  doctors: { earned: number; paid: number; pending: number };
  walletBalances: number;
  bookingsByStatus: Record<string, number>;
}

export interface MarketSummary {
  paymentsToCheck: number;
  topupsPending: number;
  refundsDue: number;
  feeRequests: number;
  bankChanges: number;
  flaggedChats: number;
}

export interface ChatLog {
  booking: AdminBooking;
  report: unknown;
  messages: Array<{ seq: number; from: string; text: string; shown: string; flags: string[]; at: string }>;
}

export const marketService = {
  summary: () => get<MarketSummary>('/summary'),
  getSettings: () => get<MarketSettingsResponse>('/settings'),
  saveSettings: async (input: MarketSettings) => (await send<MarketSettings>('PUT', '/settings', input)).data,
  saveEmail: (input: Omit<EmailConfig, 'hasPassword' | 'passHint' | 'ready'> & { password?: string; removePassword?: boolean }) =>
    send('PUT', '/email', input),
  testEmail: async (to: string) => (await send<{ ok: boolean; message: string }>('POST', '/email/test', { to })).data,
  createCronKey: async () => (await send<{ key: string }>('POST', '/cron-key')).data,

  listDoctors: () => get<RealDoctor[]>('/doctors'),
  createDoctor: async (input: DoctorProfileInput & { plan: { amountInr: number; utr: string; validUntil?: string } }) =>
    (await send<{ doctor: RealDoctor; login: DoctorLogin }>('POST', '/doctors', input)).data,
  updateDoctor: async (id: string, input: Partial<DoctorProfileInput> & { isActive?: boolean; availability?: Availability }) =>
    (await send<RealDoctor>('PUT', `/doctors/${id}`, input)).data,
  resetPassword: async (id: string) => (await send<{ doctor: RealDoctor; login: DoctorLogin }>('POST', `/doctors/${id}/reset-password`)).data,
  renewPlan: async (id: string, input: { amountInr: number; utr: string; validUntil?: string }) =>
    (await send<RealDoctor>('POST', `/doctors/${id}/plan`, input)).data,
  decideFee: async (id: string, decision: 'approve' | 'reject') => (await send<RealDoctor>('POST', `/doctors/${id}/fee/${decision}`)).data,
  getBank: (id: string) => get<BankDetails | null>(`/doctors/${id}/bank`),
  markBankReviewed: (id: string) => send('POST', `/doctors/${id}/bank/reviewed`),

  listBookings: (query = '') => get<AdminBooking[]>(`/bookings${query}`),
  cancelBooking: (id: string, reason: string) => send('POST', `/bookings/${id}/cancel`, { reason }),
  paymentsToVerify: () => get<AdminBooking[]>('/payments/bookings'),
  approvePayment: (id: string) => send('POST', `/payments/bookings/${id}/approve`),
  rejectPayment: (id: string, reason: string) => send('POST', `/payments/bookings/${id}/reject`, { reason }),
  listTopups: (status: 'pending' | 'approved' | 'rejected') => get<Topup[]>(`/payments/topups?status=${status}`),
  approveTopup: (id: string, amountInr?: number) => send('POST', `/payments/topups/${id}/approve`, amountInr ? { amountInr } : {}),
  rejectTopup: (id: string, reason: string) => send('POST', `/payments/topups/${id}/reject`, { reason }),
  listRefunds: (status: 'due' | 'paid') => get<AdminBooking[]>(`/refunds?status=${status}`),
  refundPaid: (id: string, utr: string) => send('POST', `/refunds/${id}/paid`, { utr }),
  refundDismiss: (id: string) => send('POST', `/refunds/${id}/dismiss`),

  payouts: () => get<{ currentWeek: string; doctors: PayoutRow[]; history: SettlementRow[] }>('/payouts'),
  settle: async (doctorId: string, utr: string, note: string) =>
    (await send<{ id: string; amount: number; consultations: number }>('POST', `/payouts/${doctorId}/settle`, { utr, note })).data,
  earnings: (range: 'week' | 'month' | 'all') => get<Earnings>(`/earnings?range=${range}`),

  listChats: (flagged: boolean) => get<AdminBooking[]>(`/chats${flagged ? '?flagged=1' : ''}`),
  getChat: (id: string) => get<ChatLog>(`/chats/${id}`),
};
