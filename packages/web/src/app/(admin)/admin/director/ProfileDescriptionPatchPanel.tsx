'use client';

import { useMemo, useState, useTransition } from 'react';
import type { Character } from '@endless-story/shared';
import {
    updateCharacterProfileDescriptionAction,
    type UpdateCharacterProfileDescriptionResult,
} from '@/lib/actions/update-character-profile';
import { txUrl } from '@/lib/explorer';

export function ProfileDescriptionPatchPanel({ characters }: { characters: Character[] }) {
    const [characterId, setCharacterId] = useState<string>(characters[0]?.id ?? '');
    const selected = useMemo(
        () => characters.find((c) => c.id === characterId) ?? characters[0],
        [characters, characterId],
    );
    const [description, setDescription] = useState(selected?.description ?? '');
    const [result, setResult] = useState<UpdateCharacterProfileDescriptionResult | null>(null);
    const [isPending, startTransition] = useTransition();

    const selectCharacter = (nextId: string) => {
        const next = characters.find((c) => c.id === nextId);
        setCharacterId(nextId);
        setDescription(next?.description ?? '');
        setResult(null);
    };

    const run = () => {
        if (!characterId || !description.trim()) return;
        setResult(null);
        startTransition(async () => {
            const r = await updateCharacterProfileDescriptionAction({ characterId, description });
            setResult(r);
        });
    };

    return (
        <div className="space-y-4 rounded border border-hairline bg-surface p-4">
            <div>
                <h3 className="font-serif text-xl tracking-wide text-ink">履歷修正</h3>
                <p className="mt-1 text-2xs leading-relaxed text-mute">
                    由 saga storyteller cap 修正公開 NFT 描述；owner 無法自行改。
                </p>
            </div>

            <label className="block space-y-1.5">
                <div className="text-2xs tracking-widest text-mute">角色</div>
                <select
                    value={characterId}
                    onChange={(e) => selectCharacter(e.target.value)}
                    disabled={isPending}
                    className="w-full rounded border border-hairline bg-canvas px-3 py-2 text-sm text-ink focus:border-cinnabar focus:outline-none"
                >
                    {characters.length === 0 ? <option value="">— 無角色 —</option> : null}
                    {characters.map((c) => (
                        <option key={c.id} value={c.id}>
                            {c.name} ({c.id.slice(0, 10)}…)
                        </option>
                    ))}
                </select>
            </label>

            <label className="block space-y-1.5">
                <div className="text-2xs tracking-widest text-mute">公開描述</div>
                <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={isPending}
                    rows={7}
                    className="w-full rounded border border-hairline bg-canvas px-3 py-2 text-sm leading-relaxed text-ink focus:border-cinnabar focus:outline-none"
                />
            </label>

            <div className="flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    onClick={run}
                    disabled={isPending || !characterId || !description.trim()}
                    className="rounded bg-cinnabar px-4 py-2 text-sm tracking-widest text-canvas hover:bg-seal disabled:opacity-50"
                >
                    {isPending ? '修正中…' : '上鏈修正描述'}
                </button>
                <span className="text-2xs tracking-widest text-mute">
                    會更新 <code className="font-mono">profile.description</code>，Display 描述會跟著變。
                </span>
            </div>

            {result ? <ResultView result={result} /> : null}
        </div>
    );
}

function ResultView({ result }: { result: UpdateCharacterProfileDescriptionResult }) {
    return (
        <div className="flex flex-wrap items-center gap-3 rounded border border-hairline bg-canvas/40 p-3 text-2xs tracking-widest">
            <span className={`inline-block h-2 w-2 rounded-full ${result.ok ? 'bg-jade' : 'bg-cinnabar'}`} />
            <span className="text-mute">{result.ok ? '已修正' : `失敗：${result.error ?? '未知'}`}</span>
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
        </div>
    );
}
