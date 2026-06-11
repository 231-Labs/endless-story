import { walrusAggregatorUrl } from '@endless-story/shared';
import { eventChapter } from '@endless-story/runner';
import { objectUrl, txUrl } from '@/lib/explorer';
import type { EventCutEntry } from '@/lib/api/cuts';
import { Markdown } from '@/components/common/Markdown';

/**
 * Event-cut list — the canonical "回" (woven multi-POV chapters), newest first.
 * Each entry expands inline (like the gazette). The embedded `es:cut` header is
 * stripped before render and surfaced as a verifiable "this event happened on
 * chain" banner. See docs/CONTENT_PIPELINE.md §2/§8.1.
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

    const raws = await Promise.all(cuts.map((c) => fetchBody(c.blobId)));

    return (
        <div className="space-y-8">
            {cuts.map((c, i) => {
                const { body } = eventChapter.parseCutHeader((raws[i] ?? '').trim());
                return (
                    <article
                        key={c.commitmentId}
                        className="rounded-3xl border border-hairline/60 bg-surface/40 p-6 backdrop-blur-sm sm:p-10"
                    >
                        <header className="flex flex-wrap items-center gap-3 text-2xs tracking-widest text-mute/80">
                            {c.day != null ? (
                                <span className="rounded border border-hairline/50 bg-canvas/50 px-2 py-1">
                                    DAY {c.day}
                                </span>
                            ) : null}
                            {c.sceneName ? <span>{c.sceneName}</span> : null}
                            <span>{c.povCharacterIds.length} 視角合本</span>
                            <a
                                href={objectUrl(c.commitmentId)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-cinnabar"
                            >
                                on-chain anchor ↗
                            </a>
                            {c.eventTx ? (
                                <a
                                    href={txUrl(c.eventTx)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-cinnabar hover:underline"
                                >
                                    查驗此事件 ↗
                                </a>
                            ) : null}
                        </header>
                        {c.eventLabel ? (
                            <p className="mt-4 text-2xs tracking-widest text-cinnabar/70">
                                本回出自鏈上事件「{c.eventLabel}」
                            </p>
                        ) : null}
                        {body ? (
                            <Markdown source={body} className="mt-4" />
                        ) : (
                            <p className="mt-6 text-sm text-mute">— 章回內容暫時無法讀取 —</p>
                        )}
                    </article>
                );
            })}
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
