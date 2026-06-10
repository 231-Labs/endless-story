import { walrusAggregatorUrl } from '@endless-story/shared';
import { objectUrl } from '@/lib/explorer';
import type { GazetteEntry } from '@/lib/api/gazettes';
import { Markdown } from '@/components/common/Markdown';

/**
 * Full list of gazettes for a saga, newest first. Each entry expands
 * inline — gazettes are short enough to read in place without a
 * dedicated detail page.
 */
export async function GazetteList({
    gazettes,
    sagaName,
}: {
    gazettes: GazetteEntry[];
    sagaName: string;
}) {
    if (gazettes.length === 0) {
        return (
            <div className="rounded-3xl border border-hairline/50 bg-surface/40 p-12 text-center backdrop-blur-sm">
                <p className="font-serif text-base text-ink">{sagaName} 還沒出過公報</p>
                <p className="mt-3 text-sm leading-relaxed text-mute">
                    要等班主在管理後台「編公報並上鏈」按下後，這裡才會有內容。
                </p>
            </div>
        );
    }

    // Resolve full markdown for each gazette in parallel.
    const bodies = await Promise.all(gazettes.map((g) => fetchBody(g.blobId)));

    return (
        <div className="space-y-8">
            {gazettes.map((g, i) => (
                <article
                    key={g.commitmentId}
                    className="rounded-3xl border border-hairline/60 bg-surface/40 p-6 backdrop-blur-sm sm:p-10"
                >
                    <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 text-2xs tracking-widest text-mute/80">
                        <span>
                            {new Date(Number(g.committedAtMs)).toLocaleString('zh-TW', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                            })}
                        </span>
                        <span className="flex items-center gap-4">
                            <a
                                href={objectUrl(g.commitmentId)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-cinnabar"
                            >
                                上鏈紀錄 ↗
                            </a>
                            <a
                                href={`/api/blob/${g.blobId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-cinnabar"
                            >
                                原文 ↗
                            </a>
                        </span>
                    </header>
                    {bodies[i] ? (
                        <Markdown source={bodies[i]} className="mt-6" />
                    ) : (
                        <p className="mt-6 text-sm text-mute">— 公報內容暫時無法讀取 —</p>
                    )}
                </article>
            ))}
        </div>
    );
}

async function fetchBody(blobId: string): Promise<string> {
    try {
        const res = await fetch(walrusAggregatorUrl(blobId, { network: 'testnet' }), {
            cache: 'no-store',
        });
        return res.ok ? await res.text() : '';
    } catch {
        return '';
    }
}
