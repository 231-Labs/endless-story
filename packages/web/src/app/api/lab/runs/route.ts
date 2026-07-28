/** Run registry: list all runs; create a new run from a seed. */

import { labAuthorized, ok, fail, unauthorized } from '@/lib/lab/http';
import { labManager } from '@/lib/lab/manager';
import { createRun, listRunIds, readRunMeta, readRunStatus } from '@/lib/lab/store';
import { normalizeRunConfig, type LabRunConfigInput } from '@/lib/lab/run-config';
import type { LabRunSummary } from '@/lib/lab/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const manager = labManager();
        const runs: LabRunSummary[] = [];
        for (const id of listRunIds()) {
            const meta = readRunMeta(id);
            if (!meta) continue;
            const active = manager.get(id);
            runs.push({
                meta,
                status: readRunStatus(id),
                phase: active?.phase ?? 'idle',
                pendingTicks: active?.pendingTicks ?? 0,
                lastError: active?.lastError,
            });
        }
        return ok({ runs });
    } catch (error) {
        return fail(error, 500);
    }
}

export async function POST(req: Request) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const body = (await req.json()) as {
            title?: string;
            note?: string;
            config?: LabRunConfigInput;
        };
        // One normaliser, one test that walks every field — see `run-config.ts` for
        // why this is not inlined here any more.
        const config = normalizeRunConfig(body.config);
        const meta = createRun({ title: body.title ?? config.presetId, note: body.note, config });
        // Seed the world eagerly so the scroll opens alive (throws early on a
        // missing LLM key rather than at the first tick).
        await labManager().open(meta.id);
        return ok({ meta }, 201);
    } catch (error) {
        return fail(error);
    }
}
