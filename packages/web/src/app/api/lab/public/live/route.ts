/** GET /api/lab/public/live?after= — guest-safe live snapshot of the featured run. */

import { ok, fail, unauthorized, labViewerAuthorized } from '@/lib/lab/http';
import { requirePublicRunId } from '@/lib/lab/public-config';
import { buildLiveSnapshot } from '@/lib/lab/live';
import { sanitizeLiveForGuest } from '@/lib/lab/guest-view';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const runId = requirePublicRunId();
        if (!labViewerAuthorized(req, runId)) return unauthorized();
        const after = Number(new URL(req.url).searchParams.get('after') ?? '0');
        const snapshot = await buildLiveSnapshot(runId, Number.isFinite(after) ? after : 0);
        return ok(sanitizeLiveForGuest(snapshot));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status = message.includes('not found') || message.includes('no public run') ? 404 : 500;
        return fail(error, status);
    }
}
