'use client';

/**
 * LabCastRail — 名帖排：every character as a small calling card. Where they
 * are, what burns hottest in them, the last thing they said. Clicking a card
 * jumps the scroll to that character's scene.
 */

import type { LabCharacterLive } from '@/lib/lab/types';

export function LabCastRail({
    characters,
    onSelectScene,
}: {
    characters: LabCharacterLive[];
    onSelectScene?: (sceneId: string) => void;
}) {
    return (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {characters.map((c) => (
                <button
                    key={c.id}
                    type="button"
                    onClick={() => c.sceneId && onSelectScene?.(c.sceneId)}
                    className="es-card group p-3 text-left transition hover:border-cinnabar/50"
                >
                    <div className="flex items-center gap-2.5">
                        {/* 名印：一字為記 */}
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-cinnabar/85 font-serif text-base text-white shadow-sm">
                            {c.name.slice(0, 1)}
                        </span>
                        <div className="min-w-0">
                            <p className="truncate font-serif text-sm tracking-[0.12em] text-ink">
                                {c.name}
                                <span className="ml-1.5 text-2xs tracking-[0.15em] text-mute">{c.role ?? ''}</span>
                            </p>
                            <p className="truncate font-serif text-2xs tracking-[0.15em] text-jade/90">
                                在 {c.sceneName}
                            </p>
                        </div>
                    </div>
                    {c.wants[0] ? (
                        <p className="mt-2 truncate font-serif text-xs text-ink/75" title={c.wants[0].desc}>
                            {c.wants[0].layer}｜{c.wants[0].desc}
                        </p>
                    ) : null}
                    {c.latestLine ? (
                        <p className="mt-1.5 line-clamp-2 font-serif text-xs leading-relaxed text-mute/90">
                            「{c.latestLine.text}」
                        </p>
                    ) : (
                        <p className="mt-1.5 font-serif text-xs text-mute/55">未曾開口。</p>
                    )}
                </button>
            ))}
        </div>
    );
}
