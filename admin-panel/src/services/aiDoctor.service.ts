import { apiRequest } from '../lib/api';
import type { Availability } from '@/components/market/ui';

/** library: free, no ads, only VaidyaCure library remedies · free: unlocked by ads · premium: paid from the wallet */
export type AiTier = 'library' | 'free' | 'premium';

/* All endpoints are super-admin only; API keys are write-only (never returned). */

export interface AiStatus {
  encryptionConfigured: boolean;
  providers: number;
  doctors: number;
}

export interface AiProvider {
  id: string;
  name: string;
  baseUrl: string;
  keyHint: string;
  isActive: boolean;
  expiresAt: string | null;
  notes: string;
  doctorsCount: number;
  updatedAt: string;
}

export interface AiProviderInput {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  isActive?: boolean;
  expiresAt?: string | null;
  notes?: string;
}

export interface AiDoctor {
  id: string;
  name: string;
  designation: string;
  about: string;
  tier: AiTier;
  providerId: string | null;
  providerName: string | null;
  model: string;
  fallbackProviderId: string | null;
  fallbackModel: string;
  avatarColor: string;
  isActive: boolean;
  sortOrder: number;
  estimatedCostInr: number;
  consultMinutes: number | null;
  maxUserMessages: number | null;
  alwaysAvailable: boolean;
  availability: Availability;
  slotCapacity: number;
  updatedAt: string;
}

export interface AiDoctorInput {
  name: string;
  designation: string;
  about: string;
  tier: AiTier;
  providerId: string;
  model: string;
  fallbackProviderId: string | null;
  fallbackModel: string;
  avatarColor: string;
  isActive: boolean;
  sortOrder: number;
  estimatedCostInr: number;
  consultMinutes: number | null;
  maxUserMessages: number | null;
  alwaysAvailable: boolean;
  availability: Availability;
  slotCapacity: number;
}

export interface AiSettings {
  premiumPriceInr: number;
  adsRequired: number;
  consultationSeconds: number;
  maxUserMessages: number;
  freeConsultsPerDevicePerDay: number;
  premiumUnlocksPerDevicePerDay: number;
  adUnlocksPerDevicePerDay: number;
  globalConsultsPerDay: number;
  walletEnabled: boolean;
  adsMode: 'test' | 'disabled';
  /** Short AI answer above health search results */
  searchAiEnabled: boolean;
  searchAiModel: string;
  searchAiFallbackModel: string;
  searchAiPerDevicePerDay: number;
  searchAiGlobalPerDay: number;
  /** Works out the salt behind a medicine brand typed in search */
  medicineAiModel: string;
  /** Reading the medicine name from a camera photo */
  photoAiEnabled: boolean;
  photoAiModel: string;
  photoAiFallbackModel: string;
  photoAiPerDevicePerDay: number;
  photoAiGlobalPerDay: number;
  /** Mic button in the app's search, and the language it starts in */
  voiceSearchEnabled: boolean;
  voiceSearchLanguage: 'en-IN' | 'hi-IN';
}

export interface AiAuditEntry {
  id: string;
  adminEmail: string;
  action: string;
  target: string;
  details: string;
  createdAt: string;
}

export interface TestResult {
  ok: boolean;
  latencyMs?: number;
  modelsCount?: number;
  reply?: string;
  message?: string;
}

type Envelope<T> = { status: string; data: T; message?: string };

const BASE = '/admin/ai';
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const aiDoctorService = {
  async status() {
    return (await apiRequest<Envelope<AiStatus>>(`${BASE}/status`)).data;
  },

  async listProviders() {
    return (await apiRequest<Envelope<AiProvider[]>>(`${BASE}/providers`)).data;
  },
  async createProvider(input: AiProviderInput) {
    return (await apiRequest<Envelope<AiProvider>>(`${BASE}/providers`, json('POST', input))).data;
  },
  async updateProvider(id: string, input: AiProviderInput) {
    return (await apiRequest<Envelope<AiProvider>>(`${BASE}/providers/${encodeURIComponent(id)}`, json('PUT', input))).data;
  },
  async deleteProvider(id: string) {
    await apiRequest(`${BASE}/providers/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  async testProvider(id: string) {
    return (await apiRequest<Envelope<TestResult>>(`${BASE}/providers/${encodeURIComponent(id)}/test`, { method: 'POST' })).data;
  },
  async providerModels(id: string) {
    return (await apiRequest<Envelope<string[]>>(`${BASE}/providers/${encodeURIComponent(id)}/models`)).data;
  },

  async listDoctors() {
    return (await apiRequest<Envelope<AiDoctor[]>>(`${BASE}/doctors`)).data;
  },
  async createDoctor(input: AiDoctorInput) {
    return (await apiRequest<Envelope<AiDoctor>>(`${BASE}/doctors`, json('POST', input))).data;
  },
  async updateDoctor(id: string, input: AiDoctorInput) {
    return (await apiRequest<Envelope<AiDoctor>>(`${BASE}/doctors/${encodeURIComponent(id)}`, json('PUT', input))).data;
  },
  async deleteDoctor(id: string) {
    await apiRequest(`${BASE}/doctors/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  async testDoctor(id: string) {
    return (await apiRequest<Envelope<TestResult>>(`${BASE}/doctors/${encodeURIComponent(id)}/test`, { method: 'POST' })).data;
  },

  async getSettings() {
    return (await apiRequest<Envelope<AiSettings>>(`${BASE}/settings`)).data;
  },
  /** Saves only the given fields (the AI Doctor page and Settings > Search save different parts) */
  async updateSettings(input: Partial<AiSettings>) {
    return (await apiRequest<Envelope<AiSettings>>(`${BASE}/settings`, json('PUT', input))).data;
  },

  async audit() {
    return (await apiRequest<Envelope<AiAuditEntry[]>>(`${BASE}/audit`)).data;
  },

  async getWebSearch() {
    return (await apiRequest<Envelope<WebSearchSettings>>(`${BASE}/web-search`)).data;
  },
  async updateWebSearch(input: WebSearchInput) {
    return (await apiRequest<Envelope<WebSearchSettings>>(`${BASE}/web-search`, json('PUT', input))).data;
  },
  async testWebSearch() {
    return (await apiRequest<Envelope<WebSearchTestResult>>(`${BASE}/web-search/test`, { method: 'POST' })).data;
  },
};

/** Internet search in the app (Google results through Serper.dev). The key itself is never sent back. */
export interface WebSearchSettings {
  enabled: boolean;
  hasKey: boolean;
  keyHint: string;
  perDevicePerDay: number;
  globalPerDay: number;
  usedToday: number;
}

export interface WebSearchInput {
  enabled: boolean;
  /** A new key replaces the saved one; leave out to keep it */
  apiKey?: string;
  removeKey?: boolean;
  perDevicePerDay: number;
  globalPerDay: number;
}

export interface WebSearchTestResult {
  ok: boolean;
  message: string;
  count?: number;
  firstTitle?: string;
  ms?: number;
}
