/** GET /api/lab/public — 春雪社 public config (featured run, brand, opening cast). */

import { ok, fail } from '@/lib/lab/http';
import { resolvePublicConfig, publicRunExists } from '@/lib/lab/public-config';
import { readRunMeta } from '@/lib/lab/store';
import { readDailyShot } from '@/lib/lab/daily-shot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const config = resolvePublicConfig();
        const meta = config.runId && publicRunExists(config.runId) ? readRunMeta(config.runId) : null;
        const hasDailyShot = config.runId ? Boolean(readDailyShot(config.runId)) : false;
        return ok({
            brand: config.brand,
            runId: config.runId,
            featuredCastNames: config.featuredCastNames,
            runTitle: meta?.title ?? null,
            hasDailyShot,
            ready: Boolean(config.runId && meta),
        });
    } catch (error) {
        return fail(error, 500);
    }
}
