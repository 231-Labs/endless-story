'use client';

import { useEffect, useState } from 'react';
import { useCurrentAccount, useCurrentClient } from '@mysten/dapp-kit-react';
import { ENDLESS_STORY_DEPLOYMENT, read } from '@endless-story/sdk';
import type { Character } from '@endless-story/shared';
import { Markdown } from '@/components/common/Markdown';
import { objectUrl, eventUrl } from '@/lib/explorer';
import { truncateBlobId } from '@/lib/format';
import type { PovChapterEntry } from '@/lib/chain/pov-read';
import { parseProvenance } from '@/lib/chain/chapter-provenance';
import { CHAPTER_COPY } from '@/lib/copy/chapters';
import { SubscribeButton } from '@/components/common/SubscribeButton';

/**
 * 角色回 — a character's first-person POV chapters, owner + subscriber gated.
 *
 * Access model: the gazette + woven cuts are public; a character's POV deep
 * cut is private to the **owner** and her **subscribers**. We gate client-side
 * (real dapp-kit account, not the URL ?as= param) and only mount the full
 * body fetch when authorized — so a non-reader's HTML never carries the full
 * chapter text. Locked readers see a server-extracted first-paragraph teaser
 * (PovChapterEntry.teaser) that dissolves into the bg, plus a subscribe CTA,
 * and the on-chain anchor (proves the chapter exists + is verifiable).
 *
 * Same demo-mode caveat as reflections: the blob is plaintext on Walrus, so
 * this is a UX gate, not cryptographic. Real privacy = Seal (backlog).
 */
export function ChainPovSection({
    chapters,
    character,
}: {
    chapters: PovChapterEntry[];
    character: Character;
}) {
    const account = useCurrentAccount();
    const client = useCurrentClient();
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
            .listSubscriptionsForAddress(client, account.address, pkg)
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
    }, [account, isOwner, character.id, client]);

    const canRead = isOwner || isSubscriber;
    const accessState = isOwner ? 'owner' : isSubscriber ? 'subscriber' : 'locked';

    return (
        // 本傳 is a READING view — a centered, comfortable-width column (not the wide
        // left-indented grid layout the other tabs use), so the prose sits balanced on
        // the page instead of hugging the left with a big right gutter.
        <section className="mx-auto max-w-3xl">
            <div className="flex items-center gap-4">
                <div className="h-px w-8 bg-cinnabar" />
                <h2 className="font-serif text-2xl tracking-wide text-cinnabar">
                    {CHAPTER_COPY.pov.sectionHeader(character.name)}
                </h2>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-mute/80">
                {CHAPTER_COPY.pov.sectionNote}
            </p>
            <p className="mt-1 text-2xs tracking-widest text-mute/60">
                {CHAPTER_COPY.pov.accessNote(accessState)}
            </p>
            <ul className="mt-8 grid grid-cols-1 gap-4 sm:gap-6">
                {chapters.map((c) => (
                    <li key={c.commitmentId}>
                        <article className="es-card p-6 sm:p-8">
                            {/* Reading opens with prose; provenance sits in the footer. */}
                            {canRead ? (
                                <ClientPovBody blobId={c.blobId} />
                            ) : (
                                <LockedTeaser teaser={c.teaser} character={character} />
                            )}
                            <ProvenanceFooter chapter={c} canRead={canRead} />
                        </article>
                    </li>
                ))}
            </ul>
        </section>
    );
}

/**
 * Locked state: a first-paragraph taste that dissolves into the page bg,
 * then a clear subscribe CTA. The teaser is server-extracted (plain text),
 * so the full body is never shipped to a non-subscriber.
 */
function LockedTeaser({
    teaser,
    character,
}: {
    teaser?: string;
    character: Character;
}) {
    return (
        <div>
            <div className="relative max-h-40 overflow-hidden">
                <p className="text-lg leading-loose text-ink/80 sm:text-xl sm:leading-[2.1]">
                    {teaser ?? CHAPTER_COPY.pov.lockHint}
                </p>
                {/* Gradient mask — the text dissolves into the card/page bg.
                    `to-surface` keeps it dark-mode safe (semantic token). */}
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-surface"
                />
            </div>
            <div className="mt-5 flex flex-col items-start gap-3">
                <p className="font-serif text-base text-ink/90">
                    {CHAPTER_COPY.pov.lockCtaLabel(character.name)}
                </p>
                <SubscribeButton
                    characterId={character.id}
                    currentCount={character.subscriberCount ?? 0}
                />
                <p className="text-2xs tracking-widest text-mute/60">{CHAPTER_COPY.pov.lockHint}</p>
            </div>
        </div>
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
        return <p className="text-sm text-mute">{CHAPTER_COPY.pov.bodyUnavailable}</p>;
    }
    if (raw == null) {
        return <p className="text-sm text-mute">{CHAPTER_COPY.pov.bodyLoading}</p>;
    }
    // Strip the embedded on-chain-event provenance header before rendering;
    // surface it as a verifiable source line instead of leaking the raw comment.
    const { provenance, body } = parseProvenance(raw.trim());
    return (
        <>
            {provenance?.eventLabel ? (
                <p className="mb-3 text-2xs tracking-widest text-cinnabar/70">
                    {CHAPTER_COPY.pov.fromEvent(provenance.eventLabel)}
                    {provenance.eventTx ? (
                        <a
                            href={eventUrl(provenance.eventTx)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 hover:underline"
                        >
                            {CHAPTER_COPY.provenance.verifyShort}
                        </a>
                    ) : null}
                </p>
            ) : null}
            <Markdown source={body} className="chapter-prose" />
        </>
    );
}

/** Tidy on-chain verification footer — kept out of the reading opening. */
function ProvenanceFooter({ chapter, canRead }: { chapter: PovChapterEntry; canRead: boolean }) {
    return (
        <footer className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline/50 pt-4 text-2xs tracking-widest text-mute/70">
            <span className="text-mute/80">{CHAPTER_COPY.provenance.footerLead}</span>
            <span className="font-mono text-mute/60">walrus · {truncateBlobId(chapter.blobId)}</span>
            <a
                href={objectUrl(chapter.commitmentId)}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-cinnabar"
                title="在區塊鏈瀏覽器查看 commitment"
            >
                {CHAPTER_COPY.provenance.onChainAnchor}
            </a>
            {canRead ? (
                <a
                    href={chapter.blobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-cinnabar"
                    title="在 Walrus 直接讀原文"
                >
                    {CHAPTER_COPY.provenance.walrusBlob}
                </a>
            ) : null}
        </footer>
    );
}
