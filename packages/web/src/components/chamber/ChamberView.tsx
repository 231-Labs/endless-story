'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { ChamberLayout, SceneDesign, SceneElement } from '@endless-story/chamber-3d';
import { getVaultInventory, type VaultInventory } from '@/lib/actions/vault-collection';
import { curateVault } from '@/lib/actions/curate-vault';
import { buildVaultDesign } from '@/lib/chamber/vault-design-build';
import { audioUnlocked, playPluck, playRevealMotif, unlockAudio } from '@/lib/chamber/sound';

const ChamberCanvas = dynamic(
  () => import('@endless-story/chamber-3d').then((m) => m.ChamberCanvas),
  { ssr: false, loading: () => null },
);

const POEMS = ['啟匣焚香', '塵掩珠光，拂之即明', '一瞬既藏，歲月不散'];

const PILL =
  'rounded-full border border-white/20 bg-black/25 px-4 py-1.5 text-sm text-white/85 backdrop-blur-md transition-colors hover:bg-black/40 disabled:opacity-40 disabled:hover:bg-black/25';

// ── 展間 (rooms) — local persistence until on-chain rooms land ────────

interface LayoutOverride {
  pos: [number, number, number];
  yawDeg: number;
  scale?: number;
}

interface Room {
  id: string;
  name: string;
  /** exhibited item keys (checked in the inventory). */
  keys: string[];
  overrides: Record<string, LayoutOverride>;
  lights: Record<string, { color: string; intensity: number }>;
  note?: string;
}

interface RoomsState {
  activeId: string;
  rooms: Room[];
}

function roomsKey(characterId: string): string {
  return `vault-rooms:v1:${characterId || 'demo'}`;
}

function loadRooms(characterId: string): RoomsState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(roomsKey(characterId));
    return raw ? (JSON.parse(raw) as RoomsState) : null;
  } catch {
    return null;
  }
}

function saveRooms(characterId: string, state: RoomsState): void {
  try {
    localStorage.setItem(roomsKey(characterId), JSON.stringify(state));
  } catch {
    // storage blocked — in-memory only
  }
}

/** stable element identity: item key, else structural fallback. */
function elKey(el: SceneElement, i: number): string {
  return (el.params?.key as string | undefined) ?? `${el.kind}:${i}`;
}

/**
 * 藏閣 — the collector's vault. The inventory panel curates: pick the rooms,
 * check what to exhibit, give the AI curator an instruction (it arranges AND
 * lights every piece), then fine-tune by hand.
 */
