'use client';

import { useState, useTransition } from 'react';
import { useSagaAdmin } from '@/lib/hooks/useSagaAdmin';
import { runPovAction, type RunPovResult } from '@/lib/actions/run-pov-worker';
import { txUrl, objectUrl } from '@/lib/explorer';

/**
 * Admin-only trigger for runner's character POV worker.
 *
 * Hidden for non-saga-admin. Bypasses subscriber gate (admin testing
 * tool). Result inline so the admin can see what the LLM produced
 * + verify chain anchor.
 */
export function PovTriggerButton({ characterId }: { characterId: string }) {
    const { isSagaAdmin } = useSagaAdmin();
    const [triggerNarrative, setTriggerNarrative] = useState('');
    const [result, setResult] = useState<RunPovResult | null>(null);
    const [isPending, startTransition] = useTransition();

    if (!isSagaAdmin) return null;

    const handleRun = (dryRun: boolean) => {
        setResult(null);
        startTransition(async () => {
            const r = await runPovAction({
                characterId,
                triggerNarrative: triggerNarrative.trim() || undefined,
                dryRun,
                forceRun: true,
            });
            setResult(r);
        });
    };

    return (
        <details className="mt-6 rounded border border-hairline bg-canvas/40 p-4">
            <summary className="cursor-pointer text-xs tracking-widest text-cinnabar">
                ▸ 導演工具 · 觸發 POV 章回
            </summary>

            <div className="mt-4 space-y-3">
                <label className="block text-2xs tracking-widest text-mute">
                    觸發語（可空 — 預設「請寫下你此刻心境」）
                </label>
                <textarea
                    value={triggerNarrative}
                    onChange={(e) => setTriggerNarrative(e.target.value)}
                    rows={2}
                    placeholder="你剛剛在後台化妝間與林某起了口角…"
                    disabled={isPending}
                    className="w-full rounded border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:border-cinnabar focus:outline-none"
                />
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => handleRun(true)}
                        disabled={isPending}
                        className="rounded border border-hairline bg-surface px-3 py-1.5 text-xs tracking-widest text-ink hover:bg-elevated disabled:opacity-50"
                    >
                        {isPending ? '生成中…' : 'Dry-Run（只看文字）'}
                    </button>
                    <button
                        type="button"
                        onClick={() => handleRun(false)}
                        disabled={isPending}
                        className="rounded bg-cinnabar px-3 py-1.5 text-xs tracking-widest text-canvas hover:bg-seal disabled:opacity-50"
                    >
                        {isPending ? '上鏈中…' : '上鏈 Anchor'}
                    </button>
                </div>

                {result ? <PovResult result={result} /> : null}
            </div>
        </details>
    );
}

function PovResult({ result }: { result: RunPovResult }) {
    return (
        <div className="space-y-3 rounded bg-surface p-3">
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
                          : 'Dry-Run'}
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
                {result.commitmentId ? (
                    <a
                        href={objectUrl(result.commitmentId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cinnabar hover:underline"
                    >
                        commitment
                    </a>
                ) : null}
                {result.blobUrl ? (
                    <a
                        href={result.blobUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cinnabar hover:underline"
                    >
                        walrus
                    </a>
                ) : null}
            </div>

            {result.error ? (
                <div className="text-xs text-cinnabar">錯誤：{result.error}</div>
            ) : null}

            {result.chapter ? (
                <div className="rounded border border-hairline/60 bg-canvas/40 p-3">
                    <p className="font-serif text-sm leading-loose text-ink whitespace-pre-wrap">
                        {result.chapter}
                    </p>
                </div>
            ) : null}
        </div>
    );
}
