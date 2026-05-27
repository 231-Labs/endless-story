import Link from 'next/link';
import type { GazetteEntry } from '@/lib/api/gazettes';

/**
 * Slim teaser shown at the top of /feed?mode=all when a gazette exists.
 * Click → /feed?mode=gazette to read full.
 *
 * Server-rendered: we fetch the first paragraph of the gazette
 * markdown directly from Walrus so the teaser shows real prose, not
 * a generic placeholder.
 */
export async function GazetteTeaser({
    gazette,
    sagaName,
}: {
    gazette: GazetteEntry;
    sagaName: string;
}) {
    const excerpt = await fetchExcerpt(gazette.blobId);
    return (
        <Link
            href="/feed?mode=gazette"
            className="group flex flex-col gap-3 rounded-3xl border border-cinnabar/30 bg-gradient-to-br from-surface/80 to-cinnabar/[0.03] p-6 backdrop-blur-sm transition-all duration-300 hover:border-cinnabar/60 hover:shadow-sm sm:flex-row sm:items-center sm:gap-6 sm:p-8"
        >
            <div className="shrink-0 sm:w-32">
                <div className="text-2xs tracking-[0.3em] text-cinnabar/80">今日公報</div>
                <div className="mt-1 font-serif text-base text-ink">{sagaName}</div>
            </div>
            <div className="min-w-0 flex-1">
                <p className="line-clamp-2 max-w-prose font-serif text-sm leading-loose text-ink/85 sm:text-base">
                    {excerpt || '— 公報內容載入中 —'}
                </p>
                <p className="mt-3 text-2xs tracking-widest text-cinnabar transition-colors group-hover:underline">
                    閱讀完整公報 ❯
                </p>
            </div>
        </Link>
    );
}

async function fetchExcerpt(blobId: string): Promise<string> {
    try {
        const res = await fetch(
            `https://aggregator.walrus-testnet.walrus.space/v1/blobs/${blobId}`,
            { cache: 'no-store' },
        );
        if (!res.ok) return '';
        const text = await res.text();
        // Strip markdown title line + first blank, take next ~120 chars
        // of body for the teaser.
        const body = text.replace(/^#[^\n]*\n+/, '').trim();
        return body.slice(0, 140).replace(/\s+/g, ' ').trim();
    } catch {
        return '';
    }
}

