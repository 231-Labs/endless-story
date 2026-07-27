/**
 * GET  /api/lab/public — 春雪社 public config (featured run, brand, opening cast).
 * PUT  /api/lab/public — director: hang / clear the featured public run → public.json
 */

import { ok, fail, unauthorized, labAuthorized } from '@/lib/lab/http';
import {
    resolvePublicConfig,
    publicRunExists,
    writePublicConfig,
    publicRunPinnedByEnv,
    readPublicJson,
} from '@/lib/lab/public-config';
import { readRunMeta } from '@/lib/lab/store';
import { readDailyShot } from '@/lib/lab/daily-shot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const config = resolvePublicConfig();
        const file = readPublicJson();
        const meta = config.runId && publicRunExists(config.runId) ? readRunMeta(config.runId) : null;
        const hasDailyShot = config.runId ? Boolean(readDailyShot(config.runId)) : false;
        return ok({
            brand: config.brand,
            runId: config.runId,
            featuredCastNames: config.featuredCastNames,
            runTitle: meta?.title ?? null,
            hasDailyShot,
            ready: Boolean(config.runId && meta),
            pinnedByEnv: publicRunPinnedByEnv(),
            fileRunId: file?.runId?.trim() || null,
        });
    } catch (error) {
        return fail(error, 500);
    }
}

export async function PUT(req: Request) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const body = (await req.json()) as { runId?: string | null };
        if (body.runId === undefined) throw new Error('runId required (string or null to clear)');
        const config = writePublicConfig({ runId: body.runId });
        const pinnedByEnv = publicRunPinnedByEnv();
        const envId = process.env.LAB_PUBLIC_RUN_ID?.trim() || null;
        const effective = config.runId;
        const meta = effective ? readRunMeta(effective) : null;
        const warning =
            pinnedByEnv && envId && body.runId !== envId
                ? `環境變數 LAB_PUBLIC_RUN_ID=${envId} 仍覆蓋 public.json；請在部署設定清掉後才會生效`
                : null;
        return ok({
            brand: config.brand,
            runId: effective,
            featuredCastNames: config.featuredCastNames,
            runTitle: meta?.title ?? null,
            ready: Boolean(effective && meta),
            pinnedByEnv,
            fileRunId: body.runId,
            warning,
        });
    } catch (error) {
        return fail(error, 400);
    }
}
