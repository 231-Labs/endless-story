/** GET /api/lab/role — whether the current request is director or viewer. */

import { ok, labRole } from '@/lib/lab/http';
import { resolvePublicConfig } from '@/lib/lab/public-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const role = labRole(req);
    const pub = resolvePublicConfig();
    return ok({
        role: role === 'director' ? 'director' : 'viewer',
        director: role === 'director',
        publicRunId: pub.runId,
        brand: pub.brand,
        featuredCastNames: pub.featuredCastNames,
    });
}
