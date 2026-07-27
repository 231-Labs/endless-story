'use client';

/**
 * LabGuestSecondary — 看客次要入口：追蹤／訂閱／藏閣。
 * 不進首屏；local 寫 Port，sui 深鏈舊頁。
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getOrCreateViewerId, VIEWER_ID_HEADER } from '@/lib/viewer-id-client';

type Panel = 'closed' | 'follow' | 'subscribe' | 'vault';

interface CastMember {
    id: string;
    name: string;
    role?: string;
}

async function productFetch<T>(url: string, init?: RequestInit): Promise<T> {
    const viewerId = getOrCreateViewerId();
    const res = await fetch(url, {
        ...init,
        cache: 'no-store',
        headers: {
            'content-type': 'application/json',
            [VIEWER_ID_HEADER]: viewerId,
            ...(init?.headers ?? {}),
        },
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(data?.error ?? `${res.status}`);
    return data;
}

export function LabGuestSecondary({
    cast,
}: {
    cast: CastMember[];
}) {
    const [panel, setPanel] = useState<Panel>('closed');
    const [backend, setBackend] = useState<'local' | 'sui'>('local');
    const [follows, setFollows] = useState<string[]>([]);
    const [subscriptions, setSubscriptions] = useState<string[]>([]);
    const [inventory, setInventory] = useState<Array<{ id: string; title: string; imageUrl?: string }>>([]);
    const [message, setMessage] = useState<string | null>(null);
    const [chainLinks, setChainLinks] = useState<{
        subscriptions?: string;
        dossier?: string;
        chamber?: string;
    } | null>(null);

    const refresh = useCallback(async () => {
        try {
            const [ent, vault] = await Promise.all([
                productFetch<{
                    backend: 'local' | 'sui';
                    follows: string[];
                    subscriptions: string[];
                    chainDeepLinks: { subscriptions?: string; dossier?: string } | null;
                }>('/api/lab/public/entitlements'),
                productFetch<{
                    backend: 'local' | 'sui';
                    inventory: Array<{ id: string; title: string; imageUrl?: string }>;
                    chainDeepLink?: string | null;
                }>('/api/lab/public/vault'),
            ]);
            setBackend(ent.backend);
            setFollows(ent.follows ?? []);
            setSubscriptions(ent.subscriptions ?? []);
            setInventory(vault.inventory ?? []);
            setChainLinks({
                ...(ent.chainDeepLinks ?? {}),
                chamber: vault.chainDeepLink ?? undefined,
            });
        } catch (e) {
            setMessage(e instanceof Error ? e.message : String(e));
        }
    }, []);

    useEffect(() => {
        if (panel === 'closed') return;
        void refresh();
    }, [panel, refresh]);

    const act = async (action: 'follow' | 'unfollow' | 'subscribe' | 'unsubscribe', characterId: string) => {
        setMessage(null);
        const res = await productFetch<{
            redirected?: boolean;
            href?: string;
            follows?: string[];
            subscriptions?: string[];
            message?: string;
        }>('/api/lab/public/entitlements', {
            method: 'POST',
            body: JSON.stringify({ action, characterId }),
        });
        if (res.redirected && res.href) {
            window.location.href = res.href;
            return;
        }
        if (res.follows) setFollows(res.follows);
        if (res.subscriptions) setSubscriptions(res.subscriptions);
        setMessage(res.message ?? '已更新');
    };

    const addStill = async (member: CastMember) => {
        setMessage(null);
        const res = await productFetch<{
            redirected?: boolean;
            href?: string;
            inventory?: Array<{ id: string; title: string; imageUrl?: string }>;
        }>('/api/lab/public/vault', {
            method: 'POST',
            body: JSON.stringify({
                action: 'add',
                item: { id: `still-${member.id}`, title: `${member.name}・劇照`, imageUrl: undefined },
            }),
        });
        if (res.redirected && res.href) {
            window.location.href = res.href;
            return;
        }
        if (res.inventory) setInventory(res.inventory);
        setMessage('已收入本地藏閣');
    };

    return (
        <div className="relative">
            <div className="flex items-center gap-1">
                <SecondaryBtn active={panel === 'follow'} onClick={() => setPanel(panel === 'follow' ? 'closed' : 'follow')} label="追蹤" />
                <SecondaryBtn active={panel === 'subscribe'} onClick={() => setPanel(panel === 'subscribe' ? 'closed' : 'subscribe')} label="訂閱" />
                <SecondaryBtn active={panel === 'vault'} onClick={() => setPanel(panel === 'vault' ? 'closed' : 'vault')} label="藏閣" />
            </div>

            {panel !== 'closed' ? (
                <div className="absolute right-0 top-full z-40 mt-2 w-[min(92vw,22rem)] border border-hairline bg-surface/95 p-4 shadow-lg backdrop-blur-md dark:bg-elevated/95">
                    <div className="flex items-baseline justify-between gap-2">
                        <p className="font-serif text-xs tracking-[0.35em] text-ink">
                            {panel === 'follow' ? '追蹤' : panel === 'subscribe' ? '訂閱' : '藏閣'}
                        </p>
                        <button type="button" className="font-serif text-2xs tracking-[0.2em] text-mute" onClick={() => setPanel('closed')}>
                            收起
                        </button>
                    </div>

                    {backend === 'sui' ? (
                        <div className="mt-4 space-y-2 font-serif text-sm tracking-[0.12em] text-mute">
                            <p>目前後端為鏈上。請走既有頁面：</p>
                            {panel === 'follow' || panel === 'subscribe' ? (
                                <Link className="block text-cinnabar" href={chainLinks?.dossier || chainLinks?.subscriptions || '/dossier'}>
                                    前往名冊／訂閱
                                </Link>
                            ) : (
                                <Link className="block text-cinnabar" href={chainLinks?.chamber || '/chamber'}>
                                    前往藏閣
                                </Link>
                            )}
                        </div>
                    ) : panel === 'vault' ? (
                        <div className="mt-4 space-y-3">
                            {inventory.length ? (
                                <ul className="max-h-40 space-y-2 overflow-y-auto">
                                    {inventory.map((item) => (
                                        <li key={item.id} className="font-serif text-sm tracking-[0.1em] text-ink">
                                            {item.title}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="font-serif text-xs tracking-[0.2em] text-mute">尚無收藏。可從下方收入劇照。</p>
                            )}
                            <div className="max-h-36 space-y-1 overflow-y-auto border-t border-hairline/50 pt-3">
                                {cast.slice(0, 8).map((c) => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => void addStill(c)}
                                        className="block w-full py-1.5 text-left font-serif text-xs tracking-[0.2em] text-mute hover:text-cinnabar"
                                    >
                                        收入 {c.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <ul className="mt-4 max-h-56 space-y-2 overflow-y-auto">
                            {cast.map((c) => {
                                const active = panel === 'follow' ? follows.includes(c.id) : subscriptions.includes(c.id);
                                return (
                                    <li key={c.id} className="flex items-center justify-between gap-2 border-b border-hairline/40 py-2">
                                        <div className="min-w-0">
                                            <p className="truncate font-serif text-sm tracking-[0.12em] text-ink">{c.name}</p>
                                            {c.role ? <p className="font-serif text-2xs tracking-[0.2em] text-mute">{c.role}</p> : null}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                void act(
                                                    panel === 'follow'
                                                        ? active
                                                            ? 'unfollow'
                                                            : 'follow'
                                                        : active
                                                          ? 'unsubscribe'
                                                          : 'subscribe',
                                                    c.id,
                                                )
                                            }
                                            className={`shrink-0 font-serif text-2xs tracking-[0.25em] ${
                                                active ? 'text-cinnabar' : 'text-mute hover:text-ink'
                                            }`}
                                        >
                                            {active ? (panel === 'follow' ? '追蹤中' : '已訂') : panel === 'follow' ? '追蹤' : '訂閱'}
                                        </button>
                                    </li>
                                );
                            })}
                            {!cast.length ? <p className="font-serif text-xs text-mute">尚無名單</p> : null}
                        </ul>
                    )}

                    {message ? <p className="mt-3 font-serif text-2xs tracking-[0.2em] text-cinnabar/80">{message}</p> : null}
                </div>
            ) : null}
        </div>
    );
}

function SecondaryBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`px-2 py-1.5 font-serif text-2xs tracking-[0.3em] transition ${
                active ? 'text-cinnabar' : 'text-mute/80 hover:text-ink'
            }`}
        >
            {label}
        </button>
    );
}
