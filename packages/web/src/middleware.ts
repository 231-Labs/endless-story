/**
 * Middleware — stub gate for /admin/* plus the cinema-lab door policy:
 *
 *   LAB_DISABLED=1  director lab pages 404. Public 春雪社 APIs and the
 *                   featured-run guest stage stay reachable.
 *   LAB_SECRET      locks director surfaces. Guest may still open the
 *                   featured `/lab/run/<id>` (看客 chrome) and /api/lab/public/*.
 *   neither set     open — local development.
 *
 * Admin auth stays a Phase 2 TODO (wallet allowlist), unchanged.
 */
import { NextResponse, type NextRequest } from 'next/server';

const LAB_COOKIE = 'es_lab_key';

function isPublicLabApi(pathname: string): boolean {
  return pathname === '/api/lab/public'
    || pathname.startsWith('/api/lab/public/')
    || pathname === '/api/lab/role';
}

/** Guest-readable APIs on any run — still re-checked in-route for public-run id. */
function isGuestReadableRunApi(pathname: string): boolean {
  // /api/lab/runs/<id>/live|dossiers|archive|ticks|daily-shot
  return /^\/api\/lab\/runs\/[^/]+\/(live|dossiers|archive|ticks|daily-shot)\/?$/.test(pathname);
}

/** Featured-run guest stage pages (no director cookie required). */
function isGuestRunPage(pathname: string): boolean {
  // /lab/run/<id> and reading / dossier under it — interview stays director-only
  return /^\/lab\/run\/[^/]+\/?$/.test(pathname)
    || /^\/lab\/run\/[^/]+\/reading\/?$/.test(pathname)
    || /^\/lab\/run\/[^/]+\/dossier(\/|$)/.test(pathname);
}

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  const isLabPage = pathname === '/lab' || pathname.startsWith('/lab/');
  const isLabApi = pathname.startsWith('/api/lab');
  const isPublicApi = isPublicLabApi(pathname);
  const guestReadableApi = isGuestReadableRunApi(pathname);
  const guestRunPage = isGuestRunPage(pathname);

  if (isLabPage || isLabApi) {
    if (process.env.LAB_DISABLED === '1') {
      // Production web host: director UI off; 春雪社 public + featured-run reads stay on.
      if (isPublicApi || guestReadableApi) return NextResponse.next();
      return new NextResponse('not found', { status: 404 });
    }

    if (isPublicApi || guestReadableApi) return NextResponse.next();
    if (isLabApi) return NextResponse.next(); // director API auth checked in-route

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

    const hasCookie = req.cookies.get(LAB_COOKIE)?.value === secret;
    if (hasCookie) return NextResponse.next();

    // No director cookie: allow guest chrome on run stage / reading / dossier.
    if (guestRunPage) return NextResponse.next();

    return new NextResponse('cinema-lab: access key required (open /lab?key=…)', { status: 401 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/lab/:path*', '/api/lab/:path*'],
};
