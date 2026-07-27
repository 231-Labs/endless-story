/**
 * GET/POST /api/lab/public/recruitment — open campaigns + local follow-join.
 */

import { ok, fail } from '@/lib/lab/http';
import { getProductPorts } from '@/lib/ports';
import { viewerIdFromRequest } from '@/lib/viewer-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const ports = getProductPorts();
        const campaigns = await ports.recruitment.listOpenCampaigns();
        return ok({
            backend: ports.backend,
            campaigns,
            chainDeepLink: ports.backend === 'sui' ? '/dossier' : null,
        });
    } catch (error) {
        return fail(error, 500);
    }
}

export async function POST(req: Request) {
    try {
        const ports = getProductPorts();
        if (ports.backend === 'sui') {
            return ok({
                backend: 'sui',
                redirected: true,
                href: '/dossier',
                message: '鏈上入班請走名冊徵召',
            });
        }
        const viewerId = viewerIdFromRequest(req);
        const body = (await req.json()) as { campaignId?: string; characterId?: string };
        const campaignId = body.campaignId ?? 'follow-cast';
        const result = await ports.recruitment.join?.(viewerId, campaignId, {
            characterId: body.characterId,
        });
        return ok({ backend: ports.backend, viewerId, ...result });
    } catch (error) {
        return fail(error, 400);
    }
}
