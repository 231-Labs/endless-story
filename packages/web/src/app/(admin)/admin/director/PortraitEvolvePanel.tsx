'use client';

import { useState, useTransition } from 'react';
import {
    evolvePortraitAction,
    type EvolvePortraitResult,
    type PortraitOccasionKind,
} from '@/lib/actions/evolve-portrait';
import { txUrl } from '@/lib/explorer';
import type { Character } from '@endless-story/shared';

/**
 * Admin panel: evolve a character's portrait (§11 dynamic NFT).
 *
 * Renders a new variant conditioned on the same physical_facts + an
 * occasion, then appends it to the on-chain setting gallery. The public cover
 * stays owner-controlled from the dossier gallery tab.
 */
const KINDS: { value: PortraitOccasionKind; label: string }[] = [
    { value: 'reference', label: '設定形象' },
    { value: 'stage', label: '戲妝登台' },
    { value: 'finery', label: '盛裝華服' },
    { value: 'daily', label: '日常卸妝' },
    { value: 'youth', label: '少年青澀' },
    { value: 'aged', label: '老年蒼勁' },
    { value: 'illness', label: '病中清減' },
    { value: 'snow', label: '雪夜獨行' },
    { value: 'custom', label: '自訂情境' },
];

/** Short demo hint of what each option renders (gist, not the exact prompt;
 *  Dry-Run shows the real prompt sent). */
const KIND_HINT: Record<PortraitOccasionKind, string> = {
    reference: '端正設定形象、純色底、神情沉靜',
    stage: '勾臉上彩的京劇戲妝、戴頭面、穿蟒袍登台',
    finery: '上等綢緞華服、雍容貴氣',
    daily: '後台卸妝、素常服、生活感',
    youth: '更年輕幾歲、眉眼青澀',
    aged: '多年以後、白髮皺紋、氣度蒼勁',
    illness: '久病清減、面色蒼白、形容憔悴',
    snow: '風雪夜、披斗篷、肩頭落雪',
    custom: '用下方文字逐字驅動扮相',
};

export function PortraitEvolvePanel({ characters }: { characters: Character[] }) {
    const [characterId, setCharacterId] = useState<string>(characters[0]?.id ?? '');
    const [kind, setKind] = useState<PortraitOccasionKind>('stage');
    const [occasion, setOccasion] = useState('');
    const [result, setResult] = useState<EvolvePortraitResult | null>(null);
    const [isPending, startTransition] = useTransition();

    const run = (dryRun: boolean) => {
        if (!characterId) return;
        if (kind === 'custom' && !occasion.trim()) return;
        setResult(null);
        startTransition(async () => {
            const r = await evolvePortraitAction({ characterId, kind, occasion, dryRun });
            setResult(r);
        });
    };

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_160px]">
                <label className="space-y-1.5">
                    <div className="text-2xs tracking-widest text-mute">角色</div>
                    <select
                        value={characterId}
                        onChange={(e) => setCharacterId(e.target.value)}
                        disabled={isPending}
                        className="w-full rounded border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:border-cinnabar focus:outline-none"
                    >
                        {characters.length === 0 ? <option value="">— 無角色 —</option> : null}
                        {characters.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name} ({c.id.slice(0, 10)}…)
                            </option>
                        ))}
                    </select>
                </label>
                <label className="space-y-1.5">
                    <div className="text-2xs tracking-widest text-mute">情境</div>
                    <select
                        value={kind}
                        onChange={(e) => setKind(e.target.value as PortraitOccasionKind)}
                        disabled={isPending}
                        className="w-full rounded border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:border-cinnabar focus:outline-none"
                    >
                        {KINDS.map((k) => (
                            <option key={k.value} value={k.value}>
                                {k.label}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            {kind !== 'custom' ? (
                <p className="text-2xs leading-relaxed text-mute">
                    此選項出：<span className="text-ink/80">{KIND_HINT[kind]}</span>
                    （同一人、保持體態氣質；水墨工筆畫風）
                </p>
            ) : null}

            <label className="block space-y-1.5">
                <div className="text-2xs tracking-widest text-mute">
                    情境補述{kind === 'custom' ? '（必填）' : '（可選 · 疊加細節）'}
                </div>
                <input
                    type="text"
                    value={occasion}
                    onChange={(e) => setOccasion(e.target.value)}
                    placeholder={
                        kind === 'custom'
                            ? '如：京劇老生扮相，黑三髯口，蟒袍'
                            : '如：左頰一道舊傷疤（疊加在上面選項之上）'
                    }
                    disabled={isPending}
                    className="w-full rounded border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:border-cinnabar focus:outline-none"
                />
            </label>

            <div className="flex flex-wrap gap-3">
                <button
                    type="button"
                    onClick={() => run(true)}
                    disabled={isPending || !characterId || (kind === 'custom' && !occasion.trim())}
                    className="rounded border border-hairline bg-surface px-4 py-2 text-sm tracking-widest text-ink hover:bg-elevated disabled:opacity-50"
                >
                    {isPending ? '出圖中…' : 'Dry-Run（只看新像）'}
                </button>
                <button
                    type="button"
                    onClick={() => run(false)}
                    disabled={isPending || !characterId || (kind === 'custom' && !occasion.trim())}
                    className="rounded bg-cinnabar px-4 py-2 text-sm tracking-widest text-canvas hover:bg-seal disabled:opacity-50"
                >
                    {isPending ? '上鏈中…' : '演化形象 · 加入設定集'}
                </button>
            </div>

            <p className="text-2xs tracking-widest text-mute">
                出圖 anchor 於 physical_facts（同一人）→ Walrus → add_media_asset_by_storyteller
                加入設定集；封面由 owner 在角色頁選定。
            </p>

            {result ? <ResultView result={result} /> : null}
        </div>
    );
}

function ResultView({ result }: { result: EvolvePortraitResult }) {
    const src = result.base64
        ? `data:image/png;base64,${result.base64}`
        : result.blobId
          ? `/api/blob/${result.blobId}`
          : undefined;
    return (
        <div className="space-y-3 rounded border border-hairline bg-canvas/40 p-4">
            <div className="flex flex-wrap items-center gap-3 text-2xs tracking-widest">
                <span
                    className={`inline-block h-2 w-2 rounded-full ${
                        result.ok ? 'bg-jade' : 'bg-cinnabar'
                    }`}
                />
                <span className="text-mute">
                    {result.error
                        ? '失敗'
                        : result.anchored
                          ? `已加入設定集${result.mediaIndex != null ? ` #${result.mediaIndex}` : ''}`
                          : result.ok
                            ? 'Dry-Run（新像）'
                            : '—'}
                </span>
                {result.digest ? (
                    <a
                        href={txUrl(result.digest)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cinnabar hover:underline"
                    >
                        tx
                    </a>
                ) : null}
                {result.blobId ? (
                    <a
                        href={`/api/blob/${result.blobId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cinnabar hover:underline"
                    >
                        walrus
                    </a>
                ) : null}
            </div>

            {result.error ? (
                <div className="text-sm text-cinnabar">錯誤：{result.error}</div>
            ) : null}

            {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={src}
                    alt="演化後的形象"
                    className="max-h-72 w-auto rounded border border-hairline/60"
                />
            ) : null}

            {result.promptUsed ? (
                <p className="text-2xs leading-relaxed text-mute">{result.promptUsed}</p>
            ) : null}
        </div>
    );
}
