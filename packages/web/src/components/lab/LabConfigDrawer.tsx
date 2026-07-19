'use client';

/**
 * LabConfigDrawer — 物界配置：the off-chain "contract objects" surface.
 * 四頁歸位（各司其職，不再一長滾）：
 *   物 obj    爭奪之物（stakes）＋ registered 物件（位置/容器/隱顯/狀態）
 *   景 scene  場景物理（privacy 私／capacity 容）
 *   時 time   天時（clock-bound 世界事件）
 *   憶 mem    每角 LocalRecall 記憶帳（植入／焚去）
 * 這些都是 per-run 的活世界狀態（object 有位置、隨身、隱顯——只存於一卷之內），
 * 故落於觀測台之側，而非跨卷、以名為鍵的圖庫。走拍中不可改；改即落 world.json。
 */

import { useCallback, useEffect, useState } from 'react';
import { labApi } from './useLab';
import type { LabWorldConfig } from '@/lib/lab/types';

type ConfigTab = 'obj' | 'scene' | 'time' | 'mem';

const TABS: Array<{ key: ConfigTab; label: string; tip: string }> = [
    { key: 'obj', label: '物', tip: '爭奪之物與登記物件 —— 世界裡被爭、被藏、被移的東西' },
    { key: 'scene', label: '景', tip: '場景物理：私（privacy 0–5）與容（capacity）' },
    { key: 'time', label: '時', tip: '天時：排定的 clock-bound 世界事件' },
    { key: 'mem', label: '憶', tip: '每角 LocalRecall 記憶帳：植入新憶、焚去舊憶' },
];

interface Props {
    runId: string;
    running: boolean;
    characters: Array<{ id: string; name: string }>;
    onClose: () => void;
}

