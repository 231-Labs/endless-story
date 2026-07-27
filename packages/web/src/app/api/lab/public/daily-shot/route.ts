/** GET /api/lab/public/daily-shot — today's curated 主鏡 on the featured run. */

import { ok, fail, unauthorized, labViewerAuthorized } from '@/lib/lab/http';
import { requirePublicRunId } from '@/lib/lab/public-config';
import { readDailyShot } from '@/lib/lab/daily-shot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const runId = requirePublicRunId();
        if (!labViewerAuthorized(req, runId)) return unauthorized();
        const shot = readDailyShot(runId);
        return ok({ runId, shot });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status = message.includes('not found') || message.includes('no public run') ? 404 : 500;
        return fail(error, status);
    }
}
