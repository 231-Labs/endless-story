/** Run control: step / run N ticks / pause / fork. */

import { labAuthorized, ok, fail, unauthorized } from '@/lib/lab/http';
import { labManager } from '@/lib/lab/manager';
import { forkRun } from '@/lib/lab/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ControlBody {
    action: 'step' | 'run' | 'pause' | 'fork' | 'open';
    ticks?: number;
    title?: string;
    note?: string;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const { id } = await params;
        const body = (await req.json()) as ControlBody;
        const manager = labManager();
        switch (body.action) {
            case 'open': {
                await manager.open(id);
                return ok({ opened: id });
            }
            case 'step': {
                await manager.requestTicks(id, 1);
                return ok({ queued: 1 });
            }
            case 'run': {
                const ticks = Number.isInteger(body.ticks) && (body.ticks as number) > 0
                    ? Math.min(body.ticks as number, 600)
                    : 6;
                await manager.requestTicks(id, ticks);
                return ok({ queued: ticks });
            }
            case 'pause': {
                manager.pause(id);
                return ok({ paused: id });
            }
            case 'fork': {
                manager.assertIdle(id);
                const meta = forkRun(id, {
                    title: body.title?.trim() || `fork of ${id}`,
                    note: body.note,
                });
                return ok({ meta }, 201);
            }
            default:
                return fail(new Error(`unknown action: ${(body as { action?: string }).action}`));
        }
    } catch (error) {
        return fail(error);
    }
}
