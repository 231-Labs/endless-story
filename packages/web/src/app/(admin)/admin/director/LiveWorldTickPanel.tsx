'use client';

import { useState, useTransition } from 'react';
import { runTickLoopAction, type TickLoopResult } from '@/lib/actions/tick-loop';
import { TickLoopResultView } from './scheduler/result-views';

/**
 * 活世界 tick — run a tick with ALL the current mechanisms ON, passed in the tick
 * BODY (runtime, no env flag, no redeploy). This is the "run whatever the new
 * mechanism is" button: spine event resolution + resource settlement (so contested
 * resources actually CHANGE HANDS instead of resolving empty_outcome) + perception.
 * Use it to see whether the world's economy actually MOVES.
 */
const LIVE_INPUT = {
    eventSpine: true, //        spine owns resolve+settlement → outcomes_with_resource_transfers
    parallelEvents: false, //   SINGLE spine event (not one-per-axis): far fewer ACT card
    //                          decisions → faster settle-probe. spineMode still on via eventSpine.
    directorResources: true, // director may instantiate + settle scarce resources on chain
    situationPerceive: true, // characters perceive the objective 當下處境
    // LEAN diagnostic: each per-character LLM+recall is 20-65s (serial), so a full
    // tick takes 6-8 min. To test ONLY whether resources settle/transfer, cut every
    // slow phase that isn't on that path: POV/sleep/gazette AND move (79s in the log),
    // and cap the cast to the minimum that still forms a contest.
    pov: false,
    sleep: false,
    gazette: false,
    move: false,
    maxCharacters: 3,
} as const;

export function LiveWorldTickPanel() {
    const [pending, start] = useTransition();
    const [result, setResult] = useState<TickLoopResult | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [n, setN] = useState(0);

    const runOnce = () => {
        setErr(null);
        start(async () => {
            try {
                const r = await runTickLoopAction(LIVE_INPUT);
                setResult(r);
                setN((x) => x + 1);
                if (!r.ok) setErr(r.error ?? 'tick 失敗');
            } catch (e) {
                setErr(e instanceof Error ? e.message : String(e));
            }
        });
    };

    return (
        <div>
            <button
                onClick={runOnce}
                disabled={pending}
                className="rounded-full border border-cinnabar/40 px-5 py-2 text-sm text-cinnabar transition hover:bg-cinnabar/10 disabled:opacity-50"
            >
                {pending ? '世界運轉中…（spine 結算 + 資源轉手 + 感知）' : '活世界 · 推進一個真結算 tick'}
            </button>
            <p className="mt-2 text-2xs leading-relaxed text-mute">
                帶 <code className="font-mono">eventSpine + parallelEvents + directorResources + situationPerceive</code>（寫在 tick body,
                不靠 env、不用重部署）。看下方結果的「事件開/收 + 收尾」有沒有真的判出勝負;再開「資源帳本」看持有者有沒有易手。
                {n > 0 && <span className="text-ink"> · 已跑 {n} tick</span>}
            </p>
            {err && <p className="mt-2 text-sm text-cinnabar">{err}</p>}
            {result && (
                <div className="mt-4">
                    <TickLoopResultView result={result} />
                </div>
            )}
        </div>
    );
}
