'use client';

import { useState, useTransition } from 'react';
import {
    runDailyBatchAction,
    type DailyBatchResult,
} from '@/lib/actions/daily-batch';
import { runTickLoopAction, type TickLoopResult } from '@/lib/actions/tick-loop';
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

            <TickLoopSection />
        </div>
    );
}

/* ── N4 — autonomous tick (act + POV + sleep + gazette in one pass) ── */
function TickLoopSection() {
    const [plan, setPlan] = useState(true);
    const [move, setMove] = useState(true);
    const [sleep, setSleep] = useState(true);
    const [gazette, setGazette] = useState(true);
    const [result, setResult] = useState<TickLoopResult | null>(null);
    const [isPending, startTransition] = useTransition();

    const run = (dryRun: boolean) => {
        setResult(null);
        startTransition(async () => {
            const r = await runTickLoopAction({ plan, move, sleep, gazette, dryRun });
            setResult(r);
        });
    };

    return (
        <div className="space-y-3 rounded border border-hairline/60 bg-canvas/30 p-3">
            <div className="text-2xs tracking-widest text-mute">
                自治推進一個 tick（N4 · 世界自己動一輪）
            </div>
            <p className="text-2xs leading-relaxed text-mute">
                一鍵跑完整迴圈：① 推進時間 → ② 每個角色**更新規劃（立志，並行）** → ③ 開著的事件中，
                每個角色**自己出牌**（全員出完即自動收尾）→ ④ 每人寫 POV（dry-run 並行、上鏈序列）
                → ⑤ **夜裡**才睡一覺整理記憶 → ⑥ 編當日公報。上鏈步驟依序簽（單一 keypair）。
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
            <div className="flex flex-wrap gap-3">
                <button
                    type="button"
                    onClick={() => run(true)}
                    disabled={isPending}
                    className="rounded border border-hairline bg-surface px-4 py-2 text-sm tracking-widest text-ink hover:bg-elevated disabled:opacity-50"
                >
                    {isPending ? '跑輪中…' : 'Dry-Run（只預覽 POV）'}
                </button>
                <button
                    type="button"
                    onClick={() => run(false)}
                    disabled={isPending}
                    className="rounded bg-ink px-4 py-2 text-sm tracking-widest text-canvas hover:bg-ink/80 disabled:opacity-50"
                >
                    {isPending ? '世界運轉中…' : '自治推進一個 tick'}
                </button>
            </div>
            {result ? <TickLoopResultView result={result} /> : null}
        </div>
    );
}

