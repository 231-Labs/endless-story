/** World-physics config: read + edit (idle runs only). */

import { labAuthorized, ok, fail, unauthorized } from '@/lib/lab/http';
import { applyWorldConfigOp, readWorldConfig, type WorldConfigOp } from '@/lib/lab/world-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const { id } = await params;
        return ok({ config: readWorldConfig(id) });
    } catch (error) {
        return fail(error, 404);
    }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const { id } = await params;
        const operation = (await req.json()) as WorldConfigOp;
        return ok({ config: applyWorldConfigOp(id, operation) });
    } catch (error) {
        return fail(error);
    }
}
