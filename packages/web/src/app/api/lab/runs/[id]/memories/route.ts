/** 記憶編輯: list / add / forget one character's LocalRecall memories. */

import { labAuthorized, ok, fail, unauthorized } from '@/lib/lab/http';
import { addRunMemory, forgetRunMemory, listRunMemories } from '@/lib/lab/memories';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const { id } = await params;
        const characterId = new URL(req.url).searchParams.get('characterId');
        if (!characterId) return fail(new Error('characterId is required'));
        return ok({ memories: listRunMemories(id, characterId) });
    } catch (error) {
        return fail(error);
    }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const { id } = await params;
        const body = (await req.json()) as
            | { op: 'add'; characterId?: string; text?: string; kind?: string; importance?: number }
            | { op: 'forget'; characterId?: string; seq?: number };
        if (!body.characterId) return fail(new Error('characterId is required'));
        if (body.op === 'add') {
            if (!body.text?.trim()) return fail(new Error('text is required'));
            const memories = await addRunMemory(id, {
                characterId: body.characterId,
                text: body.text,
                kind: body.kind,
                importance: body.importance,
            });
            return ok({ memories });
        }
        if (body.op === 'forget') {
            if (typeof body.seq !== 'number') return fail(new Error('seq is required'));
            return ok({ memories: forgetRunMemory(id, body.characterId, body.seq) });
        }
        return fail(new Error('op must be add|forget'));
    } catch (error) {
        return fail(error);
    }
}
