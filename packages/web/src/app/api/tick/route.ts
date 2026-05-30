/**
 * POST /api/tick — execute ONE autonomous world tick.
 *
 * This is the headless execution endpoint behind the standalone world-loop
 * CLI (packages/cli/scripts/world-loop.ts). It runs the same
 * `runTickLoopAction` the admin SchedulerPanel button does — advance time →
 * plan → move → act → POV → sleep → gazette — so the world can run with no
 * human in the loop.
 *
 * Auth: if `TICK_LOOP_SECRET` is set, requires `Authorization: Bearer <secret>`
 * (the CLI reads the same env). When unset, the route is open — convenient in
 * local dev; SET THE SECRET before exposing this anywhere.
 *
 * Body (optional JSON): a partial TickLoopInput — { advance, plan, move,
 * sleep, gazette, autoResolve, maxCharacters, dryRun }. Empty body = defaults.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { runTickLoopAction, type TickLoopInput } from '@/lib/actions/tick-loop';

// A tick fans out several LLM calls + chain writes — give it room.
export const runtime = 'nodejs';
export const maxDuration = 300;

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
        const result = await runTickLoopAction(input);
        return NextResponse.json(result);
    } catch (err) {
        return NextResponse.json(
            { ok: false, error: err instanceof Error ? err.message : String(err) },
            { status: 500 },
        );
    }
}
