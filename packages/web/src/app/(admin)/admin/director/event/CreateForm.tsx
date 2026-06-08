import { useState, useTransition } from 'react';
import type { Character, Scene } from '@endless-story/shared';
import {
    createBudgetEventAction,
    type CreateBudgetEventResult,
} from '@/lib/actions/budget-event';
import { txUrl, objectUrl } from '@/lib/explorer';

export function CreateForm({
    scenes,
    characters,
    onCreated,
}: {
    scenes: Scene[];
    characters: Character[];
    onCreated: () => void;
}) {
    // Default to the first scene that has at least one character — that's
    // the most useful default. Falls back to `scenes[0]` so empty deployments
    // still pick something.
    const sceneCharCount = (sceneId: string) =>
        characters.filter((c) => c.currentSceneId === sceneId).length;
    const firstPopulated = scenes.find((s) => sceneCharCount(s.id) > 0);
    const [sceneId, setSceneId] = useState<string>(
        firstPopulated?.id ?? scenes[0]?.id ?? '',
    );
    const [title, setTitle] = useState('');
    const [summary, setSummary] = useState('');
    const [scale, setScale] = useState(3);
    const [result, setResult] = useState<CreateBudgetEventResult | null>(null);
    const [isPending, startTransition] = useTransition();

    const handleSubmit = () => {
        if (!sceneId || !title.trim()) return;
        setResult(null);
        startTransition(async () => {
            const r = await createBudgetEventAction({
                sceneId,
                title: title.trim(),
                summary: summary.trim(),
                scale,
            });
            setResult(r);
            if (r.ok) {
                setTitle('');
                setSummary('');
                onCreated();
            }
        });
    };

    return (
        <div className="space-y-3 rounded border border-hairline bg-canvas/40 p-4">
            <h3 className="font-serif text-base text-ink">開新事件</h3>
            <p className="text-2xs tracking-widest text-mute">
                預設牌組：斬 / 攻 / 敘 / 觀，每位參與者抽 3 張。建立後到下方「發牌」加入角色。
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                    <div className="text-2xs tracking-widest text-mute">場景</div>
                    <select
                        value={sceneId}
                        onChange={(e) => setSceneId(e.target.value)}
                        disabled={isPending}
                        className="w-full rounded border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:border-cinnabar focus:outline-none"
                    >
                        {scenes.length === 0 ? (
                            <option value="">— 無場景 —</option>
                        ) : null}
                        {scenes.map((s) => {
                            const n = sceneCharCount(s.id);
                            return (
                                <option key={s.id} value={s.id}>
                                    {s.name} · {n} 人
                                </option>
                            );
                        })}
                    </select>
                </label>

                <label className="space-y-1.5">
                    <div className="text-2xs tracking-widest text-mute">scale (1–5)</div>
                    <input
                        type="number"
                        min={1}
                        max={5}
                        value={scale}
                        onChange={(e) => setScale(Number(e.target.value))}
                        disabled={isPending}
                        className="w-full rounded border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:border-cinnabar focus:outline-none"
                    />
                </label>
            </div>

            <label className="block space-y-1.5">
                <div className="text-2xs tracking-widest text-mute">標題</div>
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="後台一場口角"
                    disabled={isPending}
                    className="w-full rounded border border-hairline bg-surface px-3 py-2 font-serif text-sm text-ink focus:border-cinnabar focus:outline-none"
                />
            </label>

            <label className="block space-y-1.5">
                <div className="text-2xs tracking-widest text-mute">摘要</div>
                <textarea
                    rows={2}
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="林某與沈伶在後台化妝間口角…"
                    disabled={isPending}
                    className="w-full rounded border border-hairline bg-surface px-3 py-2 font-serif text-sm text-ink focus:border-cinnabar focus:outline-none"
                />
            </label>

            <div className="flex items-center justify-between gap-3">
                <p className="text-2xs tracking-widest text-mute">
                    push_event · storyteller cap-gated
                </p>
                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!sceneId || !title.trim() || isPending}
                    className="rounded bg-cinnabar px-4 py-2 text-sm tracking-widest text-canvas hover:bg-seal disabled:opacity-50"
                >
                    {isPending ? '建立中…' : '上鏈 · 開事件'}
                </button>
            </div>

            {result ? <CreateResult result={result} /> : null}
        </div>
    );
}

function CreateResult({ result }: { result: CreateBudgetEventResult }) {
    return (
        <div className="flex flex-wrap items-center gap-3 text-2xs tracking-widest">
            <span
                className={`inline-block h-2 w-2 rounded-full ${
                    result.ok ? 'bg-jade' : 'bg-cinnabar'
                }`}
            />
            <span className="text-mute">{result.ok ? '已上鏈' : '失敗'}</span>
            {result.digest ? (
                <a
                    href={txUrl(result.digest)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cinnabar hover:underline"
                >
                    tx
                </a>
            ) : null}
            {result.eventId ? (
                <a
                    href={objectUrl(result.eventId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cinnabar hover:underline"
                >
                    event
                </a>
            ) : null}
            {result.error ? (
                <span className="text-cinnabar">{result.error}</span>
            ) : null}
        </div>
    );
}
