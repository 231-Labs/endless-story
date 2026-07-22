'use client';

/**
 * 演員訪談室 · 對照 — 同一個問題，問兩個時間點的同一個人。並排看兩個回答
 * 與各自的今日事件／身心／關係／召回／查驗 —— 用來判斷角色是否因記憶更新
 * 而「合理地」變了，而不是隨機不同。
 */

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { LabPageHeader } from '@/components/lab/LabPageHeader';
import { labApi } from '@/components/lab/useLab';
import type {
    InterviewActorCard,
    InterviewCheckpointList,
    InterviewMessageRecord,
    InterviewSnapshotView,
} from '@/lib/lab/interview/types';

interface SideResult {
    momentLabel: string;
    answer: InterviewMessageRecord;
    snapshot: InterviewSnapshotView | null;
}

export default function InterviewComparePage({ params }: { params: Promise<{ id: string }> }) {
    const { id: rawId } = use(params);
    const id = decodeURIComponent(rawId);

    const [actors, setActors] = useState<InterviewActorCard[]>([]);
    const [checkpoints, setCheckpoints] = useState<InterviewCheckpointList | null>(null);
    const [characterId, setCharacterId] = useState('');
    const [tickA, setTickA] = useState<number | 'current'>('current');
    const [tickB, setTickB] = useState<number | 'current'>('current');
    const [question, setQuestion] = useState('今日過得如何？');
    const [running, setRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [results, setResults] = useState<[SideResult, SideResult] | null>(null);

    useEffect(() => {
        let cancelled = false;
        Promise.all([labApi.interviewActors(id), labApi.interviewCheckpoints(id)])
            .then(([a, c]) => {
                if (cancelled) return;
                setActors(a.actors);
                setCheckpoints(c);
                setCharacterId((prev) => prev || a.actors[0]?.id || '');
                const ticks = c.checkpoints.map((x) => x.tick);
                if (ticks.length >= 2) {
                    setTickA(ticks[ticks.length - 2]);
                    setTickB(ticks[ticks.length - 1]);
                }
            })
            .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
        return () => {
            cancelled = true;
        };
    }, [id]);

    const tickOptions = useMemo(() => {
        const opts: Array<{ value: number | 'current'; label: string }> = [
            { value: 'current', label: checkpoints ? `${checkpoints.current.label}（當前）` : '當前' },
        ];
        for (const c of [...(checkpoints?.checkpoints ?? [])].reverse()) {
            opts.push({ value: c.tick, label: `${c.label} · 拍${c.tick}` });
        }
        return opts;
    }, [checkpoints]);

    const runOne = useCallback(
        async (tick: number | 'current'): Promise<SideResult> => {
            const { interview } = await labApi.createInterview(id, { characterId, tick, mode: 'free' });
            const round = await labApi.askInterview(id, interview.id, question.trim());
            const snapshot = await labApi
                .interviewSnapshot(id, characterId, interview.tick)
                .catch(() => null);
            return { momentLabel: interview.momentLabel, answer: round.answer, snapshot };
        },
        [id, characterId, question],
    );

    const run = useCallback(async () => {
        if (!characterId || !question.trim() || running) return;
        setRunning(true);
        setError(null);
        setResults(null);
        try {
            // 逐側跑（同一人的影子 session 建立各自獨立，但避免同時搶模型）。
            const a = await runOne(tickA);
            const b = await runOne(tickB);
            setResults([a, b]);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setRunning(false);
        }
    }, [characterId, question, running, runOne, tickA, tickB]);

    return (
        <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-8">
            <LabPageHeader
                eyebrow="片場 · 演員訪談室"
                title="兩個時間點的她"
                titleTip="同題並問 —— 驗她是否因記憶更新而合理變化"
                backHref={`/lab/run/${encodeURIComponent(id)}/interview`}
                backTitle="回名錄"
            />

            {error ? <p className="mt-4 font-serif text-sm text-cinnabar" role="alert">{error}</p> : null}

            <section className="es-lab-panel mt-6 flex flex-wrap items-end gap-x-6 gap-y-4 p-4 sm:p-5">
                <label className="block">
                    <span className="es-page-lead-eyebrow">訪問誰</span>
                    <select className="es-field mt-1 min-w-40" value={characterId} onChange={(e) => setCharacterId(e.target.value)}>
                        {actors.map((a) => (
                            <option key={a.id} value={a.id}>{a.name}{a.role ? `（${a.role}）` : ''}</option>
                        ))}
                    </select>
                </label>
                <label className="block">
                    <span className="es-page-lead-eyebrow">甲之時刻</span>
                    <select
                        className="es-field mt-1 min-w-52"
                        value={tickA === 'current' ? 'current' : String(tickA)}
                        onChange={(e) => setTickA(e.target.value === 'current' ? 'current' : Number(e.target.value))}
                    >
                        {tickOptions.map((o) => (
                            <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
                        ))}
                    </select>
                </label>
                <label className="block">
                    <span className="es-page-lead-eyebrow">乙之時刻</span>
                    <select
                        className="es-field mt-1 min-w-52"
                        value={tickB === 'current' ? 'current' : String(tickB)}
                        onChange={(e) => setTickB(e.target.value === 'current' ? 'current' : Number(e.target.value))}
                    >
                        {tickOptions.map((o) => (
                            <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
                        ))}
                    </select>
                </label>
                <label className="block min-w-64 flex-1">
                    <span className="es-page-lead-eyebrow">同一問</span>
                    <input className="es-field mt-1 w-full" value={question} onChange={(e) => setQuestion(e.target.value)} />
                </label>
                <button type="button" onClick={() => void run()} disabled={running} className="es-button-primary disabled:opacity-50">
                    {running ? '兩席並問中…' : '並問'}
                </button>
            </section>

            {results ? (
                <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {results.map((side, i) => (
                        <article key={i} className="es-lab-panel p-4">
                            <h2 className="font-serif text-sm tracking-[0.15em] text-cinnabar">{side.momentLabel}</h2>
                            <p className="mt-2 whitespace-pre-wrap font-serif text-[15px] leading-loose text-ink">{side.answer.content}</p>
                            <div className="mt-3 space-y-2 border-t border-hairline/60 pt-3 font-serif text-xs leading-relaxed text-mute">
                                {side.snapshot ? (
                                    <>
                                        <p>身心 —— {side.snapshot.known.stateWords.join('，') || '平常'}</p>
                                        <div>
                                            今日親歷 ——{' '}
                                            {side.snapshot.known.witnessedToday.length
                                                ? side.snapshot.known.witnessedToday.map((e) => e.sceneName).join('、')
                                                : '無大事'}
                                        </div>
                                        <div>
                                            眼中眾人 ——{' '}
                                            {side.snapshot.known.relations.slice(0, 4).map((r) => `${r.knownAs}（${r.closenessWord}）`).join('、') || '無'}
                                        </div>
                                    </>
                                ) : null}
                                <p>
                                    召回 ——{' '}
                                    {side.answer.recalledMemorySeqs?.length
                                        ? side.answer.recalledMemorySeqs.map((s) => `#${s}`).join('、')
                                        : '無'}
                                </p>
                                {side.answer.evaluation ? (
                                    <p>
                                        查驗 —— 人格 {side.answer.evaluation.characterConsistency.toFixed(2)} · 記憶{' '}
                                        {side.answer.evaluation.memoryGrounding.toFixed(2)} · 邊界{' '}
                                        {side.answer.evaluation.knowledgeBoundary.toFixed(2)}
                                        {side.answer.evaluation.possibleLeak ? ' · ⚑越界' : ''}
                                    </p>
                                ) : (
                                    <p>查驗 —— 未評</p>
                                )}
                                {side.answer.boundaryFlags?.length ? (
                                    <p className="text-cinnabar">預檢 —— {side.answer.boundaryFlags.map((f) => f.detail).join('；')}</p>
                                ) : null}
                            </div>
                        </article>
                    ))}
                </section>
            ) : null}
        </main>
    );
}
