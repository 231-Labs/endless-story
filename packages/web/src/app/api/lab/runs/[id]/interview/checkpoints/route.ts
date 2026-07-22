/** 演員訪談室: visitable time snapshots (per-tick checkpoints + event anchors). */

import { labAuthorized, ok, fail, unauthorized } from '@/lib/lab/http';
import { checkpointListOf } from '@/lib/lab/interview/actors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const { id } = await params;
        return ok(checkpointListOf(id));
    } catch (error) {
        return fail(error);
    }
}
