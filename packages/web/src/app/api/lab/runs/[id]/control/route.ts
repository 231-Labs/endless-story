/** Run control: step / run N ticks / pause / fork / 活著 / 捎話. */

import { labAuthorized, ok, fail, unauthorized } from '@/lib/lab/http';
import { queueStimulus } from '@/lib/lab/interludes';
import { labManager } from '@/lib/lab/manager';
import { forkRun, setRunAlive } from '@/lib/lab/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ControlBody {
    action: 'step' | 'run' | 'pause' | 'fork' | 'open' | 'alive' | 'stimulus';
    ticks?: number;
    title?: string;
    note?: string;
    /** alive only. */
    on?: boolean;
    /** stimulus only — 捎話對象與內容。 */
    characterId?: string;
    text?: string;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const { id } = await params;
        const body = (await req.json()) as ControlBody;
        const manager = labManager();
        // 任何 control 呼叫都算「觸及這一卷」——伺服器重啟後的 lazy 重臂就靠這裡
        // （與 live 輪詢那一路同一套，見 AGENT_WAKE_LAYER 附錄 A）。null-safe：卷
        // 不存在或不是活著的 mirror 卷就什麼都不做。
        manager.armIfAlive(id);
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
            case 'alive': {
                const meta = setRunAlive(id, body.on === true);
                manager.armIfAlive(id); // on→掛上巡佇列；off→摘下（都冪等）
                return ok({ meta });
            }
            case 'stimulus': {
                if (!body.characterId) throw new Error('捎話需要指名一位角色');
                if (!body.text?.trim()) throw new Error('捎話不能是空的');
                const outcome = queueStimulus(id, body.characterId, body.text);
                return ok(outcome);
            }
            default:
                return fail(new Error(`unknown action: ${(body as { action?: string }).action}`));
        }
    } catch (error) {
        return fail(error);
    }
}
