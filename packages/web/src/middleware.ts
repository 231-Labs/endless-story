/**
 * Middleware — stub gate for /admin/* plus the cinema-lab door policy:
 *
 *   LAB_DISABLED=1  the lab does not exist on this host — /lab/* and
 *                   /api/lab/* answer 404. Set it on the production web
 *                   service when the lab runs as its own Zeabur service
 *                   (same image, different env — see docs/CINEMA_LAB.md §6).
 *   LAB_SECRET      shared-secret lock: /lab?key=<secret> once stores the
 *                   cookie (30 days); pages and /api/lab (which re-checks the
 *                   same cookie server-side) are then usable.
 *   neither set     open — local development.
 *
 * Admin auth stays a Phase 2 TODO (wallet allowlist), unchanged.
 */
import { NextResponse, type NextRequest } from 'next/server';

const LAB_COOKIE = 'es_lab_key';

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  const isLabPage = pathname === '/lab' || pathname.startsWith('/lab/');
  const isLabApi = pathname.startsWith('/api/lab');
  if (isLabPage || isLabApi) {
    if (process.env.LAB_DISABLED === '1') {
      return new NextResponse('not found', { status: 404 });
    }
    const secret = process.env.LAB_SECRET?.trim();
    if (!secret || isLabApi) return NextResponse.next(); // API auth is checked in-route
    const key = searchParams.get('key');
    if (key === secret) {
      const url = req.nextUrl.clone();
      url.searchParams.delete('key');
      const res = NextResponse.redirect(url);
      res.cookies.set(LAB_COOKIE, secret, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 30,
        path: '/',
      });
      return res;
    }
    if (req.cookies.get(LAB_COOKIE)?.value !== secret) {
      return new NextResponse('cinema-lab: access key required (open /lab?key=…)', { status: 401 });
    }
  }
  // TODO(Phase 2): check wallet header / cookie against allowed admin addresses.
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/lab/:path*', '/api/lab/:path*'],
};
