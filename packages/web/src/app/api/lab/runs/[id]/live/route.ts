/** Live snapshot — the handscroll's polling feed. ?after=<seq> returns only
 *  newer beats; the full world projection is always included (it is small). */

import { labAuthorized, ok, fail, unauthorized } from '@/lib/lab/http';
import { buildLiveSnapshot } from '@/lib/lab/live';
import { labManager } from '@/lib/lab/manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const { id } = await params;
        // 活著卷的常駐輪詢點——伺服器重啟後 registry 是空的，這裡順手重臂
        // （lazy 重臂，見 manager.armIfAlive）；null-safe，非 alive 卷是無感的。
        labManager().armIfAlive(id);
        const after = Number(new URL(req.url).searchParams.get('after') ?? '0');
        const snapshot = await buildLiveSnapshot(id, Number.isFinite(after) ? after : 0);
        return ok(snapshot);
    } catch (error) {
        return fail(error, 404);
    }
}
