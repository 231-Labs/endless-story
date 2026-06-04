'use client';

import { useState, useTransition } from 'react';
import type { Character } from '@endless-story/shared';
import {
    generatePersonaAction,
    type GeneratePersonaResult,
} from '@/lib/actions/generate-persona';

/**
 * Admin panel: re-distill a character's 本色 (persona).
 *
 * New mints auto-distil persona via redeemVoucher's `after()`; ReconcilePanel
 * only BACKFILLS missing personas (it skips characters that already have one).
 * This panel force-re-distils the selected character: `generatePersonaAction`
 * always anchors a fresh commitment and reads take the latest, so the new
 * 軸/腔/界 immediately supersede the old — no force flag / version bump needed.
 */
export function PersonaRedistillPanel({ characters }: { characters: Character[] }) {
    const [characterId, setCharacterId] = useState<string>(characters[0]?.id ?? '');
    const [result, setResult] = useState<GeneratePersonaResult | null>(null);
    const [isPending, startTransition] = useTransition();

    const handleRedistill = () => {
        if (!characterId) return;
        setResult(null);
        startTransition(async () => {
            const r = await generatePersonaAction(characterId);
            setResult(r);
        });
    };

    const persona = result?.persona;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
                <label className="space-y-1.5">
                    <div className="text-2xs tracking-widest text-mute">角色</div>
                    <select
                        value={characterId}
                        onChange={(e) => setCharacterId(e.target.value)}
                        disabled={isPending}
                        className="rounded border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:border-cinnabar focus:outline-none"
                    >
                        {characters.length === 0 ? <option value="">— 無角色 —</option> : null}
                        {characters.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name} ({c.id.slice(0, 10)}…)
                            </option>
                        ))}
                    </select>
                </label>
                <button
                    type="button"
                    onClick={handleRedistill}
                    disabled={isPending || !characterId}
                    className="rounded bg-cinnabar px-4 py-2 text-sm tracking-widest text-canvas hover:bg-seal disabled:opacity-50"
                >
                    {isPending ? '蒸餾中…' : '重蒸本色'}
                </button>
            </div>

            <p className="text-2xs tracking-widest text-mute">
                重新從鏈上公開 profile 蒸餾 軸 / 腔 / 界，anchor 一筆新的 commitment（讀取永遠取最新）。
                會覆蓋舊本色、無視已存在 —— 與「對帳補漏」不同（那個只補沒有的）。需要 admin 錢包有 gas。
            </p>

            {result ? (
                <div className="space-y-3 text-2xs tracking-widest">
                    <div className="flex flex-wrap items-center gap-3">
                        <span
                            className={`inline-block h-2 w-2 rounded-full ${result.ok ? 'bg-jade' : 'bg-cinnabar'}`}
                        />
                        <span className="text-mute">
                            {result.ok
                                ? `已重蒸 v${result.version ?? 1}${result.commitmentId ? ` · ${result.commitmentId.slice(0, 10)}…` : ''}`
                                : result.skipped
                                  ? `略過：${result.skipped}`
                                  : `失敗：${result.error ?? '未知'}`}
                        </span>
                    </div>
                    {persona ? (
                        <div className="space-y-2 rounded border border-hairline bg-surface/60 p-3 leading-relaxed">
                            <PersonaList label="軸" items={persona.axes} />
                            <PersonaList label="腔" items={persona.mannerisms} />
                            <PersonaList label="界" items={persona.boundaries} />
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

function PersonaList({ label, items }: { label: string; items: string[] }) {
    if (!items?.length) return null;
    return (
        <div>
            <span className="text-cinnabar">{label}</span>
            <span className="text-mute"> · </span>
            <span className="text-ink">{items.join('、')}</span>
        </div>
    );
}
