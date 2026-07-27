/** GET /api/lab/public/cast — featured-run cast via product ports. */

import { ok, fail, unauthorized, labViewerAuthorized } from '@/lib/lab/http';
import { requirePublicRunId, resolvePublicConfig } from '@/lib/lab/public-config';
import { getProductPorts } from '@/lib/ports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const runId = requirePublicRunId();
        if (!labViewerAuthorized(req, runId)) return unauthorized();
        const ports = getProductPorts();
        const cast = await ports.cast.listCast(runId);
        const { featuredCastNames } = resolvePublicConfig();
        return ok({ runId, cast, featuredCastNames, backend: ports.backend });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status = message.includes('not found') || message.includes('no public run') ? 404 : 500;
        return fail(error, status);
    }
}