function TickLoopResultView({ result }: { result: TickLoopResult }) {
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
                </span>
            </div>
            {result.error ? (
                <div className="text-sm text-cinnabar">錯誤：{result.error}</div>
            ) : null}

            {/* PLAN */}
            {result.plans.length > 0 ? (
                <section className="space-y-1">
                    <div className="text-2xs tracking-widest text-mute">規劃（立志 · 跨 tick 目標）</div>
                    <ul className="space-y-1">
                        {result.plans.map((p) => (
                            <li key={p.characterId} className="text-xs">
                                <span
                                    className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${
                                        p.ok ? 'bg-jade' : 'bg-cinnabar'
                                    }`}
                                />
                                <span className="text-ink">{p.name}</span>
                                {p.ok ? (
                                    <span className="text-mute">
                                        {' '}
                                        {p.hadPrevious ? '（承前）' : '（初志）'}
                                        {p.longTermGoal ? `目標：${p.longTermGoal}` : ''}
                                        {p.dailyPlanHint ? ` · 眼下：${p.dailyPlanHint}` : ''}
                                    </span>
                                ) : (
                                    <span className="text-cinnabar"> {p.error}</span>
                                )}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {/* MOVE */}
            {result.moves.length > 0 ? (
                <section className="space-y-1">
                    <div className="text-2xs tracking-widest text-mute">移動（自主走位）</div>
                    <ul className="space-y-1">
                        {result.moves.map((m) => (
                            <li key={m.characterId} className="text-xs">
                                <span
                                    className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${
                                        m.ok ? 'bg-jade' : 'bg-cinnabar'
                                    }`}
                                />
                                <span className="text-ink">{m.name}</span>
                                {m.ok ? (
                                    <span className="text-mute">
                                        {' '}
                                        走去「{m.toSceneName ?? '別處'}」
                                        {m.reason ? ` — ${m.reason}` : ''}
                                    </span>
                                ) : (
                                    <span className="text-cinnabar"> {m.error}</span>
                                )}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {/* ACT */}
            {result.acts.length > 0 ? (
                <section className="space-y-1">
                    <div className="text-2xs tracking-widest text-mute">出牌（角色自決）</div>
                    <ul className="space-y-1">
                        {result.acts.map((a, i) => (
                            <li key={`${a.eventId}-${a.characterId}-${i}`} className="text-xs">
                                <span
                                    className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${
                                        a.ok ? 'bg-jade' : 'bg-cinnabar'
                                    }`}
                                />
                                <span className="text-ink">{a.name ?? a.characterId.slice(0, 8)}</span>
                                {a.ok ? (
                                    <span className="text-mute">
                                        {' '}
                                        打出「{a.cardLabel}」— {a.intent}
                                    </span>
                                ) : (
                                    <span className="text-cinnabar"> {a.error}</span>
                                )}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : (
                <p className="text-2xs text-mute">（沒有開著的事件可出牌）</p>
            )}

            {/* RESOLVE (judge) */}
            {result.resolves.length > 0 ? (
                <section className="space-y-1">
                    <div className="text-2xs tracking-widest text-mute">收尾（judge 自動結算）</div>
                    <ul className="space-y-1">
                        {result.resolves.map((r, i) => (
                            <li key={`${r.eventId}-${i}`} className="text-xs">
                                <span
                                    className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${
                                        r.ok ? 'bg-jade' : 'bg-cinnabar'
                                    }`}
                                />
                                <span className="text-mute">
                                    事件 {r.eventId.slice(0, 8)}…{' '}
                                    {r.ok ? '已收尾' : `失敗：${r.error ?? ''}`}
                                </span>
                                {r.digest ? (
                                    <a
                                        href={txUrl(r.digest)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="ml-2 text-cinnabar hover:underline"
                                    >
                                        tx
                                    </a>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {/* POV */}
            {result.povs.length > 0 ? (
                <section className="space-y-1">
                    <div className="text-2xs tracking-widest text-mute">章回（POV）</div>
                    <ul className="space-y-1">
                        {result.povs.map((p) => (
                            <li key={p.characterId} className="text-xs">
                                <span
                                    className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${
                                        p.ok ? 'bg-jade' : p.skipReason ? 'bg-mute' : 'bg-cinnabar'
                                    }`}
                                />
                                <span className="text-ink">{p.name}</span>
                                <span className="text-mute">
                                    {' '}
                                    {p.anchored
                                        ? '已上鏈'
                                        : p.skipReason
                                          ? `skip: ${p.skipReason}`
                                          : p.ok
                                            ? 'dry-run'
                                            : `失敗${p.error ? `：${p.error}` : ''}`}
                                    {typeof p.recalledCount === 'number' && p.recalledCount > 0
                                        ? ` · 憶 ${p.recalledCount}`
                                        : ''}
                                </span>
                                {p.digest ? (
                                    <a
                                        href={txUrl(p.digest)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="ml-2 text-cinnabar hover:underline"
                                    >
                                        tx
                                    </a>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {/* SLEEP */}
            {result.sleepNote ? (
                <p className="text-2xs text-mute">睡眠整理：{result.sleepNote}</p>
            ) : null}
            {result.sleeps.length > 0 ? (
                <section className="space-y-1">
                    <div className="text-2xs tracking-widest text-mute">睡眠整理（反思壓縮）</div>
                    <ul className="space-y-1">
                        {result.sleeps.map((s) => (
                            <li key={s.characterId} className="text-xs">
                                <span
                                    className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${
                                        s.anchored ? 'bg-jade' : 'bg-mute'
                                    }`}
                                />
                                <span className="text-ink">{s.name}</span>
                                <span className="text-mute">
                                    {' '}
                                    {s.anchored
                                        ? `沉澱 ${s.reflections?.length ?? 0} 條`
                                        : s.skipReason === 'nothing_to_consolidate'
                                          ? '無可沉澱'
                                          : s.skipReason ?? '—'}
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {/* GAZETTE */}
            {result.gazette ? (
                <section className="text-xs">
                    <span className="text-2xs tracking-widest text-mute">公報：</span>{' '}
                    {result.gazette.anchored ? (
                        <span className="text-jade">
                            已編 · 事件 {result.gazette.eventCount} · 章回 {result.gazette.chapterCount}
                        </span>
                    ) : (
                        <span className="text-mute">
                            {result.gazette.skipReason ?? result.gazette.error ?? '未編'}
                        </span>
                    )}
                    {result.gazette.digest ? (
                        <a
                            href={txUrl(result.gazette.digest)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 text-cinnabar hover:underline"
                        >
                            tx
                        </a>
                    ) : null}
                </section>
            ) : null}
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
