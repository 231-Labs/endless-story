'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useCurrentAccount } from '@mysten/dapp-kit';
import type { Character } from '@endless-story/shared';
import { getMyRoster } from '@/lib/actions/roster';

function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

/**
 * Owner roster picker — the door into the chamber renderer. Lists the
 * characters this wallet owns; each card links to `/chamber?id=<id>`.
 */
export function ChamberRoster() {
  const account = useCurrentAccount();
  const wallet = account?.address ?? null;

  const [roster, setRoster] = useState<Character[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!wallet) {
      setRoster(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getMyRoster(wallet)
      .then((r) => {
        if (!cancelled) setRoster(r);
      })
      .catch(() => {
        if (!cancelled) setRoster([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [wallet]);

  if (!wallet) {
    return (
      <p className="es-soft-panel rounded-lg p-4 text-sm text-mute">
        請先在右上角連結錢包，載入你持有的角色。
      </p>
    );
  }

  if (loading) {
    return <p className="es-soft-panel rounded-lg p-4 text-sm text-mute">載入中…</p>;
  }

  if (roster && roster.length === 0) {
    return (
      <p className="es-soft-panel rounded-lg p-4 text-sm text-mute">
        這個錢包還沒有角色。到首頁徵召一位，再回來布置廂房。
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {roster?.map((c) => (
        <Link
          key={c.id}
          href={`/chamber?id=${c.id}`}
          className="es-choice-card flex flex-col gap-1 rounded-lg p-4 transition-colors hover:border-cinnabar/60"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-base font-medium text-ink">{c.name}</span>
            {c.role ? <span className="shrink-0 text-xs text-cinnabar">{c.role}</span> : null}
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-mute">
            <span className="font-mono">{shortId(c.id)}</span>
            <span>{c.currentSceneId ? '在場景中' : '尚無場景'}</span>
          </div>
          <span className="mt-2 text-xs text-cinnabar">進廂房 →</span>
        </Link>
      ))}
    </div>
  );
}
