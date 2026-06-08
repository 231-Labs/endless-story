'use client';

import { useState, useTransition } from 'react';
import type { Character } from '@endless-story/shared';
import {
    assessRelationshipsAction,
    applyRelationshipTiesAction,
    type ProposedTie,
} from '@/lib/actions/assess-relationships';

/**
 * Admin panel: assess ONE character's relationships to the saga roster from
 * public descriptions, review the LLM proposals, then seed them as symmetric
 * director ties (public relationship graph) + symmetric memories on both sides.
 *
 * Saga-wide relationship backfill lives in the reconciler (reconcile-all) — the single
 * batch entry. This panel is for reviewed, targeted single-character seeding.
 */

const TONE_ZH: Record<string, string> = {
    affection: '親近',
    romance: '戀慕',
    mentorship: '師徒',
    rivalry: '競爭',
    wary: '戒備',
    tension: '緊張',
    estrangement: '隔閡',
    acquaintance: '故舊',
    neutral: '平淡',
};

export function RelationshipAssessPanel({ characters }: { characters: Character[] }) {
    const [characterId, setCharacterId] = useState<string>(characters[0]?.id ?? '');
    const [ties, setTies] = useState<ProposedTie[] | null>(null);
    const [include, setInclude] = useState<Record<number, boolean>>({});
    const [assessNote, setAssessNote] = useState<string | null>(null);
    const [applyNote, setApplyNote] = useState<string | null>(null);
    const [isAssessing, startAssess] = useTransition();
    const [isApplying, startApply] = useTransition();

    const handleAssess = () => {
        if (!characterId) return;
        setTies(null);
        setApplyNote(null);
        setAssessNote(null);
        startAssess(async () => {
            const r = await assessRelationshipsAction(characterId);
            if (!r.ok) {
                setAssessNote(`評估失敗：${r.error ?? '未知'}`);
                return;
            }
            setTies(r.ties);
            setInclude(Object.fromEntries(r.ties.map((_, i) => [i, true])));
            const extras: string[] = [];
            if (r.skipped) extras.push(`略過：${r.skipped}`);
            if (r.existingOtherIds.length) extras.push(`已有 ${r.existingOtherIds.length} 條公開 tie（上鏈時自動跳過）`);
            setAssessNote(
                r.ties.length === 0
                    ? `沒有提案${extras.length ? `（${extras.join('；')}）` : '（描述中找不到合理關係對象）'}`
                    : `${r.characterName ?? ''} → ${r.ties.length} 條提案${extras.length ? `（${extras.join('；')}）` : ''}`,
            );
        });
    };

    const handleApply = () => {
        if (!characterId || !ties) return;
        const selected = ties.filter((_, i) => include[i]);
        if (selected.length === 0) {
            setApplyNote('沒有勾選任何 tie');
            return;
        }
        setApplyNote(null);
        startApply(async () => {
            const r = await applyRelationshipTiesAction(characterId, selected);
            setApplyNote(
                r.ok
                    ? `已上鏈：seed ${r.seeded} 條、跳過 ${r.skippedExisting} 條、寫入 ${r.memoriesWritten} 段記憶${r.digest ? ` · ${r.digest.slice(0, 10)}…` : ''}`
                    : `上鏈失敗：${r.error ?? '未知'}`,
            );
        });
    };

    const busy = isAssessing || isApplying;
    const selectedCount = ties ? ties.filter((_, i) => include[i]).length : 0;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
                <label className="space-y-1.5">
                    <div className="text-2xs tracking-widest text-mute">角色</div>
                    <select
                        value={characterId}
                        onChange={(e) => setCharacterId(e.target.value)}
                        disabled={busy}
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
                    onClick={handleAssess}
                    disabled={busy || !characterId}
                    className="rounded bg-cinnabar px-4 py-2 text-sm tracking-widest text-canvas hover:bg-seal disabled:opacity-50"
                >
                    {isAssessing ? '評估中…' : '評估關係'}
                </button>
            </div>

            <p className="text-2xs tracking-widest text-mute">
                依公開描述評估此角色與名冊的關係（含「故舊」——故事前就認識），審核後 seed 成導演公開對稱 tie
                + 雙向記憶。冪等：已有的 pair 會自動跳過。需要 admin 錢包有 gas。
                <br />全班批次補帳請用上方的「對帳全班 · 補齊缺漏」（已含關係）。
            </p>

            {assessNote ? <p className="text-2xs tracking-widest text-mute">{assessNote}</p> : null}

            {ties && ties.length > 0 ? (
                <div className="space-y-2">
                    {ties.map((t, i) => (
                        <label
                            key={`${t.otherId}-${i}`}
                            className="flex cursor-pointer gap-3 rounded border border-hairline bg-surface/60 p-3"
                        >
                            <input
                                type="checkbox"
                                checked={include[i] ?? false}
                                onChange={(e) => setInclude((prev) => ({ ...prev, [i]: e.target.checked }))}
                                disabled={busy}
                                className="mt-1"
                            />
                            <div className="space-y-1 text-2xs leading-relaxed">
                                <div className="tracking-widest">
                                    <span className="text-ink">與 {t.otherName}</span>
                                    <span className="text-mute"> · </span>
                                    <span className="text-cinnabar">{TONE_ZH[t.tone] ?? t.tone}</span>
                                    <span className="text-mute"> · </span>
                                    <span className="text-mute">{t.kind === 'prior' ? '故事前就認識' : '初見'}</span>
                                    <span className="text-mute"> · 重要度 {t.importance}</span>
                                </div>
                                <div className="text-ink/90">自述：{t.selfMemory}</div>
                                <div className="text-ink/70">對方：{t.otherMemory}</div>
                            </div>
                        </label>
                    ))}
                    <button
                        type="button"
                        onClick={handleApply}
                        disabled={busy || selectedCount === 0}
                        className="rounded bg-cinnabar px-4 py-2 text-sm tracking-widest text-canvas hover:bg-seal disabled:opacity-50"
                    >
                        {isApplying ? '上鏈中…' : `確認並上鏈 (${selectedCount})`}
                    </button>
                </div>
            ) : null}

            {applyNote ? <p className="text-2xs tracking-widest text-mute">{applyNote}</p> : null}
        </div>
    );
}
