'use client';

/**
 * 願牆 —— the prayer wall. Gathers the SPOKEN prayers characters have voiced at a
 * temple (神明 前) into one place: 對神明說出口的話. Each entry is a votive plaque —
 * the prayer-giver's portrait + name, the temple and when, the SPOKEN prayer as
 * the hero line, and the underlying 心願 as a subtle sub-line.
 *
 * This is DELIBERATELY distinct from the 願榜 (LabWishBoard), which aggregates
 * each character's INTERNAL 心事 (their live wants). A 願榜 entry is something a
 * character wants; a 願牆 entry is something a character came to a temple and
 * SAID OUT LOUD to a god. Newest-first (the snapshot already sorts them).
 */

import type { LabPrayer } from '@/lib/lab/types';

/** Layer → a subtle tint for the 心願 chip (mirrors the 願榜's palette so the two
 *  screens read as one family). 情/愛/戀 warm; 志/圖/業 cinnabar; 恨/仇 seal. */
function layerTone(layer: string): string {
    if (/情|愛|戀|慾|溫|眷/.test(layer)) return 'text-rose-400/90 border-rose-400/30 bg-rose-400/[0.07]';
    if (/志|圖|業|功|名|利|錢/.test(layer)) return 'text-cinnabar/90 border-cinnabar/30 bg-cinnabar/[0.07]';
    if (/恨|仇|怨|懼|怕/.test(layer)) return 'text-seal/90 border-seal/30 bg-seal/[0.08]';
    return 'text-mute border-hairline bg-ink/[0.04]';
}

export function LabWishWall({
    prayers,
    onSelectCharacter,
}: {
    prayers: LabPrayer[];
    onSelectCharacter?: (characterId: string) => void;
}) {
    if (!prayers.length) {
        return (
            <p className="mt-6 font-serif text-xs leading-relaxed tracking-[0.2em] text-mute/70">
                廟前尚無人祈願——待有人心事無門，自會來求。
            </p>
        );
    }

    const temples = new Set(prayers.map((p) => p.templeName)).size;

    return (
        <div className="mt-5">
            <p className="font-serif text-2xs leading-relaxed tracking-[0.24em] text-mute/70">
                神前所求 · 眾生對神明說出口的願 · {prayers.length} 願 · {temples} 座廟宇
            </p>
            <ul className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {prayers.map((prayer) => (
                    <li
                        key={prayer.id}
                        className="group relative overflow-hidden rounded-lg border border-cinnabar/25 bg-canvas/80 px-4 py-3.5 shadow-sm backdrop-blur-sm transition hover:border-cinnabar/50 dark:bg-white/[0.03]"
                    >
                        {/* 朱砂一線 —— the votive plaque's cinnabar edge */}
                        <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-cinnabar/60" />

                        {/* who came to pray */}
                        <button
                            type="button"
                            onClick={() => onSelectCharacter?.(prayer.characterId)}
                            className="flex items-center gap-2 text-left"
                            title={`開 ${prayer.name} 內頁`}
                        >
                            {prayer.portraitUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={prayer.portraitUrl} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                            ) : (
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cinnabar/80 font-serif text-xs text-white">
                                    {prayer.name.slice(0, 1)}
                                </span>
                            )}
                            <span className="font-serif text-2xs tracking-[0.1em] text-ink/85 transition group-hover:text-cinnabar">
                                {prayer.name}
                            </span>
                            <span className="ml-auto shrink-0 font-serif text-[10px] tracking-[0.12em] text-mute/70">
                                {prayer.templeName}
                                {prayer.clock ? ` · 第${prayer.day}日 ${prayer.clock}` : ` · 第${prayer.day}日`}
                            </span>
                        </button>

                        {/* the SPOKEN prayer —— the hero */}
                        <p className="mt-2.5 font-serif text-[15px] leading-relaxed tracking-[0.02em] text-ink/95">
                            <span aria-hidden className="mr-1 select-none text-cinnabar/70">「</span>
                            {prayer.text}
                            <span aria-hidden className="ml-0.5 select-none text-cinnabar/70">」</span>
                        </p>

                        {/* the underlying 心願 —— a subtle sub-line */}
                        {prayer.wantDesc ? (
                            <div className="mt-2 flex items-center gap-2 border-t border-hairline/60 pt-2">
                                {prayer.layer ? (
                                    <span className={`shrink-0 rounded-sm border px-1.5 py-px font-serif text-[10px] tracking-[0.1em] ${layerTone(prayer.layer)}`}>
                                        {prayer.layer}
                                    </span>
                                ) : null}
                                <span className="min-w-0 truncate font-serif text-2xs text-mute/80" title={prayer.wantDesc}>
                                    心願所繫：{prayer.wantDesc}
                                </span>
                            </div>
                        ) : null}
                    </li>
                ))}
            </ul>
        </div>
    );
}
