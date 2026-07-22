/**
 * 演員訪談室: one character's state at a moment, split into the two halves —
 * `known` (角色可知 — the ONLY material prompts are built from) and
 * `directorOnly` (僅導演可見 — never enters a prompt).
 */

import { labAuthorized, ok, fail, unauthorized } from '@/lib/lab/http';
import { buildInterviewContext, panelMemoriesOf } from '@/lib/lab/interview/context';
import type { InterviewSnapshotView } from '@/lib/lab/interview/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const { id } = await params;
        const url = new URL(req.url);
        const characterId = url.searchParams.get('characterId');
        if (!characterId) return fail(new Error('characterId is required'));
        const tickRaw = url.searchParams.get('tick');
        const tick = tickRaw === null || tickRaw === '' || tickRaw === 'current' ? null : Number(tickRaw);
        if (tick !== null && !Number.isInteger(tick)) return fail(new Error('tick must be an integer or "current"'));

        const context = await buildInterviewContext(id, characterId, tick, '');
        // 面板初覽用「記憶帳近況」取代按問召回（尚未有問題可召）。
        const view: InterviewSnapshotView = {
            momentLabel: context.moment.momentLabel,
            tick: context.moment.tick,
            known: {
                ...context.known,
                memories: panelMemoriesOf(id, characterId, tick !== null ? context.moment.day : null).map((m) => ({
                    seq: m.seq,
                    day: m.day,
                    kind: m.kind,
                    importance: m.importance,
                    text: m.content,
                })),
            },
            directorOnly: context.directorOnly,
        };
        return ok(view);
    } catch (error) {
        return fail(error);
    }
}
