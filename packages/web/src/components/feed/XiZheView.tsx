import type { ReactNode } from 'react';
import { Markdown } from '@/components/common/Markdown';
import { parseXiZhe, moodLabel } from '@/lib/feed/xizhe-format';

/**
 * 戲折 playbill — lays out an assembled 戲折 as a structured 戲單 (題目 · 立意 ·
 * 班底 · 分場 · 折子戲中戲 · 角兒私詞) instead of dumping raw markdown, so the
 * cast/scenes read as a programme and only the 折子 climax flows as prose.
 * Parses the on-chain body via parseXiZhe (tolerant of older blobs).
 */
export function XiZheView({ body, className }: { body: string; className?: string }) {
    const doc = parseXiZhe(body);

    return (
        <article className={className}>
            {doc.title ? (
                <h1 className="font-serif text-4xl leading-tight tracking-wide text-ink sm:text-5xl">
                    《{doc.title}》
                </h1>
            ) : null}
            {doc.subtitle ? (
                <p className="mt-4 text-sm tracking-[0.18em] text-mute/80">{doc.subtitle}</p>
            ) : null}

            {doc.premise || doc.director || doc.qizhi ? (
                <div className="mt-8 border-l-2 border-cinnabar/40 pl-5 sm:pl-6">
                    {doc.premise ? (
                        <p className="font-serif text-xl leading-relaxed text-ink/90 sm:text-2xl">{doc.premise}</p>
                    ) : null}
                    {doc.director || doc.qizhi ? (
                        <p className="mt-3 text-xs tracking-[0.2em] text-mute">
                            {doc.director ? <>班主 · {doc.director}</> : null}
                            {doc.director && doc.qizhi ? <span className="mx-2.5 text-hairline">｜</span> : null}
                            {doc.qizhi ? <>氣質 · {doc.qizhi}</> : null}
                        </p>
                    ) : null}
                </div>
            ) : null}

            {doc.cast.length ? (
                <section className="mt-12">
                    <SectionLabel>班底</SectionLabel>
                    <ul className="mt-5 grid grid-cols-1 gap-x-10 gap-y-1 sm:grid-cols-2">
                        {doc.cast.map((c, i) => (
                            <li
                                key={`${c.part}-${i}`}
                                className="flex min-w-0 items-baseline gap-2.5 border-b border-hairline/30 py-3"
                            >
                                <span className="shrink-0 font-serif text-lg text-ink">{c.part}</span>
                                <span className="shrink-0 text-hairline">—</span>
                                <span className="truncate text-lg text-ink/90">{c.actor ?? '（待定）'}</span>
                                {c.hangdang || c.yinggong ? (
                                    <span className="ml-auto shrink-0 whitespace-nowrap rounded-full border border-hairline/50 bg-canvas/40 px-2.5 py-0.5 text-2xs tracking-widest text-mute">
                                        {c.hangdang}
                                        {c.yinggong ? ` · ${c.yinggong}` : ''}
                                    </span>
                                ) : null}
                                {c.cross ? (
                                    <span className="shrink-0 whitespace-nowrap rounded-full bg-cinnabar/10 px-2 py-0.5 text-2xs tracking-widest text-cinnabar">
                                        {c.cross}
                                    </span>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {doc.scenes.length ? (
                <section className="mt-12">
                    <SectionLabel>分場 · {doc.scenes.length} 折</SectionLabel>
                    <ol className="mt-5 flex flex-wrap gap-2.5">
                        {doc.scenes.map((s, i) => (
                            <li
                                key={`${s.n}-${i}`}
                                className="flex items-center gap-2 rounded-full border border-hairline/50 bg-surface/30 px-3.5 py-1.5"
                            >
                                <span className="text-2xs text-mute/50">{String(s.n).padStart(2, '0')}</span>
                                <span className="font-serif text-sm tracking-wide text-ink/90">〈{s.title}〉</span>
                                {moodLabel(s.mood) ? (
                                    <span className="text-2xs text-cinnabar/70">{moodLabel(s.mood)}</span>
                                ) : null}
                            </li>
                        ))}
                    </ol>
                </section>
            ) : null}

            {doc.prose ? (
                <section className="mt-14">
                    <SectionLabel>
                        折子 · 戲中戲
                        {doc.climaxTitle ? <span className="ml-2 text-mute/60">〈{doc.climaxTitle}〉</span> : null}
                    </SectionLabel>
                    <Markdown
                        source={doc.prose}
                        className="chapter-prose mt-6 text-lg leading-loose text-ink/85 sm:text-xl sm:leading-[2.2]"
                    />
                </section>
            ) : null}

            {doc.song && doc.song.lines.length ? (
                <section className="mt-14">
                    <SectionLabel>
                        角兒私詞
                        {doc.song.title ? <span className="ml-2 text-mute/60">《{doc.song.title}》</span> : null}
                        <span className="ml-2 text-cinnabar/70">有感而發</span>
                    </SectionLabel>
                    <div className="mt-5 border-l-2 border-hairline/40 pl-6">
                        {doc.song.lines.map((l, i) => (
                            <p key={i} className="font-serif text-lg italic leading-loose text-ink/80">
                                {l}
                            </p>
                        ))}
                    </div>
                </section>
            ) : null}
        </article>
    );
}

function SectionLabel({ children }: { children: ReactNode }) {
    return (
        <h2 className="flex items-center gap-3 text-2xs tracking-[0.3em] text-mute">
            <span className="h-px w-6 bg-cinnabar/40" />
            {children}
        </h2>
    );
}
