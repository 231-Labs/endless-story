/** Tiny helpers shared by every /api/lab route. */

import { NextResponse } from 'next/server';

export const LAB_COOKIE = 'es_lab_key';

/**
 * Optional shared-secret gate. Unset LAB_SECRET = open (local dev).
 * Set it in production; the middleware turns ?key=… into the cookie.
 * LAB_DISABLED=1 kills the lab entirely (middleware 404s first; this is
 * defence-in-depth for any path the matcher misses).
 */
export function labAuthorized(req: Request): boolean {
    if (process.env.LAB_DISABLED === '1') return false;
    const secret = process.env.LAB_SECRET?.trim();
    if (!secret) return true;
    if (req.headers.get('authorization') === `Bearer ${secret}`) return true;
    const cookie = req.headers.get('cookie') ?? '';
    return cookie.split(/;\s*/).some((entry) => entry === `${LAB_COOKIE}=${secret}`);
}

export function unauthorized(): NextResponse {
    return NextResponse.json({ error: 'lab access denied' }, { status: 401 });
}

export function ok(data: unknown, init?: number): NextResponse {
    return NextResponse.json(data, { status: init ?? 200 });
}

export function fail(error: unknown, status = 400): NextResponse {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status });
}
