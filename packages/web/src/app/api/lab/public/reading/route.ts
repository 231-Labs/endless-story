/**
 * GET /api/lab/public/reading — guest reading via product ports.
 * ?kind=dossiers|archive|ticks|file  (file needs &file=)
 */

import { ok, fail, unauthorized, labViewerAuthorized } from '@/lib/lab/http';
import { requirePublicRunId } from '@/lib/lab/public-config';
import { getProductPorts } from '@/lib/ports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const runId = requirePublicRunId();
        if (!labViewerAuthorized(req, runId)) return unauthorized();
        const url = new URL(req.url);
        const kind = url.searchParams.get('kind') ?? 'dossiers';
        const ports = getProductPorts();
        const reading = ports.reading;

        if (kind === 'dossiers') {
            const data = (await reading.listDossiers(runId)) as { dossiers: unknown; editorial: unknown };
            return ok({ runId, ...data, backend: ports.backend });
        }
        if (kind === 'archive') {
            const data = (await reading.listArchive(runId)) as { entries: unknown };
            return ok({ runId, ...data, backend: ports.backend });
        }
        if (kind === 'ticks') {
            const limit = Number(url.searchParams.get('limit') ?? '60');
            if (!reading.listTicks) return ok({ runId, records: [], backend: ports.backend });
            const data = (await reading.listTicks(runId, Number.isFinite(limit) ? limit : 60)) as {
                records: unknown;
            };
            return ok({ runId, ...data, backend: ports.backend });
        }
        if (kind === 'file') {
            const file = url.searchParams.get('file');
            if (!file) throw new Error('file required');
            const content = await reading.readArchiveFile(runId, file);
            return ok({ runId, content, backend: ports.backend });
        }
        throw new Error(`unknown kind: ${kind}`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status = message.includes('not found') || message.includes('no public run') ? 404 : 400;
        return fail(error, status);
    }
}
