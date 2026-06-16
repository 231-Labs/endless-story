'use client';

import { useState, useTransition } from 'react';
import { runPerceptionAbAction, type PerceptionAbResult } from '@/lib/actions/perception-ab';

/**
 * Perception A/B (admin) — the CONTROLLED, non-destructive comparison.
 * At the current frozen state, runs PLAN twice per character (perception OFF vs ON)
 * in dry-run (no advance, no chain/MemWal write), so each character is its own
 * control. Renders side-by-side + a copy-pasteable markdown block for judgement.
 */
export function PerceptionAbPanel() {
    const [pending, start] = useTransition();
    const [res, setRes] = useState<PerceptionAbResult | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const run = () => {
        setErr(null);
        setCopied(false);
        start(async () => {
            try {
                const r = await runPerceptionAbAction({ maxCharacters: 6 });
                setRes(r);
                if (!r.ok) setErr(r.error ?? '比對失敗');
            } catch (e) {
                setErr(e instanceof Error ? e.message : String(e));
            }
        });
    };

    const copy = async () => {
        if (!res?.markdown) return;
        try {
            await navigator.clipboard.writeText(res.markdown);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            /* clipboard blocked → user selects the textarea manually */
        }
    };

    const changed = res?.rows.filter((r) => r.changed).length ?? 0;

    return (
        <div>
            <button
                onClick={run}
                disabled={pending}
                className="rounded-full border border-cinnabar/40 px-5 py-2 text-sm text-cinnabar transition hover:bg-cinnabar/10 disabled:opacity-50"
            >
                {pending ? '比對中…（每人各跑兩次 PLAN，稍候）' : '跑感知對照（dry-run · 不動世界）'}
            </button>

            {err && <p className="mt-3 text-sm text-cinnabar">{err}</p>}

            {res?.ok && (
                <div className="mt-5 space-y-5">
                    <div className="text-sm text-mute">
                        {res.sagaName} · {res.dayLabel} · 計畫有變 <span className="text-ink">{changed}/{res.rows.length}</span> 人
                    </div>

                    <div>
                        <div className="flex items-center justify-between">
                            <span className="text-2xs uppercase tracking-[0.2em] text-mute">
                                可貼出的對照（複製整段貼給 Claude 判斷）
                            </span>
                            <button
                                onClick={copy}
                                className="rounded-full border border-hairline px-3 py-1 text-2xs text-mute transition hover:text-ink"
                            >
                                {copied ? '已複製 ✓' : '複製全部'}
                            </button>
                        </div>
                        <textarea
                            readOnly
                            value={res.markdown}
                            onFocus={(e) => e.currentTarget.select()}
                            className="mt-2 h-64 w-full resize-y rounded border border-hairline bg-paper/40 p-3 font-mono text-xs leading-relaxed text-ink"
                        />
                    </div>

                    {res.rows.map((r) => (
                        <div key={r.characterId} className="rounded border border-hairline p-4">
                            <div className="font-serif text-base tracking-wide text-ink">
                                {r.name}（{r.role}）
                                <span className={`ml-2 text-2xs ${r.changed ? 'text-cinnabar' : 'text-mute'}`}>
                                    {r.changed ? '· 計畫有變' : '· 計畫未變'}
                                </span>
                            </div>
                            {r.briefing.trim() && (
                                <pre className="mt-2 whitespace-pre-wrap font-mono text-2xs leading-relaxed text-mute">
                                    {r.briefing.trim()}
                                </pre>
                            )}
                            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div>
                                    <div className="text-2xs uppercase tracking-[0.2em] text-mute">感知關</div>
                                    <pre className="mt-1 whitespace-pre-wrap font-mono text-2xs leading-relaxed text-ink">
                                        {r.planOff.trim()}
                                    </pre>
                                </div>
                                <div>
                                    <div className="text-2xs uppercase tracking-[0.2em] text-cinnabar/70">感知開</div>
                                    <pre className="mt-1 whitespace-pre-wrap font-mono text-2xs leading-relaxed text-ink">
                                        {r.planOn.trim()}
                                    </pre>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
