/** 展覽室 API: repo reports + uploaded exhibits + orphan-run adoption. */

import { labAuthorized, ok, fail, unauthorized } from '@/lib/lab/http';
import {
    deleteUploadedExhibit,
    listRepoReports,
    listUploadedExhibits,
    readRepoCastState,
    readRepoReport,
    readUploadedExhibit,
    saveUploadedExhibit,
} from '@/lib/lab/exhibits';
import { adoptRun, listOrphanRuns } from '@/lib/lab/import';
import { reviveFromCastState, type CastStateFile } from '@/lib/lab/revive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const url = new URL(req.url);
        const report = url.searchParams.get('report');
        if (report) return ok({ content: readRepoReport(report) });
        const upload = url.searchParams.get('upload');
        if (upload) return ok({ content: readUploadedExhibit(upload) });
        return ok({
            reports: listRepoReports(),
            uploads: listUploadedExhibits(),
            orphans: listOrphanRuns(),
        });
    } catch (error) {
        return fail(error, 404);
    }
}

export async function POST(req: Request) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const body = (await req.json()) as
            | { kind: 'upload'; id?: string; markdown?: string }
            | { kind: 'adopt'; dir?: string; title?: string; note?: string }
            | { kind: 'revive'; castStateRel?: string; json?: string; title?: string; presetId?: string; llm?: 'fake' | 'real' };
        if (body.kind === 'upload') {
            if (!body.id || !body.markdown) return fail(new Error('id and markdown are required'));
            return ok({ saved: saveUploadedExhibit(body.id, body.markdown) }, 201);
        }
        if (body.kind === 'adopt') {
            if (!body.dir) return fail(new Error('dir is required'));
            return ok({ meta: adoptRun(body.dir, body.title, body.note) }, 201);
        }
        if (body.kind === 'revive') {
            if (!body.title?.trim()) return fail(new Error('title is required'));
            const text = body.castStateRel ? readRepoCastState(body.castStateRel) : body.json;
            if (!text) return fail(new Error('castStateRel or json is required'));
            const castState = JSON.parse(text) as CastStateFile;
            const meta = await reviveFromCastState({
                castState,
                title: body.title,
                presetId: body.presetId,
                llm: body.llm,
                sourceLabel: body.castStateRel ?? '貼上之 cast-state',
            });
            return ok({ meta }, 201);
        }
        return fail(new Error('kind must be upload|adopt|revive'));
    } catch (error) {
        return fail(error);
    }
}

export async function DELETE(req: Request) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const upload = new URL(req.url).searchParams.get('upload');
        if (!upload) return fail(new Error('upload id is required'));
        deleteUploadedExhibit(upload);
        return ok({ deleted: upload });
    } catch (error) {
        return fail(error);
    }
}
