import Link from 'next/link';
import type { GazetteEntry } from '@/lib/api/gazettes';
import { fetchTensionHeadline } from '@/lib/chain/drama';
import { fetchChapterText } from '@/lib/chain/pov-read';
import { cachedPublicRead, publicChainReadTtl } from '@/lib/chain/read-cache';

/**
 * Slim teaser shown at the top of /feed?mode=all when a gazette exists.
 * Click → /feed?mode=gazette to read full.
 *
 * Server-rendered: we fetch the first paragraph of the gazette markdown
 * directly from Walrus (free public plot content) PLUS a live, LLM-free
 * "current tension" headline (the top contested resources right now) — so a
 * not-yet-onboarded reader can see at a glance where the heat is and read
 * some story for free, the top of the subscribe funnel.
 */
export async function GazetteTeaser({
    gazette,
    sagaName,
    sagaId,
}: {
    gazette: GazetteEntry;
    sagaName: string;
    sagaId: string;
}) {
    const [excerpt, tension] = await Promise.all([
        fetchExcerpt(gazette.blobId),
        // The "current tension" headline re-derives the whole drama state from
        // chain events — fine once a minute, far too heavy per page view. SWR:
        // a rollover serves the old headline and refreshes in the background.
        cachedPublicRead(
            `drama:headline:${sagaId}`,
            publicChainReadTtl(60_000),
            () => fetchTensionHeadline(sagaId).catch(() => null),
            { staleTtlMs: 10 * 60 * 1000 },
        ),
    ]);
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
                {tension ? (
                    <p className="mb-2 text-2xs tracking-widest text-cinnabar/90">
                        此刻張力 · {tension}
                    </p>
                ) : null}
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
        // Shared immutable-blob cache — the gazette list renders the same body,
        // so the teaser's excerpt is free after the first fetch.
        const text = await fetchChapterText(`/api/blob/${blobId}`);
        return stripMarkdown(text).slice(0, 140).trim();
    } catch {
        return '';
    }
}

/**
 * Tiny markdown-to-plain-text for inline teasers. The teaser is a
 * single short line so we can't render full markdown — drop the
 * markup characters and collapse whitespace.
 */
function stripMarkdown(md: string): string {
    return md
        // Remove any heading lines entirely (we don't want the gazette header in the teaser)
        .replace(/^#+\s.*$/gm, '')
        // Remove list markers
        .replace(/^[\s]*[-*·]\s+/gm, '')
        // Remove link wrappers [text](url) → text
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        // Remove emphasis markers
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        // Collapse whitespace
        .replace(/\s+/g, ' ')
        .trim();
}

