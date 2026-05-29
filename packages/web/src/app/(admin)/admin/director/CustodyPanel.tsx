'use client';

import { useState, useTransition } from 'react';
import type { Character } from '@endless-story/shared';
import {
    revokeControlAction,
    reissueControlAction,
    type CustodyResult,
} from '@/lib/actions/custody';
import { txUrl } from '@/lib/explorer';

/**
 * Admin panel: SEAL custody revocation demo.
 *
 * Revoke → the saga's ControlCap epoch is stale → MemWal recall hits
 * ENoAccess (memory read cut on-chain). Re-issue → recall works again.
 * Verify the effect in the dev-server terminal: after revoke, a POV /
 * reflection logs `[memory] recall … failed` or `→ 0 memories`; after
 * re-issue it recovers.
 */
export function CustodyPanel({ characters }: { characters: Character[] }) {
    const [characterId, setCharacterId] = useState<string>(characters[0]?.id ?? '');
    const [result, setResult] = useState<(CustodyResult & { op: string }) | null>(null);
    const [isPending, startTransition] = useTransition();

    const run = (op: 'revoke' | 'reissue') => {
        if (!characterId) return;
        setResult(null);
        startTransition(async () => {
            const r =
                op === 'revoke'
                    ? await revokeControlAction(characterId)
                    : await reissueControlAction(characterId);
            setResult({ ...r, op });
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
                <button
                    type="button"
                    onClick={() => run('revoke')}
                    disabled={isPending || !characterId}
                    className="rounded border border-cinnabar/60 bg-cinnabar/5 px-4 py-2 text-sm tracking-widest text-cinnabar hover:bg-cinnabar/10 disabled:opacity-50"
                >
                    {isPending ? '處理中…' : '撤銷控制'}
                </button>
                <button
                    type="button"
                    onClick={() => run('reissue')}
                    disabled={isPending || !characterId}
                    className="rounded border border-jade/60 bg-jade/5 px-4 py-2 text-sm tracking-widest text-jade hover:bg-jade/10 disabled:opacity-50"
                >
                    {isPending ? '處理中…' : '重新授權'}
                </button>
            </div>

            <p className="text-2xs leading-relaxed tracking-widest text-mute">
                撤銷後 saga 的 ControlCap epoch 過期 → MemWal recall 觸發 ENoAccess（鏈上斷訪）。
                重新授權發一張新 cap 給 admin → recall 恢復。效果看 dev server 終端機的 [memory] log。
                （demo 用；正常營運別亂撤。）
            </p>

            {result ? (
                <div className="flex flex-wrap items-center gap-3 text-2xs tracking-widest">
                    <span
                        className={`inline-block h-2 w-2 rounded-full ${
                            result.ok ? 'bg-jade' : 'bg-cinnabar'
                        }`}
                    />
                    <span className="text-mute">
                        {result.op === 'revoke' ? '撤銷' : '重新授權'}
                        {result.ok ? ' ✓' : ` 失敗：${result.error ?? '未知'}`}
                    </span>
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
            ) : null}
        </div>
    );
}
