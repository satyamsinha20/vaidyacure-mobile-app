export const APP_CONFIG = {
  API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api',
  APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || 'VaidyaCure Operations Portal',
  COOKIE_TOKEN_KEY: 'vaidya_admin_token',
  STORAGE_USER_KEY: 'vaidya_admin_user',
} as const;

export const ROUTES = {
  LOGIN: '/login',
  DASHBOARD: '/',
  PROFILE: '/profile',
  MANAGE_ROLES: '/manage-roles',
  MANAGE_USERS: '/manage-users',
  REMEDIES: '/remedies',
  AI_DOCTOR: '/ai-doctor',
} as const;