export function ChamberView({ characterId }: { characterId: string }) {
  const [inventory, setInventory] = useState<VaultInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [poemIdx, setPoemIdx] = useState(0);
  const [inkOverlay, setInkOverlay] = useState(true);
  // 展間
  const [roomsState, setRoomsState] = useState<RoomsState | null>(null);
  // 自由布局
  const [arrange, setArrange] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [tMode, setTMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  // AI 策展
  const [instruction, setInstruction] = useState('');
  const [curating, setCurating] = useState(false);
  const [curateError, setCurateError] = useState<string | null>(null);
  const aliveRef = useRef(true);

  // load inventory + rooms
  useEffect(() => {
    aliveRef.current = true;
    setLoading(true);
    getVaultInventory(characterId)
      .then((inv) => {
        if (!aliveRef.current) return;
        setInventory(inv);
        const saved = loadRooms(characterId);
        if (saved && saved.rooms.length > 0) {
          setRoomsState(saved);
        } else {
          const first: Room = {
            id: `room-${Math.random().toString(36).slice(2, 8)}`,
            name: '第一展間',
            keys: [...inv.stills.map((s) => s.key), ...inv.curios.map((c) => c.key)],
            overrides: {},
            lights: {},
          };
          const init = { activeId: first.id, rooms: [first] };
          setRoomsState(init);
          saveRooms(characterId, init);
        }
        if (audioUnlocked()) playRevealMotif();
        requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
        setTimeout(() => window.dispatchEvent(new Event('resize')), 600);
      })
      .catch(() => {
        if (aliveRef.current) setInventory(null);
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

  const room = roomsState?.rooms.find((r) => r.id === roomsState.activeId) ?? null;

  const updateRoom = useCallback(
    (mutate: (r: Room) => Room) => {
      setRoomsState((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          rooms: prev.rooms.map((r) => (r.id === prev.activeId ? mutate(r) : r)),
        };
        saveRooms(characterId, next);
        return next;
      });
    },
    [characterId],
  );

  // checked items → design → overrides + lights
  const layout: ChamberLayout | null = useMemo(() => {
    if (!inventory || !room) return null;
    const stills = inventory.stills.filter((s) => room.keys.includes(s.key));
    const curios = inventory.curios.filter((c) => room.keys.includes(c.key));
    const base: SceneDesign = buildVaultDesign(stills, curios);
    const elements = base.elements.map((el, i) => {
      const k = elKey(el, i);
      const o = room.overrides[k];
      const light = room.lights[k];
      let out = el;
      if (o) out = { ...out, pos: o.pos, yaw: o.yawDeg, scale: o.scale ?? out.scale };
      if (light) out = { ...out, params: { ...out.params, light } };
      return out;
    });
    return { characterId, avatars: [], params: null, design: { ...base, elements } };
  }, [inventory, room, characterId]);

  const commitTransform = useCallback(
    (index: number, pos: [number, number, number], yawDeg: number, scale: number) => {
      const el = layout?.design?.elements[index];
      if (!el) return;
      const k = elKey(el, index);
      updateRoom((r) => ({ ...r, overrides: { ...r.overrides, [k]: { pos, yawDeg, scale } } }));
    },
    [layout, updateRoom],
  );

  const resetLayout = useCallback(() => {
    setSelected(null);
    updateRoom((r) => ({ ...r, overrides: {}, lights: {}, note: undefined }));
  }, [updateRoom]);

  const toggleItem = useCallback(
    (key: string) => {
      setSelected(null);
      updateRoom((r) => ({
        ...r,
        keys: r.keys.includes(key) ? r.keys.filter((k) => k !== key) : [...r.keys, key],
      }));
    },
    [updateRoom],
  );

  const addRoom = useCallback(() => {
    setRoomsState((prev) => {
      if (!prev) return prev;
      const room: Room = {
        id: `room-${Math.random().toString(36).slice(2, 8)}`,
        name: `第${['一', '二', '三', '四', '五', '六', '七', '八', '九'][prev.rooms.length] ?? prev.rooms.length + 1}展間`,
        keys: [],
        overrides: {},
        lights: {},
      };
      const next = { activeId: room.id, rooms: [...prev.rooms, room] };
      saveRooms(characterId, next);
      return next;
    });
    setSelected(null);
  }, [characterId]);

  const switchRoom = useCallback(
    (id: string) => {
      setRoomsState((prev) => {
        if (!prev) return prev;
        const next = { ...prev, activeId: id };
        saveRooms(characterId, next);
        return next;
      });
      setSelected(null);
    },
    [characterId],
  );

  // AI 策展
  const runCurate = useCallback(async () => {
    if (!inventory || !room || !layout?.design) return;
    setCurating(true);
    setCurateError(null);
    const itemsByKey = new Map<string, { title: string; type: 'still' | 'curio' }>();
    for (const s of inventory.stills) itemsByKey.set(s.key, { title: s.title, type: 'still' });
    for (const c of inventory.curios) itemsByKey.set(c.key, { title: c.title, type: 'curio' });
    const items = room.keys
      .filter((k) => itemsByKey.has(k))
      .map((k) => ({ key: k, ...itemsByKey.get(k)! }));
    const current = layout.design.elements
      .map((el, i) => ({ el, k: elKey(el, i) }))
      .filter(({ el, k }) => itemsByKey.has(k) && (el.kind === 'display_still' || el.kind === 'display_curio'))
      .map(({ el, k }) => ({
        key: k,
        pos: el.pos,
        yaw: el.yaw ?? 0,
        scale: el.scale ?? 1,
      }));
    const res = await curateVault({ items, instruction, current });
    if (!aliveRef.current) return;
    if (!res.ok || !res.result) {
      setCurateError(res.error ?? '策展失敗');
      setCurating(false);
      return;
    }
    const overrides: Record<string, LayoutOverride> = {};
    const lights: Record<string, { color: string; intensity: number }> = {};
    for (const a of res.result.arrangement) {
      overrides[a.key] = { pos: a.pos, yawDeg: a.yaw, scale: a.scale };
      lights[a.key] = a.light;
    }
    updateRoom((r) => ({
      ...r,
      overrides: { ...r.overrides, ...overrides },
      lights: { ...r.lights, ...lights },
      note: res.result!.note,
    }));
    if (audioUnlocked()) playRevealMotif();
    setCurating(false);
  }, [inventory, room, layout, instruction, updateRoom]);

  const exhibitedCount = room?.keys.length ?? 0;

  return (
    <div
      className="relative h-full w-full overflow-hidden bg-[#07080c]"
      onPointerDownCapture={handleFirstPointer}
    >
      <div className="absolute inset-0">
        <ChamberCanvas
          style={{ width: '100%', height: '100%' }}
          layout={layout ?? undefined}
          cinematic={!arrange}
          editable={arrange}
          selectedIndex={selected}
          transformMode={tMode}
          onSelect={setSelected}
          onCommit={commitTransform}
        />
      </div>

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
          {room?.name ?? '藏閣'} · 展出 {exhibitedCount} 件
        </span>
        <button
          type="button"
          onClick={() => {
            setArrange((v) => {
              if (v) setSelected(null);
              return !v;
            });
          }}
          disabled={!layout}
          className={[PILL, arrange ? 'border-[#caa64a]/70 text-[#e8cd84]' : ''].join(' ')}
        >
          {arrange ? '完成布局' : '布局'}
        </button>
        <button type="button" onClick={() => setPanelOpen((v) => !v)} className={PILL}>
          展品庫
        </button>
      </div>

      {/* 畫題 + 印章 */}
      <div className="pointer-events-none absolute bottom-24 left-7 z-20 flex items-start gap-3">
        <h1
          style={{ writingMode: 'vertical-rl' }}
          className="font-serif text-2xl leading-snug tracking-[0.4em] text-white/95 drop-shadow-[0_2px_10px_rgba(0,0,0,0.65)]"
        >
          我的藏閣
        </h1>
        <span className="grid h-9 w-9 rotate-2 place-items-center rounded-[3px] bg-[#a03226] font-serif text-lg leading-none text-[#f3e7d3] shadow-lg">
          藏
        </span>
      </div>
      <div className="pointer-events-none absolute bottom-16 left-7 z-20 max-w-xs text-xs tracking-widest text-white/65 drop-shadow">
        {room?.note ? `策展語：${room.note}` : ''}
      </div>

      {/* 自由布局 toolbar */}
      {arrange ? (
        <div className="absolute inset-x-0 bottom-5 z-20 flex justify-center">
          <div className="flex items-center gap-2 rounded-full border border-white/15 bg-black/35 px-3 py-2 backdrop-blur-md">
            <span className="px-1 text-xs tracking-wider text-white/55">
              點選藏品{selected != null ? ` · 已選 #${selected + 1}` : ''}
            </span>
            <span className="h-5 w-px bg-white/20" />
            {(['translate', 'rotate', 'scale'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setTMode(m)}
                className={[
                  'rounded-full px-3 py-1 text-xs transition-colors',
                  tMode === m ? 'bg-white/90 text-stone-900' : 'text-white/75 hover:bg-white/15',
                ].join(' ')}
              >
                {m === 'translate' ? '移動' : m === 'rotate' ? '旋轉' : '縮放'}
              </button>
            ))}
            <span className="h-5 w-px bg-white/20" />
            <button type="button" onClick={resetLayout} className="rounded-full px-3 py-1 text-xs text-white/75 hover:bg-white/15">
              還原
            </button>
            <span className="px-1 text-[10px] text-white/35">本地保存 · 鏈上保存待部署</span>
          </div>
        </div>
      ) : null}

      {/* 展品庫 — rooms + inventory + AI curator */}
      {panelOpen ? (
        <aside className="absolute bottom-20 right-5 top-16 z-20 flex w-80 flex-col rounded-lg border border-white/15 bg-black/35 backdrop-blur-md">
          {/* rooms */}
          <div className="flex items-center gap-1.5 overflow-x-auto border-b border-white/10 p-3">
            {(roomsState?.rooms ?? []).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => switchRoom(r.id)}
                className={[
                  'shrink-0 rounded-full px-3 py-1 text-xs transition-colors',
                  r.id === roomsState?.activeId
                    ? 'bg-white/90 text-stone-900'
                    : 'bg-white/10 text-white/70 hover:bg-white/20',
                ].join(' ')}
              >
                {r.name}
              </button>
            ))}
            <button
              type="button"
              onClick={addRoom}
              className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/70 hover:bg-white/20"
              title="新增展間"
            >
              ＋
            </button>
          </div>

          {/* inventory with checkboxes */}
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <p className="mb-2 text-[10px] tracking-widest text-white/40">
              我的展品 · 勾選展出{arrange ? ' · 點列可選取' : ''}
            </p>
            {loading ? (
              <p className="text-sm text-white/60">啟封中…</p>
            ) : inventory ? (
              <ol className="flex flex-col gap-1.5">
                {[...inventory.stills, ...inventory.curios].map((it) => {
                  const checked = room?.keys.includes(it.key) ?? false;
                  const idx = layout?.design?.elements.findIndex(
                    (el, i) => elKey(el, i) === it.key,
                  );
                  return (
                    <li
                      key={it.key}
                      className={[
                        'flex items-start gap-2 rounded-md border p-2 text-xs',
                        arrange && checked ? 'cursor-pointer' : '',
                        arrange && selected != null && idx === selected
                          ? 'border-[#caa64a]/70 bg-[#caa64a]/10'
                          : 'border-white/10 bg-white/5',
                      ].join(' ')}
                      onClick={
                        arrange && checked && idx != null && idx >= 0
                          ? () => setSelected(idx)
                          : undefined
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleItem(it.key)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-0.5 accent-[#caa64a]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-medium text-white/85">{it.title}</span>
                          <span className="shrink-0 text-[10px] text-[#caa64a]">
                            {'url' in it ? '劇照' : '珍玩'}
                          </span>
                        </div>
                        <p className="mt-0.5 text-white/55">{it.subtitle}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="text-sm text-white/50">展品庫載入失敗。</p>
            )}
          </div>

          {/* AI curator */}
          <div className="border-t border-white/10 p-3">
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="給策展人的指示，例：白蛇傳三張排成一排居中，整體燈光冷一點…"
              rows={2}
              className="w-full resize-none rounded-md border border-white/15 bg-white/5 p-2 text-xs text-white/85 placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-[#caa64a]/60"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-[10px] text-white/40">
                {curating ? '策展人佈展中…' : curateError ? curateError : 'AI 擺位＋逐件配燈'}
              </span>
              <button
                type="button"
                onClick={runCurate}
                disabled={curating || loading || exhibitedCount === 0}
                className="shrink-0 rounded-full border border-[#caa64a]/50 bg-[#caa64a]/15 px-4 py-1.5 text-xs text-[#e8cd84] transition-colors hover:bg-[#caa64a]/25 disabled:opacity-40"
              >
                ✨ AI 佈置
              </button>
            </div>
          </div>
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
