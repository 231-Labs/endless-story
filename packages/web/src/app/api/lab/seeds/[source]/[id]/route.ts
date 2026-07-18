/** Raw seed / season JSON (for the 劇本館 editor). ?kind=season reads the
 *  seasons dir; default reads the stories/seeds dir. */

import { labAuthorized, ok, fail, unauthorized } from '@/lib/lab/http';
import { readSeasonText, readSeedText } from '@/lib/lab/seeds';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
    req: Request,
    { params }: { params: Promise<{ source: string; id: string }> },
) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const { source, id } = await params;
        if (source !== 'builtin' && source !== 'custom') return fail(new Error('source must be builtin|custom'));
        const kind = new URL(req.url).searchParams.get('kind') === 'season' ? 'season' : 'seed';
        const json = kind === 'season' ? readSeasonText(source, id) : readSeedText(source, id);
        return ok({ id, source, kind, json });
    } catch (error) {
        return fail(error, 404);
    }
}
