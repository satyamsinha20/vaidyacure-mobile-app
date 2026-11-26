import { apiRequest } from '../lib/api';
import type { Availability } from '@/components/market/ui';
import type { BankDetails } from './market.service';

/* Real doctor's own panel (/api/doctor): doctor tokens only */

type Envelope<T> = { status: string; data: T; message?: string; token?: string };
const BASE = '/doctor';
const get = async <T,>(path: string) => (await apiRequest<Envelope<T>>(`${BASE}${path}`)).data;
const send = async <T,>(method: string, path: string, body: unknown = {}) =>
  apiRequest<Envelope<T>>(`${BASE}${path}`, { method, body: JSON.stringify(body) });

export interface DoctorMe {
  id: string;
  /** The doctor's only number (registration number): VC-DOC-000001 */
  doctorCode: string;
  email: string;
  name: string;
  qualification: string;
  specialization: string;
  experienceYears: number;
  about: string;
  languages: string[];
  avatarColor: string;
  feeInr: number;
  appPriceInr: number;
  commissionPercent: number;
  requestedFeeInr: number | null;
  consultMinutes: number;
  availability: Availability;
  planValidUntil: string | null;
  bankHint: string;
  bankUpdatedAt: string | null;
  mustChangePassword: boolean;
  termsAcceptedAt: string | null;
  rules: { doctorJoinMinutes: number; patientReplyMinutes: number; patientNoShowKeepPercent: number; followUpHours: number; followUpFreeCount: number };
}

export interface ChatTimers {
  doctorJoinedAt: string | null;
  replyBy: string | null;
  patientRepliedAt: string | null;
  chatEndsAt: string | null;
  chatEndedAt: string | null;
}

export interface DoctorReport {
  diagnosis: string;
  advice: string;
  medicines: Array<{ name: string; dose: string; frequency: string; duration: string; notes: string }>;
  /** Medicines written freely (older reports do not have it) */
  medicinesText?: string;
  tests: string[];
  /** Tests written freely (older reports do not have it) */
  testsText?: string;
  followUpAdvice: string;
  sentAt?: string;
}

export interface DoctorBooking {
  id: string;
  status: string;
  slotStart: string;
  slotEnd: string;
  consultMinutes: number;
  patient: { name: string; age: number; gender: string; heightCm: number; weightKg: number; pregnancy: string; problem: string };
  isFollowUp: boolean;
  followUpOfId: string | null;
  chat: ChatTimers;
  hasReport: boolean;
  report: DoctorReport | null;
  earnings: { amount: number; weekStart: string; settled: boolean } | null;
}

export interface LiveMessage {
  seq: number;
  from: 'doctor' | 'patient' | 'system';
  text: string;
  at: string;
}

export interface ChatState extends ChatTimers {
  status: string;
  slotStart: string;
  slotEnd: string;
  hasReport: boolean;
  serverTime: string;
}

export interface ThreadItem {
  id: string;
  status: string;
  slotStart: string;
  isFollowUp: boolean;
  problem: string;
  report: DoctorReport | null;
  messages: LiveMessage[];
}

export interface DoctorDashboard {
  todayCount: number;
  next: DoctorBooking | null;
  reportsPending: number;
  earnings: { earned: number; settled: number; pending: number; payableNow: number };
  planValidUntil: string | null;
  bookable: boolean;
  hasHours: boolean;
  hasBank: boolean;
}

export interface DoctorEarnings {
  currentWeek: string;
  totals: { earned: number; settled: number; pending: number; payableNow: number };
  weeks: Array<{ weekStart: string; consultations: number; amount: number; settled: number; pending: number; isCurrent: boolean }>;
  settlements: Array<{ id: string; amount: number; consultations: number; weeks: string[]; utr: string; note: string; paidAt: string }>;
}

export interface DoctorPatient {
  key: string;
  name: string;
  age: number;
  gender: string;
  consultations: number;
  lastAt: string;
  bookings: Array<{ id: string; slotStart: string; status: string; hasReport: boolean; problem: string }>;
}

export const doctorPanelService = {
  me: () => get<DoctorMe>('/me'),
  changePassword: async (currentPassword: string, newPassword: string) => (await send('POST', '/auth/change-password', { currentPassword, newPassword })).token!,
  acceptTerms: () => send('POST', '/auth/accept-terms'),
  dashboard: () => get<DoctorDashboard>('/dashboard'),
  updateProfile: (input: { about: string; languages: string[] }) => send('PUT', '/profile', input),
  updateAvailability: (availability: Availability) => send<Availability>('PUT', '/availability', availability),
  updateBank: async (bank: BankDetails) => (await send<{ bankHint: string }>('PUT', '/bank', bank)).data,
  requestFee: (feeInr: number) => send('POST', '/fee-request', { feeInr }),

  bookings: (scope: 'upcoming' | 'today' | 'past') => get<DoctorBooking[]>(`/bookings?scope=${scope}`),
  booking: (id: string) => get<{ booking: DoctorBooking; thread: ThreadItem[] }>(`/bookings/${id}`),
  messages: (id: string, after: number) => get<{ messages: LiveMessage[]; state: ChatState }>(`/bookings/${id}/messages?after=${after}`),
  sendMessage: async (id: string, text: string) => (await send<{ message: LiveMessage; state: ChatState }>('POST', `/bookings/${id}/messages`, { text })).data,
  endChat: (id: string) => send('POST', `/bookings/${id}/end`),
  sendReport: (id: string, report: DoctorReport) => send<DoctorBooking>('POST', `/bookings/${id}/report`, report),

  patients: () => get<DoctorPatient[]>('/patients'),
  earnings: () => get<DoctorEarnings>('/earnings'),
};
