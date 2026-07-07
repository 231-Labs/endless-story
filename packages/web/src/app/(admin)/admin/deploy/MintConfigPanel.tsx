'use client';

import { useState, useTransition } from 'react';
import {
    getMintConfigSnapshot,
    setMintFeeAction,
    setMintPausedAction,
    type MintConfigSnapshot,
} from '@/lib/actions/mint-config';
import { txUrl } from '@/lib/explorer';
import { ENDLESS_DECIMALS } from '@endless-story/shared';

function rawToHuman(raw: string | bigint): string {
    try {
        const n = BigInt(raw);
        return (n / BigInt(10 ** ENDLESS_DECIMALS)).toString();
    } catch {
        return '0';
    }
}

function humanToRaw(human: string): string {
    const trimmed = human.trim();
    if (!trimmed) return '0';
    try {
        return (BigInt(trimmed) * BigInt(10 ** ENDLESS_DECIMALS)).toString();
    } catch {
        return '0';
    }
}

export function MintConfigPanel({ initial }: { initial: MintConfigSnapshot | null }) {
    const [snap, setSnap] = useState<MintConfigSnapshot | null>(initial);
    const [feeHuman, setFeeHuman] = useState<string>(initial ? rawToHuman(initial.fee) : '1');
    const [paused, setPaused] = useState<boolean>(initial?.paused ?? false);
    const [msg, setMsg] = useState<string>('');
    const [ok, setOk] = useState<boolean | null>(null);
    const [digest, setDigest] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const handleApplyFee = () => {
        setMsg('套用費用…');
        setOk(null);
        setDigest(null);
        startTransition(async () => {
            const res = await setMintFeeAction({ feeRaw: humanToRaw(feeHuman) });
            if (!res.ok) {
                setOk(false);
                setMsg(`FAIL ${res.error ?? ''}`);
                if (res.digest) setDigest(res.digest);
                return;
            }
            setOk(true);
            setMsg('鑄造費已更新');
            setDigest(res.digest ?? null);
            const next = await getMintConfigSnapshot();
            if (next) setSnap(next);
        });
    };

    const handleTogglePaused = () => {
        const next = !paused;
        setMsg(next ? '暫停中…' : '恢復中…');
        setOk(null);
        setDigest(null);
        startTransition(async () => {
            const res = await setMintPausedAction({ paused: next });
            if (!res.ok) {
                setOk(false);
                setMsg(`FAIL ${res.error ?? ''}`);
                return;
            }
            setOk(true);
            setPaused(next);
            setMsg(next ? '已暫停（用戶無法自助鑄造）' : '已恢復');
            setDigest(res.digest ?? null);
            const fresh = await getMintConfigSnapshot();
            if (fresh) setSnap(fresh);
        });
    };

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                    <span className="text-2xs tracking-widest text-mute">收藏鑄造費 (ENDLESS)</span>
                    <input
                        type="number"
                        min={0}
                        value={feeHuman}
                        onChange={(e) => setFeeHuman(e.target.value)}
                        disabled={isPending || !snap}
                        className="mt-1 w-full rounded border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:border-cinnabar focus:outline-none disabled:opacity-50"
                    />
                    <span className="mt-1 block text-2xs text-mute">
                        鏈上 raw: {humanToRaw(feeHuman)} (6 decimals)
                    </span>
                </label>
                <div>
                    <span className="text-2xs tracking-widest text-mute">當前鏈上狀態</span>
                    <div className="mt-1 rounded border border-hairline/60 bg-surface px-3 py-2 text-sm text-ink">
                        {snap
                            ? `${rawToHuman(snap.fee)} ENDLESS · ${snap.paused ? '已暫停' : '正常開放'}`
                            : '尚未種子化（種世界時自動建立，預設 1 ENDLESS）'}
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap gap-3">
                <button
                    type="button"
                    onClick={handleApplyFee}
                    disabled={isPending || !snap}
                    title="套用收藏鑄造費"
                    className="inline-flex items-center gap-1.5 rounded bg-cinnabar px-4 py-2 text-sm tracking-widest text-canvas hover:bg-seal disabled:opacity-50"
                >
                    <CheckIcon className="h-4 w-4" />
                    {isPending ? '套用中' : '套用'}
                </button>
                <button
                    type="button"
                    onClick={handleTogglePaused}
                    disabled={isPending || !snap}
                    title={paused ? '恢復自助鑄造' : '暫停自助鑄造'}
                    className={`inline-flex items-center gap-1.5 rounded border px-4 py-2 text-sm tracking-widest disabled:opacity-50 ${
                        paused
                            ? 'border-jade/60 text-jade hover:bg-jade hover:text-canvas'
                            : 'border-hairline text-ink hover:bg-elevated'
                    }`}
                >
                    <PowerIcon className="h-4 w-4" />
                    {paused ? '恢復' : '暫停'}
                </button>
            </div>

            {msg ? (
                <div
                    className={`flex items-center gap-3 text-2xs tracking-widest ${
                        ok === null ? 'text-mute' : ok ? 'text-jade' : 'text-cinnabar'
                    }`}
                >
                    <span>{msg}</span>
                    {digest ? (
                        <a
                            href={txUrl(digest)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-cinnabar hover:underline"
                        >
                            tx ↗
                        </a>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
            <path d="M20 6 9 17l-5-5" />
        </svg>
    );
}

function PowerIcon(props: React.SVGProps<SVGSVGElement>) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
            <path d="M12 2v10" />
            <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
        </svg>
    );
}
