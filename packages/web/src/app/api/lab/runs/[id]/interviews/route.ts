/** 演員訪談室: list / create interview sessions for a run. */

import { labAuthorized, ok, fail, unauthorized } from '@/lib/lab/http';
import { createInterview } from '@/lib/lab/interview/respond';
import { listInterviews } from '@/lib/lab/interview/store';
import type { InterviewMode } from '@/lib/lab/interview/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODES: InterviewMode[] = ['free', 'public', 'private', 'diary'];

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const { id } = await params;
        const characterId = new URL(req.url).searchParams.get('characterId') ?? undefined;
        return ok({ interviews: listInterviews(id, characterId) });
    } catch (error) {
        return fail(error);
    }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const { id } = await params;
        const body = (await req.json()) as {
            characterId?: string;
            tick?: number | 'current' | null;
            mode?: string;
            interviewerIdentity?: string;
        };
        if (!body.characterId) return fail(new Error('characterId is required'));
        const mode = MODES.includes(body.mode as InterviewMode) ? (body.mode as InterviewMode) : 'free';
        const tick = body.tick === 'current' || body.tick === undefined || body.tick === null ? null : Number(body.tick);
        if (tick !== null && !Number.isInteger(tick)) return fail(new Error('tick must be an integer or "current"'));
        const interview = createInterview({
            runId: id,
            characterId: body.characterId,
            tick,
            mode,
            interviewerIdentity: body.interviewerIdentity,
        });
        return ok({ interview });
    } catch (error) {
        return fail(error);
    }
}
