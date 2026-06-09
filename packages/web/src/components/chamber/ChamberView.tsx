'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { TimeOfDay, Weather } from '@endless-story/chamber-3d';
import {
  generateChamberLayout,
  generateChamberFromReference,
  generateChamberCode,
  type ChamberGeneration,
} from '@/lib/actions/generate-chamber-layout';

const WEATHERS: { key: Weather; label: string }[] = [
  { key: 'clear', label: '晴' },
  { key: 'snow', label: '雪' },
  { key: 'rain', label: '雨' },
  { key: 'mist', label: '霧' },
];
const TIMES: { key: TimeOfDay; label: string }[] = [
  { key: 'dawn', label: '晨' },
  { key: 'day', label: '午' },
  { key: 'dusk', label: '暮' },
  { key: 'night', label: '夜' },
];

const ChamberCanvas = dynamic(
  () => import('@endless-story/chamber-3d').then((m) => m.ChamberCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center text-sm text-mute">
        載入廂房…
      </div>
    ),
  },
);

export function ChamberView({ characterId }: { characterId: string }) {
  const [gen, setGen] = useState<ChamberGeneration | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  // parametric-environment toggles — default 晴・午 (the bright 青綠山水 look)
  const [weather, setWeather] = useState<Weather>('clear');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('day');
  const aliveRef = useRef(true);

  const run = useCallback(
    (force: boolean) => {
      if (force) setRegenerating(true);
      else setLoading(true);
      generateChamberLayout(characterId, force)
        .then((g) => {
          if (aliveRef.current) setGen(g);
        })
        .catch(() => {
          if (aliveRef.current && !force) setGen(null);
        })
        .finally(() => {
          if (!aliveRef.current) return;
          setLoading(false);
          setRegenerating(false);
        });
    },
    [characterId],
  );

  const runVision = useCallback(() => {
    setRegenerating(true);
    generateChamberFromReference(characterId, true)
      .then((g) => {
        if (aliveRef.current) setGen(g);
      })
      .catch(() => {})
      .finally(() => {
        if (aliveRef.current) setRegenerating(false);
      });
  }, [characterId]);

  const runCode = useCallback(() => {
    setRegenerating(true);
    generateChamberCode(characterId, true)
      .then((g) => {
        if (aliveRef.current) setGen(g);
      })
      .catch(() => {})
      .finally(() => {
        if (aliveRef.current) setRegenerating(false);
      });
  }, [characterId]);

  useEffect(() => {
    aliveRef.current = true;
    run(false);
    return () => {
      aliveRef.current = false;
    };
  }, [run]);

  const busy = loading || regenerating;
  const layout = gen?.layout ?? null;
  const self = layout?.avatars.find((a) => a.isSelf);
  const others = layout?.avatars.filter((a) => !a.isSelf) ?? [];

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* diorama */}
      <div className="flex flex-1 flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <Link href="/chamber" className="es-outline-button text-sm">
            ← 回名冊
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs text-mute">
              {gen?.usedModel ? `GLM 生成 · ${gen.usedModel}` : '示意佈局 · 未接 LLM'}
              {layout?.sceneId ? ' · 已讀場景' : ''}
              {gen?.cached ? ' · 快取' : ''}
            </span>
            <button
              type="button"
              onClick={() => run(true)}
              disabled={busy}
              className="es-outline-button text-sm disabled:opacity-50"
            >
              {regenerating ? '生成中…' : '↻ 重生佈置'}
            </button>
            <button
              type="button"
              onClick={runVision}
              disabled={busy}
              title="把參考圖餵給 glm-4.6v，讓它看圖佈置（擺道具）"
              className="es-outline-button text-sm disabled:opacity-50"
            >
              ✨ 看圖佈置
            </button>
            <button
              type="button"
              onClick={runCode}
              disabled={busy}
              title="實驗：讓 glm-4.6v 看圖直接寫 Three.js 程式碼生成整個場景（沙箱執行，壞了退回 spec）"
              className="es-outline-button text-sm disabled:opacity-50"
            >
              🧪 GLM 寫場景
            </button>
          </div>
        </div>

        {/* parametric environment toggles */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="text-mute">天氣</span>
          <div className="flex gap-1">
            {WEATHERS.map((w) => (
              <button
                key={w.key}
                type="button"
                onClick={() => setWeather(w.key)}
                className={[
                  'rounded-md border px-2.5 py-1 transition-colors',
                  weather === w.key
                    ? 'border-cinnabar/60 bg-cinnabar/10 text-ink'
                    : 'border-hairline bg-canvas/30 text-mute hover:bg-canvas/50',
                ].join(' ')}
              >
                {w.label}
              </button>
            ))}
          </div>
          <span className="ml-2 text-mute">時辰</span>
          <div className="flex gap-1">
            {TIMES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTimeOfDay(t.key)}
                className={[
                  'rounded-md border px-2.5 py-1 transition-colors',
                  timeOfDay === t.key
                    ? 'border-cinnabar/60 bg-cinnabar/10 text-ink'
                    : 'border-hairline bg-canvas/30 text-mute hover:bg-canvas/50',
                ].join(' ')}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative h-[58vh] overflow-hidden rounded-lg border border-hairline bg-canvas lg:h-[72vh]">
          <ChamberCanvas
            style={{ width: '100%', height: '100%' }}
            layout={layout ?? undefined}
            envOverride={{ weather, timeOfDay, season: 'spring' }}
          />

          {/* regenerating overlay — keep the current room visible underneath */}
          {regenerating ? (
            <div className="absolute right-3 top-3 rounded-md bg-elevated/80 px-3 py-1.5 text-xs text-cinnabar backdrop-blur">
              重生佈置中…
            </div>
          ) : null}

          <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-elevated/80 px-3 py-1.5 text-xs text-mute backdrop-blur">
            {loading ? (
              <span>生成佈置…（首次約 1–2 分鐘，之後快取秒開）</span>
            ) : (
              <>
                <span className="text-ink">{self?.name ?? '此角色'}</span> 的廂房
                {gen?.roomStyle ? <span className="ml-1">· {gen.roomStyle}</span> : null}
                {others.length > 0 ? <span className="ml-1">· 同住 {others.length} 人</span> : null}
              </>
            )}
          </div>
        </div>

        {/* object chips — data-driven from the generated layout */}
        {layout && (layout.placements?.length ?? 0) > 0 ? (
          <div className="flex flex-wrap gap-2">
            {(layout.placements ?? []).map((p, i) => (
              <span
                key={`${p.tag ?? p.kind}:${i}`}
                className="rounded-full border border-hairline bg-surface px-3 py-1 text-xs text-mute"
              >
                {p.label ?? p.tag ?? (p.kind === 1 ? '掛軸' : '物件')}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* generation run record (the self-check loop) */}
      <aside className="es-soft-panel flex w-full flex-col gap-2 rounded-lg p-4 lg:w-72">
        <h2 className="text-sm font-medium text-ink">生成記錄</h2>
        {loading ? (
          <p className="text-sm text-mute">執行中…</p>
        ) : gen && gen.log.length > 0 ? (
          <ol className="flex flex-col gap-2">
            {gen.log.map((s, i) => (
              <li key={i} className="rounded-md border border-hairline bg-canvas/30 p-2 text-xs">
                <span className="font-medium text-cinnabar">{phaseLabel(s.phase)}</span>
                {s.model ? <span className="ml-1 text-mute">{s.model}</span> : null}
                <p className="mt-0.5 text-mute">{s.note}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-mute">—</p>
        )}
      </aside>
    </div>
  );
}

function phaseLabel(phase: ChamberGeneration['log'][number]['phase']): string {
  switch (phase) {
    case 'sceneSpec':
      return '生成佈局';
    case 'vision':
      return '看圖生成';
    case 'code':
      return 'GLM 寫場景';
    case 'revise':
      return '依建議重生';
    case 'critique':
      return '自檢';
    case 'fallback':
      return '退回示意';
    case 'error':
      return '錯誤';
    default:
      return phase;
  }
}
