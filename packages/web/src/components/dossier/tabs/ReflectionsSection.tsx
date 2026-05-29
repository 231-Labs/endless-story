'use client';

import { useEffect, useState } from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { Markdown } from '@/components/common/Markdown';
import { objectUrl } from '@/lib/explorer';
import { formatDate, truncateAddress } from '@/lib/format';
import type { ReflectionEntry } from '@/lib/chain/reflection-read';

/**
 * Owner-gated "她的內心獨白" section.
 *
 * Same reason as InterventionComposerGate this is client-side: the
 * dossier page's server-side `viewerWallet` falls back to a demo wallet
 * when no `?as=` URL param is present, which made non-owners look like
 * owners. Reading `useCurrentAccount()` is the source of truth.
 *
 * Privacy levels (demo-mode honest):
 *   - **Body**: fetched client-side only when wallet matches. Never
 *     ships in the SSR HTML payload for non-owners.
 *   - **Question** (active mode): shown only to owner in the UI; note
 *     that `ReflectionCommitted` events carry the question in plaintext
 *     on chain — anyone reading events sees it. Future: encrypt before
 *     submit.
 *   - **Metadata** (mode + timestamp + reflectionId + walrus blobId):
 *     visible to everyone — these are on-chain events, public by
 *     construction. We want non-owners to see "she has 3 reflections"
 *     as a soul-magnetism signal, just not read them.
 */
export function ReflectionsSection({
    reflections,
    characterNftOwner,
}: {
    reflections: ReflectionEntry[];
    characterNftOwner: string;
}) {
    const account = useCurrentAccount();
    const isOwner = !!account && account.address === characterNftOwner;

    return (
        <section>
            <div className="flex items-center gap-4">
                <div className="h-px w-8 bg-cinnabar/40" />
                <h2 className="font-serif text-2xl tracking-wide text-ink">她的內心獨白</h2>
            </div>
            <p className="mt-2 pl-12 text-2xs tracking-widest text-mute/70">
                {isOwner
                    ? '只有你與她的訂閱者能讀到這段 — 公開的章回不會說的話。'
                    : '訂閱她之後可讀；目前你只看見鏈上 anchor 與時間戳。'}
            </p>
            <div className="mt-8 pl-0 sm:pl-12">
                {reflections.length === 0 ? (
                    <div className="rounded-3xl bg-surface/40 border border-hairline/50 p-12 text-center backdrop-blur-sm">
                        <p className="text-sm text-mute tracking-wide">
                            她還沒寫過反思。owner 問一句，或讓她在台後獨自待一會兒。
                        </p>
                    </div>
                ) : (
                    <ul className="space-y-6">
                        {reflections.map((r) => (
                            <ReflectionRow
                                key={r.reflectionId}
                                reflection={r}
                                isOwner={isOwner}
                            />
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
}

function ReflectionRow({
    reflection,
    isOwner,
}: {
    reflection: ReflectionEntry;
    isOwner: boolean;
}) {
    return (
        <li className="rounded-3xl bg-surface/40 border border-hairline/50 p-6 sm:p-8 backdrop-blur-sm transition-all duration-300 hover:bg-surface hover:shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-3 text-xs tracking-widest text-mute/80">
                <span className="bg-canvas/50 px-2.5 py-1 rounded border border-hairline/50">
                    {reflection.mode === 'active' ? '答' : '獨'} ·{' '}
                    {formatDate(
                        new Date(Number(reflection.committedAtMs)).toISOString(),
                    )}
                </span>
                <span className="font-mono text-2xs">
                    importance {reflection.importance}
                </span>
            </div>
            {/* Question is on-chain plaintext, but we still hide it from
                non-owner UI for visual consistency with the body gate. */}
            {isOwner && reflection.mode === 'active' && reflection.question ? (
                <div className="mt-4 border-l-2 border-cinnabar/40 pl-3 text-2xs leading-relaxed tracking-wide text-mute">
                    班主問：{reflection.question}
                </div>
            ) : null}
            {isOwner ? (
                <ClientReflectionBody blobUrl={reflection.blobUrl} />
            ) : (
                <p className="mt-3 text-2xs tracking-widest text-mute/60">
                    {truncateAddress(reflection.reflectionId)} · on-chain anchor，僅 owner / 訂閱者可讀
                </p>
            )}
            <div className="mt-4 flex flex-wrap gap-3 text-2xs tracking-widest text-mute/70">
                <a
                    href={objectUrl(reflection.reflectionId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-cinnabar"
                >
                    on-chain ↗
                </a>
                {isOwner ? (
                    <a
                        href={reflection.blobUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-cinnabar"
                    >
                        walrus ↗
                    </a>
                ) : null}
            </div>
        </li>
    );
}

/**
 * Fetches the reflection markdown from Walrus on the client. Only
 * mounts when the parent already verified ownership, so the body bytes
 * never enter a non-owner's HTML payload.
 */
function ClientReflectionBody({ blobUrl }: { blobUrl: string }) {
    const [body, setBody] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        fetch(blobUrl)
            .then((r) => (r.ok ? r.text() : Promise.reject(new Error('walrus fail'))))
            .then((txt) => {
                if (!cancelled) setBody(txt);
            })
            .catch(() => {
                if (!cancelled) setFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, [blobUrl]);

    if (failed) {
        return (
            <p className="mt-4 text-sm text-mute">— Walrus 暫時讀不到這段反思 —</p>
        );
    }
    if (body == null) {
        return <p className="mt-4 text-sm text-mute">讀取中…</p>;
    }
    return <Markdown source={body} className="mt-4" />;
}
