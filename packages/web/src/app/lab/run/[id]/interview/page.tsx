'use client';

/**
 * 演員訪談室 · 名錄 — 這一卷的演員名錄（劇院名錄／選角檔案口徑，不是數值
 * 面板）：選人、選時刻（時光快照／事件錨）、選訪談模式，開始訪談。
 */

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LabPageHeader, LAB_ICON_BUTTON } from '@/components/lab/LabPageHeader';
import { IconScroll } from '@/components/lab/LabIcons';
import { labApi } from '@/components/lab/useLab';
import type {
    InterviewActorCard,
    InterviewCheckpointList,
    InterviewMode,
    InterviewSummary,
} from '@/lib/lab/interview/types';
import { INTERVIEW_MODE_LABEL } from '@/lib/lab/interview/types';

const MODES: InterviewMode[] = ['free', 'public', 'private', 'diary'];

const MODE_HINT: Record<InterviewMode, string> = {
    free: '自然對話 —— 測人格穩定與知識邊界',
    public: '戲園報館捧場客可見 —— 她會顧著名聲與分寸',
    private: '不見報的私下談話 —— 可坦白，邊界不放鬆',
    diary: '不是對話 —— 邀她寫下今日私記',
};

export default function InterviewRosterPage({ params }: { params: Promise<{ id: string }> }) {
    const { id: rawId } = use(params);
    const id = decodeURIComponent(rawId);
    const router = useRouter();

    const [actors, setActors] = useState<InterviewActorCard[] | null>(null);
    const [checkpoints, setCheckpoints] = useState<InterviewCheckpointList | null>(null);
    const [past, setPast] = useState<InterviewSummary[]>([]);
    const [error, setError] = useState<string | null>(null);

    const [tick, setTick] = useState<number | 'current'>('current');
    const [mode, setMode] = useState<InterviewMode>('free');
    const [interviewer, setInterviewer] = useState('');
    const [anchorId, setAnchorId] = useState('');
    const [starting, setStarting] = useState<string | null>(null);
    // 名帖深連結：?actor=<id> —— 捲至該卡並點亮（不自動開訪，時刻/模式仍由人定）。
    const [highlight, setHighlight] = useState<string | null>(null);
    useEffect(() => {
        setHighlight(new URLSearchParams(window.location.search).get('actor'));
    }, []);
    useEffect(() => {
        if (!highlight || !actors?.length) return;
        document.getElementById(`actor-${highlight}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, [highlight, actors]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [a, c, s] = await Promise.all([
                    labApi.interviewActors(id),
                    labApi.interviewCheckpoints(id),
                    labApi.interviews(id),
                ]);
                if (cancelled) return;
                setActors(a.actors);
                setCheckpoints(c);
                setPast(s.interviews.slice(0, 8));
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : String(e));
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [id]);

    const momentLabel = useMemo(() => {
        if (!checkpoints) return '';
        if (tick === 'current') return `${checkpoints.current.label}（當前）`;
        return checkpoints.checkpoints.find((c) => c.tick === tick)?.label ?? `拍 ${tick}`;
    }, [checkpoints, tick]);

    const anchor = useMemo(
        () => checkpoints?.eventAnchors.find((a) => a.eventId === anchorId) ?? null,
        [checkpoints, anchorId],
    );

    const start = useCallback(
        async (characterId: string) => {
            setStarting(characterId);
            setError(null);
            try {
                const { interview } = await labApi.createInterview(id, {
                    characterId,
                    tick,
                    mode,
                    interviewerIdentity: interviewer.trim() || undefined,
                });
                router.push(`/lab/run/${encodeURIComponent(id)}/interview/${interview.id}`);
            } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
                setStarting(null);
            }
        },
        [id, tick, mode, interviewer, router],
    );

    return (
        <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-8">
            <LabPageHeader
                eyebrow="片場 · 演員訪談室"
                title="演員名錄"
                titleTip="訪問一位剛經歷完今天的演員"
                backHref={`/lab/run/${encodeURIComponent(id)}`}
                backTitle="回觀測台"
                actions={
                    <>
                        <Link
                            href={`/lab/run/${encodeURIComponent(id)}/interview/compare`}
                            className="es-outline-button !py-1.5 font-serif text-xs"
                            title="同題並問兩個時間點的她"
                        >
                            對照
                        </Link>
                        <Link
                            href={`/lab/run/${encodeURIComponent(id)}/reading`}
                            aria-label="卷宗與章回"
                            title="卷宗與章回"
                            className={LAB_ICON_BUTTON}
                        >
                            <IconScroll />
                        </Link>
                    </>
                }
            />

            {error ? (
                <p className="mt-4 font-serif text-sm text-cinnabar" role="alert">{error}</p>
            ) : null}

            {/* ── 訪問之約：時刻 × 模式 × 訪問者 ─────────────────────────── */}
            <section className="es-lab-panel mt-6 p-4 sm:p-5">
                <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
                    <label className="block">
                        <span className="es-page-lead-eyebrow">訪問時刻</span>
                        <select
                            className="es-field mt-1 min-w-56"
                            value={tick === 'current' ? 'current' : String(tick)}
                            onChange={(e) => {
                                setAnchorId('');
                                setTick(e.target.value === 'current' ? 'current' : Number(e.target.value));
                            }}
                        >
                            <option value="current">
                                {checkpoints ? `${checkpoints.current.label}（當前）` : '當前'}
                            </option>
                            {checkpoints
                                ? [...checkpoints.checkpoints].reverse().map((c) => (
                                    <option key={c.tick} value={c.tick}>
                                        {c.label} · 拍{c.tick}
                                    </option>
                                ))
                                : null}
                        </select>
                    </label>
                    <label className="block">
                        <span className="es-page-lead-eyebrow">或以事為錨</span>
                        <select
                            className="es-field mt-1 min-w-64"
                            value={anchorId}
                            onChange={(e) => setAnchorId(e.target.value)}
                        >
                            <option value="">（不用事件錨）</option>
                            {checkpoints?.eventAnchors.map((a) => (
                                <option key={a.eventId} value={a.eventId}>
                                    第{a.day}日·{a.partOfDay} {a.sceneName}｜{a.snippet}
                                </option>
                            ))}
                        </select>
                    </label>
                    {anchor ? (
                        <span className="flex gap-2">
                            <button
                                type="button"
                                className="es-outline-button"
                                onClick={() => setTick(Math.max(0, anchor.tick - 1))}
                                title="此事發生前的她（前一拍快照）"
                            >
                                此事前
                            </button>
                            <button
                                type="button"
                                className="es-outline-button"
                                onClick={() => setTick(anchor.tick)}
                                title="此事發生後的她（該拍快照）"
                            >
                                此事後
                            </button>
                        </span>
                    ) : null}
                    <label className="block">
                        <span className="es-page-lead-eyebrow">訪問者自報</span>
                        <input
                            className="es-field mt-1 min-w-52"
                            value={interviewer}
                            onChange={(e) => setInterviewer(e.target.value)}
                            placeholder="如：春雪小報記者"
                        />
                    </label>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    {MODES.map((m) => (
                        <button
                            key={m}
                            type="button"
                            onClick={() => setMode(m)}
                            title={MODE_HINT[m]}
                            className={`rounded-full border px-4 py-1.5 font-serif text-sm tracking-[0.12em] transition ${
                                mode === m
                                    ? 'border-cinnabar/70 text-cinnabar'
                                    : 'border-hairline text-mute hover:text-ink'
                            }`}
                        >
                            {INTERVIEW_MODE_LABEL[m]}
                        </button>
                    ))}
                    <span className="ml-2 font-serif text-xs text-mute">{MODE_HINT[mode]}</span>
                </div>
                <p className="mt-3 font-serif text-xs tracking-[0.08em] text-mute">
                    將訪問：<span className="text-ink">{momentLabel || '…'}</span>
                    {checkpoints && !checkpoints.checkpoints.length
                        ? ' —— 此卷尚無時光快照（自本功能上線後走的拍才會留存），僅可訪「當前」。'
                        : ''}
                </p>
            </section>

            {/* ── 名錄 ───────────────────────────────────────────────────── */}
            {actors === null ? (
                <p className="mt-8 font-serif text-sm tracking-[0.3em] text-mute">展開名錄中…</p>
            ) : (
                <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {actors.map((actor) => (
                        <article
                            key={actor.id}
                            id={`actor-${actor.id}`}
                            className={`es-lab-panel flex gap-4 p-4 ${highlight === actor.id ? 'ring-1 ring-cinnabar/60' : ''}`}
                        >
                            <div className="h-24 w-20 shrink-0 overflow-hidden rounded border border-hairline bg-elevated/40">
                                {actor.portraitUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={actor.portraitUrl} alt={actor.name} className="h-full w-full object-cover" />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center font-serif text-2xl text-mute">
                                        {actor.name.slice(0, 1)}
                                    </div>
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <header className="flex items-baseline gap-2">
                                    <h2 className="font-serif text-lg tracking-[0.14em] text-ink">{actor.name}</h2>
                                    <span className="font-serif text-xs text-mute">
                                        {[actor.role, actor.age !== undefined ? `${actor.age}歲` : '']
                                            .filter(Boolean)
                                            .join(' · ')}
                                    </span>
                                </header>
                                <dl className="mt-2 space-y-1 font-serif text-xs leading-relaxed text-mute">
                                    <div>現在何處 —— <span className="text-ink">{actor.sceneName}</span></div>
                                    {actor.activity ? <div>正在做 —— <span className="text-ink">{actor.activity}</span></div> : null}
                                    <div>心緒 —— <span className="text-ink">{actor.moodWord}</span></div>
                                    <div>
                                        記憶落款 ——{' '}
                                        <span className="text-ink">
                                            {actor.lastMemoryDay !== undefined ? `第${actor.lastMemoryDay}日` : '尚無記憶'}
                                        </span>
                                    </div>
                                </dl>
                                <button
                                    type="button"
                                    onClick={() => void start(actor.id)}
                                    disabled={starting !== null}
                                    className="es-button-primary mt-3 !px-4 !py-1.5 text-sm disabled:opacity-50"
                                >
                                    {starting === actor.id ? '備席中…' : '開始訪談'}
                                </button>
                            </div>
                        </article>
                    ))}
                </section>
            )}

            {/* ── 舊訪談 ─────────────────────────────────────────────────── */}
            {past.length ? (
                <section className="mt-8">
                    <h3 className="es-page-lead-eyebrow">近日訪談</h3>
                    <ul className="mt-2 divide-y divide-hairline/60 border-y border-hairline/60">
                        {past.map((s) => (
                            <li key={s.id}>
                                <Link
                                    href={`/lab/run/${encodeURIComponent(id)}/interview/${s.id}`}
                                    className="flex items-baseline justify-between gap-3 py-2 font-serif text-sm text-ink hover:text-cinnabar"
                                >
                                    <span className="min-w-0 truncate">
                                        {s.momentLabel}的{s.characterName} · {INTERVIEW_MODE_LABEL[s.mode]}
                                    </span>
                                    <span className="shrink-0 text-xs text-mute">
                                        {s.messageCount ? `${s.messageCount} 句` : '未啟'}
                                        {s.markCount ? ` · ${s.markCount} 標` : ''}
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}
        </main>
    );
}
