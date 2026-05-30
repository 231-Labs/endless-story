'use client';

import { useEffect, useState, useTransition } from 'react';
import type { Character, Scene } from '@endless-story/shared';
import {
    createBudgetEventAction,
    dealHandAction,
    resolveEventAction,
    type ActionResult,
    type CreateBudgetEventResult,
} from '@/lib/actions/budget-event';
import {
    runCharacterTurnAction,
    type CharacterTurnResult,
} from '@/lib/actions/character-turn';
import {
    fetchBudgetEvents,
    fetchBudgetEventDetail,
    type BudgetEventEntry,
    type BudgetEventDetail,
} from '@/lib/chain/event-read';
import { txUrl, objectUrl } from '@/lib/explorer';

/**
 * Admin panel: BudgetEvent (event.move 1.6) lifecycle controller.
 *
 * Three steps mapped 1:1 to admin server actions:
 *   1. 開事件 — push_event (admin signs storyteller cap)
 *   2. 發牌 — deal_participant_hand per character (entry fun → 1 tx each)
 *   3. 結算 — resolve_event with empty outcomes
 *
 * Catalog is a preset 4-card demo deck (KILL / ATTACK / SOCIAL / WITNESS).
 * Custom catalog editor + outcomes composer are v2.
 */
export function EventPanel({
    scenes,
    characters,
}: {
    scenes: Scene[];
    characters: Character[];
}) {
    const [events, setEvents] = useState<BudgetEventEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshNonce, setRefreshNonce] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        fetchBudgetEvents({ limit: 20 })
            .then((list) => {
                if (!cancelled) setEvents(list);
            })
            .catch(() => {
                if (!cancelled) setEvents([]);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [refreshNonce]);

    return (
        <div className="space-y-8">
            <CreateForm
                scenes={scenes}
                characters={characters}
                onCreated={() => setRefreshNonce((n) => n + 1)}
            />

            <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                    <h3 className="font-serif text-base text-ink">近期事件</h3>
                    <button
                        type="button"
                        onClick={() => setRefreshNonce((n) => n + 1)}
                        className="text-2xs tracking-widest text-mute hover:text-cinnabar"
                    >
                        ↻ 重整
                    </button>
                </div>
                {loading && events.length === 0 ? (
                    // Only show the placeholder on the FIRST load. On a refresh
                    // (events already populated) keep the list mounted so an
                    // expanded event — and its character-decision result — isn't
                    // unmounted/collapsed every time you act.
                    <p className="text-sm text-mute">讀取中…</p>
                ) : events.length === 0 ? (
                    <p className="text-sm text-mute">
                        鏈上還沒事件。用上方表單開第一個。
                    </p>
                ) : (
                    <ul className="space-y-3">
                        {events.map((ev) => (
                            <EventRow
                                key={ev.eventId}
                                summary={ev}
                                characters={characters}
                                scenes={scenes}
                                onMutated={() => setRefreshNonce((n) => n + 1)}
                            />
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

/* ──── create form ──── */

function CreateForm({
    scenes,
    characters,
    onCreated,
}: {
    scenes: Scene[];
    characters: Character[];
    onCreated: () => void;
}) {
    // Default to the first scene that has at least one character — that's
    // the most useful default. Falls back to `scenes[0]` so empty deployments
    // still pick something.
    const sceneCharCount = (sceneId: string) =>
        characters.filter((c) => c.currentSceneId === sceneId).length;
    const firstPopulated = scenes.find((s) => sceneCharCount(s.id) > 0);
    const [sceneId, setSceneId] = useState<string>(
        firstPopulated?.id ?? scenes[0]?.id ?? '',
    );
    const [title, setTitle] = useState('');
    const [summary, setSummary] = useState('');
    const [scale, setScale] = useState(3);
    const [result, setResult] = useState<CreateBudgetEventResult | null>(null);
    const [isPending, startTransition] = useTransition();

    const handleSubmit = () => {
        if (!sceneId || !title.trim()) return;
        setResult(null);
        startTransition(async () => {
            const r = await createBudgetEventAction({
                sceneId,
                title: title.trim(),
                summary: summary.trim(),
                scale,
            });
            setResult(r);
            if (r.ok) {
                setTitle('');
                setSummary('');
                onCreated();
            }
        });
    };

    return (
        <div className="space-y-3 rounded border border-hairline bg-canvas/40 p-4">
            <h3 className="font-serif text-base text-ink">開新事件</h3>
            <p className="text-2xs tracking-widest text-mute">
                預設牌組：斬 / 攻 / 敘 / 觀，每位參與者抽 3 張。建立後到下方「發牌」加入角色。
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                    <div className="text-2xs tracking-widest text-mute">場景</div>
                    <select
                        value={sceneId}
                        onChange={(e) => setSceneId(e.target.value)}
                        disabled={isPending}
                        className="w-full rounded border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:border-cinnabar focus:outline-none"
                    >
                        {scenes.length === 0 ? (
                            <option value="">— 無場景 —</option>
                        ) : null}
                        {scenes.map((s) => {
                            const n = sceneCharCount(s.id);
                            return (
                                <option key={s.id} value={s.id}>
                                    {s.name} · {n} 人
                                </option>
                            );
                        })}
                    </select>
                </label>

                <label className="space-y-1.5">
                    <div className="text-2xs tracking-widest text-mute">scale (1–5)</div>
                    <input
                        type="number"
                        min={1}
                        max={5}
                        value={scale}
                        onChange={(e) => setScale(Number(e.target.value))}
                        disabled={isPending}
                        className="w-full rounded border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:border-cinnabar focus:outline-none"
                    />
                </label>
            </div>

            <label className="block space-y-1.5">
                <div className="text-2xs tracking-widest text-mute">標題</div>
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="後台一場口角"
                    disabled={isPending}
                    className="w-full rounded border border-hairline bg-surface px-3 py-2 font-serif text-sm text-ink focus:border-cinnabar focus:outline-none"
                />
            </label>

            <label className="block space-y-1.5">
                <div className="text-2xs tracking-widest text-mute">摘要</div>
                <textarea
                    rows={2}
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="林某與沈伶在後台化妝間口角…"
                    disabled={isPending}
                    className="w-full rounded border border-hairline bg-surface px-3 py-2 font-serif text-sm text-ink focus:border-cinnabar focus:outline-none"
                />
            </label>

            <div className="flex items-center justify-between gap-3">
                <p className="text-2xs tracking-widest text-mute">
                    push_event · storyteller cap-gated
                </p>
                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!sceneId || !title.trim() || isPending}
                    className="rounded bg-cinnabar px-4 py-2 text-sm tracking-widest text-canvas hover:bg-seal disabled:opacity-50"
                >
                    {isPending ? '建立中…' : '上鏈 · 開事件'}
                </button>
            </div>

            {result ? <CreateResult result={result} /> : null}
        </div>
    );
}

function CreateResult({ result }: { result: CreateBudgetEventResult }) {
    return (
        <div className="flex flex-wrap items-center gap-3 text-2xs tracking-widest">
            <span
                className={`inline-block h-2 w-2 rounded-full ${
                    result.ok ? 'bg-jade' : 'bg-cinnabar'
                }`}
            />
            <span className="text-mute">{result.ok ? '已上鏈' : '失敗'}</span>
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
            {result.eventId ? (
                <a
                    href={objectUrl(result.eventId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cinnabar hover:underline"
                >
                    event
                </a>
            ) : null}
            {result.error ? (
                <span className="text-cinnabar">{result.error}</span>
            ) : null}
        </div>
    );
}

/* ──── per-event row ──── */

function EventRow({
    summary,
    characters,
    scenes,
    onMutated,
}: {
    summary: BudgetEventEntry;
    characters: Character[];
    scenes: Scene[];
    onMutated: () => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const [detail, setDetail] = useState<BudgetEventDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    // Bumped after a deal/resolve so the expanded detail (participants +
    // the "available to deal" filter) re-fetches — otherwise the dropdown
    // keeps offering an already-dealt character → chain abort 16.
    const [detailNonce, setDetailNonce] = useState(0);

    const sceneName =
        scenes.find((s) => s.id === summary.sceneId)?.name ?? '未知場景';
    const created = new Date(Number(summary.createdAtMs)).toLocaleString('zh-TW', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
    const isResolved = summary.resolvedAtMs != null;

    useEffect(() => {
        if (!expanded) return;
        let cancelled = false;
        setDetailLoading(true);
        fetchBudgetEventDetail(summary.eventId)
            .then((d) => {
                if (!cancelled) setDetail(d);
            })
            .finally(() => {
                if (!cancelled) setDetailLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [expanded, summary.eventId, detailNonce]);

    return (
        <li className="rounded border border-hairline bg-canvas/30">
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex w-full items-center gap-3 p-3 text-left hover:bg-canvas/50"
            >
                <span
                    className={`inline-block rounded px-2 py-0.5 text-2xs tracking-widest ${
                        isResolved
                            ? 'bg-jade/15 text-jade'
                            : 'bg-cinnabar/15 text-cinnabar'
                    }`}
                >
                    {isResolved ? '結' : '開'}
                </span>
                <span className="flex-1 text-sm text-ink">
                    {sceneName} ·{' '}
                    <span className="font-mono text-2xs text-mute">
                        {summary.eventId.slice(0, 10)}…
                    </span>
                </span>
                <span className="text-2xs tracking-widest text-mute">
                    {summary.participantCount} 人 · {created}
                </span>
                <span className="text-mute">{expanded ? '▴' : '▾'}</span>
            </button>

            {expanded ? (
                <div className="border-t border-hairline/60 p-3 space-y-3">
                    {detailLoading && detail == null ? (
                        <p className="text-2xs text-mute">讀取詳情…</p>
                    ) : detail == null ? (
                        <p className="text-2xs text-cinnabar">
                            無法讀取事件詳情（可能 RPC 暫時不通）
                        </p>
                    ) : (
                        <EventDetailView
                            detail={detail}
                            characters={characters}
                            onMutated={() => {
                                setDetailNonce((n) => n + 1); // re-fetch this event's detail
                                onMutated(); // refresh the list (participant counts)
                            }}
                        />
                    )}
                    <div className="flex flex-wrap gap-3 text-2xs tracking-widest">
                        <a
                            href={objectUrl(summary.eventId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-cinnabar hover:underline"
                        >
                            on-chain ↗
                        </a>
                    </div>
                </div>
            ) : null}
        </li>
    );
}

function EventDetailView({
    detail,
    characters,
    onMutated,
}: {
    detail: BudgetEventDetail;
    characters: Character[];
    onMutated: () => void;
}) {
    const [pickerCharId, setPickerCharId] = useState<string>(characters[0]?.id ?? '');
    const [actionResult, setActionResult] = useState<ActionResult | null>(null);
    const [isPending, startTransition] = useTransition();
    // N1: character agent decides its own card play.
    const [turnCharId, setTurnCharId] = useState<string>('');
    const [turnResult, setTurnResult] = useState<CharacterTurnResult | null>(null);
    const [turnPending, startTurnTransition] = useTransition();
    const handleTurn = () => {
        const cid = turnCharId || detail.participants[0];
        if (!cid) return;
        setTurnResult(null);
        startTurnTransition(async () => {
            const r = await runCharacterTurnAction(detail.eventId, cid);
            setTurnResult(r);
            onMutated();
        });
    };

    // Filter to characters in this event's scene + not already a
    // participant. Chain would abort with `EJoinerNotInScene` (18) /
    // `EAlreadyParticipant` (16) otherwise; UI hides instead of letting
    // admin pick something that's guaranteed to revert.
    const availableForDeal = characters.filter(
        (c) =>
            !detail.participants.includes(c.id) &&
            c.currentSceneId === detail.sceneId,
    );
    const inSceneCount = characters.filter(
        (c) => c.currentSceneId === detail.sceneId,
    ).length;
    // The select's state can lag behind the filtered options (e.g. default
    // = characters[0] who's already a participant → not in availableForDeal).
    // Use an "effective" id that's guaranteed to be in the option list so
    // the displayed option and the dealt id never desync.
    const effectiveDealId = availableForDeal.some((c) => c.id === pickerCharId)
        ? pickerCharId
        : availableForDeal[0]?.id ?? '';

    const handleDeal = () => {
        if (!effectiveDealId) return;
        setActionResult(null);
        startTransition(async () => {
            const r = await dealHandAction({
                eventId: detail.eventId,
                characterId: effectiveDealId,
            });
            setActionResult(r);
            // Re-sync the detail on EITHER outcome: a failure (e.g.
            // EAlreadyParticipant / EEventNotOpen from a stale dropdown)
            // means the UI was out of date — refetch so it self-heals and
            // stops offering an already-joined character.
            onMutated();
        });
    };

    const handleResolve = () => {
        setActionResult(null);
        startTransition(async () => {
            const r = await resolveEventAction({
                eventId: detail.eventId,
                sceneId: detail.sceneId,
            });
            setActionResult(r);
            onMutated();
        });
    };

    return (
        <div className="space-y-3">
            <div className="text-sm text-ink/90">
                <div className="font-serif text-base">{detail.title}</div>
                {detail.summary ? (
                    <p className="mt-1 text-xs leading-relaxed text-mute">
                        {detail.summary}
                    </p>
                ) : null}
                <div className="mt-2 text-2xs tracking-widest text-mute">
                    scale {detail.scale} · catalog {detail.cardCount} 卡 · 每人抽{' '}
                    {detail.handSize} · 出牌 {detail.submittedActionCount}
                </div>
            </div>

            <div className="space-y-1">
                <div className="text-2xs tracking-widest text-mute">參與者</div>
                {detail.participants.length === 0 ? (
                    <p className="text-2xs text-mute">尚無 — 用下方表單發牌邀人</p>
                ) : (
                    <ul className="space-y-1">
                        {detail.participants.map((cid, i) => {
                            const c = characters.find((x) => x.id === cid);
                            return (
                                <li
                                    key={cid}
                                    className="flex items-center gap-3 text-2xs"
                                >
                                    <span className="font-mono text-mute">
                                        #{i + 1}
                                    </span>
                                    <span className="text-ink">
                                        {c?.name ?? '?'}
                                    </span>
                                    <span className="font-mono text-mute">
                                        hand: [{detail.hands[i]?.join(', ') ?? ''}]
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {detail.status === 'open' ? (
                <div className="space-y-2 rounded border border-hairline/60 bg-surface p-3">
                    <div className="text-2xs tracking-widest text-mute">
                        發牌 + 結算
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <select
                            value={effectiveDealId}
                            onChange={(e) => setPickerCharId(e.target.value)}
                            disabled={isPending || availableForDeal.length === 0}
                            className="rounded border border-hairline bg-canvas px-2 py-1 text-xs text-ink"
                        >
                            {availableForDeal.length === 0 ? (
                                <option value="">
                                    {inSceneCount === 0
                                        ? '— 此場景內無角色 —'
                                        : '— 此場景內全員已加入 —'}
                                </option>
                            ) : null}
                            {availableForDeal.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={handleDeal}
                            disabled={
                                isPending || !pickerCharId || availableForDeal.length === 0
                            }
                            className="rounded border border-hairline bg-canvas px-3 py-1 text-xs text-ink hover:bg-elevated disabled:opacity-50"
                        >
                            {isPending ? '發牌中…' : '發一手'}
                        </button>
                        <button
                            type="button"
                            onClick={handleResolve}
                            disabled={isPending}
                            className="rounded bg-cinnabar px-3 py-1 text-xs text-canvas hover:bg-seal disabled:opacity-50"
                        >
                            {isPending ? '結算中…' : '結算（空 outcomes）'}
                        </button>
                    </div>
                    <p className="text-2xs tracking-widest text-mute/70">
                        只能選此事件場景內的角色（共 {inSceneCount} 名）。要換場景的話，請開新事件。
                    </p>

                    {detail.participants.length > 0 ? (
                        <div className="mt-2 space-y-2 border-t border-hairline/50 pt-2">
                            <div className="text-2xs tracking-widest text-cinnabar">
                                角色自決出牌（N1 · 依記憶+性格選牌）
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <select
                                    value={turnCharId || detail.participants[0]}
                                    onChange={(e) => setTurnCharId(e.target.value)}
                                    disabled={turnPending}
                                    className="rounded border border-hairline bg-canvas px-2 py-1 text-xs text-ink"
                                >
                                    {detail.participants.map((pid) => (
                                        <option key={pid} value={pid}>
                                            {characters.find((c) => c.id === pid)?.name ??
                                                pid.slice(0, 8)}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    onClick={handleTurn}
                                    disabled={turnPending}
                                    className="rounded bg-cinnabar px-3 py-1 text-xs text-canvas hover:bg-seal disabled:opacity-50"
                                >
                                    {turnPending ? '她在想…' : '讓她自己出牌'}
                                </button>
                            </div>
                            {turnResult ? (
                                <div
                                    className={`rounded border p-2 text-2xs ${
                                        turnResult.ok
                                            ? 'border-jade/40 bg-jade/5'
                                            : 'border-cinnabar/40 bg-cinnabar/5 text-cinnabar'
                                    }`}
                                >
                                    {turnResult.ok ? (
                                        <>
                                            <div className="text-jade">
                                                打出「{turnResult.cardLabel}」
                                                {typeof turnResult.recalledCount === 'number'
                                                    ? ` · 憶 ${turnResult.recalledCount}`
                                                    : ''}
                                                {turnResult.relationshipCount
                                                    ? ` · 牽絆 ${turnResult.relationshipCount}`
                                                    : ''}
                                            </div>
                                            <p className="mt-1 font-serif text-sm leading-relaxed text-ink/90">
                                                「{turnResult.intent}」
                                            </p>
                                            {turnResult.reason ? (
                                                <p className="mt-1 text-mute">
                                                    （{turnResult.reason}）
                                                </p>
                                            ) : null}
                                        </>
                                    ) : (
                                        <span>{turnResult.error}</span>
                                    )}
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            ) : (
                <div className="rounded border border-jade/40 bg-jade/5 p-3 text-2xs text-jade">
                    已結算 · resolved_at {detail.resolvedAtMs}
                </div>
            )}

            {actionResult ? (
                <div className="flex flex-wrap items-center gap-3 text-2xs tracking-widest">
                    <span
                        className={`inline-block h-2 w-2 rounded-full ${
                            actionResult.ok ? 'bg-jade' : 'bg-cinnabar'
                        }`}
                    />
                    {actionResult.digest ? (
                        <a
                            href={txUrl(actionResult.digest)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-cinnabar hover:underline"
                        >
                            tx
                        </a>
                    ) : null}
                    {actionResult.error ? (
                        <span className="text-cinnabar">{actionResult.error}</span>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
