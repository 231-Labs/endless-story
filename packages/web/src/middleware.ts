/**
 * Middleware — stub gate for /admin/* plus an optional shared-secret gate for
 * the cinema-lab (/lab/*). Set LAB_SECRET in production; visiting
 * /lab?key=<secret> once stores the cookie, after which the lab (pages and
 * /api/lab, which re-checks the same cookie server-side) is usable.
 * Unset LAB_SECRET = open, for local development.
 *
 * Admin auth stays a Phase 2 TODO (wallet allowlist), unchanged.
 */
import { NextResponse, type NextRequest } from 'next/server';

const LAB_COOKIE = 'es_lab_key';

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  if (pathname === '/lab' || pathname.startsWith('/lab/')) {
    const secret = process.env.LAB_SECRET?.trim();
    if (!secret) return NextResponse.next();
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
  matcher: ['/admin/:path*', '/lab/:path*'],
};
