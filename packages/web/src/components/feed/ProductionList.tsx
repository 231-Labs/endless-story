import Link from 'next/link';
import { production } from '@endless-story/runner';
import type { ProductionEntry } from '@/lib/api/productions';
import { fetchChapterText } from '@/lib/chain/pov-read';
import { parseXiZhe, xiZheExcerpt } from '@/lib/feed/xizhe-format';

/**
 * Production list — the 戲折 (whole staged 劇目), newest first. Card = metadata +
 * a short excerpt; the full 戲折 prose (班底·分場·折子戲中戲章回·角兒私詞) lives
 * on /feed/production/[id]. Bodies come through the immutable-blob cache.
 * See docs/narrative/PRODUCTION_ENGINE.md §10.
 */
export async function ProductionList({
    productions,
    sagaName,
}: {
    productions: ProductionEntry[];
    sagaName: string;
}) {
    if (productions.length === 0) {
        return (
            <div className="es-card px-8 py-20 text-center">
                <p className="font-serif text-lg tracking-wide text-ink/80">{sagaName} 尚未排戲</p>
                <p className="mt-2 text-sm tracking-wide text-mute/70">
                    待班主排一齣新戲，戲班自編自演的戲折便會在此連載。
                </p>
            </div>
        );
    }

    const raws = await Promise.all(
        productions.map((p) => fetchChapterText(p.blobUrl).catch(() => '')),
    );

    return (
        <div className="space-y-6">
            {productions.map((p, i) => {
                const { body } = production.parseProductionHeader((raws[i] ?? '').trim());
                const doc = parseXiZhe(body);
                const title = doc.title ?? p.title ?? '一齣新戲';
                const excerpt = xiZheExcerpt(doc, 96);
                const castNames = doc.cast.map((c) => c.actor).filter((n): n is string => !!n);
                return (
                    <Link
                        key={p.commitmentId}
                        href={`/feed/production/${p.commitmentId}`}
                        className="group block es-card p-6 transition-all duration-300 hover:bg-surface hover:border-cinnabar/30 hover:shadow-sm sm:p-8"
                    >
                        <div className="flex flex-wrap items-center gap-3 text-2xs tracking-widest text-mute/80">
                            {p.day != null ? (
                                <span className="rounded border border-hairline/50 bg-canvas/50 px-2 py-1">
                                    DAY {p.day}
                                </span>
                            ) : null}
                            {p.classicSource ? <span>{p.classicSource} · 舊戲新唱</span> : null}
                            <span className="text-cinnabar/80">
                                戲班自編自演 · {p.castIds.length} 角{doc.scenes.length ? ` · ${doc.scenes.length} 折` : ''}
                            </span>
                        </div>
                        <h3 className="mt-3 font-serif text-2xl tracking-wide text-ink transition-colors group-hover:text-cinnabar">
                            《{title}》
                        </h3>
                        {excerpt ? (
                            <p className="mt-3 line-clamp-2 font-serif text-base leading-relaxed text-ink/80 transition-colors group-hover:text-ink/95">
                                {excerpt}
                            </p>
                        ) : null}
                        {castNames.length ? (
                            <p className="mt-3 text-2xs tracking-[0.18em] text-mute/70">
                                班底 · {castNames.slice(0, 5).join(' · ')}
                                {castNames.length > 5 ? ' …' : ''}
                            </p>
                        ) : null}
                        <p className="mt-4 text-sm tracking-widest text-cinnabar">讀這齣戲折 →</p>
                    </Link>
                );
            })}
        </div>
    );
}
