'use client';

import { useState, useTransition } from 'react';
import { runDirectorAction, type RunDirectorActionResult } from '@/lib/actions/run-director';

export function DirectorPanel() {
    const [intent, setIntent] = useState('想看感情戲');
    const [result, setResult] = useState<RunDirectorActionResult | null>(null);
    const [isPending, startTransition] = useTransition();

    const handleRun = (dryRun: boolean) => {
        setResult(null);
        startTransition(async () => {
            const r = await runDirectorAction({ intent, dryRun });
            setResult(r);
        });
    };

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <label className="text-xs tracking-widest text-mute">班主意圖</label>
                <textarea
                    value={intent}
                    onChange={(e) => setIntent(e.target.value)}
                    rows={3}
                    className="w-full rounded border border-hairline bg-surface px-3 py-2 font-serif text-base text-ink focus:border-cinnabar focus:outline-none"
                    placeholder="想看感情戲 / 春雪社最近太安逸了，給他們一點麻煩 / ..."
                    disabled={isPending}
                />
            </div>

            <div className="flex gap-3">
                <button
                    type="button"
                    onClick={() => handleRun(true)}
                    disabled={isPending || !intent.trim()}
                    className="rounded border border-hairline bg-surface px-4 py-2 text-sm tracking-widest text-ink transition-colors hover:bg-elevated disabled:opacity-50"
                >
                    {isPending ? '思考中…' : 'Dry-Run（只看 LLM 選什麼）'}
                </button>
                <button
                    type="button"
                    onClick={() => handleRun(false)}
                    disabled={isPending || !intent.trim()}
                    className="rounded bg-cinnabar px-4 py-2 text-sm tracking-widest text-canvas transition-colors hover:bg-seal disabled:opacity-50"
                >
                    {isPending ? '推進中…' : 'Dispatch（上鏈）'}
                </button>
            </div>

            {result ? <ResultView result={result} /> : null}
        </div>
    );
}

function ResultView({ result }: { result: RunDirectorActionResult }) {
    return (
        <div className="space-y-4 rounded border border-hairline bg-canvas/30 p-4">
            <div className="flex items-center gap-3">
                <span
                    className={`inline-block h-2 w-2 rounded-full ${
                        result.ok ? 'bg-jade' : 'bg-cinnabar'
                    }`}
                />
                <span className="text-xs tracking-widest text-mute">
                    {result.ok ? (result.digest ? '已上鏈' : 'Dry-run 完成') : '失敗'}
                </span>
                {result.digest ? (
                    <a
                        href={`https://suivision.xyz/txblock/${result.digest}?network=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-cinnabar hover:underline"
                    >
                        digest: {result.digest.slice(0, 10)}…
                    </a>
                ) : null}
            </div>

            {result.error ? (
                <div className="text-sm text-cinnabar">錯誤：{result.error}</div>
            ) : null}

            {result.rationale ? (
                <div>
                    <p className="text-2xs tracking-widest text-mute">LLM 內心</p>
                    <p className="mt-1 font-serif text-sm italic text-ink/80">{result.rationale}</p>
                </div>
            ) : null}

            {result.capabilities.length > 0 ? (
                <div>
                    <p className="text-2xs tracking-widest text-mute">挑了 {result.capabilities.length} 個 capability</p>
                    <ul className="mt-2 space-y-2">
                        {result.capabilities.map((cap, i) => (
                            <li
                                key={i}
                                className="rounded bg-surface px-3 py-2 font-mono text-xs text-ink"
                            >
                                <pre className="overflow-x-auto whitespace-pre-wrap">{JSON.stringify(cap, null, 2)}</pre>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            {result.errors && result.errors.length > 0 ? (
                <div>
                    <p className="text-2xs tracking-widest text-cinnabar">驗證警告</p>
                    <ul className="mt-1 list-disc pl-5 text-xs text-mute">
                        {result.errors.map((e, i) => (
                            <li key={i}>{e}</li>
                        ))}
                    </ul>
                </div>
            ) : null}

            {result.llmResponseRaw ? (
                <details className="text-xs">
                    <summary className="cursor-pointer text-mute">原始 LLM 回應</summary>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-surface p-2 font-mono text-2xs text-ink/70">
                        {result.llmResponseRaw}
                    </pre>
                </details>
            ) : null}
        </div>
    );
}