export function LabConfigDrawer({ runId, running, characters, onClose }: Props) {
    const [config, setConfig] = useState<LabWorldConfig | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const { config } = await labApi.config(runId);
            setConfig(config);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, [runId]);

    useEffect(() => {
        void load();
    }, [load]);

    const applyOp = async (op: unknown) => {
        setBusy(true);
        setError(null);
        try {
            const { config } = await labApi.configOp(runId, op);
            setConfig(config);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const applyMemoryOp = async (op: unknown) => {
        setBusy(true);
        setError(null);
        try {
            const { memories } = await labApi.memoryOp(runId, op);
            setMemories(memories);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    // ── local form state ────────────────────────────────────────────────────
    const [tab, setTab] = useState<ConfigTab>('obj');
    const [resourceText, setResourceText] = useState<string | null>(null);
    const [objectForm, setObjectForm] = useState({ label: '', sceneId: '', visibility: 'visible', container: '', state: '', portable: true });
    const [eventForm, setEventForm] = useState({ inTicks: 1, sceneId: '', text: '', clock: '', visibility: 'public' });
    const [memChar, setMemChar] = useState('');
    const [memories, setMemories] = useState<Array<{ seq: number; content: string; kind: string; day: number; importance: number }>>([]);
    const [memForm, setMemForm] = useState({ text: '', kind: 'genesis', importance: 7 });

    useEffect(() => {
        if (!memChar) {
            setMemories([]);
            return;
        }
        let cancelled = false;
        labApi
            .memories(runId, memChar)
            .then(({ memories }) => {
                if (!cancelled) setMemories(memories);
            })
            .catch((e) => setError(e instanceof Error ? e.message : String(e)));
        return () => {
            cancelled = true;
        };
    }, [runId, memChar]);

    if (!config) {
        return (
            <aside className="es-lab-panel p-4">
                <p className="font-serif text-sm text-mute">{error ?? '正在展開物界帳冊…'}</p>
            </aside>
        );
    }

    const disabled = busy || running;
    const resourceValue = resourceText ?? config.contestedResources.map((r) => (r.statement ? `${r.label}｜${r.statement}` : r.label)).join('\n');

    return (
        <aside className="es-lab-panel max-h-[78vh] overflow-y-auto p-4 no-scrollbar">
            <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-serif text-base tracking-[0.2em] text-ink" title="每一筆更動即刻落卷（world.json），下一拍生效；走拍中不可改。">
                    物界
                </h3>
                <button type="button" onClick={onClose} className="es-icon-button" aria-label="合上">↩</button>
            </div>
            {running ? <p className="mt-2 font-serif text-xs text-cinnabar/90">走拍中——先停再改。</p> : null}
            {error ? <p className="mt-2 font-serif text-xs text-cinnabar" role="alert">{error}</p> : null}

            {/* 四頁分流 */}
            <nav className="mt-3 flex gap-1">
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        type="button"
                        onClick={() => setTab(t.key)}
                        title={t.tip}
                        className={`flex-1 rounded-full py-1.5 font-serif text-sm tracking-[0.3em] transition ${
                            tab === t.key ? 'bg-cinnabar text-white shadow-[0_2px_12px_rgba(176,74,60,0.30)]' : 'text-mute hover:bg-ink/5 hover:text-ink dark:hover:bg-white/5'
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </nav>

            {/* 物 —— 爭奪之物 */}
            {tab === 'obj' ? (
            <>
            <section className="mt-4">
                <h4 className="font-serif text-xs tracking-[0.3em] text-cinnabar/90" title="一行一物：「標的｜說明」。慾望只經標的與世界相爭。">
                    爭奪之物
                </h4>
                <textarea
                    value={resourceValue}
                    onChange={(e) => setResourceText(e.target.value)}
                    rows={3}
                    className="es-field mt-2 w-full px-2.5 py-2 font-serif text-xs leading-relaxed"
                />
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                        const resources = resourceValue
                            .split('\n')
                            .map((line) => line.trim())
                            .filter(Boolean)
                            .map((line) => {
                                const [label, statement] = line.split(/｜|\|/).map((s) => s.trim());
                                return { label, statement: statement || undefined };
                            });
                        void applyOp({ op: 'set-resources', resources }).then(() => setResourceText(null));
                    }}
                    className="es-button-ghost mt-2 px-3 py-1 text-xs disabled:opacity-40"
                >
                    定稿
                </button>
            </section>

            {/* 物件 */}
            <section className="mt-5">
                <h4 className="font-serif text-xs tracking-[0.3em] text-cinnabar/90">registered 物件</h4>
                <ul className="mt-2 space-y-1.5">
                    {config.objects.map((o) => (
                        <li key={o.id} className="flex items-start justify-between gap-2 border-b border-hairline/50 pb-1.5">
                            <span className="min-w-0 font-serif text-xs leading-relaxed text-ink/85">
                                {o.label}
                                <span className="ml-1.5 text-2xs text-mute">
                                    在{o.sceneName}
                                    {o.carriedByName ? ` · ${o.carriedByName}隨身` : ''}
                                    {o.visibility !== 'visible' ? ` · ${o.visibility === 'hidden' ? '隱' : '毀'}` : ''}
                                    {o.state ? ` · ${o.state}` : ''}
                                </span>
                                {o.origin ? (
                                    <span
                                        className="mt-0.5 block font-serif text-2xs tracking-[0.1em] text-mute/55"
                                        title={`唯一身分 ${o.id}　生於第${o.origin.day}日·第${o.origin.tick}拍（${o.origin.source === 'season' ? '季框種下' : 'lab 置入'}）`}
                                    >
                                        {o.origin.source === 'season' ? '季' : '手'}·生於 d{o.origin.day}·t{o.origin.tick}
                                    </span>
                                ) : null}
                            </span>
                            <button
                                type="button"
                                disabled={disabled}
                                onClick={() => void applyOp({ op: 'remove-object', objectId: o.id })}
                                className="shrink-0 font-serif text-2xs tracking-[0.2em] text-mute hover:text-cinnabar disabled:opacity-40"
                            >
                                除
                            </button>
                        </li>
                    ))}
                    {!config.objects.length ? <li className="font-serif text-xs text-mute/60">尚無登記物件。</li> : null}
                </ul>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <input
                        placeholder="物名（如：一封未署名的信）"
                        value={objectForm.label}
                        onChange={(e) => setObjectForm({ ...objectForm, label: e.target.value })}
                        className="es-field col-span-2 px-2.5 py-1.5 text-xs"
                    />
                    <select
                        value={objectForm.sceneId}
                        onChange={(e) => setObjectForm({ ...objectForm, sceneId: e.target.value })}
                        className="es-field px-2 py-1.5 text-xs"
                    >
                        <option value="">落於何處…</option>
                        {config.scenes.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                    <select
                        value={objectForm.visibility}
                        onChange={(e) => setObjectForm({ ...objectForm, visibility: e.target.value })}
                        className="es-field px-2 py-1.5 text-xs"
                    >
                        <option value="visible">可見</option>
                        <option value="hidden">隱藏</option>
                    </select>
                    <input
                        placeholder="容器（可空，如：妝鏡下）"
                        value={objectForm.container}
                        onChange={(e) => setObjectForm({ ...objectForm, container: e.target.value })}
                        className="es-field px-2.5 py-1.5 text-xs"
                    />
                    <input
                        placeholder="狀態（可空，如：未拆）"
                        value={objectForm.state}
                        onChange={(e) => setObjectForm({ ...objectForm, state: e.target.value })}
                        className="es-field px-2.5 py-1.5 text-xs"
                    />
                </div>
                <button
                    type="button"
                    disabled={disabled || !objectForm.label.trim() || !objectForm.sceneId}
                    onClick={() =>
                        void applyOp({
                            op: 'upsert-object',
                            object: {
                                label: objectForm.label,
                                sceneId: objectForm.sceneId,
                                visibility: objectForm.visibility,
                                container: objectForm.container || undefined,
                                state: objectForm.state || undefined,
                                portable: objectForm.portable,
                            },
                        }).then(() => setObjectForm({ ...objectForm, label: '', container: '', state: '' }))
                    }
                    className="es-button-ghost mt-2 px-3 py-1 text-xs disabled:opacity-40"
                >
                    置入世界
                </button>
            </section>

            {config.hasEconomy ? (
                <p className="mt-4 font-serif text-2xs text-mute/70" title="season economy 帳冊隨 world.json 落卷，暫以唯讀待之">
                    帶銀錢物理 · 唯讀
                </p>
            ) : null}
            </>
            ) : null}

            {/* 時 —— 天時 */}
            {tab === 'time' ? (
            <section className="mt-4">
                <h4 className="font-serif text-xs tracking-[0.3em] text-cinnabar/90">天時（排定的世界事件）</h4>
                <ul className="mt-2 space-y-1.5">
                    {config.scheduledEvents.map((ev) => (
                        <li key={ev.id} className="flex items-start justify-between gap-2 border-b border-hairline/50 pb-1.5">
                            <span className="min-w-0 font-serif text-xs leading-relaxed text-ink/85">
                                第{ev.atTick}拍 · {ev.sceneName} · {ev.text.slice(0, 40)}
                                {ev.delivered ? <span className="ml-1.5 text-2xs text-jade">已成典</span> : null}
                            </span>
                            {!ev.delivered ? (
                                <button
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => void applyOp({ op: 'remove-scheduled-event', eventId: ev.id })}
                                    className="shrink-0 font-serif text-2xs tracking-[0.2em] text-mute hover:text-cinnabar disabled:opacity-40"
                                >
                                    除
                                </button>
                            ) : null}
                        </li>
                    ))}
                    {!config.scheduledEvents.length ? <li className="font-serif text-xs text-mute/60">天無定數。</li> : null}
                </ul>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <input
                        placeholder="事（如：郵差送來一只木匣）"
                        value={eventForm.text}
                        onChange={(e) => setEventForm({ ...eventForm, text: e.target.value })}
                        className="es-field col-span-2 px-2.5 py-1.5 text-xs"
                    />
                    <select
                        value={eventForm.sceneId}
                        onChange={(e) => setEventForm({ ...eventForm, sceneId: e.target.value })}
                        className="es-field px-2 py-1.5 text-xs"
                    >
                        <option value="">發於何處…</option>
                        {config.scenes.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                    <span className="inline-flex items-center gap-1.5">
                        <input
                            type="number"
                            min={0}
                            value={eventForm.inTicks}
                            onChange={(e) => setEventForm({ ...eventForm, inTicks: Math.max(0, Number(e.target.value) || 0) })}
                            className="es-field w-16 px-2 py-1.5 text-center text-xs"
                            aria-label="幾拍之後"
                        />
                        <span className="font-serif text-2xs tracking-[0.2em] text-mute">拍後</span>
                    </span>
                </div>
                <button
                    type="button"
                    disabled={disabled || !eventForm.text.trim() || !eventForm.sceneId}
                    onClick={() =>
                        void applyOp({
                            op: 'add-scheduled-event',
                            event: {
                                inTicks: eventForm.inTicks,
                                sceneId: eventForm.sceneId,
                                text: eventForm.text,
                                visibility: eventForm.visibility,
                            },
                        }).then(() => setEventForm({ ...eventForm, text: '' }))
                    }
                    className="es-button-ghost mt-2 px-3 py-1 text-xs disabled:opacity-40"
                >
                    排入天時
                </button>
            </section>
            ) : null}

            {/* 憶 —— 記憶 */}
            {tab === 'mem' ? (
            <section className="mt-4">
                <h4 className="font-serif text-xs tracking-[0.3em] text-cinnabar/90" title="LocalRecall 記憶帳：靜場時可植入新憶或焚去舊憶；重要度 1–10 影響召回排序">
                    記憶
                </h4>
                <select
                    value={memChar}
                    onChange={(e) => setMemChar(e.target.value)}
                    className="es-field mt-2 w-full px-2 py-1.5 text-xs"
                >
                    <option value="">誰的記憶…</option>
                    {characters.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
                {memChar ? (
                    <>
                        <ul className="mt-2 max-h-44 space-y-1.5 overflow-y-auto no-scrollbar">
                            {memories.map((m) => (
                                <li key={m.seq} className="flex items-start justify-between gap-2 border-b border-hairline/40 pb-1.5">
                                    <span className="min-w-0 font-serif text-2xs leading-relaxed text-ink/85">
                                        <span className="mr-1.5 text-mute">{m.kind}·{m.importance}·d{m.day}</span>
                                        {m.content}
                                    </span>
                                    <button
                                        type="button"
                                        disabled={disabled}
                                        onClick={() =>
                                            void applyMemoryOp({ op: 'forget', characterId: memChar, seq: m.seq })
                                        }
                                        aria-label="焚去此憶"
                                        title="焚去此憶"
                                        className="shrink-0 font-serif text-2xs tracking-[0.2em] text-mute hover:text-cinnabar disabled:opacity-40"
                                    >
                                        焚
                                    </button>
                                </li>
                            ))}
                            {!memories.length ? <li className="font-serif text-2xs text-mute/60">白紙一張。</li> : null}
                        </ul>
                        <textarea
                            value={memForm.text}
                            onChange={(e) => setMemForm({ ...memForm, text: e.target.value })}
                            placeholder="植一段記憶（以角色第一人稱寫最順）…"
                            rows={2}
                            className="es-field mt-2 w-full px-2.5 py-1.5 font-serif text-xs leading-relaxed"
                        />
                        <div className="mt-1.5 flex items-center gap-1.5">
                            <select
                                value={memForm.kind}
                                onChange={(e) => setMemForm({ ...memForm, kind: e.target.value })}
                                className="es-field px-2 py-1 text-2xs"
                                title="記憶種類"
                            >
                                {['genesis', 'observation', 'relationship', 'dream', 'reflection'].map((k) => (
                                    <option key={k} value={k}>{k}</option>
                                ))}
                            </select>
                            <input
                                type="number"
                                min={1}
                                max={10}
                                value={memForm.importance}
                                onChange={(e) => setMemForm({ ...memForm, importance: Math.max(1, Math.min(10, Number(e.target.value) || 7)) })}
                                className="es-field w-12 px-1 py-1 text-center text-2xs"
                                title="重要度 1–10"
                                aria-label="重要度"
                            />
                            <button
                                type="button"
                                disabled={disabled || !memForm.text.trim()}
                                onClick={() =>
                                    void applyMemoryOp({
                                        op: 'add',
                                        characterId: memChar,
                                        text: memForm.text,
                                        kind: memForm.kind,
                                        importance: memForm.importance,
                                    }).then(() => setMemForm({ ...memForm, text: '' }))
                                }
                                className="es-button-ghost px-3 py-1 text-xs disabled:opacity-40"
                            >
                                植入
                            </button>
                        </div>
                    </>
                ) : null}
            </section>
            ) : null}

            {/* 景 —— 場景物理 */}
            {tab === 'scene' ? (
            <section className="mt-4">
                <p className="font-serif text-2xs leading-relaxed text-mute/70">私＝privacy（0 全開 … 5 密室）；容＝capacity（同場人數上限）。改即落卷。</p>
                <ul className="mt-3 space-y-1">
                    {config.scenes.map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate font-serif text-xs text-ink/85">{s.name}</span>
                            <span className="flex shrink-0 items-center gap-1 font-serif text-2xs text-mute">
                                私
                                <input
                                    type="number"
                                    min={0}
                                    max={5}
                                    defaultValue={s.privacyLevel}
                                    disabled={disabled}
                                    onBlur={(e) => {
                                        const privacyLevel = Number(e.target.value);
                                        if (privacyLevel !== s.privacyLevel) {
                                            void applyOp({ op: 'set-scene', sceneId: s.id, privacyLevel });
                                        }
                                    }}
                                    className="es-field w-11 px-1 py-0.5 text-center text-2xs"
                                />
                                容
                                <input
                                    type="number"
                                    min={1}
                                    defaultValue={s.capacity ?? 8}
                                    disabled={disabled}
                                    onBlur={(e) => {
                                        const capacity = Number(e.target.value);
                                        if (capacity !== s.capacity) {
                                            void applyOp({ op: 'set-scene', sceneId: s.id, capacity });
                                        }
                                    }}
                                    className="es-field w-11 px-1 py-0.5 text-center text-2xs"
                                />
                            </span>
                        </li>
                    ))}
                </ul>
            </section>
            ) : null}
        </aside>
    );
}
