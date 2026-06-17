'use client';

import { useState, useTransition } from 'react';
import { runShowrunnerAction } from '@/lib/actions/showrunner';
import type { ShowrunnerResult } from '@/lib/director/showrunner';
import type { ShowrunnerLogEntry } from '@/lib/director/memory-store';
import { Markdown } from '@/components/common/Markdown';

/**
 * Admin panel: run one Showrunner heartbeat (dry-run = read-only evaluation,
 * live = audit → repair → intervene), show the resulting 導演日誌 + tool
 * trail, and display the persistent arc plan / recent log.
 */
export function ShowrunnerPanel({
    initialArcPlan,
    initialLog,
}: {
    initialArcPlan: string;
    initialLog: ShowrunnerLogEntry[];
}) {
    const [result, setResult] = useState<ShowrunnerResult | null>(null);
    const [arcPlan, setArcPlan] = useState(initialArcPlan);
    const [log, setLog] = useState<ShowrunnerLogEntry[]>(initialLog);
    const [isPending, startTransition] = useTransition();

    const handleRun = (dryRun: boolean) => {
        setResult(null);
        startTransition(async () => {
            const r = await runShowrunnerAction({ dryRun });
            setResult(r);
            if (r.ok) {
                setArcPlan(r.arcPlan);
                setLog((prev) =>
                    [
                        ...prev,
                        {
                            at: new Date().toISOString(),
                            day: r.audit.day,
                            report: r.report,
                            toolCalls: r.toolCalls,
                        },
                    ].slice(-10),
                );
            }
        });
    };

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap gap-3">
                <button
                    type="button"
                    onClick={() => handleRun(true)}
                    disabled={isPending}
                    className="rounded border border-hairline bg-surface px-4 py-2 text-sm tracking-widest text-ink hover:bg-elevated disabled:opacity-50"
                >
                    {isPending ? '心跳中…' : 'Dry-Run（只巡檢評估，不動手）'}
                </button>
                <button
                    type="button"
                    onClick={() => handleRun(false)}
                    disabled={isPending}
                    className="rounded bg-cinnabar px-4 py-2 text-sm tracking-widest text-canvas hover:bg-seal disabled:opacity-50"
                >
                    {isPending ? '心跳中…' : '跑一次心跳（巡檢→補漏→干預）'}
                </button>
            </div>
            <p className="text-2xs tracking-widest text-mute">
                headless 排程：world-loop 加 <code>--showrunner-every=N</code>（或 env
                SHOWRUNNER_EVERY_TICKS），每 N tick POST /api/showrunner。
            </p>

            {result ? <HeartbeatResult result={result} /> : null}

            <div className="rounded border border-hairline bg-canvas/40 p-4">
                <h3 className="text-xs tracking-widest text-mute">弧線計畫（跨心跳記憶）</h3>
                {arcPlan ? (
                    <Markdown source={arcPlan} compact className="mt-2" />
                ) : (
                    <p className="mt-2 text-sm leading-relaxed text-mute">
                        （尚無 —— 第一次心跳會建立第一版）
                    </p>
                )}
            </div>

            {log.length > 0 ? (
                <div className="space-y-3">
                    <h3 className="text-xs tracking-widest text-mute">導演日誌（新→舊）</h3>
                    {[...log].reverse().map((entry, i) => (
                        <div key={`${entry.at}-${i}`} className="rounded border border-hairline bg-canvas/40 p-4">
                            <div className="flex flex-wrap items-center gap-3 text-2xs tracking-widest text-mute">
                                <span>{entry.at.slice(0, 16).replace('T', ' ')}</span>
                                {entry.day != null ? <span>第{entry.day}日</span> : null}
                                <span>工具 {entry.toolCalls.filter((c) => c.ok).length}/{entry.toolCalls.length}</span>
                            </div>
                            <Markdown source={entry.report} compact className="mt-2" />
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function HeartbeatResult({ result }: { result: ShowrunnerResult }) {
    return (
        <div className="space-y-3 rounded border border-hairline bg-canvas/40 p-4">
            <div className="flex flex-wrap items-center gap-3 text-2xs tracking-widest">
                <span
                    className={`inline-block h-2 w-2 rounded-full ${result.ok ? 'bg-jade' : 'bg-cinnabar'}`}
                />
                <span className="text-mute">
                    巡檢 {result.audit.issues.length} 項 · 工具{' '}
                    {result.toolCalls.filter((c) => c.ok).length}/{result.toolCalls.length}
                    {result.repair ? ` · 機械補漏 ${result.repair.attempted}` : ''}
                </span>
            </div>
            {result.error ? (
                <p className="text-sm text-cinnabar">{result.error}</p>
            ) : null}
            {result.toolCalls.length > 0 ? (
                <ul className="space-y-1 text-2xs tracking-widest text-mute">
                    {result.toolCalls.map((c, i) => (
                        <li key={i}>
                            {c.ok ? '✓' : '✗'} {c.tool} ({c.ms}ms)
                        </li>
                    ))}
                </ul>
            ) : null}
            <Markdown source={result.report} compact />
        </div>
    );
}
