'use client';

import { useEffect, useState, useTransition } from 'react';
import {
    setDirectorBeatAction,
    clearDirectorBeatAction,
    getDirectorBeatAction,
    type DirectorBeat,
} from '@/lib/actions/director-beat';

/**
 * Director beat (Step 2) — broadcast a saga-public crisis the whole cast will perceive.
 * It enters every character's 當下處境 next tick (perception ON). Private pressure on a
 * single character uses inject_dream instead.
 */
export function DirectorBeatPanel() {
    const [pending, start] = useTransition();
    const [text, setText] = useState('');
    const [phase, setPhase] = useState('');
    const [current, setCurrent] = useState<DirectorBeat | null>(null);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        getDirectorBeatAction().then(setCurrent).catch(() => {});
    }, []);

    const broadcast = () => {
        setErr(null);
        start(async () => {
            const r = await setDirectorBeatAction(text, phase);
            if (r.ok) {
                setCurrent(r.beat ?? null);
                setText('');
                setPhase('');
            } else setErr(r.error ?? '失敗');
        });
    };

    const clear = () => {
        setErr(null);
        start(async () => {
            await clearDirectorBeatAction();
            setCurrent(null);
        });
    };

    return (
        <div className="space-y-3">
            {current ? (
                <div className="rounded border border-cinnabar/30 bg-cinnabar/5 p-3">
                    <div className="text-2xs uppercase tracking-[0.2em] text-cinnabar/70">當前廣播中的危機</div>
                    <div className="mt-1 text-sm text-ink">{current.text}</div>
                    {current.phase && <div className="mt-0.5 text-2xs text-mute">phase: {current.phase}</div>}
                </div>
            ) : (
                <div className="text-2xs text-mute">目前沒有廣播中的危機。</div>
            )}

            <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="例：百代公司逼宮，限三日內交出母盤，否則全班停演"
                rows={2}
                className="w-full resize-y rounded border border-hairline bg-paper/40 p-3 text-sm text-ink placeholder:text-mute/60"
            />
            <input
                value={phase}
                onChange={(e) => setPhase(e.target.value)}
                placeholder="phase（選填，如 act_2）"
                className="w-full rounded border border-hairline bg-paper/40 px-3 py-2 text-sm text-ink placeholder:text-mute/60"
            />

            {err && <p className="text-sm text-cinnabar">{err}</p>}

            <div className="flex gap-3">
                <button
                    onClick={broadcast}
                    disabled={pending || !text.trim()}
                    className="rounded-full border border-cinnabar/40 px-5 py-2 text-sm text-cinnabar transition hover:bg-cinnabar/10 disabled:opacity-50"
                >
                    {pending ? '處理中…' : '廣播危機（全員下個 tick 感知）'}
                </button>
                {current && (
                    <button
                        onClick={clear}
                        disabled={pending}
                        className="rounded-full border border-hairline px-5 py-2 text-sm text-mute transition hover:text-ink disabled:opacity-50"
                    >
                        解除
                    </button>
                )}
            </div>
            <p className="text-2xs leading-relaxed text-mute">
                公開廣播：全 saga 角色都會感知到（進「當下處境」）。只想壓一個角色 → 用 inject_dream（私密記憶），不會外洩。
                註：目前存在 web 服務記憶體，服務重啟會清掉（持久化上鏈為後續）。
            </p>
        </div>
    );
}
