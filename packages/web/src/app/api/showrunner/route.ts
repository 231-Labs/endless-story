/**
 * POST /api/showrunner — execute ONE Showrunner heartbeat
 * (NARRATIVE_AGENTS.md §12.2): audit → mechanical repair → LLM evaluate →
 * budgeted tool loop → 導演日誌 + arc plan persisted to director memory.
 *
 * Headless counterpart of the admin ShowrunnerPanel, meant to be hit by the
 * world-loop CLI every N ticks (--showrunner-every) or an external cron.
 *
 * Auth: same scheme as /api/tick — if `TICK_LOOP_SECRET` is set, requires
 * `Authorization: Bearer <secret>`; unset = open (local dev only).
 *
 * Body (optional JSON): { maxToolCalls, autoRepair, maxRepairs, dryRun }.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { runShowrunnerAction } from '@/lib/actions/showrunner';
import type { ShowrunnerOptions, ShowrunnerResult } from '@/lib/director/showrunner';

// Heartbeat is LLM-bound (several rounds + possible image-generating repairs).
export const runtime = 'nodejs';
export const maxDuration = 1800;

// Serialize heartbeats — overlapping runs would race on director memory and
// double-spend the tool budget.
let chain: Promise<unknown> = Promise.resolve();
function runSerialized(input: ShowrunnerOptions): Promise<ShowrunnerResult> {
    const run = chain.then(
        () => runShowrunnerAction(input),
        () => runShowrunnerAction(input),
    );
    chain = run.then(
        () => {},
        () => {},
    );
    return run;
}

function authorized(req: NextRequest): boolean {
    const secret = process.env.TICK_LOOP_SECRET;
    if (!secret) return true;
    return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
    if (!authorized(req)) {
        return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
    let input: ShowrunnerOptions = {};
    try {
        const body = (await req.json()) as ShowrunnerOptions | null;
        if (body && typeof body === 'object') input = body;
    } catch {
        /* empty / invalid body → defaults */
    }
    try {
        const result = await runSerialized(input);
        return NextResponse.json(result);
    } catch (err) {
        return NextResponse.json(
            { ok: false, error: err instanceof Error ? err.message : String(err) },
            { status: 500 },
        );
    }
}
