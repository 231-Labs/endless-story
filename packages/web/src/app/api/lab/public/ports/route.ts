/** GET /api/lab/public/ports — which product backend is active (debug / UI). */

import { ok } from '@/lib/lab/http';
import { getProductPorts } from '@/lib/ports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
    const ports = getProductPorts();
    return ok({ backend: ports.backend });
}
