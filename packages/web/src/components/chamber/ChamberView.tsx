'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { getVaultData, type VaultData } from '@/lib/actions/vault-collection';
import { audioUnlocked, playPluck, playRevealMotif, unlockAudio } from '@/lib/chamber/sound';

const ChamberCanvas = dynamic(
  () => import('@endless-story/chamber-3d').then((m) => m.ChamberCanvas),
  { ssr: false, loading: () => null },
);

/** Loading verses — cycled while the vault opens. */
const POEMS = ['啟匣焚香', '塵掩珠光，拂之即明', '一瞬既藏，歲月不散'];

const PILL =
  'rounded-full border border-white/20 bg-black/25 px-4 py-1.5 text-sm text-white/85 backdrop-blur-md transition-colors hover:bg-black/40 disabled:opacity-40 disabled:hover:bg-black/25';

/** Preload the vault imagery so the reveal has no pop-in. */
function preloadImages(v: VaultData, timeoutMs = 4000): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const urls = [
    ...(v.layout.avatars ?? []).map((a) => a.portraitUrl),
    ...(v.layout.design?.elements ?? [])
      .filter((e) => e.kind === 'display_still')
      .map((e) => e.assetUrl),
  ].filter((u): u is string => !!u);
  if (urls.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    let left = urls.length;
    const done = () => {
      left -= 1;
      if (left <= 0) resolve();
    };
    setTimeout(resolve, timeoutMs);
    for (const u of urls) {
      const img = new Image();
      img.onload = done;
      img.onerror = done;
      img.src = u;
    }
  });
}

/**
 * 藏閣 — the collector's vault: a room made of darkness and light. Collected
 * 劇照 float in their own light shafts on the orbit ring; 珍玩 turn on lit
 * plinths; the collector stands at the heart. Provenance is the luxury.
 */
export function ChamberView({ characterId }: { characterId: string }) {
  const [vault, setVault] = useState<VaultData | null>(null);
  const [loading, setLoading] = useState(true);
  const [catalogueOpen, setCatalogueOpen] = useState(true);
  const [poemIdx, setPoemIdx] = useState(0);
  const [inkOverlay, setInkOverlay] = useState(true);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    setLoading(true);
    getVaultData(characterId)
      .then(async (v) => {
        await preloadImages(v);
        if (!aliveRef.current) return;
        setVault(v);
        if (audioUnlocked()) playRevealMotif();
        // nudge the compositor: a large in-place scene swap can leave the
        // WebGL canvas stale until a layout recalc (seen in headless Chrome).
        requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
        setTimeout(() => window.dispatchEvent(new Event('resize')), 600);
      })
      .catch(() => {
        if (aliveRef.current) setVault(null);
      })
      .finally(() => {
        if (aliveRef.current) setLoading(false);
      });
    return () => {
      aliveRef.current = false;
    };
  }, [characterId]);

  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setPoemIdx((i) => (i + 1) % POEMS.length), 3200);
    return () => clearInterval(t);
  }, [loading]);

  useEffect(() => {
    if (!loading) {
      setInkOverlay(false);
      return;
    }
    setInkOverlay(true);
    const t = setTimeout(() => setInkOverlay(false), 4200);
    return () => clearTimeout(t);
  }, [loading]);

  const firstTouchRef = useRef(false);
  const handleFirstPointer = useCallback(() => {
    unlockAudio();
    if (!firstTouchRef.current) {
      firstTouchRef.current = true;
      playPluck(146.8, 0.07);
    }
  }, []);

  const layout = vault?.layout ?? null;
  const items = vault?.items ?? [];
  const stillCount = items.filter((i) => i.type === 'still').length;
  const curioCount = items.length - stillCount;

  return (
    <div
      className="relative h-full w-full overflow-hidden bg-[#07080c]"
      onPointerDownCapture={handleFirstPointer}
    >
      <div className="absolute inset-0">
        <ChamberCanvas style={{ width: '100%', height: '100%' }} layout={layout ?? undefined} cinematic />
      </div>

      {/* legibility scrims */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/40 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/45 to-transparent" />

      {/* top bar */}
      <div className="absolute left-5 top-4 z-20">
        <Link href="/chamber" className={PILL}>
          ← 名冊
        </Link>
      </div>
      <div className="absolute right-5 top-4 z-20 flex items-center gap-2">
        <span className="rounded-full bg-black/25 px-3 py-1 text-xs text-white/55 backdrop-blur-md">
          藏閣 · {items.length} 件藏品
        </span>
        <button type="button" onClick={() => setCatalogueOpen((v) => !v)} className={PILL}>
          藏品冊
        </button>
      </div>

      {/* 畫題 + 印章 */}
      <div className="pointer-events-none absolute bottom-24 left-7 z-20 flex items-start gap-3">
        <h1
          style={{ writingMode: 'vertical-rl' }}
          className="font-serif text-2xl leading-snug tracking-[0.4em] text-white/95 drop-shadow-[0_2px_10px_rgba(0,0,0,0.65)]"
        >
          {(vault?.collectorName ?? '無名') + '之藏閣'}
        </h1>
        <span className="grid h-9 w-9 rotate-2 place-items-center rounded-[3px] bg-[#a03226] font-serif text-lg leading-none text-[#f3e7d3] shadow-lg">
          藏
        </span>
      </div>
      <div className="pointer-events-none absolute bottom-16 left-7 z-20 text-xs tracking-widest text-white/65 drop-shadow">
        {vault ? `劇照 ${stillCount} · 珍玩 ${curioCount}` : ''}
      </div>

      {/* 藏品冊 — the catalogue */}
      {catalogueOpen ? (
        <aside className="absolute bottom-20 right-5 top-16 z-20 w-72 overflow-y-auto rounded-lg border border-white/15 bg-black/35 p-4 backdrop-blur-md">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-serif text-sm tracking-[0.3em] text-white/90">藏品冊</h2>
            <span className="text-[10px] text-white/40">provenance</span>
          </div>
          {loading ? (
            <p className="text-sm text-white/60">啟封中…</p>
          ) : items.length > 0 ? (
            <ol className="flex flex-col gap-2">
              {items.map((it, i) => (
                <li
                  key={i}
                  className="animate-fade-in-up rounded-md border border-white/10 bg-white/5 p-2 text-xs"
                  style={{ animationDelay: `${i * 90}ms`, animationFillMode: 'backwards' }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium text-white/85">{it.title}</span>
                    <span className="shrink-0 text-[10px] text-[#caa64a]">
                      {it.type === 'still' ? '劇照' : '珍玩'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-white/55">{it.subtitle}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-white/50">尚無藏品 — 收藏角色的劇照後在此陳列。</p>
          )}
          <p className="mt-4 border-t border-white/10 pt-3 text-[10px] leading-relaxed text-white/35">
            出讓與購藏（Kiosk）將在下一片接通：掛紅絹籤者可購，收益回班社。
          </p>
        </aside>
      ) : null}

      {/* 墨暈 opening overlay */}
      {loading && inkOverlay ? (
        <div className="absolute inset-0 z-40 grid place-items-center bg-gradient-to-b from-[#0b0d12]/92 to-[#06070b]/96 transition-opacity duration-700">
          <div className="flex flex-col items-center gap-6">
            <div className="h-16 w-16 animate-pulse rounded-full bg-[radial-gradient(circle,rgba(222,228,236,0.85),rgba(86,100,118,0.3)_55%,transparent_72%)]" />
            <p className="font-serif text-base tracking-[0.4em] text-white/80">{POEMS[poemIdx]}</p>
            <p className="text-xs tracking-wider text-white/40">啟封藏閣…</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
