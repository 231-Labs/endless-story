'use client';

import { useState, useTransition } from 'react';
import {
    compileGazetteAction,
    type CompileGazetteActionResult,
} from '@/lib/actions/compile-gazette';
import { txUrl, objectUrl } from '@/lib/explorer';

/**
 * Admin panel: compile a saga gazette from recent chain events +
 * POV chapters. Same Dry-Run / Anchor split as the POV trigger.
 */
export function GazettePanel() {
    const [result, setResult] = useState<CompileGazetteActionResult | null>(null);
    const [isPending, startTransition] = useTransition();

    const handleRun = (dryRun: boolean) => {
        setResult(null);
        startTransition(async () => {
            const r = await compileGazetteAction({ dryRun });
            setResult(r);
        });
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
                <button
                    type="button"
                    onClick={() => handleRun(true)}
                    disabled={isPending}
                    className="rounded border border-hairline bg-surface px-4 py-2 text-sm tracking-widest text-ink hover:bg-elevated disabled:opacity-50"
                >
                    {isPending ? '編公報中…' : 'Dry-Run（只看 markdown）'}
                </button>
                <button
                    type="button"
                    onClick={() => handleRun(false)}
                    disabled={isPending}
                    className="rounded bg-cinnabar px-4 py-2 text-sm tracking-widest text-canvas hover:bg-seal disabled:opacity-50"
                >
                    {isPending ? '上鏈中…' : '編公報並上鏈'}
                </button>
            </div>
            <p className="text-2xs tracking-widest text-mute">
                抓最近 director 事件 + POV 章回 → 模板 + LLM 縫合 → Walrus + commitment::commit (subject_id=saga)。
                當日無事件時自動 skip。
            </p>

            {result ? <ResultView result={result} /> : null}
        </div>
    );
}

function ResultView({ result }: { result: CompileGazetteActionResult }) {
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
                          : 'Dry-Run'}
                </span>
                <span className="text-mute">
                    {result.eventCount} 事件 · {result.chapterCount} 章回
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

            {result.markdown ? (
                <pre className="overflow-x-auto whitespace-pre-wrap rounded border border-hairline/60 bg-surface p-3 font-serif text-sm leading-loose text-ink">
                    {result.markdown}
                </pre>
            ) : null}
        </div>
    );
}
