/** Raw seed JSON (for the seed editor). */

import { labAuthorized, ok, fail, unauthorized } from '@/lib/lab/http';
import { readSeedText } from '@/lib/lab/seeds';

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
        return ok({ id, source, json: readSeedText(source, id) });
    } catch (error) {
        return fail(error, 404);
    }
}
