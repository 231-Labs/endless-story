'use client';

import { useState, useTransition } from 'react';
import {
    runReflectionAction,
    type RunReflectionResult,
} from '@/lib/actions/run-reflection';
import { txUrl, objectUrl } from '@/lib/explorer';
import type { Character } from '@endless-story/shared';

/**
 * Admin panel: trigger a character reflection.
 *
 * - **Passive**: free-form interior monologue, no owner question. Useful
 *   for "the character just had a heavy chapter — give her a moment
 *   alone" testing.
 * - **Active**: simulate an owner asking a question without going
 *   through the dossier composer. Useful for QA before letting owners
 *   loose, or for re-running with a different question.
 *
 * Same dry-run / anchor split as the POV trigger + gazette compiler.
 */
export function ReflectionPanel({ characters }: { characters: Character[] }) {
    const [characterId, setCharacterId] = useState<string>(characters[0]?.id ?? '');
    const [mode, setMode] = useState<'passive' | 'active'>('passive');
    const [question, setQuestion] = useState('');
    const [result, setResult] = useState<RunReflectionResult | null>(null);
    const [isPending, startTransition] = useTransition();

    const handleRun = (dryRun: boolean) => {
        if (!characterId) return;
        if (mode === 'active' && !question.trim()) return;
        setResult(null);
        startTransition(async () => {
            const r = await runReflectionAction({
                characterId,
                mode,
                ownerQuestion: mode === 'active' ? question : undefined,
                dryRun,
            });
            setResult(r);
        });
    };

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
                <label className="space-y-1.5">
                    <div className="text-2xs tracking-widest text-mute">角色</div>
                    <select
                        value={characterId}
                        onChange={(e) => setCharacterId(e.target.value)}
                        disabled={isPending}
                        className="w-full rounded border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:border-cinnabar focus:outline-none"
                    >
                        {characters.length === 0 ? (
                            <option value="">— 沒有可選角色 —</option>
                        ) : null}
                        {characters.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name} ({c.id.slice(0, 10)}…)
                            </option>
                        ))}
                    </select>
                </label>

                <label className="space-y-1.5">
                    <div className="text-2xs tracking-widest text-mute">模式</div>
                    <select
                        value={mode}
                        onChange={(e) => setMode(e.target.value as 'passive' | 'active')}
                        disabled={isPending}
                        className="w-full rounded border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:border-cinnabar focus:outline-none"
                    >
                        <option value="passive">passive · 獨</option>
                        <option value="active">active · 答</option>
                    </select>
                </label>
            </div>

            {mode === 'active' ? (
                <label className="block space-y-1.5">
                    <div className="text-2xs tracking-widest text-mute">
                        班主問句（模擬 owner）
                    </div>
                    <textarea
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        rows={3}
                        placeholder="你昨夜在後台是不是哭了？"
                        disabled={isPending}
                        className="w-full rounded border border-hairline bg-surface px-3 py-2 font-serif text-sm text-ink focus:border-cinnabar focus:outline-none"
                    />
                </label>
            ) : (
                <p className="text-2xs leading-relaxed tracking-widest text-mute">
                    無問句 — 角色自己卸了妝、燈滅了、寫給自己的句子。
                </p>
            )}

            <div className="flex flex-wrap gap-3">
                <button
                    type="button"
                    onClick={() => handleRun(true)}
                    disabled={
                        isPending ||
                        !characterId ||
                        (mode === 'active' && !question.trim())
                    }
                    className="rounded border border-hairline bg-surface px-4 py-2 text-sm tracking-widest text-ink hover:bg-elevated disabled:opacity-50"
                >
                    {isPending ? '寫著…' : 'Dry-Run（只看獨白）'}
                </button>
                <button
                    type="button"
                    onClick={() => handleRun(false)}
                    disabled={
                        isPending ||
                        !characterId ||
                        (mode === 'active' && !question.trim())
                    }
                    className="rounded bg-cinnabar px-4 py-2 text-sm tracking-widest text-canvas hover:bg-seal disabled:opacity-50"
                >
                    {isPending ? '上鏈中…' : '上鏈 Anchor'}
                </button>
            </div>

            <p className="text-2xs tracking-widest text-mute">
                LLM 'primary' tier · Walrus + reflection::submit · ImportancE 6 (passive) / 7 (active)
            </p>

            {result ? <ResultView result={result} /> : null}
        </div>
    );
}

function ResultView({ result }: { result: RunReflectionResult }) {
    return (
        <div className="space-y-3 rounded border border-hairline bg-canvas/40 p-4">
            <div className="flex flex-wrap items-center gap-3 text-2xs tracking-widest">
                <span
                    className={`inline-block h-2 w-2 rounded-full ${
                        result.ok ? 'bg-jade' : 'bg-cinnabar'
                    }`}
                />
                <span className="text-mute">
                    {result.skipReason
                        ? `skipped: ${result.skipReason}`
                        : result.anchored
                          ? '已上鏈'
                          : result.ok
                            ? 'Dry-Run'
                            : '失敗'}
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
                {result.reflectionId ? (
                    <a
                        href={objectUrl(result.reflectionId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cinnabar hover:underline"
                    >
                        reflection
                    </a>
                ) : null}
                {result.blobId ? (
                    <a
                        href={`/api/blob/${result.blobId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cinnabar hover:underline"
                        title="走 web proxy 補正 content-type，否則中文會亂碼"
                    >
                        walrus
                    </a>
                ) : null}
            </div>

            {result.error ? (
                <div className="text-sm text-cinnabar">錯誤：{result.error}</div>
            ) : null}

            {result.reflection ? (
                <pre className="overflow-x-auto whitespace-pre-wrap rounded border border-hairline/60 bg-surface p-3 font-serif text-sm leading-loose text-ink">
                    {result.reflection}
                </pre>
            ) : null}
        </div>
    );
}
