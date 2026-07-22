/** 演員訪談室: one interview session — detail / 清除本次訪談. */

import { labAuthorized, ok, fail, unauthorized } from '@/lib/lab/http';
import { deleteInterview, readInterview, readMarks } from '@/lib/lab/interview/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string; sid: string }> }) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const { id, sid } = await params;
        const interview = readInterview(id, sid);
        if (!interview) return fail(new Error(`interview not found: ${sid}`), 404);
        return ok({ interview, marks: readMarks(id, sid) });
    } catch (error) {
        return fail(error);
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; sid: string }> }) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const { id, sid } = await params;
        deleteInterview(id, sid);
        return ok({ deleted: sid });
    } catch (error) {
        return fail(error);
    }
}
