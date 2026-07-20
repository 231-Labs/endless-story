/** 診斷導出 — one self-contained, AI-readable Markdown file for the whole run. */

import { labAuthorized, fail, unauthorized } from '@/lib/lab/http';
import { buildRunDiagnostics } from '@/lib/lab/export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function stamp(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    if (!labAuthorized(req)) return unauthorized();
    try {
        const { id } = await params;
        const md = buildRunDiagnostics(id);
        return new Response(md, {
            headers: {
                'Content-Type': 'text/markdown; charset=utf-8',
                'Content-Disposition': `attachment; filename="endless-story-${id}-${stamp()}.md"`,
            },
        });
    } catch (error) {
        return fail(error, 500);
    }
}
