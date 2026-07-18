/** Serve a harness-written self-contained HTML report (e.g. report.html). */

import { NextResponse } from 'next/server';
import { labAuthorized, unauthorized } from '@/lib/lab/http';
import { readRepoReportHtml } from '@/lib/lab/exhibits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const rel = new URL(req.url).searchParams.get('path');
        if (!rel) return NextResponse.json({ error: 'path is required' }, { status: 400 });
        return new NextResponse(readRepoReportHtml(rel), {
            headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, max-age=60' },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: message }, { status: 404 });
    }
}
