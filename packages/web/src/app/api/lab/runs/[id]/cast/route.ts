/** 中途入場: join one character to a live run (idle only, snapshot immediately). */

import { labAuthorized, ok, fail, unauthorized } from '@/lib/lab/http';
import { joinCastToRun } from '@/lib/lab/join-cast';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const { id } = await params;
        const body = (await req.json()) as {
            name?: string;
            description?: string;
            secret?: string;
            gender?: string;
            ageYears?: number;
            role?: string;
            homeScene?: string;
            workScene?: string;
            arrivalScene?: string;
            memories?: string[];
            arrivalNote?: string;
            ties?: Array<{ target?: string; tone?: string; toneBack?: string; view?: string; viewBack?: string; warmth?: number }>;
        };
        if (!body.name?.trim()) return fail(new Error('入場之人要有名字'));
        if (!body.description?.trim()) return fail(new Error('要有身分描述'));
        if (!body.homeScene || !body.workScene) return fail(new Error('落腳（home）與日常（work）場景都要選'));
        const joined = await joinCastToRun(id, {
            name: body.name,
            description: body.description,
            secret: body.secret,
            gender: body.gender,
            ageYears: typeof body.ageYears === 'number' ? body.ageYears : undefined,
            role: body.role,
            homeScene: body.homeScene,
            workScene: body.workScene,
            arrivalScene: body.arrivalScene,
            memories: Array.isArray(body.memories) ? body.memories.filter((m): m is string => typeof m === 'string') : undefined,
            arrivalNote: body.arrivalNote,
            ties: Array.isArray(body.ties)
                ? body.ties
                    .filter((t): t is typeof t & { target: string } => typeof t?.target === 'string' && t.target.trim() !== '')
                    .map((t) => ({
                        target: t.target,
                        tone: t.tone,
                        toneBack: t.toneBack,
                        view: t.view,
                        viewBack: t.viewBack,
                        warmth: typeof t.warmth === 'number' ? t.warmth : undefined,
                    }))
                : undefined,
        });
        return ok({ joined });
    } catch (error) {
        return fail(error);
    }
}
