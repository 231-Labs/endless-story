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
import { audioUnlocked, playPluck, playRevealMotif, unlockAudio } from '@/lib/chamber/sound';

/** Preload the layout's images (portraits + 掛軸) so the reveal has no pop-in. */
function preloadImages(gen: ChamberGeneration, timeoutMs = 4000): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const urls = [
    ...gen.layout.avatars.map((a) => a.portraitUrl),
    ...(gen.layout.placements ?? []).filter((p) => p.kind === 1).map((p) => p.assetUrl),
  ].filter((u): u is string => !!u);
  if (urls.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    let left = urls.length;
    const done = () => {
      left -= 1;
      if (left <= 0) resolve();
    };
    const timer = setTimeout(resolve, timeoutMs);
    void timer;
    for (const u of urls) {
      const img = new Image();
      img.onload = done;
      img.onerror = done;
      img.src = u;
    }
  });
}

const ChamberCanvas = dynamic(
  () => import('@endless-story/chamber-3d').then((m) => m.ChamberCanvas),
  { ssr: false, loading: () => null },
);

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

/** Loading verses — cycled while the agent paints the room. */
const POEMS = [
  '磨墨候場，簾影未動',
  '青綠未乾，且候片刻',
  '香線初燃，水台將顯',
  '一桌二椅，自有萬象',
];

/** Frosted pill button used across the floating UI. */
const PILL =
  'rounded-full border border-white/20 bg-black/25 px-4 py-1.5 text-sm text-white/85 backdrop-blur-md transition-colors hover:bg-black/40 disabled:opacity-40 disabled:hover:bg-black/25';

/**
 * 廂房 — presented as a living 立軸: full-bleed diorama, vertical painting
 * title with a red seal, floating frosted controls, and the generation run
 * record styled as a 題跋 (colophon) strip.
 */
