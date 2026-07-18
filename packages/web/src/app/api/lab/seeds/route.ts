/** Seed library: list built-in + custom seeds/seasons; save custom ones. */

import { labAuthorized, ok, fail, unauthorized } from '@/lib/lab/http';
import { listSeasons, listSeeds, saveCustomSeason, saveCustomSeed } from '@/lib/lab/seeds';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        return ok({ seeds: listSeeds(), seasons: listSeasons() });
    } catch (error) {
        return fail(error, 500);
    }
}

export async function POST(req: Request) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const body = (await req.json()) as { kind?: 'seed' | 'season'; id?: string; json?: string };
        if (!body.id || !body.json) return fail(new Error('id and json are required'));
        const saved = body.kind === 'season' ? saveCustomSeason(body.id, body.json) : saveCustomSeed(body.id, body.json);
        return ok({ saved });
    } catch (error) {
        return fail(error);
    }
}
