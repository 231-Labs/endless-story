'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import {
    runDailyBatchAction,
    type DailyBatchResult,
} from '@/lib/actions/daily-batch';
import { runTickLoopAction, type TickLoopResult } from '@/lib/actions/tick-loop';
import {
    BatchResultView,
    TickLoopResultView,
    parseCharacterIds,
} from './scheduler/result-views';

const DEMO_CAST_IDS = [
    '0x1dff99a3adf385874ae06066a1064a308d9d32907b35ef2ae63023ef9776a349',
    '0xa6832662d55a02c09d556c41d4d8bc44c17f0fb3e6338f70c332f63458cdafc7',
    '0xc162a7e009a4d63ccf89c7773ea5fc0e3516eca05a536e4d40a042c9883509f6',
];

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

            <TickLoopSection />
        </div>
    );
}

/* ── N4 — autonomous tick (plan + move + drama + social + act + POV) ── */
function TickLoopSection() {
    const [plan, setPlan] = useState(true);
    const [move, setMove] = useState(true);
    const [pov, setPov] = useState(true);
    const [sleep, setSleep] = useState(true);
    const [gazette, setGazette] = useState(true);
    const [maxCharacters, setMaxCharacters] = useState('6');
    const [characterIdsText, setCharacterIdsText] = useState('');
    const [result, setResult] = useState<TickLoopResult | null>(null);
    const [isPending, startTransition] = useTransition();

    const [intervalSec, setIntervalSec] = useState('60');
    const [loopRunning, setLoopRunning] = useState(false);
    const [loopCount, setLoopCount] = useState(0);
    const [loopLast, setLoopLast] = useState<TickLoopResult | null>(null);
    const [loopError, setLoopError] = useState<string | null>(null);
    const runningRef = useRef(false);

    // Stop the local runner if the panel unmounts (tab close / navigation away).
    useEffect(() => () => {
        runningRef.current = false;
    }, []);

    const buildInput = (dryRun: boolean) => {
        const parsedMax = Number(maxCharacters);
        const characterIds = parseCharacterIds(characterIdsText);
        return {
            plan,
            move,
            pov,
            sleep,
            gazette,
            dryRun,
            ...(Number.isFinite(parsedMax) && parsedMax > 0
                ? { maxCharacters: Math.floor(parsedMax) }
                : {}),
            ...(characterIds.length > 0 ? { characterIds } : {}),
        };
    };

    const run = (dryRun: boolean) => {
        setResult(null);
        startTransition(async () => {
            const r = await runTickLoopAction(buildInput(dryRun));
            setResult(r);
        });
    };

    // Local "runner": drive REAL ticks on an interval, sequential + non-overlapping
    // (mirrors packages/cli/scripts/world-loop.ts, but browser-driven). Options +
    // interval are snapshotted at start; change them and restart to apply.
    const startLoop = () => {
        if (runningRef.current) return;
        const input = buildInput(false);
        const sec = Math.max(5, Math.floor(Number(intervalSec) || 60));
        runningRef.current = true;
        setLoopRunning(true);
        setLoopError(null);
        setLoopCount(0);
        void (async () => {
            while (runningRef.current) {
                setLoopCount((n) => n + 1);
                try {
                    const r = await runTickLoopAction(input);
                    setLoopLast(r);
                    setLoopError(r.ok ? null : r.error ?? 'tick 失敗');
                } catch (e) {
                    setLoopError(e instanceof Error ? e.message : String(e));
                }
                // Interruptible sleep: 100ms chunks so Stop responds promptly.
                for (let i = 0; i < sec * 10 && runningRef.current; i += 1) {
                    await new Promise((res) => setTimeout(res, 100));
                }
            }
            setLoopRunning(false);
        })();
    };

    const stopLoop = () => {
        runningRef.current = false;
        setLoopRunning(false);
    };

    return (
        <div className="space-y-3 rounded border border-hairline/60 bg-canvas/30 p-3">
            <div className="text-2xs tracking-widest text-mute">
                自治推進一個 tick（N4 · 世界自己動一輪）
            </div>
            <p className="text-2xs leading-relaxed text-mute">
                一鍵跑完整迴圈：PLAN 更新規劃 → MOVE 自主走位 → DRAMA 推導稀缺張力
                → SOCIAL 同場觀察/搭話 → ACT 開著事件中角色自己出牌 → POV 章回
                → 夜裡 SLEEP 整理記憶 → GAZETTE 編公報。上鏈步驟依序簽（單一 keypair）。
                若只要檢查 DRAMA/SOCIAL，可先關掉 POV 省下最慢的章回生成。
                Dry-run 不寫入 memory、scene-lines 或鏈上 anchor；它只能驗本輪決策，
                不能驗第二輪記憶召回。
            </p>
            <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-2xs tracking-widest text-mute">
                    <input
                        type="checkbox"
                        checked={plan}
                        onChange={(e) => setPlan(e.target.checked)}
                        disabled={isPending}
                    />
                    含更新規劃
                </label>
                <label className="flex items-center gap-2 text-2xs tracking-widest text-mute">
                    <input
                        type="checkbox"
                        checked={move}
                        onChange={(e) => setMove(e.target.checked)}
                        disabled={isPending}
                    />
                    含自主移動
                </label>
                <label className="flex items-center gap-2 text-2xs tracking-widest text-mute">
                    <input
                        type="checkbox"
                        checked={pov}
                        onChange={(e) => setPov(e.target.checked)}
                        disabled={isPending}
                    />
                    含 POV 章回
                </label>
                <label className="flex items-center gap-2 text-2xs tracking-widest text-mute">
                    <input
                        type="checkbox"
                        checked={sleep}
                        onChange={(e) => setSleep(e.target.checked)}
                        disabled={isPending}
                    />
                    含睡眠整理
                </label>
                <label className="flex items-center gap-2 text-2xs tracking-widest text-mute">
                    <input
                        type="checkbox"
                        checked={gazette}
                        onChange={(e) => setGazette(e.target.checked)}
                        disabled={isPending}
                    />
                    含編公報
                </label>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
                <label className="flex flex-col gap-1 text-2xs tracking-widest text-mute">
                    上限
                    <input
                        type="number"
                        min={1}
                        max={12}
                        value={maxCharacters}
                        onChange={(e) => setMaxCharacters(e.target.value)}
                        disabled={isPending}
                        className="rounded border border-hairline bg-surface px-2 py-1 text-sm text-ink"
                    />
                </label>
                <label className="flex flex-col gap-1 text-2xs tracking-widest text-mute">
                    <span className="flex items-center justify-between gap-2">
                        角色 IDS
                        <button
                            type="button"
                            onClick={() => {
                                setMaxCharacters('3');
                                setCharacterIdsText(DEMO_CAST_IDS.join('\n'));
                            }}
                            disabled={isPending}
                            className="rounded border border-hairline bg-surface px-2 py-0.5 text-2xs text-ink hover:bg-elevated disabled:opacity-50"
                        >
                            孟/顧/柳
                        </button>
                    </span>
                    <textarea
                        value={characterIdsText}
                        onChange={(e) => setCharacterIdsText(e.target.value)}
                        disabled={isPending}
                        rows={2}
                        placeholder="0x... , 0x... 或換行貼上"
                        className="rounded border border-hairline bg-surface px-2 py-1 font-mono text-xs text-ink"
                    />
                </label>
            </div>
            <div className="flex flex-wrap gap-3">
                <button
                    type="button"
                    onClick={() => run(true)}
                    disabled={isPending || loopRunning}
                    className="rounded border border-hairline bg-surface px-4 py-2 text-sm tracking-widest text-ink hover:bg-elevated disabled:opacity-50"
                >
                    {isPending ? '跑輪中…' : pov ? 'Dry-Run（預覽 POV）' : 'Dry-Run（快速檢查）'}
                </button>
                <button
                    type="button"
                    onClick={() => run(false)}
                    disabled={isPending || loopRunning}
                    className="rounded bg-ink px-4 py-2 text-sm tracking-widest text-canvas hover:bg-ink/80 disabled:opacity-50"
                >
                    {isPending ? '世界運轉中…' : '自治推進一個 tick'}
                </button>
            </div>

            {/* Local Runner — continuous autonomous loop (browser-driven, same as CLI world-loop) */}
            <div className="space-y-2 rounded border border-jade/30 bg-jade/5 p-3">
                <div className="text-2xs tracking-widest text-mute">
                    本機 Runner · 連續自治（每 N 秒一 tick · 真實上鏈 · 序列不重疊）
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-2xs tracking-widest text-mute">
                        間隔（秒）
                        <input
                            type="number"
                            min={5}
                            value={intervalSec}
                            onChange={(e) => setIntervalSec(e.target.value)}
                            disabled={loopRunning}
                            className="w-20 rounded border border-hairline bg-surface px-2 py-1 text-sm text-ink"
                        />
                    </label>
                    {loopRunning ? (
                        <button
                            type="button"
                            onClick={stopLoop}
                            className="rounded bg-cinnabar px-4 py-2 text-sm tracking-widest text-canvas hover:bg-seal"
                        >
                            ■ 停止
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={startLoop}
                            disabled={isPending}
                            className="rounded bg-jade px-4 py-2 text-sm tracking-widest text-canvas hover:bg-jade/80 disabled:opacity-50"
                        >
                            ▶ 啟動本機 Runner
                        </button>
                    )}
                    {loopRunning ? (
                        <span className="flex items-center gap-2 text-2xs tracking-widest text-jade">
                            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-jade" />
                            運轉中 · 已跑 {loopCount} tick
                        </span>
                    ) : loopCount > 0 ? (
                        <span className="text-2xs tracking-widest text-mute">已停止 · 共 {loopCount} tick</span>
                    ) : null}
                </div>
                {loopError ? <div className="text-xs text-cinnabar">最近錯誤：{loopError}</div> : null}
                <p className="text-2xs leading-relaxed text-mute">
                    以上方的勾選 / 上限 / 角色 IDS 當每輪參數（啟動當下快照,改動需重新啟動）。
                    這顆等同 CLI 的 world-loop,只是在瀏覽器驅動;關掉此分頁即自動停止。
                </p>
                {loopLast ? <TickLoopResultView result={loopLast} /> : null}
            </div>

            {result ? <TickLoopResultView result={result} /> : null}
        </div>
    );
}
