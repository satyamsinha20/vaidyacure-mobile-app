import { apiRequest } from '../lib/api';

/* Admin endpoints for app content: feedback, marketing ads, wellness tips. */

export type FeedbackStatus = 'new' | 'read' | 'resolved';
export type FeedbackRating = 'excellent' | 'good' | 'average' | 'poor';

export interface FeedbackItem {
  id: string;
  rating: FeedbackRating;
  message: string;
  platform: string;
  appVersion: string;
  status: FeedbackStatus;
  createdAt: string;
}

export interface FeedbackPage {
  items: FeedbackItem[];
  total: number;
  page: number;
  pages: number;
  counts: Record<FeedbackStatus, number>;
}

export type AdActionType = 'none' | 'url' | 'phone' | 'whatsapp';

export interface AdItem {
  id: string;
  clientName: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  actionType: AdActionType;
  actionValue: string;
  startAt: string | null;
  endAt: string | null;
  isActive: boolean;
  sortOrder: number;
  impressions: number;
  clicks: number;
  updatedAt: string;
}

export type AdInput = Omit<AdItem, 'id' | 'impressions' | 'clicks' | 'updatedAt'>;

export interface WellnessTipItem {
  id: string;
  title: string;
  text: string;
  category: string;
  scheduledFor: string | null;
  isActive: boolean;
  sortOrder: number;
  updatedAt: string;
}

export type WellnessTipInput = Omit<WellnessTipItem, 'id' | 'updatedAt'>;

/** Window event carrying the latest "new feedback" count, so the top bar badge updates at once */
export const FEEDBACK_COUNT_EVENT = 'vc:feedback-count';
export const announceFeedbackCount = (count: number) => {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(FEEDBACK_COUNT_EVENT, { detail: count }));
};

type Envelope<T> = { status: string; data: T };
const BASE = '/admin/content';
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const contentService = {
  async listFeedback(params: { status?: string; rating?: string; page?: number }) {
    const query = new URLSearchParams();
    if (params.status) query.set('status', params.status);
    if (params.rating) query.set('rating', params.rating);
    query.set('page', String(params.page ?? 1));
    return (await apiRequest<Envelope<FeedbackPage>>(`${BASE}/feedback?${query}`)).data;
  },
  async feedbackSummary() {
    return (await apiRequest<Envelope<{ newCount: number }>>(`${BASE}/feedback/summary`)).data;
  },
  async setFeedbackStatus(id: string, status: FeedbackStatus) {
    await apiRequest(`${BASE}/feedback/${encodeURIComponent(id)}`, json('PATCH', { status }));
  },
  async deleteFeedback(id: string) {
    await apiRequest(`${BASE}/feedback/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async listAds() {
    return (await apiRequest<Envelope<AdItem[]>>(`${BASE}/ads`)).data;
  },
  async createAd(input: AdInput) {
    return (await apiRequest<Envelope<AdItem>>(`${BASE}/ads`, json('POST', input))).data;
  },
  async updateAd(id: string, input: AdInput) {
    return (await apiRequest<Envelope<AdItem>>(`${BASE}/ads/${encodeURIComponent(id)}`, json('PUT', input))).data;
  },
  async deleteAd(id: string) {
    await apiRequest(`${BASE}/ads/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async listTips() {
    return (await apiRequest<Envelope<{ today: string; todayTipId: string | null; items: WellnessTipItem[] }>>(`${BASE}/tips`)).data;
  },
  async createTip(input: WellnessTipInput) {
    return (await apiRequest<Envelope<WellnessTipItem>>(`${BASE}/tips`, json('POST', input))).data;
  },
  async updateTip(id: string, input: WellnessTipInput) {
    return (await apiRequest<Envelope<WellnessTipItem>>(`${BASE}/tips/${encodeURIComponent(id)}`, json('PUT', input))).data;
  },
  async deleteTip(id: string) {
    await apiRequest(`${BASE}/tips/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
};

/** Uploads an image to Cloudinary through the admin panel's /api/upload route */
export const uploadImage = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success || !data.url) throw new Error(data.error || 'Image upload failed.');
  return data.url as string;
};
