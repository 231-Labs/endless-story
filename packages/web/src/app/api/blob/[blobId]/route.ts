/**
 * Walrus blob proxy — re-emit aggregator response with corrected
 * Content-Type so browsers display text blobs (chapters, gazettes,
 * reflections) instead of treating them as octet-stream gibberish.
 *
 * Why this exists: the public Walrus testnet aggregator returns blobs
 * with `x-content-type-options: nosniff` but no `Content-Type` header.
 * In a browser that means UTF-8 text gets rendered as latin-1 → 中文
 * 變亂碼. We re-fetch server-side and stream back with the right
 * header. Body is still the raw bytes; no transformation.
 *
 * Default content-type is `text/plain; charset=utf-8` which works for
 * markdown chapters too. Override with `?ct=<mime>` if a future
 * consumer needs PNG / JSON / etc — keeps the proxy general.
 */

import { NextResponse } from 'next/server';

// Self-hosted override via NEXT_PUBLIC_WALRUS_AGGREGATOR (e.g. https://walrus.231labs.xyz);
// unset → public testnet aggregator.
const AGGREGATOR_BASE =
    (process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR?.trim().replace(/\/$/, '') ??
        'https://aggregator.walrus-testnet.walrus.space') + '/v1/blobs';

export async function GET(
    req: Request,
    { params }: { params: Promise<{ blobId: string }> },
) {
    const { blobId } = await params;
    if (!blobId || !/^[A-Za-z0-9_-]+$/.test(blobId)) {
        return new NextResponse('invalid blob id', { status: 400 });
    }

    const url = new URL(req.url);
    const contentType = url.searchParams.get('ct') ?? 'text/plain; charset=utf-8';

    let upstream: Response;
    try {
        upstream = await fetch(`${AGGREGATOR_BASE}/${blobId}`, { cache: 'no-store' });
    } catch (err) {
        return new NextResponse(
            `walrus aggregator unreachable: ${err instanceof Error ? err.message : 'unknown'}`,
            { status: 502 },
        );
    }
    if (!upstream.ok) {
        const text = await upstream.text().catch(() => '');
        return new NextResponse(`walrus HTTP ${upstream.status}: ${text.slice(0, 300)}`, {
            status: upstream.status,
        });
    }

    const body = await upstream.arrayBuffer();
    return new NextResponse(body, {
        status: 200,
        headers: {
            'content-type': contentType,
            // Mirror Walrus's own caching cadence — blobs are immutable.
            'cache-control': 'public, max-age=86400',
        },
    });
}
