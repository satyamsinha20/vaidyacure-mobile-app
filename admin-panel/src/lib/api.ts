import Cookies from 'js-cookie';
import { APP_CONFIG } from './constants';

export interface ApiResponse<T = any> {
  status: 'success' | 'error' | 'ok';
  message?: string;
  data?: T;
  [key: string]: any;
}

export class ApiError extends Error {
  status: number;
  data?: any;

  constructor(message: string, status: number = 500, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Base API request helper connecting to VaidyaCure Express Backend
 */
export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = Cookies.get(APP_CONFIG.COOKIE_TOKEN_KEY);
  
  // Format clean URL path
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${APP_CONFIG.API_BASE_URL}${cleanEndpoint}`;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  try {
    const res = await fetch(url, {
      ...options,
      headers,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new ApiError(
        data.message || `Request failed with status ${res.status}`,
        res.status,
        data
      );
    }

    return data as T;
  } catch (err: any) {
    if (err instanceof ApiError) {
      throw err;
    }
    // Network / connection failure
    throw new ApiError(
      err.message || 'Cannot connect to backend server. Ensure Express is running on http://localhost:5000.',
      0
    );
  }
}
