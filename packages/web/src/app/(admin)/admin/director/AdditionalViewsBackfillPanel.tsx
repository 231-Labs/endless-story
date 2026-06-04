'use client';

import { useState, useTransition } from 'react';
import type { Character } from '@endless-story/shared';
import {
    backfillAdditionalViewsAction,
    type BackfillAdditionalViewsResult,
} from '@/lib/actions/backfill-additional-views';

export function AdditionalViewsBackfillPanel({ characters }: { characters: Character[] }) {
    const [characterId, setCharacterId] = useState<string>(characters[0]?.id ?? '');
    const [force, setForce] = useState(false);
    const [result, setResult] = useState<BackfillAdditionalViewsResult | null>(null);
    const [isPending, startTransition] = useTransition();

    const run = () => {
        if (!characterId) return;
        setResult(null);
        startTransition(async () => {
            const r = await backfillAdditionalViewsAction({ characterId, force });
            setResult(r);
        });
    };

    return (
        <div className="space-y-4 rounded border border-hairline bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="font-serif text-xl tracking-wide text-ink">補標準設定圖</h3>
                    <p className="mt-1 text-2xs leading-relaxed text-mute">
                        補 mint 後背景任務產生的正面形象與人物設定圖。
                    </p>
                </div>
                <label className="flex items-center gap-2 text-2xs tracking-widest text-mute">
                    <input
                        type="checkbox"
                        checked={force}
                        onChange={(e) => setForce(e.target.checked)}
                        disabled={isPending}
                        className="h-4 w-4 accent-cinnabar"
                    />
                    強制重生
                </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
                <label className="space-y-1.5">
                    <div className="text-2xs tracking-widest text-mute">角色</div>
                    <select
                        value={characterId}
                        onChange={(e) => setCharacterId(e.target.value)}
                        disabled={isPending}
                        className="w-full rounded border border-hairline bg-canvas px-3 py-2 text-sm text-ink focus:border-cinnabar focus:outline-none"
                    >
                        {characters.length === 0 ? <option value="">— 無角色 —</option> : null}
                        {characters.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name} ({c.id.slice(0, 10)}…)
                            </option>
                        ))}
                    </select>
                </label>
                <div className="flex items-end">
                    <button
                        type="button"
                        onClick={run}
                        disabled={isPending || !characterId}
                        className="w-full rounded bg-cinnabar px-4 py-2 text-sm tracking-widest text-canvas hover:bg-seal disabled:opacity-50 sm:w-auto"
                    >
                        {isPending ? '補圖中…' : '補正面 + 設定圖'}
                    </button>
                </div>
            </div>

            {result ? <BackfillResult result={result} /> : null}
        </div>
    );
}

function BackfillResult({ result }: { result: BackfillAdditionalViewsResult }) {
    const requested = result.requested?.join(' / ') || '—';
    const existing = result.existing?.join(' / ') || '—';
    return (
        <div className="space-y-3 rounded border border-hairline bg-canvas/40 p-4">
            <div className="flex flex-wrap items-center gap-3 text-2xs tracking-widest">
                <span className={`inline-block h-2 w-2 rounded-full ${result.ok ? 'bg-jade' : 'bg-cinnabar'}`} />
                <span className="text-mute">
                    {result.error
                        ? '失敗'
                        : result.skipped === 'already_complete'
                          ? '已完整'
                          : result.appended > 0
                            ? `已補 ${result.appended} 張`
                            : '未追加'}
                </span>
                {result.characterName ? <span className="text-ink/70">{result.characterName}</span> : null}
            </div>

            <div className="grid gap-1 text-2xs leading-relaxed text-mute sm:grid-cols-2">
                <span>既有：{existing}</span>
                <span>本次：{requested}</span>
            </div>

            {result.error ? <div className="text-sm text-cinnabar">錯誤：{result.error}</div> : null}
            {result.skipped && !result.error ? (
                <div className="text-sm text-mute">狀態：{labelSkipped(result.skipped)}</div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
                {result.frontalUrl ? <PreviewImage src={result.frontalUrl} label="正面形象" /> : null}
                {result.artSheetUrl ? <PreviewImage src={result.artSheetUrl} label="人物設定" /> : null}
            </div>
        </div>
    );
}

function PreviewImage({ src, label }: { src: string; label: string }) {
    return (
        <figure className="space-y-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={label} className="max-h-72 w-auto rounded border border-hairline/60" />
            <figcaption className="text-2xs tracking-widest text-mute">{label}</figcaption>
        </figure>
    );
}

function labelSkipped(skipped: string): string {
    if (skipped === 'already_complete') return '正面形象與人物設定已存在';
    if (skipped === 'no_anchor') return '缺少初始形象';
    if (skipped === 'image_unconfigured') return '圖片服務未設定';
    if (skipped === 'saga_unconfigured') return 'saga 尚未種子化';
    return skipped;
}
