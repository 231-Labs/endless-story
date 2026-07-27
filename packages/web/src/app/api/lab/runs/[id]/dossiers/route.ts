/** Event dossiers — the objective/subjective anthology compiled per event. */

import { ok, fail, unauthorized } from '@/lib/lab/http';
import { canReadRun } from '@/lib/lab/run-access';
import { listDossiers, readDossier, readEditorial } from '@/lib/lab/artifacts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        if (!canReadRun(req, id)) return unauthorized();
        const slug = new URL(req.url).searchParams.get('slug');
        if (slug) {
            const dossier = readDossier(id, slug);
            if (!dossier) return fail(new Error(`dossier not found: ${slug}`), 404);
            return ok(dossier);
        }
        return ok({ dossiers: listDossiers(id), editorial: readEditorial(id) });
    } catch (error) {
        return fail(error, 500);
    }
}
