'use client';

/**
 * Dev-only 藏閣 scene preview — renders the chamber canvas with the demo
 * inventory and a 日/夜 switch, no wallet / chain required. For iterating on
 * the exhibition-hall aesthetics (backdrop, scenery, lighting) in isolation.
 * Not linked from anywhere; open /dev/chamber-preview directly.
 */

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { ChamberLayout } from '@endless-story/chamber-3d';
import { buildVaultDesign, MAX_ZONES } from '@/lib/chamber/vault-design-build';

const ChamberCanvas = dynamic(
  () => import('@endless-story/chamber-3d').then((m) => m.ChamberCanvas),
  { ssr: false, loading: () => null },
);

const DEMO_STILLS = [
  { key: 'seed:liu_xiaosheng', url: '/chamber/demo-stills/liu_xiaosheng.png', title: '柳生春·許仙扮相', subtitle: '戲妝油彩 · 第 1 版' },
  { key: 'seed:duishi', url: '/chamber/demo-stills/duishi.png', title: '台上眼神戲', subtitle: '劇照 · 第 1 版' },
  { key: 'seed:youhu', url: '/chamber/demo-stills/youhu.png', title: '白蛇傳·遊湖借傘', subtitle: '劇照 · 第 1 版' },
  { key: 'seed:duanqiao', url: '/chamber/demo-stills/duanqiao.png', title: '白蛇傳·斷橋', subtitle: '劇照 · 第 1 版' },
];

const DEMO_CURIOS = [
  { key: 'curio:chest', assetUrl: '/chamber/kit/wooden_chest.glb', fitHeight: 0.42, tag: 'chest', title: '檀木匣', subtitle: '珍玩 · 示意' },
  { key: 'curio:vase', assetUrl: '/chamber/kit/vase_static.glb', fitHeight: 0.34, tag: 'vase', title: '素盞', subtitle: '珍玩 · 示意' },
];

export default function ChamberPreviewPage() {
  const [night, setNight] = useState(true);
  const [zones, setZones] = useState(1);
  const [wide, setWide] = useState(false);

  // double the demo set so multi-zone distribution has something to spread
  const stills = useMemo(
    () => [
      ...DEMO_STILLS,
      ...DEMO_STILLS.map((s) => ({ ...s, key: `${s.key}:b`, title: `${s.title}·又一幀` })),
    ],
    [],
  );

  const layout: ChamberLayout = useMemo(
    () => ({
      characterId: 'dev-preview',
      avatars: [],
      params: null,
      design: buildVaultDesign(stills, DEMO_CURIOS, { bright: !night, zones }),
    }),
    [stills, night, zones],
  );

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black">
      <ChamberCanvas
        key={wide ? 'wide' : 'close'}
        style={{ width: '100%', height: '100%' }}
        layout={layout}
        cinematic={false}
        cameraPos={wide ? [6, 17, 33] : undefined}
      />
      <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setWide((v) => !v)}
          className={[
            'rounded-full border px-3 py-1.5 text-sm backdrop-blur-md transition-colors',
            wide ? 'border-amber-300/70 bg-black/50 text-amber-100' : 'border-white/20 bg-black/25 text-white/60',
          ].join(' ')}
        >
          全景
        </button>
        <div className="mr-2 inline-flex items-center gap-1 rounded-full border border-white/20 bg-black/25 px-2 py-1 backdrop-blur-md">
          <span className="px-1 text-xs text-white/70">展區</span>
          {Array.from({ length: MAX_ZONES }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setZones(n)}
              className={[
                'rounded-full px-2 py-0.5 text-xs transition-colors',
                zones === n ? 'bg-white/85 text-stone-900' : 'text-white/60 hover:text-white/85',
              ].join(' ')}
            >
              {n}
            </button>
          ))}
        </div>
        {(['day', 'night'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setNight(t === 'night')}
            className={[
              'rounded-full border px-4 py-1.5 text-sm backdrop-blur-md transition-colors',
              (t === 'night') === night
                ? 'border-amber-300/70 bg-black/50 text-amber-100'
                : 'border-white/20 bg-black/25 text-white/60',
            ].join(' ')}
          >
            {t === 'day' ? '☀ 日' : '☾ 夜'}
          </button>
        ))}
      </div>
    </main>
  );
}
