import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { APP_CONFIG, ROUTES } from './lib/constants';

/**
 * Routing guard (Next.js 16 "proxy", formerly middleware). It only decides
 * which screens to show: the backend checks every request's token and role,
 * so a doctor can never use admin APIs even by typing an admin URL.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(APP_CONFIG.COOKIE_TOKEN_KEY)?.value;
  const isDoctor = request.cookies.get('vaidya_admin_role')?.value === 'doctor';
  const isLoginPage = pathname === ROUTES.LOGIN;
  const isDoctorArea = pathname === '/doctor' || pathname.startsWith('/doctor/');

  // Already logged in: skip the login page
  if (isLoginPage && token) {
    return NextResponse.redirect(new URL(isDoctor ? '/doctor' : ROUTES.DASHBOARD, request.url));
  }

  // Not logged in: go to login
  if (!isLoginPage && !token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL(ROUTES.LOGIN, request.url);
    if (pathname !== '/') {
      loginUrl.searchParams.set('redirect', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // Doctors only see the doctor panel; admins never see it
  if (token && isDoctor && !isDoctorArea && !pathname.startsWith('/api/')) {
    return NextResponse.redirect(new URL('/doctor', request.url));
  }
  if (token && !isDoctor && isDoctorArea) {
    return NextResponse.redirect(new URL(ROUTES.DASHBOARD, request.url));
  }

  return NextResponse.next();
}

// Match all application routes except static files, Next.js internals, and image assets
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
