'use client';

import { useState, useTransition } from 'react';
import type { Character } from '@endless-story/shared';
import {
    seedGenesisMemoryAction,
    type SeedGenesisResult,
} from '@/lib/actions/seed-genesis-memory';

/**
 * Admin panel: seed a character's genesis memories into MemWal.
 *
 * New mints auto-seed via the recruitment wizard; this is for characters
 * minted before the feature existed, or to re-seed. MemWal appends, so
 * re-running stacks memories — use sparingly.
 */
export function GenesisMemoryPanel({ characters }: { characters: Character[] }) {
    const [characterId, setCharacterId] = useState<string>(characters[0]?.id ?? '');
    const [count, setCount] = useState(4);
    const [result, setResult] = useState<SeedGenesisResult | null>(null);
    const [isPending, startTransition] = useTransition();

    const handleSeed = () => {
        if (!characterId) return;
        setResult(null);
        startTransition(async () => {
            const r = await seedGenesisMemoryAction(characterId, count);
            setResult(r);
        });
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
                <label className="space-y-1.5">
                    <div className="text-2xs tracking-widest text-mute">角色</div>
                    <select
                        value={characterId}
                        onChange={(e) => setCharacterId(e.target.value)}
                        disabled={isPending}
                        className="rounded border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:border-cinnabar focus:outline-none"
                    >
                        {characters.length === 0 ? <option value="">— 無角色 —</option> : null}
                        {characters.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name} ({c.id.slice(0, 10)}…)
                            </option>
                        ))}
                    </select>
                </label>
                <label className="space-y-1.5">
                    <div className="text-2xs tracking-widest text-mute">幾條</div>
                    <input
                        type="number"
                        min={1}
                        max={8}
                        value={count}
                        onChange={(e) => setCount(Number(e.target.value))}
                        disabled={isPending}
                        className="w-20 rounded border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:border-cinnabar focus:outline-none"
                    />
                </label>
                <button
                    type="button"
                    onClick={handleSeed}
                    disabled={isPending || !characterId}
                    className="rounded bg-cinnabar px-4 py-2 text-sm tracking-widest text-canvas hover:bg-seal disabled:opacity-50"
                >
                    {isPending ? '寫入中…' : '種下初始記憶'}
                </button>
            </div>

            <p className="text-2xs tracking-widest text-mute">
                從角色描述蒸餾出第一人稱開場記憶，寫進 MemWal（缺 creds 時 seeded=0）。
                MemWal 是 append，重複跑會疊加 — 一隻角色種一次就好。
            </p>

            {result ? (
                <div className="flex flex-wrap items-center gap-3 text-2xs tracking-widest">
                    <span
                        className={`inline-block h-2 w-2 rounded-full ${
                            result.ok ? 'bg-jade' : 'bg-cinnabar'
                        }`}
                    />
                    <span className="text-mute">
                        {result.skipped === 'memory_unconfigured'
                            ? 'MemWal 未設定（seeded 0）— 填 .env.local 後再試'
                            : result.skipped === 'character_unreachable'
                              ? '角色讀不到（RPC lag？稍後再試）'
                              : result.ok
                                ? `已種 ${result.seeded}/${result.generated} 條`
                                : `失敗：${result.error ?? '未知'}`}
                    </span>
                </div>
            ) : null}
        </div>
    );
}
