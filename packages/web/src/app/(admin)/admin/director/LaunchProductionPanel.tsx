'use client';

import { useEffect, useState, useTransition } from 'react';
import {
    launchProductionAction,
    type LaunchProductionActionResult,
} from '@/lib/actions/launch-production';
import {
    getProductionCastingOptions,
    type ProductionCastingOptions,
} from '@/lib/actions/production-casting';
import { txUrl, objectUrl } from '@/lib/explorer';

/**
 * Admin panel: manually trigger `launch_production` (the Director tool) —排一齣
 * 新戲 from the live cast, end-to-end (選角→寫本→作曲→填詞→戲中戲→戲折上鏈).
 * Same Dry-Run / Anchor split as the gazette trigger. Lets you smoke-test the
 * whole production chain without going through the heartbeat / chat loop.
 */
const PLAYS: { key: string; label: string }[] = [
    { key: '', label: '班主自選' },
    { key: 'baishe', label: '白蛇 · 斷橋' },
    { key: 'honglou', label: '紅樓 · 改良' },
    { key: '大戲', label: '白蛇傳 · 全本（大戲）' },
];

export function LaunchProductionPanel() {
    const [classicKey, setClassicKey] = useState('');
    const [skipScore, setSkipScore] = useState(true);
    const [options, setOptions] = useState<ProductionCastingOptions | null>(null);
    const [picks, setPicks] = useState<Record<string, string>>({});
    const [result, setResult] = useState<LaunchProductionActionResult | null>(null);
    const [isPending, startTransition] = useTransition();

    // Load the chosen play's parts + roster so you can pin 指定選角. 自選 → no matrix.
    useEffect(() => {
        let alive = true;
        setPicks({});
        setOptions(null);
        if (!classicKey) return;
        getProductionCastingOptions(classicKey)
            .then((o) => {
                if (alive) setOptions(o);
            })
            .catch(() => {});
        return () => {
            alive = false;
        };
    }, [classicKey]);

    const handleRun = (dryRun: boolean) => {
        setResult(null);
        const cast = Object.keys(picks).length ? picks : undefined;
        startTransition(async () => {
            const r = await launchProductionAction({
                classicKey: classicKey || undefined,
                skipScore,
                dryRun,
                cast,
            });
            setResult(r);
        });
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-2xs tracking-widest text-mute">
                    戲碼
                    <select
                        value={classicKey}
                        onChange={(e) => setClassicKey(e.target.value)}
                        disabled={isPending}
                        className="rounded border border-hairline bg-surface px-2 py-1 text-sm text-ink disabled:opacity-50"
                    >
                        {PLAYS.map((p) => (
                            <option key={p.key || 'auto'} value={p.key}>
                                {p.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="flex items-center gap-2 text-2xs tracking-widest text-mute">
                    <input
                        type="checkbox"
                        checked={skipScore}
                        onChange={(e) => setSkipScore(e.target.checked)}
                        disabled={isPending}
                    />
                    純排戲（跳過作曲）
                </label>
            </div>

            {options && options.parts.length ? (
                <div className="space-y-2 rounded border border-hairline/60 bg-canvas/30 p-3">
                    <div className="text-2xs tracking-widest text-mute">
                        指定選角（欽點）· 留「自動」則由行當/緣分自動配
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {options.parts.map((part) => (
                            <label key={part.partId} className="flex items-center gap-2 text-sm text-ink">
                                <span className="w-28 shrink-0 text-mute">
                                    {part.partName}
                                    <span className="ml-1 text-2xs text-mute/60">
                                        {part.hangdang}/{part.yinggong}
                                    </span>
                                </span>
                                <select
                                    value={picks[part.partName] ?? ''}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setPicks((prev) => {
                                            const next = { ...prev };
                                            if (v) next[part.partName] = v;
                                            else delete next[part.partName];
                                            return next;
                                        });
                                    }}
                                    disabled={isPending}
                                    className="flex-1 rounded border border-hairline bg-surface px-2 py-1 text-sm text-ink disabled:opacity-50"
                                >
                                    <option value="">自動</option>
                                    {options.roster.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.name}（{c.role}）
                                        </option>
                                    ))}
                                </select>
                            </label>
                        ))}
                    </div>
                </div>
            ) : null}

            <div className="flex flex-wrap gap-3">
                <button
                    type="button"
                    onClick={() => handleRun(true)}
                    disabled={isPending}
                    className="rounded border border-hairline bg-surface px-4 py-2 text-sm tracking-widest text-ink hover:bg-elevated disabled:opacity-50"
                >
                    {isPending ? '排戲中…' : 'Dry-Run（只排不上鏈）'}
                </button>
                <button
                    type="button"
                    onClick={() => handleRun(false)}
                    disabled={isPending}
                    className="rounded bg-cinnabar px-4 py-2 text-sm tracking-widest text-canvas hover:bg-seal disabled:opacity-50"
                >
                    {isPending ? '上鏈中…' : '排一齣並上鏈'}
                </button>
            </div>
            <p className="text-2xs tracking-widest text-mute">
                讀真班底 → 班主選戲 → 編劇寫本 → 行當選角（乾旦/坤生）→ 琴師作曲 → 角色有感而發填詞 → 全體演戲中戲 →
                鑄成「戲折」commitment::commit (subject_id=saga)。多次 LLM＋上鏈，請耐心等。
            </p>

            {result ? <ResultView result={result} /> : null}
        </div>
    );
}

