/** Durable tick timeline (ticks.jsonl) — events + POVs per tick. */

import { ok, fail, unauthorized } from '@/lib/lab/http';
import { canReadRun } from '@/lib/lab/run-access';
import { readTickRecords } from '@/lib/lab/artifacts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        if (!canReadRun(req, id)) return unauthorized();
        const url = new URL(req.url);
        const limit = Number(url.searchParams.get('limit') ?? '0');
        let records = readTickRecords(id);
        if (Number.isInteger(limit) && limit > 0) records = records.slice(-limit);
        return ok({ records });
    } catch (error) {
        return fail(error, 500);
    }
}
