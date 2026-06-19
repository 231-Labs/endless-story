'use client';

import { useState, useTransition } from 'react';
import { runShowrunnerAction } from '@/lib/actions/showrunner';
import type { ShowrunnerResult } from '@/lib/director/showrunner';
import type { ShowrunnerLogEntry } from '@/lib/director/memory-store';
import { Markdown } from '@/components/common/Markdown';

/**
 * Admin panel: run one Showrunner heartbeat (dry-run = read-only evaluation,
 * live = audit → repair → intervene), show the resulting 導演日誌 + tool
 * trail, and display the persistent arc plan / recent log.
 */
export function ShowrunnerPanel({
    initialArcPlan,
    initialLog,
}: {
    initialArcPlan: string;
    initialLog: ShowrunnerLogEntry[];
}) {
    const [result, setResult] = useState<ShowrunnerResult | null>(null);
    const [arcPlan, setArcPlan] = useState(initialArcPlan);
    const [log, setLog] = useState<ShowrunnerLogEntry[]>(initialLog);
    const [isPending, startTransition] = useTransition();

    const handleRun = (dryRun: boolean) => {
        setResult(null);
        startTransition(async () => {
            const r = await runShowrunnerAction({ dryRun });
            setResult(r);
            if (r.ok) {
                setArcPlan(r.arcPlan);
                setLog((prev) =>
                    [
                        ...prev,
                        {
                            at: new Date().toISOString(),
                            day: r.audit.day,
                            report: r.report,
                            toolCalls: r.toolCalls,
                        },
                    ].slice(-10),
                );
            }
        });
    };

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => handleRun(true)}
                    disabled={isPending}
                    aria-label="Dry-Run（只巡檢評估，不動手）"
                    title="Dry-Run · 只巡檢評估，不動手"
                    className="es-icon-button h-9 w-9 border border-hairline text-ink disabled:opacity-50"
                >
                    {isPending ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <EyeIcon className="h-4 w-4" />}
                </button>
                <button
                    type="button"
                    onClick={() => handleRun(false)}
                    disabled={isPending}
                    aria-label="跑一次心跳（巡檢 → 補漏 → 干預）"
                    title="跑一次心跳 · 巡檢 → 補漏 → 干預"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-cinnabar text-canvas transition hover:bg-seal disabled:opacity-50"
                >
                    {isPending ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <PulseIcon className="h-4 w-4" />}
                </button>
                {isPending ? <span className="text-2xs tracking-widest text-mute">心跳中…</span> : null}
            </div>

            {result ? <HeartbeatResult result={result} /> : null}

            <ArcPlan arcPlan={arcPlan} />

            <DirectorLog log={log} />
        </div>
    );
}

/* ── arc plan: current-focus first, the rest collapsed ───────────────────────── */

