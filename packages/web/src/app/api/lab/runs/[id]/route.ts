/** One run: detail, rename/note, delete. */

import { labAuthorized, ok, fail, unauthorized } from '@/lib/lab/http';
import { labManager } from '@/lib/lab/manager';
import { deleteRun, readRunMeta, readRunStatus, updateRunNote } from '@/lib/lab/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const { id } = await params;
        const meta = readRunMeta(id);
        if (!meta) return fail(new Error(`run not found: ${id}`), 404);
        const active = labManager().get(id);
        return ok({
            meta,
            status: readRunStatus(id),
            phase: active?.phase ?? 'idle',
            pendingTicks: active?.pendingTicks ?? 0,
            lastError: active?.lastError,
            provider: active?.provider,
            model: active?.model,
        });
    } catch (error) {
        return fail(error, 500);
    }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const { id } = await params;
        const body = (await req.json()) as { title?: string; note?: string };
        return ok({ meta: updateRunNote(id, body) });
    } catch (error) {
        return fail(error);
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const { id } = await params;
        const manager = labManager();
        manager.assertIdle(id);
        manager.close(id);
        deleteRun(id);
        return ok({ deleted: id });
    } catch (error) {
        return fail(error);
    }
}
