/** GET/PUT daily-shot for a run — directors write; anyone who can read the run may GET. */

import { ok, fail, unauthorized, labAuthorized } from '@/lib/lab/http';
import { canReadRun } from '@/lib/lab/run-access';
import { readDailyShot, writeDailyShot, type DailyShot } from '@/lib/lab/daily-shot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        if (!canReadRun(req, id)) return unauthorized();
        return ok({ runId: id, shot: readDailyShot(id) });
    } catch (error) {
        return fail(error, 404);
    }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const { id } = await params;
        const body = (await req.json()) as Omit<DailyShot, 'updatedAt'>;
        if (!body?.id || !body?.title || body.day == null) throw new Error('id, title, day required');
        const shot = writeDailyShot(id, body);
        return ok({ runId: id, shot });
    } catch (error) {
        return fail(error, 400);
    }
}
