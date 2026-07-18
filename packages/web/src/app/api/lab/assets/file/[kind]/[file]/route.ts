/** Serve a stored lab asset (image bytes). */

import { NextResponse } from 'next/server';
import { labAuthorized, unauthorized } from '@/lib/lab/http';
import { isAssetKind, readAssetFile } from '@/lib/lab/assets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
    req: Request,
    { params }: { params: Promise<{ kind: string; file: string }> },
) {
    if (!labAuthorized(req)) return unauthorized();
    const { kind, file } = await params;
    const decoded = decodeURIComponent(file);
    if (!isAssetKind(kind)) return NextResponse.json({ error: 'bad kind' }, { status: 400 });
    const asset = readAssetFile(kind, decoded);
    if (!asset) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return new NextResponse(new Uint8Array(asset.bytes), {
        headers: {
            'content-type': asset.mime,
            // content is name-addressed and replaced in place; short private cache
            'cache-control': 'private, max-age=60',
        },
    });
}
