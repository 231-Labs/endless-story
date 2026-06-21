'use client';

import { useState, useTransition } from 'react';
import {
    compileEventChapterAction,
    type CompileEventChapterActionResult,
} from '@/lib/actions/compile-event-chapter';
import { txUrl, objectUrl } from '@/lib/explorer';

/**
 * Admin panel: weave one event's POVs into the canonical "回" (event_cut).
 * Standalone path — give the scene + event tx + cast, the compiler fetches each
 * character's matching POV from chain and braids them. Same Dry-Run / Anchor
 * split as the gazette. See docs/narrative/CONTENT_PIPELINE.md §2.
 */
export function EventCutPanel() {
    const [sceneId, setSceneId] = useState('');
    const [eventTx, setEventTx] = useState('');
    const [eventLabel, setEventLabel] = useState('');
    const [castIds, setCastIds] = useState('');
    const [day, setDay] = useState('');
    const [result, setResult] = useState<CompileEventChapterActionResult | null>(null);
    const [isPending, startTransition] = useTransition();

    const run = (dryRun: boolean) => {
        setResult(null);
        const castCharacterIds = castIds
            .split(/[,，\s]+/)
            .map((s) => s.trim())
            .filter(Boolean);
        startTransition(async () => {
            const r = await compileEventChapterAction({
                sceneId: sceneId.trim(),
                eventTx: eventTx.trim() || undefined,
                eventLabel: eventLabel.trim() || undefined,
                day: day.trim() ? Number(day.trim()) : undefined,
                castCharacterIds,
                dryRun,
            });
            setResult(r);
        });
    };

    const ready = sceneId.trim().length > 0 && eventTx.trim().length > 0;

    return (
        <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="場景 sceneId（cut 的 commitment subject）" value={sceneId} onChange={setSceneId} mono />
                <Field label="事件 tx digest（串起各 POV）" value={eventTx} onChange={setEventTx} mono />
                <Field label="這樁事（label，選填）" value={eventLabel} onChange={setEventLabel} />
                <Field label="第幾日（選填）" value={day} onChange={setDay} />
                <div className="sm:col-span-2">
                    <Field
                        label="在場角色 ids（逗號分隔，從 /dossier 抄）"
                        value={castIds}
                        onChange={setCastIds}
                        mono
                    />
                </div>
            </div>
            <div className="flex flex-wrap gap-3">
                <button
                    type="button"
                    onClick={() => run(true)}
                    disabled={isPending || !ready}
                    className="rounded border border-hairline bg-surface px-4 py-2 text-sm tracking-widest text-ink hover:bg-elevated disabled:opacity-50"
                >
                    {isPending ? '織回中…' : 'Dry-Run（只看織出的回）'}
                </button>
                <button
                    type="button"
                    onClick={() => run(false)}
                    disabled={isPending || !ready}
                    className="rounded bg-cinnabar px-4 py-2 text-sm tracking-widest text-canvas hover:bg-seal disabled:opacity-50"
                >
                    {isPending ? '上鏈中…' : '織一回並上鏈'}
                </button>
            </div>
            <p className="text-2xs tracking-widest text-mute">
                抓在場角色「同一事件 tx」的 POV → 多視角織成一回（保留各人聲口、不抹平矛盾）→ Walrus +
                commitment::commit（subject_id=scene）。少於 2 個 POV 會自動 skip。
            </p>
            {result ? <ResultView result={result} /> : null}
        </div>
    );
}

function Field({
    label,
    value,
    onChange,
    mono,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    mono?: boolean;
}) {
    return (
        <label className="block">
            <span className="block text-2xs tracking-widest text-mute">{label}</span>
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={`mt-1 w-full rounded border border-hairline bg-canvas px-3 py-2 text-sm text-ink dark:bg-canvas/40 ${
                    mono ? 'font-mono text-2xs' : ''
                }`}
            />
        </label>
    );
}

function ResultView({ result }: { result: CompileEventChapterActionResult }) {
    return (
        <div className="space-y-3 rounded border border-hairline bg-canvas/40 p-4">
            <div className="flex flex-wrap items-center gap-3 text-2xs tracking-widest">
                <span className={`inline-block h-2 w-2 rounded-full ${result.ok ? 'bg-jade' : 'bg-cinnabar'}`} />
                <span className="text-mute">
                    {result.skipReason
                        ? `skipped: ${result.skipReason}`
                        : result.anchored
                          ? '已上鏈'
                          : 'Dry-Run'}
                </span>
                <span className="text-mute">{result.povCount} 視角織入</span>
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
            {result.chapter ? (
                <pre className="overflow-x-auto whitespace-pre-wrap rounded border border-hairline/60 bg-surface p-3 font-serif text-sm leading-loose text-ink">
                    {result.chapter}
                </pre>
            ) : null}
        </div>
    );
}
