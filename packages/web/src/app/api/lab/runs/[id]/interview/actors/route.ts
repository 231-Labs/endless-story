/** 演員訪談室: the run's actor roster (劇院演員名錄口徑). */

import { labAuthorized, ok, fail, unauthorized } from '@/lib/lab/http';
import { listActorCards } from '@/lib/lab/interview/actors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const { id } = await params;
        return ok({ actors: listActorCards(id) });
    } catch (error) {
        return fail(error);
    }
}
