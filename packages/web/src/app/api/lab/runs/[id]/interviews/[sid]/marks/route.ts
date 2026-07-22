/** 演員訪談室: 內容候選標記 — list / add marks on one interview's answers. */

import { labAuthorized, ok, fail, unauthorized } from '@/lib/lab/http';
import { addMark, readMarks } from '@/lib/lab/interview/store';
import type { InterviewMarkKind } from '@/lib/lab/interview/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS: InterviewMarkKind[] = [
    'public_note',
    'private_diary',
    'clip_line',
    'third_person_video',
    'character_memory',
    'needs_edit',
    'out_of_character',
];

export async function GET(req: Request, { params }: { params: Promise<{ id: string; sid: string }> }) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const { id, sid } = await params;
        return ok({ marks: readMarks(id, sid) });
    } catch (error) {
        return fail(error);
    }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string; sid: string }> }) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const { id, sid } = await params;
        const body = (await req.json()) as { messageId?: string; kind?: string; note?: string };
        if (!body.messageId) return fail(new Error('messageId is required'));
        if (!KINDS.includes(body.kind as InterviewMarkKind)) return fail(new Error('unknown mark kind'));
        const marks = addMark(id, sid, {
            messageId: body.messageId,
            kind: body.kind as InterviewMarkKind,
            note: body.note,
        });
        return ok({ marks });
    } catch (error) {
        return fail(error);
    }
}
