'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import {
    PROMPT_LAB_CALLS,
    stringifyPromptLabInput,
    type PromptLabCallDefinition,
    type PromptLabCallId,
    type PromptLabExecutionMode,
} from '@/lib/prompt-lab/catalog';
import {
    runPromptLabAction,
    type PromptLabActionResult,
    type PromptLabPromptView,
} from '@/lib/actions/prompt-lab';

export function PromptLabPanel() {
    const [selectedId, setSelectedId] = useState<PromptLabCallId>(PROMPT_LAB_CALLS[0].id);
    const selected = useMemo(
        () => PROMPT_LAB_CALLS.find((call) => call.id === selectedId) ?? PROMPT_LAB_CALLS[0],
        [selectedId],
    );
    const [inputJson, setInputJson] = useState(() => stringifyPromptLabInput(selected.defaultInput));
    const [model, setModel] = useState('');
    const [temperature, setTemperature] = useState(
        selected.defaultTemperature == null ? '' : String(selected.defaultTemperature),
    );
    const [result, setResult] = useState<PromptLabActionResult | null>(null);
    const [isPending, startTransition] = useTransition();

    const phases = useMemo(() => {
        const seen = new Set<string>();
        return PROMPT_LAB_CALLS.filter((call) => {
            if (seen.has(call.phase)) return false;
            seen.add(call.phase);
            return true;
        }).map((call) => call.phase);
    }, []);

    const selectCall = (call: PromptLabCallDefinition) => {
        setSelectedId(call.id);
        setInputJson(stringifyPromptLabInput(call.defaultInput));
        setTemperature(call.defaultTemperature == null ? '' : String(call.defaultTemperature));
        setModel('');
        setResult(null);
    };

    const run = (mode: PromptLabExecutionMode) => {
        setResult(null);
        startTransition(async () => {
            const parsedTemperature = temperature.trim() ? Number(temperature) : undefined;
            const response = await runPromptLabAction({
                callId: selected.id,
                inputJson,
                mode,
                model,
                temperature: Number.isFinite(parsedTemperature) ? parsedTemperature : undefined,
            });
            setResult(response);
        });
    };

    return (
        <div className="space-y-8">
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryTile label="Lab 範圍" value="Prompt + fixture + parser" />
                <SummaryTile label="保留既有工具" value="Dry-run / dispatch / anchor" />
                <SummaryTile label="非 LLM 階段" value="DRAMA deterministic" />
                <SummaryTile label="下一層可接" value="評分與版本紀錄" />
            </section>

            <section className="grid gap-6 lg:grid-cols-[18rem,minmax(0,1fr)]">
                <aside className="space-y-4">
                    {phases.map((phase) => (
                        <div key={phase} className="space-y-2">
                            <div className="px-1 text-2xs tracking-widest text-mute">{phase}</div>
                            <div className="space-y-2">
                                {PROMPT_LAB_CALLS.filter((call) => call.phase === phase).map((call) => (
                                    <button
                                        key={call.id}
                                        type="button"
                                        onClick={() => selectCall(call)}
                                        className={`w-full rounded-md border px-3 py-3 text-left transition-colors ${
                                            call.id === selected.id
                                                ? 'border-cinnabar bg-elevated text-ink'
                                                : 'border-hairline bg-surface/70 text-mute hover:border-cinnabar hover:text-ink dark:bg-elevated/25'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="font-serif text-sm text-ink">{call.shortTitle}</span>
                                            <KindBadge kind={call.kind} />
                                        </div>
                                        <div className="mt-1 text-2xs leading-relaxed">{call.title}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </aside>

                <div className="space-y-6">
                    <CallHeader call={selected} />

                    <section className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr),minmax(0,1.1fr)]">
                        <div className="space-y-5">
                            <div className="es-soft-panel overflow-hidden">
                                <PanelHead eyebrow={selected.phase} title="Fixture Input" />
                                <div className="space-y-4 p-4 sm:p-5">
                                    <textarea
                                        value={inputJson}
                                        onChange={(event) => setInputJson(event.target.value)}
                                        rows={22}
                                        spellCheck={false}
                                        className="h-[34rem] min-h-80 w-full resize-y rounded border border-hairline bg-canvas px-3 py-3 font-mono text-xs leading-relaxed text-ink outline-none focus:border-cinnabar dark:bg-canvas/40"
                                    />
                                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr),8rem]">
                                        <label className="space-y-1">
                                            <span className="block text-2xs tracking-widest text-mute">MODEL OVERRIDE</span>
                                            <input
                                                value={model}
                                                onChange={(event) => setModel(event.target.value)}
                                                placeholder="default"
                                                className="es-field font-mono text-xs"
                                                disabled={isPending}
                                            />
                                        </label>
                                        <label className="space-y-1">
                                            <span className="block text-2xs tracking-widest text-mute">TEMP</span>
                                            <input
                                                value={temperature}
                                                onChange={(event) => setTemperature(event.target.value)}
                                                placeholder="default"
                                                inputMode="decimal"
                                                className="es-field font-mono text-xs"
                                                disabled={isPending}
                                            />
                                        </label>
                                    </div>
                                    <div className="flex flex-wrap gap-3">
                                        <button
                                            type="button"
                                            onClick={() => run('inspect')}
                                            disabled={isPending}
                                            className="es-outline-button text-sm tracking-widest disabled:opacity-50"
                                        >
                                            {isPending ? '建置中...' : 'Inspect Prompt'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => run('run')}
                                            disabled={isPending || selected.kind === 'deterministic'}
                                            className="rounded bg-cinnabar px-4 py-2 text-sm tracking-widest text-canvas transition-colors hover:bg-seal disabled:opacity-50"
                                        >
                                            {isPending ? '執行中...' : 'Run LLM'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setInputJson(stringifyPromptLabInput(selected.defaultInput));
                                                setResult(null);
                                            }}
                                            disabled={isPending}
                                            className="es-outline-button text-sm tracking-widest disabled:opacity-50"
                                        >
                                            Reset Fixture
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <IntegrationNotes call={selected} />
                        </div>

                        <div className="space-y-5">
                            {result ? (
                                <ResultView result={result} />
                            ) : (
                                <div className="es-soft-panel p-6 text-sm leading-relaxed text-mute">
                                    選一個階段後先 Inspect Prompt；需要看模型品質時再 Run LLM。
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            </section>
        </div>
    );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-md border border-hairline bg-surface/70 p-4 dark:bg-elevated/25">
            <div className="text-2xs tracking-widest text-mute">{label}</div>
            <div className="mt-2 font-serif text-sm text-ink">{value}</div>
        </div>
    );
}

function CallHeader({ call }: { call: PromptLabCallDefinition }) {
    return (
        <section className="rounded-md border border-hairline bg-surface/70 p-5 dark:bg-elevated/25">
            <div className="flex flex-wrap items-center gap-3">
                <span className="rounded border border-cinnabar/40 px-2 py-1 text-2xs tracking-widest text-cinnabar">
                    {call.phase}
                </span>
                <KindBadge kind={call.kind} />
                <span className="font-mono text-2xs text-mute">{call.id}</span>
            </div>
            <h2 className="mt-4 font-serif text-2xl leading-tight text-ink">{call.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-mute">{call.summary}</p>
            <div className="mt-4 rounded border border-hairline bg-canvas/50 px-3 py-2 font-mono text-xs text-ink/80 dark:bg-canvas/40">
                {call.outputShape}
            </div>
        </section>
    );
}

function IntegrationNotes({ call }: { call: PromptLabCallDefinition }) {
    return (
        <div className="es-soft-panel overflow-hidden">
            <PanelHead eyebrow="INTEGRATION" title="整併判斷" />
            <div className="space-y-3 p-4 text-sm leading-relaxed text-mute sm:p-5">
                <p>
                    Lab 負責 fixture、prompt snapshot、raw output、parser。真實鏈上讀寫、Walrus、
                    dispatch、anchor 仍保留在原本功能面板。
                </p>
                {call.existingTool ? (
                    <div className="rounded border border-hairline bg-canvas/50 p-3 dark:bg-canvas/40">
                        <Link href={call.existingTool.href} className="text-cinnabar hover:underline">
                            {call.existingTool.label}
                        </Link>
                        <p className="mt-1 text-xs leading-relaxed text-mute">{call.existingTool.note}</p>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function ResultView({ result }: { result: PromptLabActionResult }) {
    return (
        <div className="space-y-5">
            <div className="es-soft-panel overflow-hidden">
                <PanelHead
                    eyebrow={result.ok ? 'READY' : 'ERROR'}
                    title={result.ok ? 'Prompt Snapshot' : '執行失敗'}
                />
                <div className="space-y-4 p-4 sm:p-5">
                    {result.error ? (
                        <div className="rounded border border-cinnabar/30 bg-cinnabar/5 p-3 text-sm text-cinnabar">
                            {result.error}
                        </div>
                    ) : null}
                    {result.prompt ? <PromptView prompt={result.prompt} /> : null}
                </div>
            </div>

            {result.rawOutput || result.parsedOutput ? (
                <div className="grid gap-5 2xl:grid-cols-2">
                    {result.rawOutput ? (
                        <OutputBlock title="Raw Output" value={result.rawOutput} />
                    ) : null}
                    {result.parsedOutput ? (
                        <OutputBlock
                            title="Parsed Output"
                            value={formatJson(result.parsedOutput)}
                            note={result.parserNote}
                        />
                    ) : null}
                </div>
            ) : null}

            {result.provider || result.model || result.usage ? (
                <div className="rounded-md border border-hairline bg-surface/70 p-4 text-xs leading-relaxed text-mute dark:bg-elevated/25">
                    {result.provider ? <span>provider={result.provider} </span> : null}
                    {result.model ? <span>model={result.model} </span> : null}
                    {result.usage ? <span>usage={formatJson(result.usage)}</span> : null}
                </div>
            ) : null}
        </div>
    );
}

function PromptView({ prompt }: { prompt: PromptLabPromptView }) {
    if (prompt.kind === 'deterministic') {
        return (
            <div className="rounded border border-hairline bg-canvas/50 p-3 text-sm text-mute dark:bg-canvas/40">
                此階段沒有 LLM prompt；請看 tick 結果中的 drama tension 與下游 dramaHint。
            </div>
        );
    }
    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-3 text-2xs tracking-widest text-mute">
                <span>kind={prompt.kind}</span>
                <span>maxTokens={prompt.maxTokens}</span>
                {prompt.temperature != null ? <span>temperature={prompt.temperature}</span> : null}
            </div>
            {prompt.system ? <OutputBlock title="System" value={prompt.system} compact /> : null}
            {prompt.messages.map((message, index) => (
                <OutputBlock
                    key={`${message.role}-${index}`}
                    title={`${message.role.toUpperCase()} ${index + 1}`}
                    value={message.content}
                    compact
                />
            ))}
        </div>
    );
}

function OutputBlock({
    title,
    value,
    note,
    compact,
}: {
    title: string;
    value: string;
    note?: string;
    compact?: boolean;
}) {
    return (
        <section className="rounded-md border border-hairline bg-surface/70 dark:bg-elevated/25">
            <div className="flex items-center justify-between gap-3 border-b border-hairline px-3 py-2">
                <div className="text-2xs tracking-widest text-mute">{title}</div>
                {note ? <div className="text-right text-2xs text-mute">{note}</div> : null}
            </div>
            <pre
                className={`overflow-x-auto whitespace-pre-wrap break-words p-3 font-mono text-2xs leading-relaxed text-ink/85 ${
                    compact ? 'max-h-80' : 'max-h-[34rem]'
                }`}
            >
                {value}
            </pre>
        </section>
    );
}

function PanelHead({ eyebrow, title }: { eyebrow: string; title: string }) {
    return (
        <div className="border-b border-hairline bg-surface/60 px-4 py-3 dark:bg-elevated/25">
            <div className="text-2xs tracking-widest text-mute">{eyebrow}</div>
            <h3 className="mt-1 font-serif text-lg text-ink">{title}</h3>
        </div>
    );
}

function KindBadge({ kind }: { kind: PromptLabCallDefinition['kind'] }) {
    const label = kind === 'deterministic' ? 'rules' : kind;
    const cls =
        kind === 'primary'
            ? 'border-cinnabar/40 text-cinnabar'
            : kind === 'cheap'
              ? 'border-jade/40 text-jade'
              : 'border-hairline text-mute';
    return (
        <span className={`rounded border px-2 py-0.5 font-mono text-2xs ${cls}`}>
            {label}
        </span>
    );
}

function formatJson(value: unknown): string {
    if (typeof value === 'string') return value;
    return JSON.stringify(value, null, 2);
}
