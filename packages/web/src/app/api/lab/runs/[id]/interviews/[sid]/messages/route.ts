/**
 * 演員訪談室: ask one question (or invite one diary entry). The whole round —
 * context assembly → percept → shadow-session respond → deterministic
 * precheck → cheap-model evaluation — runs server-side; the client only ever
 * sends the question text.
 */

import { labAuthorized, ok, fail, unauthorized } from '@/lib/lab/http';
import { postInterviewQuestion } from '@/lib/lab/interview/respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string; sid: string }> }) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const { id, sid } = await params;
        const body = (await req.json()) as { question?: string };
        const round = await postInterviewQuestion(id, sid, body.question ?? '');
        return ok(round);
    } catch (error) {
        return fail(error);
    }
}
