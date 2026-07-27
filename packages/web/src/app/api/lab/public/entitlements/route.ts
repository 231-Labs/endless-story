/**
 * GET/POST /api/lab/public/entitlements — follow + subscribe via product ports.
 * Header X-Viewer-Id identifies the guest (local backend).
 */

import { ok, fail } from '@/lib/lab/http';
import { getProductPorts } from '@/lib/ports';
import { viewerIdFromRequest } from '@/lib/viewer-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const ports = getProductPorts();
        const viewerId = viewerIdFromRequest(req);
        const subscriptions = ports.entitlement.listSubscriptions
            ? await ports.entitlement.listSubscriptions(viewerId)
            : [];
        const follows = ports.entitlement.listFollows ? await ports.entitlement.listFollows(viewerId) : [];
        return ok({
            backend: ports.backend,
            viewerId,
            subscriptions,
            follows,
            chainDeepLinks:
                ports.backend === 'sui'
                    ? { subscriptions: '/subscriptions', dossier: '/dossier' }
                    : null,
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
                href: '/subscriptions',
                message: '鏈上訂閱請走既有訂閱頁',
            });
        }
        const viewerId = viewerIdFromRequest(req);
        const body = (await req.json()) as {
            action: 'follow' | 'unfollow' | 'subscribe' | 'unsubscribe';
            characterId: string;
        };
        if (!body?.characterId || !body?.action) throw new Error('action and characterId required');
        const { action, characterId } = body;
        if (action === 'follow') await ports.entitlement.follow?.(viewerId, characterId);
        else if (action === 'unfollow') await ports.entitlement.unfollow?.(viewerId, characterId);
        else if (action === 'subscribe') await ports.entitlement.subscribe?.(viewerId, characterId);
        else if (action === 'unsubscribe') await ports.entitlement.unsubscribe?.(viewerId, characterId);
        else throw new Error(`unknown action: ${action}`);

        const subscriptions = ports.entitlement.listSubscriptions
            ? await ports.entitlement.listSubscriptions(viewerId)
            : [];
        const follows = ports.entitlement.listFollows ? await ports.entitlement.listFollows(viewerId) : [];
        return ok({ backend: ports.backend, viewerId, subscriptions, follows });
    } catch (error) {
        return fail(error, 400);
    }
}