export function ChamberView({ characterId }: { characterId: string }) {
  const [gen, setGen] = useState<ChamberGeneration | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [weather, setWeather] = useState<Weather>('clear');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('day');
  const [colophonOpen, setColophonOpen] = useState(true);
  const [poemIdx, setPoemIdx] = useState(0);
  // 墨暈 covers only the first beats; then the deterministic scene shows while
  // the agent keeps painting in the background (progressive load).
  const [inkOverlay, setInkOverlay] = useState(true);
  const aliveRef = useRef(true);

  /** Apply a generation: preload its imagery first, then ring the motif. */
  const applyGen = useCallback(async (g: ChamberGeneration) => {
    await preloadImages(g);
    if (!aliveRef.current) return;
    setGen(g);
    if (audioUnlocked()) playRevealMotif();
  }, []);

  const run = useCallback(
    (force: boolean) => {
      if (force) setRegenerating(true);
      else setLoading(true);
      generateChamberLayout(characterId, force)
        .then((g) => applyGen(g))
        .catch(() => {
          if (aliveRef.current && !force) setGen(null);
        })
        .finally(() => {
          if (!aliveRef.current) return;
          setLoading(false);
          setRegenerating(false);
        });
    },
    [characterId, applyGen],
  );

  const runVision = useCallback(() => {
    setRegenerating(true);
    generateChamberFromReference(characterId, true)
      .then((g) => applyGen(g))
      .catch(() => {})
      .finally(() => {
        if (aliveRef.current) setRegenerating(false);
      });
  }, [characterId, applyGen]);

  const runCode = useCallback(() => {
    setRegenerating(true);
    generateChamberCode(characterId, true)
      .then((g) => applyGen(g))
      .catch(() => {})
      .finally(() => {
        if (aliveRef.current) setRegenerating(false);
      });
  }, [characterId, applyGen]);

  useEffect(() => {
    aliveRef.current = true;
    run(false);
    return () => {
      aliveRef.current = false;
    };
  }, [run]);

  // cycle the loading verse
  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setPoemIdx((i) => (i + 1) % POEMS.length), 3500);
    return () => clearInterval(t);
  }, [loading]);

  // progressive load: lift the 墨暈 after a few beats even if the agent is
  // still painting — the deterministic scene plays underneath meanwhile.
  useEffect(() => {
    if (!loading) {
      setInkOverlay(false);
      return;
    }
    setInkOverlay(true);
    const t = setTimeout(() => setInkOverlay(false), 4500);
    return () => clearTimeout(t);
  }, [loading]);

  const busy = loading || regenerating;
  const layout = gen?.layout ?? null;
  const self = layout?.avatars.find((a) => a.isSelf);
  const others = layout?.avatars.filter((a) => !a.isSelf) ?? [];

  const firstTouchRef = useRef(false);
  const handleFirstPointer = useCallback(() => {
    unlockAudio();
    if (!firstTouchRef.current) {
      firstTouchRef.current = true;
      // 撥動畫軸 — one soft low string on first touch
      playPluck(146.8, 0.07);
    }
  }, []);

  return (
    <div
      className="relative h-full w-full overflow-hidden bg-[#0b0d10]"
      onPointerDownCapture={handleFirstPointer}
    >
      {/* the scroll itself */}
      <div className="absolute inset-0">
        <ChamberCanvas
          style={{ width: '100%', height: '100%' }}
          layout={layout ?? undefined}
          envOverride={{ weather, timeOfDay, season: 'spring' }}
          cinematic
        />
      </div>

      {/* legibility scrims */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/35 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/45 to-transparent" />

      {/* top bar */}
      <div className="absolute left-5 top-4 z-20">
        <Link href="/chamber" className={PILL}>
          ← 名冊
        </Link>
      </div>
      <div className="absolute right-5 top-4 z-20 flex items-center gap-2">
        <span className="rounded-full bg-black/25 px-3 py-1 text-xs text-white/55 backdrop-blur-md">
          {gen?.usedModel ? `GLM 生成 · ${gen.usedModel}` : '示意佈局'}
          {layout?.sceneId ? ' · 已讀場景' : ''}
          {gen?.cached ? ' · 快取' : ''}
        </span>
        <button
          type="button"
          onClick={() => setColophonOpen((v) => !v)}
          className={PILL}
          title="生成題跋（agent 運行記錄）"
        >
          題跋
        </button>
      </div>

      {/* 畫題 + 印章 (bottom-left, vertical) */}
      <div className="pointer-events-none absolute bottom-24 left-7 z-20 flex items-start gap-3">
        <h1
          style={{ writingMode: 'vertical-rl' }}
          className="font-serif text-2xl leading-snug tracking-[0.4em] text-white/95 drop-shadow-[0_2px_10px_rgba(0,0,0,0.65)]"
        >
          {(self?.name ?? '無名') + '之廂房'}
        </h1>
        <span className="grid h-9 w-9 rotate-2 place-items-center rounded-[3px] bg-[#a03226] font-serif text-lg leading-none text-[#f3e7d3] shadow-lg">
          廂
        </span>
      </div>
      <div className="pointer-events-none absolute bottom-16 left-7 z-20 text-xs tracking-widest text-white/65 drop-shadow">
        {gen?.roomStyle ? `${gen.roomStyle}` : ''}
        {others.length > 0 ? `${gen?.roomStyle ? ' · ' : ''}同住 ${others.length} 人` : ''}
      </div>

      {/* floating control bar (bottom-center) */}
      <div className="absolute inset-x-0 bottom-5 z-20 flex justify-center">
        <div className="flex max-w-full flex-wrap items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3 py-2 backdrop-blur-md">
          {WEATHERS.map((w) => (
            <button
              key={w.key}
              type="button"
              onClick={() => setWeather(w.key)}
              className={[
                'grid h-8 w-8 place-items-center rounded-full font-serif text-sm transition-colors',
                weather === w.key ? 'bg-white/90 text-stone-900' : 'text-white/75 hover:bg-white/15',
              ].join(' ')}
            >
              {w.label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-white/20" />
          {TIMES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTimeOfDay(t.key)}
              className={[
                'grid h-8 w-8 place-items-center rounded-full font-serif text-sm transition-colors',
                timeOfDay === t.key ? 'bg-white/90 text-stone-900' : 'text-white/75 hover:bg-white/15',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-white/20" />
          <button type="button" onClick={() => run(true)} disabled={busy} className={PILL}>
            ↻ 章回重生
          </button>
          <button
            type="button"
            onClick={runVision}
            disabled={busy}
            className={PILL}
            title="glm-4.6v 看參考圖佈置"
          >
            ✨ 看圖佈置
          </button>
          <button
            type="button"
            onClick={runCode}
            disabled={busy}
            className={PILL}
            title="glm-4.6v 看圖寫 Three.js，設計整個場景"
          >
            🖌 寫景
          </button>
        </div>
      </div>

      {/* 題跋 — the agent's run record as a colophon strip */}
      {colophonOpen ? (
        <aside className="absolute bottom-24 right-5 top-16 z-20 w-72 overflow-y-auto rounded-lg border border-white/15 bg-black/35 p-4 backdrop-blur-md">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-serif text-sm tracking-[0.3em] text-white/90">生成題跋</h2>
            <span className="text-[10px] text-white/40">agent 運行記錄</span>
          </div>
          {busy && !gen ? (
            <p className="text-sm text-white/60">執行中…</p>
          ) : gen && gen.log.length > 0 ? (
            <ol key={gen.generatedAt ?? 0} className="flex flex-col gap-2">
              {gen.log.map((s, i) => (
                <li
                  key={i}
                  className="animate-fade-in-up rounded-md border border-white/10 bg-white/5 p-2 text-xs"
                  style={{ animationDelay: `${i * 130}ms`, animationFillMode: 'backwards' }}
                >
                  <span className="font-medium text-[#e8b08a]">{phaseLabel(s.phase)}</span>
                  {s.model ? <span className="ml-1 text-white/45">{s.model}</span> : null}
                  <p className="mt-0.5 leading-relaxed text-white/70">{s.note}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-white/50">—</p>
          )}
          {layout && (layout.placements?.length ?? 0) > 0 ? (
            <div className="mt-4 border-t border-white/10 pt-3">
              <p className="mb-2 text-[10px] tracking-widest text-white/40">陳設</p>
              <div className="flex flex-wrap gap-1.5">
                {(layout.placements ?? []).map((p, i) => (
                  <span
                    key={`${p.tag ?? p.kind}:${i}`}
                    className="rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-[11px] text-white/65"
                  >
                    {p.label ?? p.tag ?? (p.kind === 1 ? '掛軸' : '物件')}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      ) : null}

      {/* painting-in-progress wisp (initial background gen or regeneration) */}
      {regenerating || (loading && !inkOverlay) ? (
        <div className="absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-full bg-black/40 px-4 py-1.5 text-xs tracking-widest text-[#e8b08a] backdrop-blur-md">
          {regenerating ? '重新作畫中…' : 'agent 作畫中 · 先入畫一觀'}
        </div>
      ) : null}

      {/* 墨暈 opening overlay — lifts after a few beats (progressive load) */}
      {loading && inkOverlay ? (
        <div className="absolute inset-0 z-40 grid place-items-center bg-gradient-to-b from-[#0e1114]/90 to-[#090b0e]/95 transition-opacity duration-700">
          <div className="flex flex-col items-center gap-6">
            <div className="h-16 w-16 animate-pulse rounded-full bg-[radial-gradient(circle,rgba(214,226,221,0.85),rgba(86,110,104,0.3)_55%,transparent_72%)]" />
            <p className="font-serif text-base tracking-[0.4em] text-white/80">{POEMS[poemIdx]}</p>
            <p className="text-xs tracking-wider text-white/40">agent 正在作畫 · 完成後自動換景</p>
          </div>
        </div>
      ) : null}
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