function ResultView({ result }: { result: LaunchProductionActionResult }) {
    return (
        <div className="space-y-3 rounded border border-hairline bg-canvas/40 p-4">
            <div className="flex flex-wrap items-center gap-3 text-2xs tracking-widest">
                <span className={`inline-block h-2 w-2 rounded-full ${result.ok ? 'bg-jade' : 'bg-cinnabar'}`} />
                <span className="text-mute">{result.anchored ? '已上鏈' : 'Dry-Run'}</span>
                {result.title ? (
                    <span className="text-ink">
                        《{result.title}》{result.scenes ? ` · ${result.scenes} 場` : ''}
                    </span>
                ) : null}
                {result.llm ? (
                    <span className="text-mute">
                        LLM {result.llm.calls} 呼叫{result.llm.failures ? `（失敗 ${result.llm.failures}）` : ''} ·{' '}
                        {(result.llm.ms / 1000).toFixed(1)}s
                    </span>
                ) : null}
                {result.digest ? (
                    <a href={txUrl(result.digest)} target="_blank" rel="noopener noreferrer" className="text-cinnabar hover:underline">
                        tx
                    </a>
                ) : null}
                {result.commitmentId ? (
                    <a href={objectUrl(result.commitmentId)} target="_blank" rel="noopener noreferrer" className="text-cinnabar hover:underline">
                        commitment
                    </a>
                ) : null}
                {result.blobId ? (
                    <a href={`/api/blob/${result.blobId}`} target="_blank" rel="noopener noreferrer" className="text-cinnabar hover:underline">
                        walrus
                    </a>
                ) : null}
            </div>

            {result.error ? <div className="text-sm text-cinnabar">錯誤：{result.error}</div> : null}

            {result.cast && result.cast.length ? (
                <div className="space-y-1">
                    <div className="text-2xs tracking-widest text-mute">選角</div>
                    <ul className="text-sm text-ink">
                        {result.cast.map((c, i) => (
                            <li key={i}>
                                {c.part} — {c.actor}
                                {c.crossCast ? <span className="ml-1 text-cinnabar">〔{c.crossCast}〕</span> : null}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            {result.emergent && result.emergent.length ? (
                <div className="space-y-1">
                    <div className="text-2xs tracking-widest text-mute">有感而發</div>
                    <ul className="text-sm text-ink">
                        {result.emergent.map((e, i) => (
                            <li key={i}>
                                {e.author}
                                {e.why ? <span className="text-mute"> — {e.why}</span> : null}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            {result.content ? (
                <div className="space-y-1">
                    <div className="text-2xs tracking-widest text-mute">產出全文（劇本 · 詞 · 戲中戲章回）</div>
                    <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded border border-hairline/60 bg-surface p-3 font-serif text-sm leading-loose text-ink">
                        {result.content}
                    </pre>
                </div>
            ) : null}

            {result.seedancePrompts && result.seedancePrompts.length ? (
                <div className="space-y-2">
                    <div className="text-2xs tracking-widest text-mute">
                        Seedance 2.0 提示詞 · 每場一段（手動貼去生 15s 短片）
                        <span className="ml-1 text-mute/60">· text-to-video，不繼承角色臉，僅供試效果</span>
                    </div>
                    {result.seedancePrompts.map((s, i) => (
                        <SeedanceBlock key={i} sceneTitle={s.sceneTitle} prompt={s.prompt} />
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function SeedanceBlock({ sceneTitle, prompt }: { sceneTitle: string; prompt: string }) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        navigator.clipboard?.writeText(prompt).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };
    return (
        <div className="rounded border border-hairline/60 bg-surface p-3">
            <div className="mb-1 flex items-center justify-between">
                <span className="text-2xs tracking-widest text-ink">〈{sceneTitle}〉</span>
                <button type="button" onClick={copy} className="text-2xs tracking-widest text-cinnabar hover:underline">
                    {copied ? '已複製' : '複製'}
                </button>
            </div>
            <textarea
                readOnly
                value={prompt}
                rows={5}
                className="w-full resize-y rounded border border-hairline/40 bg-canvas/40 p-2 font-mono text-xs leading-relaxed text-ink"
            />
        </div>
    );
}
