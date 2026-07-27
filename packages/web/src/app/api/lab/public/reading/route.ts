/**
 * GET /api/lab/public/reading — guest reading surface for the featured run.
 * ?kind=dossiers|archive|ticks|file  (file needs &file=)
 */

import { ok, fail, unauthorized, labViewerAuthorized } from '@/lib/lab/http';
import { requirePublicRunId } from '@/lib/lab/public-config';
import { listArchiveEntries, readArchiveEntry, tailTickRecords } from '@/lib/lab/artifacts';
import { listDossiers, readEditorial } from '@/lib/lab/artifacts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const runId = requirePublicRunId();
        if (!labViewerAuthorized(req, runId)) return unauthorized();
        const url = new URL(req.url);
        const kind = url.searchParams.get('kind') ?? 'dossiers';

        if (kind === 'dossiers') {
            const dossiers = listDossiers(runId);
            const editorial = readEditorial(runId);
            return ok({ runId, dossiers, editorial });
        }
        if (kind === 'archive') {
            return ok({ runId, entries: listArchiveEntries(runId) });
        }
        if (kind === 'ticks') {
            const limit = Number(url.searchParams.get('limit') ?? '60');
            return ok({ runId, records: tailTickRecords(runId, Number.isFinite(limit) ? limit : 60) });
        }
        if (kind === 'file') {
            const file = url.searchParams.get('file');
            if (!file) throw new Error('file required');
            return ok({ runId, content: readArchiveEntry(runId, file) });
        }
        throw new Error(`unknown kind: ${kind}`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status = message.includes('not found') || message.includes('no public run') ? 404 : 400;
        return fail(error, status);
    }
}
