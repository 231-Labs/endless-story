/**
 * GET/POST /api/lab/public/vault — local inventory / layout; sui deep-links to /chamber.
 */

import { ok, fail } from '@/lib/lab/http';
import { getProductPorts } from '@/lib/ports';
import { viewerIdFromRequest } from '@/lib/viewer-id';
import { ensureLocalVaultScaffold } from '@/lib/ports/local';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const ports = getProductPorts();
        if (ports.backend === 'sui') {
            return ok({
                backend: 'sui',
                inventory: [],
                layout: { rooms: [] },
                chainDeepLink: '/chamber',
            });
        }
        const viewerId = viewerIdFromRequest(req);
        ensureLocalVaultScaffold(viewerId);
        const [inventory, layout] = await Promise.all([
            ports.vault.getInventory(viewerId),
            ports.vault.getLayout(viewerId),
        ]);
        return ok({ backend: ports.backend, viewerId, inventory, layout });
    } catch (error) {
        return fail(error, 500);
    }
}

export async function POST(req: Request) {
    try {
        const ports = getProductPorts();
        if (ports.backend === 'sui') {
            return ok({ backend: 'sui', redirected: true, href: '/chamber' });
        }
        const viewerId = viewerIdFromRequest(req);
        const body = (await req.json()) as {
            action: 'add' | 'saveLayout';
            item?: { id: string; title: string; imageUrl?: string };
            layout?: unknown;
        };
        if (body.action === 'add' && body.item) {
            const inventory = await ports.vault.addItem?.(viewerId, body.item);
            return ok({ backend: ports.backend, viewerId, inventory: inventory ?? [] });
        }
        if (body.action === 'saveLayout') {
            await ports.vault.saveLayout?.(viewerId, body.layout ?? { rooms: [] });
            return ok({ backend: ports.backend, viewerId, layout: body.layout ?? { rooms: [] } });
        }
        throw new Error('action required: add | saveLayout');
    } catch (error) {
        return fail(error, 400);
    }
}
