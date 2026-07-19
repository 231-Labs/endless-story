/** Run registry: list all runs; create a new run from a seed. */

import { labAuthorized, ok, fail, unauthorized } from '@/lib/lab/http';
import { labManager } from '@/lib/lab/manager';
import { createRun, listRunIds, readRunMeta, readRunStatus } from '@/lib/lab/store';
import type { LabRunConfig, LabRunSummary } from '@/lib/lab/types';

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
            config?: Partial<LabRunConfig> & { presetId?: string };
        };
        if (!body.config?.presetId) return fail(new Error('config.presetId is required'));
        const config: LabRunConfig = {
            presetId: body.config.presetId,
            seedSource: body.config.seedSource === 'custom' ? 'custom' : 'builtin',
            seasonId: body.config.seasonId || undefined,
            seasonSource: body.config.seasonSource === 'custom' ? 'custom' : 'builtin',
            llm: body.config.llm === 'real' ? 'real' : 'fake',
            relationshipFallback: body.config.relationshipFallback !== false,
            emergentProduction: body.config.emergentProduction === true,
            ticksPerDay: Number.isInteger(body.config.ticksPerDay) && (body.config.ticksPerDay as number) > 0
                ? (body.config.ticksPerDay as number)
                : 6,
            realEmbeddings: body.config.realEmbeddings === true,
        };
        const meta = createRun({ title: body.title ?? config.presetId, note: body.note, config });
        // Seed the world eagerly so the scroll opens alive (throws early on a
        // missing LLM key rather than at the first tick).
        await labManager().open(meta.id);
        return ok({ meta }, 201);
    } catch (error) {
        return fail(error);
    }
}
