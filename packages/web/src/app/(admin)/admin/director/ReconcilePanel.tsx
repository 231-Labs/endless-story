'use client';

import { useState, useTransition } from 'react';
import {
    reconcileSagaAction,
    type ReconcileResult,
    type ReconcileStep,
    type ReconcileStepName,
    type ReconcileStatus,
} from '@/lib/actions/reconcile-character';

const STEP_LABEL: Record<ReconcileStepName, string> = {
    portrait: '主圖',
    views: '設定集',
    tags: '標籤',
    persona: '本色',
    appearance: '形貌',
    memory: '記憶',
    relationship: '關係',
    skills: '技藝',
    prologue: '創世序章',
};

const STATUS_DOT: Record<ReconcileStatus, string> = {
    ok: 'bg-jade',
    skip: 'bg-mute',
    fail: 'bg-cinnabar',
};

/**
 * Reconcile / re-issue — one idempotent button that makes every saga character WHOLE.
 * Reuses the mint generators; only fills the gaps (portrait / profile / tags / persona / memories / relationships),
 * so re-running is safe (anything already present just shows "skipped"). This is the
 * SINGLE saga-wide batch entry — incl. relationship backfill (mint-ordering backfill).
 */
export function ReconcilePanel() {
    const [results, setResults] = useState<ReconcileResult[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const run = () => {
        setResults(null);
        setError(null);
        startTransition(async () => {
            const r = await reconcileSagaAction();
            if (!r.ok && r.error) setError(r.error);
            setResults(r.results);
        });
    };

    return (
        <div className="space-y-4">
            <button
                type="button"
                onClick={run}
                disabled={isPending}
                className="rounded bg-ink px-4 py-2 text-sm tracking-widest text-canvas hover:bg-ink/80 disabled:opacity-50"
            >
                {isPending ? '對帳中…（可能生圖 + 上鏈,需數十秒）' : '對帳全班 · 補齊缺漏'}
            </button>
            <p className="text-2xs leading-relaxed text-mute">
                掃描全班,逐一補齊缺的<strong className="text-ink">主圖 / 設定集 / 標籤 / 本色 / 形貌 / 記憶 / 關係 / 技藝 / 序章</strong>。
                idempotent —— 已有的會「跳過」,可安心重跑。序列執行(單一 keypair),角色多時較慢。
                這是<strong className="text-ink">唯一的全班批次入口</strong>(含關係補帳)。
            </p>
            {error ? <div className="text-sm text-cinnabar">錯誤：{error}</div> : null}
            {results ? (
                <ul className="space-y-2">
                    {results.map((r) => (
                        <li
                            key={r.characterId}
                            className="space-y-1 rounded border border-hairline/60 bg-surface/40 p-3"
                        >
                            <div className="flex items-center gap-2 text-xs">
                                <span
                                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                                        r.ok ? 'bg-jade' : 'bg-cinnabar'
                                    }`}
                                />
                                <span className="text-ink">{r.name || r.characterId.slice(0, 10)}</span>
                                {r.error ? <span className="text-cinnabar"> {r.error}</span> : null}
                            </div>
                            <div className="flex flex-wrap gap-x-3 gap-y-1">
                                {r.steps.map((s: ReconcileStep) => (
                                    <span
                                        key={s.step}
                                        title={s.detail ?? ''}
                                        className="flex items-center gap-1 text-2xs tracking-widest text-mute"
                                    >
                                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[s.status]}`} />
                                        {STEP_LABEL[s.step]}
                                        {s.status === 'ok' ? '✓' : s.status === 'fail' ? '✕' : ''}
                                    </span>
                                ))}
                            </div>
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}
