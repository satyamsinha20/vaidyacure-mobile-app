import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { APP_CONFIG, ROUTES } from './lib/constants';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(APP_CONFIG.COOKIE_TOKEN_KEY)?.value;

  const isLoginPage = pathname === ROUTES.LOGIN;

  // Case 1: Admin is ALREADY logged in and attempts to access /login
  if (isLoginPage && token) {
    return NextResponse.redirect(new URL(ROUTES.DASHBOARD, request.url));
  }

  // Case 2: Admin is NOT logged in and attempts to access protected routes
  if (!isLoginPage && !token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL(ROUTES.LOGIN, request.url);
    // Optionally preserve the attempted path for return redirect after login
    if (pathname !== '/') {
      loginUrl.searchParams.set('redirect', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// Match all application routes except static files, Next.js internals, and image assets
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files with extensions (e.g. .svg, .png, .jpg)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
