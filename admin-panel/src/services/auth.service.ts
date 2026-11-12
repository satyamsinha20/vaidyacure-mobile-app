import Cookies from 'js-cookie';
import { apiRequest } from '../lib/api';
import { APP_CONFIG } from '../lib/constants';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'superadmin' | 'moderator' | 'editor' | 'viewer';
  lastLogin?: string;
  createdAt?: string;
}

export interface RoleUser {
  id: string;
  name: string;
  email: string;
  role: 'superadmin' | 'moderator' | 'editor' | 'viewer';
  isActive: boolean;
  createdAt?: string;
  lastLogin?: string;
}

export interface LoginResponse {
  status: 'success';
  message: string;
  token: string;
  admin: AdminUser;
}

export const DEFAULT_ADMIN: AdminUser = {
  id: '6aa8e3167bcad8f5fadd7307',
  name: 'Satyam Kumar Sinha',
  email: 'admin@vaidyacure.com',
  role: 'superadmin',
};

// One shared profile request per minute for the whole app (see getMe)
const ME_CACHE_MS = 60_000;
let meCache: { promise: Promise<AdminUser>; at: number } | null = null;

const fetchMe = async (): Promise<AdminUser> => {
  const data = await apiRequest<{ status: string; admin: AdminUser }>('/auth/me');
  if (typeof window !== 'undefined' && data.admin) {
    localStorage.setItem(APP_CONFIG.STORAGE_USER_KEY, JSON.stringify(data.admin));
    Cookies.set(APP_CONFIG.STORAGE_USER_KEY, JSON.stringify(data.admin), {
      expires: 7,
      path: '/',
      sameSite: 'lax',
    });
    Cookies.set('vaidya_admin_role', data.admin.role, {
      expires: 7,
      path: '/',
      sameSite: 'lax',
    });
  }
  return data.admin || DEFAULT_ADMIN;
};

export const authService = {
  /**
   * Log in admin with email and password
   */
  async login(email: string, password: string): Promise<LoginResponse> {
    meCache = null;
    const data = await apiRequest<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (data.token) {
      // Store token in cookie so Next.js Edge Middleware can verify server-side
      Cookies.set(APP_CONFIG.COOKIE_TOKEN_KEY, data.token, {
        expires: 7, // 7 days
        path: '/',
        sameSite: 'lax',
      });

      // Cache admin user details in localStorage and cookies for SSR sync
      if (typeof window !== 'undefined' && data.admin) {
        localStorage.setItem(APP_CONFIG.STORAGE_USER_KEY, JSON.stringify(data.admin));
        Cookies.set(APP_CONFIG.STORAGE_USER_KEY, JSON.stringify(data.admin), {
          expires: 7,
          path: '/',
          sameSite: 'lax',
        });
        Cookies.set('vaidya_admin_role', data.admin.role, {
          expires: 7,
          path: '/',
          sameSite: 'lax',
        });
      }
    }

    return data;
  },

  /**
   * Fetch current authenticated admin user from backend
   */
  async getMe(): Promise<AdminUser> {
    // TopNav, the page and its widgets all ask for the profile on every navigation:
    // share one request (and its result for a minute) instead of firing 2-3 per page
    if (meCache && Date.now() - meCache.at < ME_CACHE_MS) return meCache.promise;
    const promise = fetchMe();
    meCache = { promise, at: Date.now() };
    promise.catch(() => {
      meCache = null;
    });
    return promise;
  },

  /** Forget the cached profile (after login, logout or a profile change) */
  clearProfileCache(): void {
    meCache = null;
  },

  /**
   * Log out admin and clear session
   */
  async logout(): Promise<void> {
    meCache = null;
    try {
      await apiRequest('/auth/logout', { method: 'POST' }).catch(() => {});
    } finally {
      Cookies.remove(APP_CONFIG.COOKIE_TOKEN_KEY, { path: '/' });
      Cookies.remove(APP_CONFIG.STORAGE_USER_KEY, { path: '/' });
      Cookies.remove('vaidya_admin_role', { path: '/' });
      if (typeof window !== 'undefined') {
        localStorage.removeItem(APP_CONFIG.STORAGE_USER_KEY);
      }
    }
  },

  /**
   * Get cached admin user details from localStorage, with instant fallback to real superadmin
   */
  getStoredUser(): AdminUser {
    if (typeof window === 'undefined') return DEFAULT_ADMIN;
    try {
      const raw = localStorage.getItem(APP_CONFIG.STORAGE_USER_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.name && parsed.name !== 'Admin') {
          return parsed;
        }
      }
      return DEFAULT_ADMIN;
    } catch {
      return DEFAULT_ADMIN;
    }
  },

  /**
   * Get stored JWT auth token
   */
  getToken(): string | undefined {
    return Cookies.get(APP_CONFIG.COOKIE_TOKEN_KEY);
  },

  /**
   * Change admin password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<{ status: string; message: string }> {
    return await apiRequest<{ status: string; message: string }>('/auth/change-password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  /**
   * Fetch all roles / administrators
   */
  async getRoles(): Promise<RoleUser[]> {
    const data = await apiRequest<{ status: string; roles: RoleUser[] }>('/auth/roles');
    return data.roles;
  },

  /**
   * Create a new role (moderator / viewer)
   */
  async createRole(payload: {
    name: string;
    email: string;
    role: string;
    password: string;
  }): Promise<{ status: string; message: string; roleUser: RoleUser }> {
    return await apiRequest<{ status: string; message: string; roleUser: RoleUser }>('/auth/roles', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Update an existing role (excluding SuperAdmin)
   */
  async updateRole(
    id: string,
    payload: {
      name?: string;
      email?: string;
      role?: string;
      isActive?: boolean;
      password?: string;
    }
  ): Promise<{ status: string; message: string; roleUser: RoleUser }> {
    return await apiRequest<{ status: string; message: string; roleUser: RoleUser }>(`/auth/roles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Delete an existing role (excluding SuperAdmin)
   */
  async deleteRole(id: string): Promise<{ status: string; message: string }> {
    return await apiRequest<{ status: string; message: string }>(`/auth/roles/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Fast check if token exists
   */
  isAuthenticated(): boolean {
    return Boolean(Cookies.get(APP_CONFIG.COOKIE_TOKEN_KEY));
  },
};

