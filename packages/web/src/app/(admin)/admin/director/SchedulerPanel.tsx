'use client';

import { useState, useTransition } from 'react';
import {
    runDailyBatchAction,
    type DailyBatchResult,
} from '@/lib/actions/daily-batch';
import { txUrl, objectUrl } from '@/lib/explorer';

/**
 * Admin panel: run one "day of life" for the whole saga.
 *
 * Advances the World tick, then generates a POV chapter for each
 * character (sequential — one keypair, no parallel signing). This is
 * the manual driver for the autonomous loop; a standalone CLI can call
 * the same `runDailyBatchAction` on an interval.
 */
export function SchedulerPanel() {
    const [mode, setMode] = useState<'all' | 'subscribed'>('all');
    const [advance, setAdvance] = useState(true);
    const [result, setResult] = useState<DailyBatchResult | null>(null);
    const [isPending, startTransition] = useTransition();

    const run = (dryRun: boolean) => {
        setResult(null);
        startTransition(async () => {
            const r = await runDailyBatchAction({ advance, mode, dryRun });
            setResult(r);
        });
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-2xs tracking-widest text-mute">
                    <input
                        type="checkbox"
                        checked={advance}
                        onChange={(e) => setAdvance(e.target.checked)}
                        disabled={isPending}
                    />
                    先推進一個 tick
                </label>
                <label className="flex items-center gap-2 text-2xs tracking-widest text-mute">
                    範圍
                    <select
                        value={mode}
                        onChange={(e) => setMode(e.target.value as 'all' | 'subscribed')}
                        disabled={isPending}
                        className="rounded border border-hairline bg-surface px-2 py-1 text-xs text-ink"
                    >
                        <option value="all">全部角色</option>
                        <option value="subscribed">僅有訂閱者</option>
                    </select>
                </label>
            </div>

            <div className="flex flex-wrap gap-3">
                <button
                    type="button"
                    onClick={() => run(true)}
                    disabled={isPending}
                    className="rounded border border-hairline bg-surface px-4 py-2 text-sm tracking-widest text-ink hover:bg-elevated disabled:opacity-50"
                >
                    {isPending ? '跑批中…' : 'Dry-Run（不推進、不上鏈）'}
                </button>
                <button
                    type="button"
                    onClick={() => run(false)}
                    disabled={isPending}
                    className="rounded bg-cinnabar px-4 py-2 text-sm tracking-widest text-canvas hover:bg-seal disabled:opacity-50"
                >
                    {isPending ? '跑批中…' : '推進一日 · 全員生成'}
                </button>
            </div>

            <p className="text-2xs tracking-widest text-mute">
                每位角色依序生成 POV 章回（單一 keypair 不能並簽）。角色多時較慢。
                「僅有訂閱者」對應 POV 訂閱經濟模型；「全部角色」會 forceRun 繞過 gate。
            </p>

            {result ? <BatchResultView result={result} /> : null}
        </div>
    );
}

function BatchResultView({ result }: { result: DailyBatchResult }) {
    return (
        <div className="space-y-3 rounded border border-hairline bg-canvas/40 p-4">
            <div className="flex flex-wrap items-center gap-3 text-2xs tracking-widest">
                <span
                    className={`inline-block h-2 w-2 rounded-full ${
                        result.ok ? 'bg-jade' : 'bg-cinnabar'
                    }`}
                />
                <span className="text-mute">
                    {result.advanced ? '已推進 tick · ' : ''}
                    {result.worldTime
                        ? `第 ${result.worldTime.day} 日 · ${result.worldTime.partOfDay}`
                        : '時間未知'}
                    {' · '}
                    {result.results.length} 名角色
                </span>
            </div>

            {result.error ? (
                <div className="text-sm text-cinnabar">錯誤：{result.error}</div>
            ) : null}

            {result.results.length > 0 ? (
                <ul className="space-y-2">
                    {result.results.map((r) => (
                        <li
                            key={r.characterId}
                            className="space-y-2 rounded border border-hairline/60 bg-surface/40 p-3"
                        >
                            <div className="flex flex-wrap items-center gap-3 text-xs">
                                <span
                                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                                        r.ok ? 'bg-jade' : r.skipReason ? 'bg-mute' : 'bg-cinnabar'
                                    }`}
                                />
                                <span className="text-ink">{r.name}</span>
                                <span className="text-mute">
                                    {r.anchored
                                        ? '已上鏈'
                                        : r.skipReason
                                          ? `skip: ${r.skipReason}`
                                          : r.ok
                                            ? 'dry-run'
                                            : `失敗${r.error ? `：${r.error}` : ''}`}
                                </span>
                                {typeof r.recalledCount === 'number' && r.recalledCount > 0 ? (
                                    <span className="rounded bg-jade/15 px-1.5 py-0.5 text-2xs text-jade">
                                        憶 {r.recalledCount}
                                    </span>
                                ) : null}
                                {r.digest ? (
                                    <a
                                        href={txUrl(r.digest)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-cinnabar hover:underline"
                                    >
                                        tx
                                    </a>
                                ) : null}
                                {r.commitmentId ? (
                                    <a
                                        href={objectUrl(r.commitmentId)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-cinnabar hover:underline"
                                    >
                                        commit
                                    </a>
                                ) : null}
                            </div>
                            {r.chapter ? (
                                <p className="max-w-prose whitespace-pre-wrap font-serif text-sm leading-loose text-ink/85">
                                    {r.chapter}
                                </p>
                            ) : null}
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}
