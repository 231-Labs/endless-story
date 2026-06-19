import type { ReactNode } from 'react';
import { Markdown } from '@/components/common/Markdown';
import { SceneList } from '@/components/feed/SceneList';
import { parseXiZhe } from '@/lib/feed/xizhe-format';

/**
 * 戲折 playbill — lays out an assembled 戲折 as a structured 戲單 (題目 · 立意 ·
 * 班底 · 分場·劇本 · 折子戲中戲 · 各角視角 · 唱詞) instead of dumping raw markdown,
 * so the cast reads as a programme, each 折 opens to its 劇本, and only the 折子
 * climax flows as prose. Parses the on-chain body via parseXiZhe (tolerant of older blobs).
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
                    <SectionLabel>
                        分場 · {doc.scenes.length} 折
                        {doc.scenes.some((s) => s.lines.length) ? (
                            <span className="ml-2 text-mute/50">點折展開戲文</span>
                        ) : null}
                    </SectionLabel>
                    <SceneList scenes={doc.scenes} />
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

            {doc.povs.length ? (
                <section className="mt-12">
                    <SectionLabel>
                        各角視角
                        <span className="ml-2 text-mute/60">羅生門 · {doc.povs.length} 視角</span>
                    </SectionLabel>
                    <div className="mt-5 space-y-4">
                        {doc.povs.map((p, i) => (
                            <div
                                key={`${p.actorName}-${i}`}
                                className="rounded-md border border-hairline/40 bg-canvas/20 p-4 sm:p-5"
                            >
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                    <span className="font-serif text-base text-ink">{p.actorName}</span>
                                    <span className="text-2xs text-mute/60">飾</span>
                                    <span className="font-serif text-base text-cinnabar/90">{p.partName}</span>
                                    {p.cross ? (
                                        <span className="rounded-full bg-cinnabar/10 px-2 py-0.5 text-2xs tracking-widest text-cinnabar">
                                            {p.cross}
                                        </span>
                                    ) : null}
                                </div>
                                <p className="mt-2.5 whitespace-pre-line font-serif text-base leading-loose text-ink/80">
                                    {p.text}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}

            {doc.ci.length ? (
                <section className="mt-14">
                    <SectionLabel>唱詞 · {doc.ci.length} 首</SectionLabel>
                    <div className="mt-5 space-y-4">
                        {doc.ci.map((c, i) => (
                            <div
                                key={`${c.title}-${i}`}
                                className="rounded-md border border-hairline/40 bg-canvas/20 p-4 sm:p-5"
                            >
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                    <span className="font-serif text-base text-ink">{c.title}</span>
                                    {c.author ? <span className="text-2xs text-mute/60">· {c.author}</span> : null}
                                    <span
                                        className={
                                            c.source === 'emergent'
                                                ? 'rounded-full bg-cinnabar/10 px-2 py-0.5 text-2xs tracking-widest text-cinnabar'
                                                : 'rounded-full border border-hairline/50 px-2 py-0.5 text-2xs tracking-widest text-mute'
                                        }
                                    >
                                        {c.source === 'emergent' ? '有感而發' : '應場'}
                                    </span>
                                </div>
                                {c.why ? <p className="mt-1.5 text-2xs italic text-mute/70">出處 · {c.why}</p> : null}
                                <div className="mt-3 space-y-1">
                                    {c.lines.map((l, j) => (
                                        <p key={j} className="font-serif text-base leading-loose text-ink/85">
                                            {l}
                                        </p>
                                    ))}
                                </div>
                            </div>
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
