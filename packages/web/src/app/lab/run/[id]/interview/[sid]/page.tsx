'use client';

/**
 * 演員訪談室 · 訪談間 — 左：對話（問／答的報館訪談款式，非聊天泡泡）；
 * 右：三籤 —— 所知（角色可知＝組 prompt 的同一份素材）／內裡（僅導演可見，
 * 永不進 prompt）／查驗（確定性預檢＋LLM 評審＋內容候選標記）。
 * 頂部固定受訪時刻，換時刻＝另起新訪談。
 */

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLabDialog } from '@/components/lab/LabDialog';
import { IconBack } from '@/components/lab/LabIcons';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { labApi } from '@/components/lab/useLab';
import type {
    InterviewContentMark,
    InterviewMarkKind,
    InterviewMessageRecord,
    InterviewSessionFile,
    InterviewSnapshotView,
} from '@/lib/lab/interview/types';
import { INTERVIEW_MARK_LABEL, INTERVIEW_MODE_LABEL } from '@/lib/lab/interview/types';

const SAMPLE_QUESTIONS = [
    '今日過得如何？',
    '今日發生的事情裡，哪一件最令你在意？',
    '今日有沒有什麼想讓捧場客知道？',
    '報館若請你寫一段手記，你會寫什麼？',
    '今日有什麼事不願公開？',
    '你現在最想見誰？',
    '你對今日的演出滿意嗎？',
    '如果明日還要繼續排戲，你會做什麼？',
];

const DIARY_PROMPTS = [
    '今日最值得記下的是什麼？',
    '今日有何事不願對旁人說？',
    '今日有沒有一句話想留給明日的自己？',
    '今日有沒有一封想寫卻不會寄出的信？',
];

const MARK_KINDS: InterviewMarkKind[] = [
    'public_note',
    'private_diary',
    'clip_line',
    'third_person_video',
    'character_memory',
    'needs_edit',
    'out_of_character',
];

const SCORE_LABEL: Array<[keyof NonNullable<InterviewMessageRecord['evaluation']> & string, string]> = [
    ['characterConsistency', '人格一致'],
    ['memoryGrounding', '記憶落地'],
    ['knowledgeBoundary', '知識邊界'],
    ['relationshipConsistency', '關係一致'],
    ['voiceConsistency', '聲口一致'],
    ['publicPrivateAwareness', '公私分寸'],
];

type PanelTab = 'known' | 'director' | 'check';

function scoreTone(v: number): string {
    if (v >= 0.75) return 'text-jade';
    if (v >= 0.5) return 'text-ink';
    return 'text-cinnabar';
}

