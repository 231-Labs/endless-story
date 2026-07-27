/** Live snapshot — the handscroll's polling feed. ?after=<seq> returns only
 *  newer beats; the full world projection is always included (it is small).
 *  Directors see full operator texture; guests on the public run get sanitized. */

import { ok, fail, unauthorized, labRole } from '@/lib/lab/http';
import { canReadRun } from '@/lib/lab/run-access';
import { buildLiveSnapshot } from '@/lib/lab/live';
import { sanitizeLiveForGuest } from '@/lib/lab/guest-view';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        if (!canReadRun(req, id)) return unauthorized();
        const after = Number(new URL(req.url).searchParams.get('after') ?? '0');
        const snapshot = await buildLiveSnapshot(id, Number.isFinite(after) ? after : 0);
        if (labRole(req) === 'director') return ok(snapshot);
        return ok(sanitizeLiveForGuest(snapshot));
    } catch (error) {
        return fail(error, 404);
    }
}
