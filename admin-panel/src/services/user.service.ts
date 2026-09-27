import { apiRequest } from '../lib/api';

export interface MobileAppUser {
  _id?: string;
  id?: string;
  name: string;
  email: string;
  age: number;
  gender: 'male' | 'female' | 'other';
  ipAddress?: string;
  deviceInfo?: {
    platform?: string;
    osVersion?: string;
    brand?: string;
    model?: string;
    appVersion?: string;
    userAgent?: string;
  };
  isRegistered: boolean;
  firstOpenedAt?: string;
  lastActiveAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GetUsersResponse {
  status: 'success' | 'error';
  message?: string;
  totalUsers: number;
  totalPages: number;
  currentPage: number;
  users: MobileAppUser[];
}

export const userService = {
  /**
   * Fetch mobile app users registered from the VaidyaCure app onboarding popup
   */
  async getAppUsers(page: number = 1, limit: number = 50, search: string = ''): Promise<GetUsersResponse> {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      ...(search ? { search } : {}),
    });
    return await apiRequest<GetUsersResponse>(`/users?${params.toString()}`);
  },

  /**
   * Fetch live total count of mobile app users from MongoDB users collection
   */
  async getUserCount(): Promise<number> {
    try {
      const res = await apiRequest<{ status: string; totalUsers: number }>('/users/count');
      return typeof res.totalUsers === 'number' ? res.totalUsers : 0;
    } catch {
      return 0;
    }
  },
};

