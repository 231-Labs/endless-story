'use client';

import { useEffect, useState } from 'react';
import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit';
import { ENDLESS_STORY_DEPLOYMENT, read } from '@endless-story/sdk';
import type { Character } from '@endless-story/shared';
import { Markdown } from '@/components/common/Markdown';
import { objectUrl, txUrl } from '@/lib/explorer';
import { truncateBlobId } from '@/lib/format';
import type { PovChapterEntry } from '@/lib/chain/pov-read';
import { parseProvenance } from '@/lib/chain/chapter-provenance';

/**
 * On-chain POV chapters — owner + subscriber gated.
 *
 * Access model: the gazette is public; a character's POV chapters are
 * private to the **owner** and her **subscribers**. We gate client-side
 * (real dapp-kit account, not the URL ?as= param) and fetch the body on
 * the client only when authorized — so a non-reader's HTML never carries
 * the chapter text. Non-readers still see the on-chain anchor (proves the
 * chapter exists + is verifiable) but not the Walrus body link.
 *
 * Same demo-mode caveat as reflections: the blob is plaintext on Walrus,
 * so this is a UX gate, not cryptographic. Real privacy = Seal (backlog).
 */
export function ChainPovSection({
    chapters,
    character,
}: {
    chapters: PovChapterEntry[];
    character: Character;
}) {
    const account = useCurrentAccount();
    const suiClient = useSuiClient();
    const isOwner = !!account && account.address === character.nftOwner;
    const [isSubscriber, setIsSubscriber] = useState(false);

    useEffect(() => {
        if (!account || isOwner) {
            setIsSubscriber(false);
            return;
        }
        const pkg = ENDLESS_STORY_DEPLOYMENT.packageId;
        if (!pkg) return;
        let cancelled = false;
        read.subscribe
            .listSubscriptionsForAddress(suiClient, account.address, pkg)
            .then((subs) => {
                if (!cancelled) {
                    setIsSubscriber(subs.some((s) => s.characterId === character.id));
                }
            })
            .catch(() => {
                if (!cancelled) setIsSubscriber(false);
            });
        return () => {
            cancelled = true;
        };
    }, [account, isOwner, character.id, suiClient]);

    const canRead = isOwner || isSubscriber;

    return (
        <section>
            <div className="flex items-center gap-4">
                <div className="h-px w-8 bg-cinnabar" />
                <h2 className="font-serif text-2xl tracking-wide text-cinnabar">
                    {character.name} 視角 · 鏈上 POV
                </h2>
            </div>
            <p className="mt-2 pl-12 text-2xs tracking-widest text-mute/70">
                {canRead
                    ? isOwner
                        ? '你是班主，每一回都讀得到。'
                        : '你已訂閱，每一回都讀得到。'
                    : '訂閱之後可讀全文；此刻只見鏈上憑證。'}
            </p>
            <ul className="mt-8 grid grid-cols-1 gap-4 sm:gap-6 pl-0 sm:pl-12">
                {chapters.map((c) => (
                    <li key={c.commitmentId}>
                        <div className="block rounded-3xl bg-surface/40 border border-hairline/50 p-6 sm:p-8 backdrop-blur-sm">
                            <div className="flex flex-wrap items-center gap-3 text-2xs tracking-widest text-mute/80">
                                <span className="rounded border border-hairline/50 bg-canvas/50 px-2 py-1 font-mono">
                                    walrus · {truncateBlobId(c.blobId)}
                                </span>
                                <a
                                    href={objectUrl(c.commitmentId)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:text-cinnabar"
                                    title="在區塊鏈瀏覽器查看 commitment"
                                >
                                    on-chain anchor ↗
                                </a>
                                {canRead ? (
                                    <a
                                        href={c.blobUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="hover:text-cinnabar"
                                        title="在 Walrus 直接讀原文"
                                    >
                                        walrus blob ↗
                                    </a>
                                ) : null}
                            </div>
                            {canRead ? (
                                <ClientPovBody blobId={c.blobId} />
                            ) : (
                                <LockedNotice />
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        </section>
    );
}

/** Client-side Walrus fetch (only mounts when authorized). */
function ClientPovBody({ blobId }: { blobId: string }) {
    const [raw, setRaw] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetch(`/api/blob/${blobId}`)
            .then((r) => (r.ok ? r.text() : Promise.reject(new Error('walrus fail'))))
            .then((txt) => {
                if (!cancelled) setRaw(txt);
            })
            .catch(() => {
                if (!cancelled) setFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, [blobId]);

    if (failed) {
        return <p className="mt-4 text-sm text-mute">— 章回內容暫時讀不到 —</p>;
    }
    if (raw == null) {
        return <p className="mt-4 text-sm text-mute">讀取中…</p>;
    }
    // Strip the embedded on-chain-event provenance header before rendering;
    // surface it as a verifiable source line instead of leaking the raw comment.
    const { provenance, body } = parseProvenance(raw.trim());
    return (
        <>
            {provenance?.eventLabel ? (
                <p className="mt-3 text-2xs tracking-widest text-cinnabar/70">
                    本回出自鏈上事件「{provenance.eventLabel}」
                    {provenance.eventTx ? (
                        <a
                            href={txUrl(provenance.eventTx)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 hover:underline"
                        >
                            查驗 ↗
                        </a>
                    ) : null}
                </p>
            ) : null}
            <Markdown source={body} className="mt-4" />
        </>
    );
}

function LockedNotice() {
    return (
        <div className="mt-4 rounded-2xl border border-dashed border-hairline/60 bg-canvas/30 p-6 text-center">
            <p className="text-sm text-mute">這一回只給班主與訂閱者。</p>
            <p className="mt-1 text-2xs tracking-widest text-mute/60">
                訂閱後，台前幕後的每一個念頭都讀得到。
            </p>
        </div>
    );
}
