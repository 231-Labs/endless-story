/** Archive listing — 手卷 / 織回 / 日終 / POV markdown artifacts of a run. */

import { ok, fail, unauthorized } from '@/lib/lab/http';
import { canReadRun } from '@/lib/lab/run-access';
import { listArchiveEntries, readArchiveEntry } from '@/lib/lab/artifacts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        if (!canReadRun(req, id)) return unauthorized();
        const file = new URL(req.url).searchParams.get('file');
        if (file) return ok({ file, content: readArchiveEntry(id, file) });
        return ok({ entries: listArchiveEntries(id) });
    } catch (error) {
        return fail(error, 404);
    }
}
