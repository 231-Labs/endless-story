/**
 * POST /api/tick — execute ONE autonomous world tick.
 *
 * This is the headless execution endpoint behind the standalone world-loop
 * CLI (packages/cli/scripts/world-loop.ts). It runs the same
 * `runTickLoopAction` the admin SchedulerPanel button does — advance time →
 * plan → move → drama → social → act → POV → sleep → gazette — so the world
 * can run with no human in the loop.
 *
 * Auth: if `TICK_LOOP_SECRET` is set, requires `Authorization: Bearer <secret>`
 * (the CLI reads the same env). When unset, the route is open — convenient in
 * local dev; SET THE SECRET before exposing this anywhere.
 *
 * Body (optional JSON): a partial TickLoopInput — { advance, plan, move, pov,
 * sleep, gazette, autoResolve, maxCharacters, characterIds, dryRun }. Empty body = defaults.
 * DRAMA + SOCIAL are part of the loop; SOCIAL is skipped only for characters
 * already busy inside open events.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { runTickLoopAction, type TickLoopInput } from '@/lib/actions/tick-loop';
import type { TickLoopResult } from '@/lib/actions/tick-loop-types';

// A tick fans out several LLM calls + chain writes — give it room. A tick can run
// well past 300s (6 plans + social + POV, each LLM-bound); if the response is cut
// off mid-tick the world-loop fires the next POST and the two tick bodies overlap,
// corrupting the shared spine / registry / world-tick state.
export const runtime = 'nodejs';
export const maxDuration = 1800;

// Process-wide tick mutex: only ONE tick body runs at a time. Even if a slow
// tick's HTTP response is cut off (maxDuration) while its body runs on, the next
// request WAITS here instead of overlapping. Covers the headless world-loop; the
// admin SchedulerPanel calls runTickLoopAction directly but is manual/rare.
let tickChain: Promise<unknown> = Promise.resolve();
function runSerializedTick(input: TickLoopInput): Promise<TickLoopResult> {
    const run = tickChain.then(
        () => runTickLoopAction(input),
        () => runTickLoopAction(input),
    );
    tickChain = run.then(
        () => {},
        () => {},
    );
    return run;
}

function authorized(req: NextRequest): boolean {
    const secret = process.env.TICK_LOOP_SECRET;
    if (!secret) return true; // open in dev when no secret configured
    return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
    if (!authorized(req)) {
        return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
    let input: TickLoopInput = {};
    try {
        const body = (await req.json()) as TickLoopInput | null;
        if (body && typeof body === 'object') input = body;
    } catch {
        /* empty / invalid body → defaults */
    }
    try {
        const result = await runSerializedTick(input);
        return NextResponse.json(result);
    } catch (err) {
        return NextResponse.json(
            { ok: false, error: err instanceof Error ? err.message : String(err) },
            { status: 500 },
        );
    }
}
