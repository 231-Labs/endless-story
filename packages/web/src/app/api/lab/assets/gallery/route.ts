/** Serve a gallery media file (image or video, with range-friendly headers). */

import { NextResponse } from 'next/server';
import { labAuthorized, unauthorized } from '@/lib/lab/http';
import { isAssetKind, readGalleryFile } from '@/lib/lab/assets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    if (!labAuthorized(req)) return unauthorized();
    const url = new URL(req.url);
    const kind = url.searchParams.get('kind') ?? '';
    const key = url.searchParams.get('key') ?? '';
    const file = url.searchParams.get('file') ?? '';
    if (!isAssetKind(kind) || !key || !file) return NextResponse.json({ error: 'bad ref' }, { status: 400 });
    const media = readGalleryFile(kind, decodeURIComponent(key), decodeURIComponent(file));
    if (!media) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return new NextResponse(new Uint8Array(media.bytes), {
        headers: {
            'content-type': media.mime,
            'content-length': String(media.bytes.length),
            'accept-ranges': 'bytes',
            'cache-control': 'private, max-age=300',
        },
    });
}
