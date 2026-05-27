'use client';

import { useState, useTransition } from 'react';
import {
    useCurrentAccount,
    useSignAndExecuteTransaction,
    useSuiClient,
} from '@mysten/dapp-kit';
import { Transaction, coinWithBalance } from '@mysten/sui/transactions';
import {
    ENDLESS_STORY_DEPLOYMENT,
    tx as endlessTx,
    read,
} from '@endless-story/sdk';
import { prepareDreamAction, type PrepareDreamActionResult } from '@/lib/actions/prepare-dream';
import { txUrl, objectUrl } from '@/lib/explorer';

/**
 * 注夢按鈕 — owner-only. Two-phase flow:
 *   1. Click → modal opens, owner types dream → "送審" → server
 *      moderates + uploads to Walrus → returns prepared data
 *   2. Owner reviews optimised text → "支付 50 ENDLESS 並上鏈" →
 *      client-side PTB: coinWithBalance + dream::submit_dream → wallet
 *      signs → Dream object lands on chain.
 *
 * Owner gate: only renders when connected wallet === character.nftOwner.
 */
export function DreamInjectButton({
    characterId,
    characterNftOwner,
}: {
    characterId: string;
    characterNftOwner: string;
}) {
    const account = useCurrentAccount();
    const suiClient = useSuiClient();
    const { mutate: signAndExecute } = useSignAndExecuteTransaction();

    const [open, setOpen] = useState(false);
    const [rawText, setRawText] = useState('');
    const [prepared, setPrepared] = useState<PrepareDreamActionResult | null>(null);
    const [chainResult, setChainResult] = useState<{
        digest: string;
        dreamId?: string;
    } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    if (!account) return null;
    if (account.address !== characterNftOwner) return null;

    const handlePrepare = () => {
        setError(null);
        setPrepared(null);
        setChainResult(null);
        startTransition(async () => {
            const res = await prepareDreamAction({ characterId, rawText });
            setPrepared(res);
            if (!res.ok && !res.rejectReason) {
                setError(res.error ?? '未知錯誤');
            }
        });
    };

    const handleSubmitOnChain = () => {
        if (!prepared?.ok || prepared.status !== 'accepted' || !prepared.blobId) return;
        setError(null);
        const d = ENDLESS_STORY_DEPLOYMENT;

        startTransition(async () => {
            // Find OwnerCap for this character owned by this wallet.
            let ownerCapId: string | null = null;
            try {
                const caps = await read.character.listOwnerCapsForAddress(
                    suiClient,
                    account.address,
                    d.packageId,
                );
                const match = caps.find((c) => c.characterId === characterId);
                ownerCapId = match?.capId ?? null;
            } catch (err) {
                setError(`找不到 OwnerCap: ${err instanceof Error ? err.message : String(err)}`);
                return;
            }
            if (!ownerCapId) {
                setError('找不到對應的 OwnerCap — 你是這位角色的擁有者嗎？');
                return;
            }

            // Read price from chain config so wallet pays the current
            // amount even if admin just changed it.
            let priceRaw: bigint;
            try {
                const cfgRes = await read.dream.getDreamConfig(suiClient, d.dreamConfigId);
                const cfgJson = cfgRes.json as { price?: string | number };
                priceRaw = BigInt(cfgJson.price ?? 50_000_000);
            } catch {
                priceRaw = 50_000_000n; // sensible fallback
            }

            const tx = new Transaction();
            const payment = tx.add(
                coinWithBalance({
                    balance: priceRaw,
                    type: `${d.packageId}::currency::CURRENCY`,
                }),
            );
            tx.add(
                endlessTx.dream.submitDream({
                    config: d.dreamConfigId,
                    saga: d.sagaId,
                    character: characterId,
                    ownerCap: ownerCapId,
                    payment,
                    contentHash: prepared.contentHashBytes ?? [],
                    blobId: Array.from(new TextEncoder().encode(prepared.blobId)),
                    importance: prepared.importance ?? 8,
                }),
            );

            signAndExecute(
                { transaction: tx },
                {
                    onSuccess: async (res) => {
                        try {
                            const full = await suiClient.waitForTransaction({
                                digest: res.digest,
                                options: { showEffects: true, showObjectChanges: true },
                            });
                            const created = (full.objectChanges ?? []) as Array<{
                                type?: string;
                                objectType?: string;
                                objectId?: string;
                            }>;
                            const dream = created.find(
                                (c) => c.type === 'created' && c.objectType?.endsWith('::dream::Dream'),
                            );
                            setChainResult({ digest: res.digest, dreamId: dream?.objectId });
                        } catch (err) {
                            setError(
                                err instanceof Error
                                    ? `tx 已發出但等待失敗: ${err.message}`
                                    : 'tx 已發出但等待失敗',
                            );
                        }
                    },
                    onError: (err) => setError(err.message),
                },
            );
        });
    };

    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-2 rounded-full border border-jade/60 bg-surface px-3 py-1.5 text-xs tracking-widest text-jade transition-colors hover:bg-jade hover:text-canvas"
            >
                <DreamIcon /> 注夢
            </button>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 p-4 backdrop-blur-md">
            <div className="w-full max-w-xl rounded-2xl border border-hairline bg-elevated p-6 shadow-2xl">
                <header className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="font-serif text-xl tracking-wide text-ink">向她注入一段夢</h2>
                        <p className="mt-1 text-xs text-mute">
                            審稿員會把你的文字改寫成戲園世界的意象，再上鏈。50 ENDLESS / 次。
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            setOpen(false);
                            setRawText('');
                            setPrepared(null);
                            setChainResult(null);
                            setError(null);
                        }}
                        className="rounded-full p-1 text-mute hover:bg-surface hover:text-ink"
                        aria-label="關閉"
                    >
                        ✕
                    </button>
                </header>

                <div className="mt-6 space-y-4">
                    <div>
                        <label className="text-2xs tracking-widest text-mute">原文</label>
                        <textarea
                            value={rawText}
                            onChange={(e) => setRawText(e.target.value)}
                            rows={4}
                            disabled={isPending || prepared?.status === 'accepted'}
                            placeholder="她應該想起小時候的雪 / 她聽見有人在敲後台的窗 / ..."
                            className="mt-1 w-full rounded border border-hairline bg-surface px-3 py-2 text-sm text-ink focus:border-cinnabar focus:outline-none disabled:opacity-50"
                        />
                    </div>

                    {!prepared ? (
                        <button
                            type="button"
                            onClick={handlePrepare}
                            disabled={isPending || !rawText.trim()}
                            className="rounded border border-hairline bg-surface px-4 py-2 text-sm tracking-widest text-ink hover:bg-elevated disabled:opacity-50"
                        >
                            {isPending ? '審稿中…' : '送審 + 改寫'}
                        </button>
                    ) : null}

                    {prepared && !prepared.ok && prepared.rejectReason ? (
                        <div className="rounded border border-cinnabar/40 bg-cinnabar/5 p-3 text-sm text-cinnabar">
                            審稿未過：{prepared.rejectReason}
                            <button
                                type="button"
                                onClick={() => setPrepared(null)}
                                className="ml-3 underline"
                            >
                                重新編寫
                            </button>
                        </div>
                    ) : null}

                    {prepared?.ok && prepared.status === 'accepted' && !chainResult ? (
                        <div className="space-y-3">
                            <div className="rounded border border-jade/40 bg-jade/5 p-3">
                                <div className="text-2xs tracking-widest text-jade">改寫後（將存入 Walrus + 鏈上 anchor）</div>
                                <p className="mt-2 max-w-prose whitespace-pre-wrap font-serif text-sm leading-loose text-ink/90">
                                    {prepared.optimizedText}
                                </p>
                                <div className="mt-3 text-2xs text-mute">
                                    importance: {prepared.importance} / blobId: {prepared.blobId?.slice(0, 12)}…
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={handleSubmitOnChain}
                                disabled={isPending}
                                className="w-full rounded bg-cinnabar px-4 py-2.5 text-sm tracking-widest text-canvas hover:bg-seal disabled:opacity-50"
                            >
                                {isPending ? '上鏈中…' : '支付 50 ENDLESS · 注入夢境'}
                            </button>
                        </div>
                    ) : null}

                    {chainResult ? (
                        <div className="rounded border border-jade/40 bg-jade/5 p-3 text-sm">
                            <div className="text-jade">已注入。她將在下次出場時想起這段夢。</div>
                            <div className="mt-2 flex flex-wrap gap-3 text-2xs tracking-widest">
                                <a
                                    href={txUrl(chainResult.digest)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-cinnabar hover:underline"
                                >
                                    tx ↗
                                </a>
                                {chainResult.dreamId ? (
                                    <a
                                        href={objectUrl(chainResult.dreamId)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-cinnabar hover:underline"
                                    >
                                        dream object ↗
                                    </a>
                                ) : null}
                            </div>
                        </div>
                    ) : null}

                    {error ? (
                        <div className="rounded border border-cinnabar/40 bg-cinnabar/5 p-3 text-sm text-cinnabar">
                            錯誤：{error}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

function DreamIcon() {
    return (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
    );
}
