/**
 * POST /api/admin/reconcile — backfill character setup (setting gallery, 形貌,
 * genesis memory, relationship ties, skills, 入世序章) WITHOUT a browser tab.
 *
 * 創世 (createFoundingCast) only does the mint + a first pass; the heavy
 * per-character backfill is `reconcileCharacterAction`. Running it for the whole
 * cast as a server action is long and dies if the admin closes the tab / the
 * platform times out the request. This route runs it as a DETACHED background job
 * (via `after`) so the POST returns immediately and the cast fills in one-by-one
 * while you record — poll GET for progress.
 *
 * Auth: `Authorization: Bearer <TICK_LOOP_SECRET>` (same secret as /api/tick).
 * Open when the secret is unset (dev only).
 *
 *   curl -X POST  -H "Authorization: Bearer $TICK_LOOP_SECRET" https://<web>/api/admin/reconcile
 *   curl         -H "Authorization: Bearer $TICK_LOOP_SECRET" https://<web>/api/admin/reconcile   # progress
 *   curl -X POST  -H "Authorization: Bearer $TICK_LOOP_SECRET" "https://<web>/api/admin/reconcile?characterId=0x…"  # one (sync)
 */

import { NextResponse, after, type NextRequest } from 'next/server';
import { ENDLESS_STORY_DEPLOYMENT, makeSuiClient, read } from '@endless-story/sdk';
import { reconcileCharacterAction } from '@/lib/actions/reconcile-character';
import { resolveNetwork } from '@/lib/chain/network';

export const runtime = 'nodejs';
// POST returns immediately; the actual work runs detached via after(), so the
// request itself is short. The background job is not bound by this.
export const maxDuration = 120;

interface CharResult {
    characterId: string;
    name?: string;
    ok: boolean;
    steps?: unknown;
    error?: string;
}
interface ReconcileProgress {
    running: boolean;
    total: number;
    done: number;
    currentId?: string;
    startedAt: number;
    finishedAt?: number;
    results: CharResult[];
    error?: string;
}

// Module-level (single-process) progress + a guard so two background runs don't overlap.
let progress: ReconcileProgress | null = null;
let busy = false;

function authorized(req: NextRequest): boolean {
    const secret = process.env.TICK_LOOP_SECRET;
    if (!secret) return true; // open in dev when no secret configured
    return req.headers.get('authorization') === `Bearer ${secret}`;
}

async function listSagaCharacterIds(): Promise<string[]> {
    const d = ENDLESS_STORY_DEPLOYMENT;
    const client = makeSuiClient({ network: resolveNetwork() });
    const chars = await read.character.listMintedCharacterSummaries(client, d.packageId, {
        sagaId: d.sagaId,
    });
    return chars.map((c) => c.characterId);
}

async function runBackground(only?: string[]): Promise<void> {
    try {
        const ids = only && only.length > 0 ? only : await listSagaCharacterIds();
        progress = { running: true, total: ids.length, done: 0, startedAt: Date.now(), results: [] };
        for (const id of ids) {
            if (progress) progress.currentId = id;
            try {
                const r = await reconcileCharacterAction(id);
                progress?.results.push({ characterId: id, name: r.name, ok: r.ok, steps: r.steps });
                console.log(`[reconcile-api] ${(progress?.done ?? 0) + 1}/${ids.length} ${r.name ?? id} ${r.ok ? 'ok' : 'FAIL'}`);
            } catch (err) {
                const error = err instanceof Error ? err.message : String(err);
                progress?.results.push({ characterId: id, ok: false, error });
                console.warn(`[reconcile-api] ${id} threw: ${error}`);
            }
            if (progress) progress.done += 1;
        }
    } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        if (progress) progress.error = error;
        else progress = { running: false, total: 0, done: 0, startedAt: Date.now(), results: [], error };
        console.warn('[reconcile-api] background run failed:', error);
    } finally {
        if (progress) {
            progress.running = false;
            progress.finishedAt = Date.now();
            progress.currentId = undefined;
        }
        busy = false;
    }
}

export async function POST(req: NextRequest) {
    if (!authorized(req)) {
        return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    // Single character → run synchronously (short) and return its steps. Handy for
    // targeted re-runs / debugging a specific dossier.
    const characterId = new URL(req.url).searchParams.get('characterId');
    if (characterId) {
        try {
            const r = await reconcileCharacterAction(characterId);
            return NextResponse.json(r);
        } catch (err) {
            return NextResponse.json(
                { ok: false, error: err instanceof Error ? err.message : String(err) },
                { status: 500 },
            );
        }
    }

    if (busy) {
        return NextResponse.json({ started: false, error: 'already running', progress }, { status: 409 });
    }

    // Optional body { characterIds: [...] } to limit the run; else the whole saga.
    let only: string[] | undefined;
    try {
        const body = (await req.json()) as { characterIds?: unknown } | null;
        if (Array.isArray(body?.characterIds)) {
            only = body.characterIds.filter((x): x is string => typeof x === 'string');
        }
    } catch {
        /* empty body → whole saga */
    }

    busy = true;
    progress = { running: true, total: only?.length ?? 0, done: 0, startedAt: Date.now(), results: [] };
    // Detached: runs after the response is sent, in the (persistent) server process.
    after(() => runBackground(only));
    return NextResponse.json({
        started: true,
        scope: only && only.length > 0 ? `${only.length} characters` : 'whole saga',
        note: 'reconcile running in background — poll GET /api/admin/reconcile for progress',
    });
}

export async function GET(req: NextRequest) {
    if (!authorized(req)) {
        return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
    return NextResponse.json(
        progress ?? { running: false, total: 0, done: 0, results: [], note: 'no reconcile has run yet' },
    );
}
