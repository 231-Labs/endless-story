import { objectUrl } from '@/lib/explorer';
import { fetchChapterText } from '@/lib/chain/pov-read';
import { chaptersApi, charactersApi } from '@/lib/api/index';
import type { GazetteEntry } from '@/lib/api/gazettes';
import { rewriteGazettePovLinks } from '@/lib/feed/gazette-links';
import { Markdown } from '@/components/common/Markdown';
import { isValidWalrusBlobId } from '@endless-story/shared';

/**
 * Full list of gazettes for a saga, newest first. Each entry expands
 * inline — gazettes are short enough to read in place without a
 * dedicated detail page.
 */
export async function GazetteList({
    gazettes,
    sagaName,
    sagaId,
}: {
    gazettes: GazetteEntry[];
    sagaName: string;
    sagaId: string;
}) {
    if (gazettes.length === 0) {
        return (
            <div className="es-card p-12 text-center">
                <p className="font-serif text-base text-ink">{sagaName} 還沒出過公報</p>
                <p className="mt-3 text-sm leading-relaxed text-mute">
                    公報是班主不定期張貼的園中大事節錄，發行後會永久上鏈存證。
                    先去「文字連載」讀角色們的章回吧。
                </p>
            </div>
        );
    }

    // Resolve full markdown for each gazette in parallel.
    const [bodies, chapters, characters] = await Promise.all([
        Promise.all(gazettes.map((g) => fetchBody(g.blobId))),
        chaptersApi.listChapters(sagaId).catch(() => []),
        charactersApi.listSagaCharacters(sagaId).catch(() => []),
    ]);
    const characterNamesById = new Map(characters.map((c) => [c.id, c.name]));

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
                        <Markdown
                            source={rewriteGazettePovLinks(
                                bodies[i],
                                chapters,
                                Number(g.committedAtMs),
                                characterNamesById,
                            )}
                            className="mt-6"
                        />
                    ) : (
                        <p className="mt-6 text-sm text-mute">— 公報內容暫時無法讀取 —</p>
                    )}
                </article>
            ))}
        </div>
    );
}

async function fetchBody(blobId: string): Promise<string> {
    if (!isValidWalrusBlobId(blobId)) return '';
    try {
        // Immutable blob → shared hard cache (same entry the list scan peeked).
        return await fetchChapterText(`/api/blob/${blobId}`);
    } catch {
        return '';
    }
}
