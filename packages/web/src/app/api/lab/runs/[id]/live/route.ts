/** Live snapshot — the handscroll's polling feed. ?after=<seq> returns only
 *  newer beats; the full world projection is always included (it is small). */

import { labAuthorized, ok, fail, unauthorized } from '@/lib/lab/http';
import { buildLiveSnapshot } from '@/lib/lab/live';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const { id } = await params;
        const after = Number(new URL(req.url).searchParams.get('after') ?? '0');
        const snapshot = await buildLiveSnapshot(id, Number.isFinite(after) ? after : 0);
        return ok(snapshot);
    } catch (error) {
        return fail(error, 404);
    }
}