export default function InterviewRoomPage({ params }: { params: Promise<{ id: string; sid: string }> }) {
    const { id: rawId, sid: rawSid } = use(params);
    const id = decodeURIComponent(rawId);
    const sid = decodeURIComponent(rawSid);
    const router = useRouter();
    const dialog = useLabDialog();

    const [interview, setInterview] = useState<InterviewSessionFile | null>(null);
    const [marks, setMarks] = useState<InterviewContentMark[]>([]);
    const [snapshot, setSnapshot] = useState<InterviewSnapshotView | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [question, setQuestion] = useState('');
    const [asking, setAsking] = useState(false);
    const [tab, setTab] = useState<PanelTab>('known');
    const [markFor, setMarkFor] = useState<string | null>(null);
    const [markKind, setMarkKind] = useState<InterviewMarkKind>('public_note');
    const [markNote, setMarkNote] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    const refreshSnapshot = useCallback(
        (iv: InterviewSessionFile) => {
            labApi
                .interviewSnapshot(id, iv.characterId, iv.tick)
                .then(setSnapshot)
                .catch(() => undefined); // 面板失讀不擋訪談
        },
        [id],
    );

    useEffect(() => {
        let cancelled = false;
        labApi
            .interview(id, sid)
            .then(({ interview: iv, marks: m }) => {
                if (cancelled) return;
                setInterview(iv);
                setMarks(m);
                refreshSnapshot(iv);
            })
            .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
        return () => {
            cancelled = true;
        };
    }, [id, sid, refreshSnapshot]);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }, [interview?.messages.length, asking]);

    const isDiary = interview?.mode === 'diary';
    const latestAnswer = useMemo(
        () => (interview ? [...interview.messages].reverse().find((m) => m.role === 'character') ?? null : null),
        [interview],
    );

    const ask = useCallback(
        async (text?: string) => {
            if (!interview || asking) return;
            const q = (text ?? question).trim();
            if (!q && !isDiary) return;
            setAsking(true);
            setError(null);
            try {
                const round = await labApi.askInterview(id, sid, q);
                setInterview(round.interview);
                setQuestion('');
                setTab('check');
                refreshSnapshot(round.interview);
            } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
            } finally {
                setAsking(false);
            }
        },
        [interview, asking, question, isDiary, id, sid, refreshSnapshot],
    );

    const clear = useCallback(async () => {
        if (!(await dialog.confirm({ title: '清除本次訪談？', body: '訪談紀錄與標記將一併焚去；正卷毫髮無傷。' }))) return;
        try {
            await labApi.deleteInterview(id, sid);
            router.push(`/lab/run/${encodeURIComponent(id)}/interview`);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    }, [dialog, id, sid, router]);

    const saveMark = useCallback(
        async (messageId: string) => {
            try {
                const { marks: next } = await labApi.markInterview(id, sid, {
                    messageId,
                    kind: markKind,
                    note: markNote.trim() || undefined,
                });
                setMarks(next);
                setMarkFor(null);
                setMarkNote('');
            } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
            }
        },
        [id, sid, markKind, markNote],
    );

    if (!interview) {
        return (
            <main className="flex min-h-dvh items-center justify-center">
                <p className="font-serif text-sm tracking-[0.3em] text-mute">
                    {error ? `開席失敗：${error}` : '備席中…'}
                </p>
            </main>
        );
    }

    const marksByMessage = new Map<string, InterviewContentMark[]>();
    for (const m of marks) {
        const list = marksByMessage.get(m.messageId) ?? [];
        list.push(m);
        marksByMessage.set(m.messageId, list);
    }

    return (
        <main className="flex h-dvh flex-col">
            {/* ── 固定受訪時刻 ───────────────────────────────────────────── */}
            <header className="border-b border-hairline/60 bg-surface/70 px-4 py-3 backdrop-blur-sm dark:bg-elevated/40 sm:px-6">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <Link
                        href={`/lab/run/${encodeURIComponent(id)}/interview`}
                        aria-label="回名錄"
                        title="回名錄"
                        className="inline-flex items-center font-serif text-base text-mute hover:text-cinnabar"
                    >
                        <IconBack />
                    </Link>
                    <div className="min-w-0">
                        <h1 className="truncate font-serif text-base tracking-[0.12em] text-ink">
                            你正在訪問：<span className="text-cinnabar">{interview.momentLabel}</span>的{interview.characterName}
                        </h1>
                        <p className="font-serif text-2xs tracking-[0.15em] text-mute">
                            {INTERVIEW_MODE_LABEL[interview.mode]}
                            {interview.interviewerIdentity ? ` · 訪問者：${interview.interviewerIdentity}` : ''}
                            {interview.tick === null ? ' · 當前世界（未凍結）' : ` · 快照拍 ${interview.tick}`}
                        </p>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                        <ThemeToggle className="es-icon-button !h-10 !w-10 text-[18px]" />
                        <Link
                            href={`/lab/run/${encodeURIComponent(id)}/interview`}
                            className="es-outline-button !py-1.5 text-xs"
                            title="換人、換時刻或換模式 —— 另起一場新訪談"
                        >
                            另起新訪談
                        </Link>
                        <button type="button" onClick={() => void clear()} className="es-outline-button !py-1.5 text-xs text-cinnabar">
                            清除本次訪談
                        </button>
                    </div>
                </div>
                {interview.truncationNote ? (
                    <p className="mt-2 font-serif text-2xs leading-relaxed text-cinnabar/90">誠實限界 —— {interview.truncationNote}</p>
                ) : null}
            </header>

            {error ? (
                <p className="px-4 py-2 font-serif text-xs text-cinnabar sm:px-6" role="alert">{error}</p>
            ) : null}

            <div className="flex min-h-0 flex-1">
                {/* ── 左：訪談記錄 ───────────────────────────────────────── */}
                <section className="flex min-w-0 flex-1 flex-col">
                    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8">
                        {interview.messages.length === 0 ? (
                            <p className="font-serif text-sm leading-loose text-mute">
                                {isDiary
                                    ? '筆墨已備。點下方「落筆之引」，或自擬一句，請她寫下今日私記。'
                                    : '席已備好。她剛經歷完這一天 —— 問吧。'}
                            </p>
                        ) : null}
                        <ol className="space-y-5">
                            {interview.messages.map((m) => (
                                <li key={m.id}>
                                    {m.role === 'interviewer' ? (
                                        <div className="border-l-2 border-hairline pl-3">
                                            <span className="es-page-lead-eyebrow">問</span>
                                            <p className="mt-0.5 font-serif text-sm leading-relaxed text-mute">{m.content}</p>
                                        </div>
                                    ) : (
                                        <div className="border-l-2 border-cinnabar/50 pl-3">
                                            <span className="es-page-lead-eyebrow text-cinnabar">
                                                {isDiary ? `${interview.characterName} · 記` : `${interview.characterName} · 答`}
                                            </span>
                                            <p className="mt-1 whitespace-pre-wrap font-serif text-[15px] leading-loose text-ink">{m.content}</p>
                                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                                {m.boundaryFlags?.map((f, i) => (
                                                    <span key={i} title={f.detail} className="rounded-sm border border-cinnabar/50 px-1.5 py-0.5 font-serif text-2xs text-cinnabar">
                                                        {f.kind === 'stranger-name' ? '生人直呼' : f.kind === 'anachronism' ? '時代錯置' : '後台走光'}
                                                    </span>
                                                ))}
                                                {(marksByMessage.get(m.id) ?? []).map((mk) => (
                                                    <span key={mk.id} title={mk.note} className="rounded-sm border border-jade/50 px-1.5 py-0.5 font-serif text-2xs text-jade">
                                                        {INTERVIEW_MARK_LABEL[mk.kind]}
                                                    </span>
                                                ))}
                                                <button
                                                    type="button"
                                                    className="font-serif text-2xs tracking-[0.15em] text-mute underline-offset-4 hover:text-cinnabar hover:underline"
                                                    onClick={() => {
                                                        setMarkFor(markFor === m.id ? null : m.id);
                                                        setMarkNote('');
                                                    }}
                                                >
                                                    標記候選
                                                </button>
                                            </div>
                                            {markFor === m.id ? (
                                                <div className="es-lab-panel mt-2 flex flex-wrap items-center gap-2 p-2.5">
                                                    <select className="es-field !py-1 text-xs" value={markKind} onChange={(e) => setMarkKind(e.target.value as InterviewMarkKind)}>
                                                        {MARK_KINDS.map((k) => (
                                                            <option key={k} value={k}>{INTERVIEW_MARK_LABEL[k]}</option>
                                                        ))}
                                                    </select>
                                                    <input
                                                        className="es-field min-w-40 flex-1 !py-1 text-xs"
                                                        placeholder="人工備註（可空）"
                                                        value={markNote}
                                                        onChange={(e) => setMarkNote(e.target.value)}
                                                    />
                                                    <button type="button" className="es-button-primary !px-3 !py-1 text-xs" onClick={() => void saveMark(m.id)}>
                                                        存標記
                                                    </button>
                                                </div>
                                            ) : null}
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ol>
                        {asking ? (
                            <p className="mt-5 animate-pulse font-serif text-sm tracking-[0.2em] text-mute">
                                {isDiary ? '她提筆了…' : '她想了想…'}
                            </p>
                        ) : null}
                    </div>

                    {/* ── 問句輸入 ──────────────────────────────────────── */}
                    <footer className="border-t border-hairline/60 px-4 py-3 sm:px-8">
                        <div className="flex flex-wrap gap-1.5 pb-2">
                            {(isDiary ? DIARY_PROMPTS : SAMPLE_QUESTIONS).map((q) => (
                                <button
                                    key={q}
                                    type="button"
                                    disabled={asking}
                                    onClick={() => (isDiary ? void ask(q) : setQuestion(q))}
                                    className="rounded-full border border-hairline px-2.5 py-0.5 font-serif text-2xs text-mute transition hover:border-cinnabar/50 hover:text-ink disabled:opacity-40"
                                >
                                    {q}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-end gap-2">
                            <textarea
                                className="es-field min-h-[2.75rem] flex-1 resize-y font-serif"
                                rows={2}
                                placeholder={isDiary ? '自擬落筆之引（可空 —— 直接請她記今日）' : '問她一句…'}
                                value={question}
                                disabled={asking}
                                onChange={(e) => setQuestion(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void ask();
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => void ask()}
                                disabled={asking || (!isDiary && !question.trim())}
                                className="es-button-primary !px-5 disabled:opacity-50"
                            >
                                {asking ? '待她…' : isDiary ? '請她落筆' : '發問'}
                            </button>
                        </div>
                    </footer>
                </section>

                {/* ── 右：當日狀態三籤 ───────────────────────────────────── */}
                <aside className="hidden w-[26rem] shrink-0 flex-col border-l border-hairline/60 lg:flex">
                    <nav className="flex border-b border-hairline/60">
                        {(
                            [
                                ['known', '所知'],
                                ['director', '內裡'],
                                ['check', '查驗'],
                            ] as Array<[PanelTab, string]>
                        ).map(([key, label]) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setTab(key)}
                                className={`flex-1 py-2.5 font-serif text-sm tracking-[0.25em] transition ${
                                    tab === key ? 'text-cinnabar' : 'text-mute hover:text-ink'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </nav>
                    <div className="min-h-0 flex-1 overflow-y-auto p-4">
                        {tab === 'known' ? <KnownPanel snapshot={snapshot} /> : null}
                        {tab === 'director' ? <DirectorPanel snapshot={snapshot} /> : null}
                        {tab === 'check' ? (
                            <CheckPanel answer={latestAnswer} />
                        ) : null}
                    </div>
                </aside>
            </div>
        </main>
    );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
    return <h3 className="es-page-lead-eyebrow mt-4 first:mt-0">{children}</h3>;
}

function KnownPanel({ snapshot }: { snapshot: InterviewSnapshotView | null }) {
    if (!snapshot) return <p className="font-serif text-xs text-mute">整理她的所知中…</p>;
    const k = snapshot.known;
    return (
        <div className="font-serif text-xs leading-relaxed text-mute">
            <p className="rounded border border-hairline/70 px-2 py-1.5 text-2xs tracking-[0.12em]">
                角色所知 —— 以下即組 prompt 的同一份素材；她只知道這一面。
            </p>
            <SectionTitle>此刻</SectionTitle>
            <p className="text-ink">{k.momentLabel} · {k.sceneName}</p>
            {k.activity ? <p>正在做 —— {k.activity}</p> : null}
            {k.stateWords.length ? <p>身心 —— {k.stateWords.join('，')}</p> : null}
            <SectionTitle>今日親歷</SectionTitle>
            {k.witnessedToday.length ? (
                k.witnessedToday.map((e) => (
                    <div key={e.eventId} className="mb-2">
                        <p className="text-ink">{e.clock ? `${e.clock} · ` : ''}{e.sceneName}</p>
                        {e.lines.map((l, i) => (
                            <p key={i} className="pl-2">{l}</p>
                        ))}
                    </div>
                ))
            ) : (
                <p>（今日無大事）</p>
            )}
            <SectionTitle>記憶帳（近況）</SectionTitle>
            {k.memories.length ? (
                k.memories.map((m, i) => (
                    <p key={i} className="mb-1">
                        <span className="text-ink/70">#{m.seq ?? '—'} 第{m.day ?? '?'}日·{m.kind ?? '—'}</span> {m.text}
                    </p>
                ))
            ) : (
                <p>（尚無記憶）</p>
            )}
            <SectionTitle>眼中眾人</SectionTitle>
            {k.relations.length ? (
                k.relations.map((r) => (
                    <p key={r.id} className="mb-1">
                        <span className="text-ink">{r.knownAs}</span>
                        {r.acquaint === 'stranger' ? '（面生）' : ''} —— {[r.tone, r.closenessWord].filter(Boolean).join('，')}
                        {r.line ? `。「${r.line}」` : ''}
                    </p>
                ))
            ) : (
                <p>（心中無人掛齒）</p>
            )}
            <SectionTitle>心上事</SectionTitle>
            {k.concerns.length ? k.concerns.map((c, i) => <p key={i}>· {c}</p>) : <p>（無）</p>}
            {k.plan ? (
                <>
                    <SectionTitle>眼下打算</SectionTitle>
                    <p>{k.plan}</p>
                </>
            ) : null}
            {k.ownSecret ? (
                <>
                    <SectionTitle>她自己的心底事</SectionTitle>
                    <p className="italic">{k.ownSecret}</p>
                    <p className="text-2xs">（她知道 —— 但訪談之約要求她不輕吐。）</p>
                </>
            ) : null}
        </div>
    );
}

function DirectorPanel({ snapshot }: { snapshot: InterviewSnapshotView | null }) {
    if (!snapshot) return <p className="font-serif text-xs text-mute">整理內裡中…</p>;
    const d = snapshot.directorOnly;
    return (
        <div className="font-serif text-xs leading-relaxed text-mute">
            <p className="rounded border border-cinnabar/60 px-2 py-1.5 text-2xs tracking-[0.12em] text-cinnabar">
                僅導演可見 —— 本籤一切永不進角色 prompt。
            </p>
            <SectionTitle>她不知道的今日事件</SectionTitle>
            {d.unwitnessedToday.length ? (
                d.unwitnessedToday.map((e) => (
                    <div key={e.eventId} className="mb-2">
                        <p className="text-ink">
                            {e.clock ? `${e.clock} · ` : ''}{e.sceneName}
                            <span className="text-2xs">（見證：{e.witnessNames.join('、') || '無'}）</span>
                        </p>
                        {e.lines.map((l, i) => (
                            <p key={i} className="pl-2">{l}</p>
                        ))}
                    </div>
                ))
            ) : (
                <p>（今日無她缺席的事件）</p>
            )}
            <SectionTitle>他人的心底事</SectionTitle>
            {d.othersSecrets.length ? (
                d.othersSecrets.map((s, i) => (
                    <p key={i} className="mb-1"><span className="text-ink">{s.name}</span> —— {s.secret}</p>
                ))
            ) : (
                <p>（無）</p>
            )}
            <SectionTitle>他人眼中的她</SectionTitle>
            {d.viewsOfSubject.length ? (
                d.viewsOfSubject.map((v, i) => (
                    <p key={i} className="mb-1">
                        <span className="text-ink">{v.name}</span>（{v.warmthToSubject.toFixed(2)}／她回望 {v.warmthFromSubject.toFixed(2)}）
                        {v.line ? ` ——「${v.line}」` : ''}
                    </p>
                ))
            ) : (
                <p>（無）</p>
            )}
            <SectionTitle>羈絆數值（她 → 人／人 → 她）</SectionTitle>
            {d.bondNumbers.map((b, i) => (
                <p key={i}>{b.name} —— {b.out.toFixed(2)}／{b.back.toFixed(2)}{b.tone ? ` · ${b.tone}` : ''}</p>
            ))}
            <SectionTitle>心事全帳</SectionTitle>
            {d.wantsFull.length ? (
                d.wantsFull.map((w, i) => (
                    <p key={i}>· {w.desc}（{w.layer} · 張力 {w.tension.toFixed(2)}{w.target ? ` · 向${w.target}` : ''}）</p>
                ))
            ) : (
                <p>（無）</p>
            )}
            <SectionTitle>身心數值</SectionTitle>
            <p>
                疲 {d.stateNumbers.fatigue.toFixed(2)} · 飢 {d.stateNumbers.hunger.toFixed(2)} · 緒 {d.stateNumbers.mood.toFixed(2)}
                {d.renown !== undefined ? ` · 名頭 ${d.renown.toFixed(2)}` : ''}
                {d.selfRegard !== undefined ? ` · 自視 ${d.selfRegard.toFixed(2)}` : ''}
            </p>
            {d.secretSeed ? (
                <>
                    <SectionTitle>心底事之底稿（canon seed）</SectionTitle>
                    <p className="italic">{d.secretSeed}</p>
                </>
            ) : null}
        </div>
    );
}

function CheckPanel({ answer }: { answer: InterviewMessageRecord | null }) {
    if (!answer) return <p className="font-serif text-xs text-mute">尚無回答可查。</p>;
    const ev = answer.evaluation;
    return (
        <div className="font-serif text-xs leading-relaxed text-mute">
            <SectionTitle>結構預檢</SectionTitle>
            {answer.boundaryFlags?.length ? (
                answer.boundaryFlags.map((f, i) => (
                    <p key={i} className="text-cinnabar">⚑ {f.detail}</p>
                ))
            ) : (
                <p>（未見結構性越界）</p>
            )}
            <SectionTitle>本輪召回</SectionTitle>
            <p>
                {answer.recalledMemorySeqs?.length
                    ? `記憶 ${answer.recalledMemorySeqs.map((s) => `#${s}`).join('、')}`
                    : '（本輪未召回記憶）'}
                {answer.injectedEventIds?.length ? ` · 注入今日事件 ${answer.injectedEventIds.length} 件` : ''}
            </p>
            <SectionTitle>查驗（cheap 模型）</SectionTitle>
            {ev === undefined ? (
                <p>（未評 —— 排演檔或無模型鑰）</p>
            ) : ev === null ? (
                <p className="text-cinnabar">（評審輸出解析失敗）</p>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                        {SCORE_LABEL.map(([key, label]) => {
                            const v = ev[key];
                            return typeof v === 'number' ? (
                                <p key={key}>
                                    {label} —— <span className={scoreTone(v)}>{v.toFixed(2)}</span>
                                </p>
                            ) : null;
                        })}
                    </div>
                    {(ev.possibleLeak || ev.possibleHallucination) ? (
                        <p className="mt-1 text-cinnabar">
                            {ev.possibleLeak ? '⚑ 疑有知識越界' : ''}
                            {ev.possibleLeak && ev.possibleHallucination ? ' · ' : ''}
                            {ev.possibleHallucination ? '⚑ 疑有無中生有' : ''}
                        </p>
                    ) : null}
                    {ev.usedMemorySeqs.length ? (
                        <p className="mt-1">評審認定實際踩到 —— {ev.usedMemorySeqs.map((s) => `#${s}`).join('、')}</p>
                    ) : null}
                    {ev.findings.length ? (
                        <>
                            <SectionTitle>具體發現</SectionTitle>
                            {ev.findings.map((f, i) => (
                                <p key={i} className="mb-1">· {f}</p>
                            ))}
                        </>
                    ) : null}
                    {ev.contradictions.length ? (
                        <>
                            <SectionTitle>矛盾</SectionTitle>
                            {ev.contradictions.map((c, i) => (
                                <p key={i} className="mb-1 text-cinnabar">· {c}</p>
                            ))}
                        </>
                    ) : null}
                    {ev.interestingContentCandidates.length ? (
                        <>
                            <SectionTitle>值得轉為內容的片段</SectionTitle>
                            {ev.interestingContentCandidates.map((c, i) => (
                                <p key={i} className="mb-1 text-jade">「{c}」</p>
                            ))}
                        </>
                    ) : null}
                    {ev.notes ? (
                        <>
                            <SectionTitle>評註</SectionTitle>
                            <p>{ev.notes}</p>
                        </>
                    ) : null}
                </>
            )}
            <p className="mt-4 text-2xs">（標記候選請在左側答句下操作 —— 標記會存問、答、記憶用量與備註，供 Creator／Storyteller 取料。）</p>
        </div>
    );
}
