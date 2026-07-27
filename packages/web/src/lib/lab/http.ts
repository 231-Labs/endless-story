/** Tiny helpers shared by every /api/lab route. */

import { NextResponse } from 'next/server';
import { isPublicRunId } from './public-config';

export const LAB_COOKIE = 'es_lab_key';

export type LabRole = 'viewer' | 'director' | 'none';

/**
 * Director (= 片場) gate. Unset LAB_SECRET = open (local dev).
 * LAB_DISABLED=1 kills director surfaces; public viewer APIs use labViewerAuthorized.
 */
export function labAuthorized(req: Request): boolean {
    return labRole(req) === 'director';
}

/** True when this process still serves lab filesystem reads (public or director). */
export function labDataAvailable(): boolean {
    // Public 春雪社 needs LAB_DATA_DIR even when director UI is disabled on this host.
    return true;
}

/**
 * Resolve identity for a lab request.
 * - director: LAB_SECRET cookie/bearer (or open when secret unset and not LAB_DISABLED)
 * - none: not a director (may still be a public viewer)
 *
 * Note: LAB_DISABLED only removes director privileges on this host; public
 * viewer APIs remain available for the 春雪社 shell.
 */
export function labRole(req: Request): LabRole {
    if (process.env.LAB_DISABLED === '1') {
        return 'none';
    }
    const secret = process.env.LAB_SECRET?.trim();
    if (!secret) return 'director'; // local open = full director
    if (req.headers.get('authorization') === `Bearer ${secret}`) return 'director';
    const cookie = req.headers.get('cookie') ?? '';
    if (cookie.split(/;\s*/).some((entry) => entry === `${LAB_COOKIE}=${secret}`)) return 'director';
    return 'none';
}

/**
 * Public viewer may read the featured run's live / daily-shot / reading APIs.
 * Directors always pass. When LAB_DISABLED=1, viewers still may read public data
 * (春雪社 on the production web host).
 */
export function labViewerAuthorized(req: Request, runId?: string): boolean {
    if (labRole(req) === 'director') return true;
    if (runId) return isPublicRunId(runId);
    // Config / featured endpoints without a run id — always ok to probe.
    return true;
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
