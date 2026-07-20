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
        // HTTP headers are Latin-1 (ByteString): a run id may carry CJK (its title
        // is slugified keeping \p{L}), so the raw name can't go straight into
        // Content-Disposition. Give an ASCII-only `filename` fallback plus an
        // RFC 5987 `filename*` UTF-8 name so browsers still get the full name.
        const rawName = `endless-story-${id}-${stamp()}.md`;
        const asciiName = rawName.replace(/[^\x20-\x7E]/g, '-').replace(/["\\]/g, '-');
        return new Response(md, {
            headers: {
                'Content-Type': 'text/markdown; charset=utf-8',
                'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(rawName)}`,
            },
        });
    } catch (error) {
        return fail(error, 500);
    }
}