/** Split the arc-plan markdown into `## ` sections (### sub-items stay inside). */
function parseArcSections(md: string): { title: string; body: string }[] {
    const out: { title: string; body: string }[] = [];
    let cur: { title: string; body: string[] } | null = null;
    for (const line of md.split('\n')) {
        const m = line.match(/^(#{1,2})\s+(.*)$/); // only # / ## start a section
        if (m) {
            if (cur) out.push({ title: cur.title, body: cur.body.join('\n').trim() });
            cur = { title: m[2].trim(), body: [] };
        } else if (cur) {
            cur.body.push(line);
        }
    }
    if (cur) out.push({ title: cur.title, body: cur.body.join('\n').trim() });
    return out;
}

/** Rough item count of a section body (numbered / bulleted / ### lines). */
function countItems(body: string): number {
    return body.split('\n').filter((l) => /^\s*(\d+[.、)]|[-*·•]|#{3})\s/.test(l)).length;
}

function ArcPlan({ arcPlan }: { arcPlan: string }) {
    if (!arcPlan.trim()) {
        return (
            <div className="rounded border border-hairline bg-canvas/40 p-4">
                <h3 className="text-xs tracking-widest text-mute">弧線計畫（當前狀態快照）</h3>
                <p className="mt-2 text-sm leading-relaxed text-mute">（尚無 —— 第一次心跳會建立第一版）</p>
            </div>
        );
    }
    const sections = parseArcSections(arcPlan);
    const version = arcPlan.match(/\bv\d+\b/i)?.[0];
    const themed = sections.find((s) => s.title.includes('主題'));
    const watch = sections.find((s) => /下步|下一步|關注|接下來/.test(s.title));
    const mech = sections.find((s) => s.title.includes('機械'));
    // History lives in the 導演日誌 now — drop any 干預記錄 the LLM still emits, plus the
    // version header; everything else (張力線 / 伏筆 / …) folds away under current-focus.
    const folds = sections.filter(
        (s) =>
            s !== themed &&
            s !== watch &&
            s !== mech &&
            !/干預|紀錄|記錄/.test(s.title) &&
            !/弧線計畫/.test(s.title) &&
            Boolean(s.body.trim()),
    );
    const hasStructure = Boolean(themed || watch) || folds.length > 0;
    return (
        <div className="space-y-3 rounded border border-hairline bg-canvas/40 p-4">
            <div className="flex items-baseline justify-between">
                <h3 className="text-xs tracking-widest text-mute">弧線計畫（當前狀態快照）</h3>
                {version ? <span className="text-2xs tracking-widest text-mute">{version}</span> : null}
            </div>
            {!hasStructure ? (
                <Markdown source={arcPlan} compact />
            ) : (
                <>
                    {themed ? (
                        <div className="rounded border-l-2 border-cinnabar/60 bg-surface/50 px-3 py-2">
                            <div className="text-2xs tracking-widest text-cinnabar">當前主題</div>
                            <Markdown source={themed.body} compact className="mt-1" />
                        </div>
                    ) : null}
                    {watch ? (
                        <div>
                            <div className="mb-1 text-2xs tracking-widest text-cinnabar">下步關注</div>
                            <Markdown source={watch.body} compact />
                        </div>
                    ) : null}
                    {folds.map((s) => (
                        <details key={s.title} className="rounded border border-hairline/60 bg-surface/30 px-3 py-2">
                            <summary className="cursor-pointer list-none text-xs tracking-widest text-mute">
                                <span className="text-cinnabar">▸</span> {s.title}
                                {countItems(s.body) > 0 ? (
                                    <span className="text-mute/70"> · {countItems(s.body)}</span>
                                ) : null}
                            </summary>
                            <Markdown source={s.body} compact className="mt-2" />
                        </details>
                    ))}
                    {mech ? (
                        <details className="rounded border border-hairline bg-canvas/40 px-3 py-2">
                            <summary className="cursor-pointer list-none text-2xs tracking-widest text-mute">
                                ▸ 機械問題
                            </summary>
                            <Markdown source={mech.body} compact className="mt-1" />
                        </details>
                    ) : null}
                </>
            )}
        </div>
    );
}

/* ── director log: latest open, older paginated ──────────────────────────────── */

function LogEntry({ entry }: { entry: ShowrunnerLogEntry }) {
    return (
        <div className="rounded border border-hairline bg-canvas/40 p-4">
            <div className="flex flex-wrap items-center gap-3 text-2xs tracking-widest text-mute">
                <span>{entry.at.slice(0, 16).replace('T', ' ')}</span>
                {entry.day != null ? <span>第{entry.day}日</span> : null}
                <span>
                    工具 {entry.toolCalls.filter((c) => c.ok).length}/{entry.toolCalls.length}
                </span>
            </div>
            <Markdown source={entry.report} compact className="mt-2" />
        </div>
    );
}

function DirectorLog({ log }: { log: ShowrunnerLogEntry[] }) {
    if (log.length === 0) return null;
    const [latest, ...older] = [...log].reverse(); // newest first
    return (
        <div className="space-y-3">
            <div className="flex items-baseline justify-between">
                <h3 className="text-xs tracking-widest text-mute">導演日誌</h3>
                <span className="text-2xs tracking-widest text-mute">共 {log.length} 則</span>
            </div>
            <LogEntry entry={latest} />
            {older.length > 0 ? (
                <details>
                    <summary className="cursor-pointer list-none py-1 text-xs tracking-widest text-mute">
                        <span className="text-cinnabar">▸</span> 展開更早（{older.length} 則）
                    </summary>
                    <div className="mt-3 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
                        {older.map((entry, i) => (
                            <LogEntry key={`${entry.at}-${i}`} entry={entry} />
                        ))}
                    </div>
                </details>
            ) : null}
        </div>
    );
}

function HeartbeatResult({ result }: { result: ShowrunnerResult }) {
    return (
        <div className="space-y-3 rounded border border-hairline bg-canvas/40 p-4">
            <div className="flex flex-wrap items-center gap-3 text-2xs tracking-widest">
                <span
                    className={`inline-block h-2 w-2 rounded-full ${result.ok ? 'bg-jade' : 'bg-cinnabar'}`}
                />
                <span className="text-mute">
                    巡檢 {result.audit.issues.length} 項 · 工具{' '}
                    {result.toolCalls.filter((c) => c.ok).length}/{result.toolCalls.length}
                    {result.repair ? ` · 機械補漏 ${result.repair.attempted}` : ''}
                </span>
            </div>
            {result.error ? (
                <p className="text-sm text-cinnabar">{result.error}</p>
            ) : null}
            {result.toolCalls.length > 0 ? (
                <ul className="space-y-1 text-2xs tracking-widest text-mute">
                    {result.toolCalls.map((c, i) => (
                        <li key={i}>
                            {c.ok ? '✓' : '✗'} {c.tool} ({c.ms}ms)
                        </li>
                    ))}
                </ul>
            ) : null}
            <Markdown source={result.report} compact />
        </div>
    );
}

function EyeIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    );
}

function PulseIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...props}>
            <path d="M3 12h4l2-6 4 14 2-8h6" />
        </svg>
    );
}

function SpinnerIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}>
            <path d="M21 12a9 9 0 1 1-6.2-8.6" />
        </svg>
    );
}
