import Link from 'next/link';
import { eventChapter, eventDossier } from '@endless-story/runner';
import type { EventCutEntry } from '@/lib/api/cuts';
import { fetchChapterText } from '@/lib/chain/pov-read';
import { CHAPTER_COPY } from '@/lib/copy/chapters';

/**
 * Event-cut list — the canonical "回" (woven multi-POV chapters), newest first.
 * Card = metadata + a short excerpt; the full prose lives on /feed/cut/[id].
 * Bodies come through the immutable-blob cache (fetchChapterText), so the list
 * stops re-reading every cut from the aggregator on each visit.
 * See docs/narrative/CONTENT_PIPELINE.md §2/§8.1.
 */
export async function CutList({
    cuts,
    sagaName,
}: {
    cuts: EventCutEntry[];
    sagaName: string;
}) {
    if (cuts.length === 0) {
        return (
            <div className="es-card px-8 py-20 text-center">
                <p className="font-serif text-lg tracking-wide text-ink/80">{sagaName} 尚無章回</p>
                <p className="mt-2 text-sm tracking-wide text-mute/70">待角色們各自落筆，便會織成多視角章回。</p>
            </div>
        );
    }

    const raws = await Promise.all(
        cuts.map((c) => fetchChapterText(c.blobUrl).catch(() => '')),
    );

    return (
        <div className="space-y-6">
            {cuts.map((c, i) => {
                const { body: cutBody } = eventChapter.parseCutHeader((raws[i] ?? '').trim());
                const { bundle, body } = eventDossier.parseDossierHeader(cutBody);
                const { title, excerpt } = splitCutBody(body);
                return (
                    <Link
                        key={c.commitmentId}
                        href={bundle ? `/feed/event/${c.commitmentId}` : `/feed/cut/${c.commitmentId}`}
                        className="group block es-card p-6 transition-all duration-300 hover:bg-surface hover:border-cinnabar/30 hover:shadow-sm sm:p-8"
                    >
                        <div className="flex flex-wrap items-center gap-3 text-2xs tracking-widest text-mute/80">
                            {c.day != null ? (
                                <span className="rounded border border-hairline/50 bg-canvas/50 px-2 py-1">
                                    DAY {c.day}
                                </span>
                            ) : null}
                            {c.sceneName ? <span>{c.sceneName}</span> : null}
                            <span className="text-cinnabar/80">{CHAPTER_COPY.cut.povCount(c.povCharacterIds.length)}</span>
                        </div>
                        {c.eventLabel ? (
                            <p className="mt-3 text-2xs tracking-widest text-cinnabar/70">
                                {CHAPTER_COPY.cut.fromEvent(c.eventLabel)}
                            </p>
                        ) : null}
                        <h3 className="mt-3 font-serif text-2xl tracking-wide text-ink transition-colors group-hover:text-cinnabar">
                            {title ?? `第 ${c.day ?? '—'} 日 · ${c.sceneName ?? '一回'}`}
                        </h3>
                        {excerpt ? (
                            <p className="mt-3 line-clamp-3 text-base leading-loose text-ink/75 transition-colors group-hover:text-ink/90">
                                {excerpt}
                            </p>
                        ) : (
                            <p className="mt-3 text-sm text-mute">{CHAPTER_COPY.pov.bodyUnavailable}</p>
                        )}
                        <p className="mt-4 text-sm tracking-widest text-cinnabar">
                            {bundle ? '切換角色視角' : CHAPTER_COPY.cut.readThisCut}
                        </p>
                    </Link>
                );
            })}
        </div>
    );
}

/** First markdown heading → title; rest flattened to a plain-text excerpt. */
function splitCutBody(body: string): { title: string | null; excerpt: string } {
    const lines = body.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    let title: string | null = null;
    const rest: string[] = [];
    for (const line of lines) {
        if (title == null && /^#{1,3}\s+/.test(line)) {
            title = line.replace(/^#+\s*/, '').trim();
            continue;
        }
        rest.push(line.replace(/^#+\s*/, ''));
    }
    const flat = rest
        .join(' ')
        .replace(/[*_`>]|\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
    return { title, excerpt: flat.slice(0, 160) };
}
