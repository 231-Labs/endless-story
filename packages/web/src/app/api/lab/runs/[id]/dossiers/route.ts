/** Event dossiers — the objective/subjective anthology compiled per event. */

import { labAuthorized, ok, fail, unauthorized } from '@/lib/lab/http';
import { listDossiers, readDossier, readEditorial } from '@/lib/lab/artifacts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const { id } = await params;
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
