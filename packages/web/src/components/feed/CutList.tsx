import Link from 'next/link';
import { eventChapter } from '@endless-story/runner';
import type { EventCutEntry } from '@/lib/api/cuts';
import { fetchChapterText } from '@/lib/chain/pov-read';
import { CHAPTER_COPY } from '@/lib/copy/chapters';

/**
 * Event-cut list — the canonical "回" (woven multi-POV chapters), newest first.
 * Card = metadata + a short excerpt; the full prose lives on /feed/cut/[id].
 * Bodies come through the immutable-blob cache (fetchChapterText), so the list
 * stops re-reading every cut from the aggregator on each visit.
 * See docs/CONTENT_PIPELINE.md §2/§8.1.
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
            <div className="rounded-3xl border border-hairline/50 bg-surface/40 p-12 text-center backdrop-blur-sm">
                <p className="font-serif text-base text-ink">{sagaName} 還沒有織成的章回</p>
                <p className="mt-3 text-sm leading-relaxed text-mute">
                    當一樁事件有兩位以上角色各寫了 POV，自治推進收尾後便會把它們織成一回多視角章回；
                    也可由班主在後台「章回 · 事件合本」手動補織。
                </p>
            </div>
        );
    }

    const raws = await Promise.all(
        cuts.map((c) => fetchChapterText(c.blobUrl).catch(() => '')),
    );

    return (
        <div className="space-y-6">
            {cuts.map((c, i) => {
                const { body } = eventChapter.parseCutHeader((raws[i] ?? '').trim());
                const { title, excerpt } = splitCutBody(body);
                return (
                    <Link
                        key={c.commitmentId}
                        href={`/feed/cut/${c.commitmentId}`}
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
                        <p className="mt-4 text-sm tracking-widest text-cinnabar">{CHAPTER_COPY.cut.readThisCut}</p>
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
