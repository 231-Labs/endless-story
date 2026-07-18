'use client';

/**
 * LabCastRail — 名帖屏的角色立卡：立繪主導（圖庫肖像／gallery 首圖全出血），
 * 底部一層墨色漸層壓名款、行當、所在與心頭最熱的一樁；無框線，浮起靠光影。
 * 未有立繪者以紙面名印代之（大字名印＋直書全名）——補圖之後自動換裝。
 * 有拍者（此刻開過口）卡角一點朱砂在呼吸。
 */

import type { LabCharacterLive } from '@/lib/lab/types';

export function LabCastRail({
    characters,
    activeIds,
    onSelectCharacter,
}: {
    characters: LabCharacterLive[];
    /** 此刻（本拍）有言行者 — 卡上活點。 */
    activeIds?: Set<string>;
    onSelectCharacter?: (characterId: string) => void;
}) {
    return (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {characters.map((c) => {
                const art = c.portraitUrl ?? c.gallery.find((g) => g.type === 'image')?.url;
                const active = activeIds?.has(c.id) ?? false;
                return (
                    <button
                        key={c.id}
                        type="button"
                        onClick={() => onSelectCharacter?.(c.id)}
                        title={`開「${c.name}」內頁`}
                        className="group relative aspect-[3/4] overflow-hidden rounded-xl text-left shadow-[0_2px_16px_rgba(20,12,8,0.18)] outline-none transition-shadow duration-300 hover:shadow-[0_6px_28px_rgba(176,74,60,0.22)] focus-visible:ring-2 focus-visible:ring-cinnabar"
                    >
                        {/* 立繪層 */}
                        {art ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={art}
                                alt={c.name}
                                className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.05]"
                            />
                        ) : (
                            <span className="absolute inset-0 bg-gradient-to-b from-surface via-canvas to-surface dark:from-elevated dark:via-canvas dark:to-elevated">
                                <span className="absolute left-1/2 top-[34%] flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-lg bg-cinnabar/85 font-serif text-4xl text-white shadow-md transition-transform duration-500 group-hover:scale-105">
                                    {c.name.slice(0, 1)}
                                </span>
                                <span className="absolute right-3 top-3 font-serif text-sm tracking-[0.3em] text-mute/70 [writing-mode:vertical-rl]">
                                    {c.name}
                                </span>
                            </span>
                        )}

                        {/* 行當印 */}
                        {c.role ? (
                            <span className="absolute left-2.5 top-2.5 rounded-sm bg-ink/55 px-1.5 py-1 font-serif text-2xs tracking-[0.25em] text-white/90 backdrop-blur-[2px] [writing-mode:vertical-rl] dark:bg-black/45">
                                {c.role}
                            </span>
                        ) : null}

                        {/* 活點 */}
                        {active ? (
                            <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-cinnabar animate-lab-live-dot" title="此刻有言行" />
                        ) : null}

                        {/* 名款層 */}
                        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-3 pb-2.5 pt-10">
                            <span className="flex items-baseline gap-2">
                                <span className="font-serif text-lg tracking-[0.14em] text-white drop-shadow">{c.name}</span>
                                <span className="truncate font-serif text-2xs tracking-[0.2em] text-white/70">在 {c.sceneName}</span>
                            </span>
                            {c.wants[0] ? (
                                <span className="mt-1 block truncate font-serif text-xs leading-relaxed text-white/85" title={c.wants[0].desc}>
                                    <span className="mr-1.5 text-white/60">{c.wants[0].layer}</span>
                                    {c.wants[0].desc}
                                </span>
                            ) : null}
                            {c.latestLine ? (
                                <span className="mt-0.5 block truncate font-serif text-2xs leading-relaxed text-white/60">
                                    「{c.latestLine.text}」
                                </span>
                            ) : null}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
