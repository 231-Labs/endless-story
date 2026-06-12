'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { ChamberLayout, SceneDesign, SceneElement } from '@endless-story/chamber-3d';
import { getVaultInventory, type VaultInventory } from '@/lib/actions/vault-collection';
import { curateVault } from '@/lib/actions/curate-vault';
import { buildVaultDesign } from '@/lib/chamber/vault-design-build';
import { acquiredVaultItems, loadAcquired } from '@/lib/chamber/shop-catalog';
import { audioUnlocked, playPluck, playRevealMotif, unlockAudio } from '@/lib/chamber/sound';

const ChamberCanvas = dynamic(
  () => import('@endless-story/chamber-3d').then((m) => m.ChamberCanvas),
  { ssr: false, loading: () => null },
);

const POEMS = ['啟匣焚香', '塵掩珠光，拂之即明', '一瞬既藏，歲月不散'];

/** 珍玩縮圖字 — glyph tile when a curio has no image to preview. */
const CURIO_GLYPH: Record<string, string> = { fan: '扇', huqin: '琴', vase: '盞', chest: '匣' };

// ── 佈置 (saved arrangements) — local persistence until on-chain decorate ──
// One vault, many ways to dress it: a 佈置 is a saved curation (what's out,
// where it stands, how it's lit). Exhibits are singular — the same piece in
// two 佈置 is the same object re-arranged, never a duplicate.

interface LayoutOverride {
  pos: [number, number, number];
  yawDeg: number;
  scale?: number;
}

interface Arrangement {
  id: string;
  name: string;
  /** exhibited item keys (checked in the inventory). */
  keys: string[];
  overrides: Record<string, LayoutOverride>;
  lights: Record<string, { color: string; intensity: number }>;
  note?: string;
}

interface ArrangementsState {
  activeId: string;
  rooms: Arrangement[];
}

const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

function roomsKey(characterId: string): string {
  return `vault-rooms:v1:${characterId || 'demo'}`;
}

function loadRooms(characterId: string): ArrangementsState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(roomsKey(characterId));
    if (!raw) return null;
    const state = JSON.parse(raw) as ArrangementsState;
    // migrate the room-era naming (第X展間 → 佈置X)
    for (const r of state.rooms) r.name = r.name.replace(/^第(.)展間$/, '佈置$1');
    return state;
  } catch {
    return null;
  }
}

function saveRooms(characterId: string, state: ArrangementsState): void {
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

/** follows the site theme (html.dark) so the vault has a day and a night face.
 *  Lazy initial read = no dark flash on the opening overlay in day mode. */
function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(() =>
    typeof document === 'undefined' ? true : document.documentElement.classList.contains('dark'),
  );
  useEffect(() => {
    const html = document.documentElement;
    const update = () => setIsDark(html.classList.contains('dark'));
    update();
    const obs = new MutationObserver(update);
    obs.observe(html, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

/**
 * Chrome palette — light classes first, `dark:` variants after. CSS variants
 * (not JS state) so the SSR HTML is already correctly themed: the layout's
 * boot script sets `html.dark` before first paint, while a JS `isDark` would
 * default wrong until hydration and flash the night chrome over day mode.
 */
const UI = {
  pill: 'rounded-full border px-4 py-1.5 text-sm backdrop-blur-md transition-colors disabled:opacity-40 border-[#3a332a]/25 bg-[#fbf7ec]/65 text-[#3a332a]/90 hover:bg-[#fbf7ec]/90 dark:border-white/20 dark:bg-black/25 dark:text-white/85 dark:hover:bg-black/40',
  pillActive: 'border-[#a03226]/60 text-[#a03226] dark:border-[#caa64a]/70 dark:text-[#e8cd84]',
  chip: 'bg-[#fbf7ec]/65 text-[#6b5f4e]/90 dark:bg-black/25 dark:text-white/55',
  panel:
    'border-[#3a332a]/15 bg-[#f8f3e6]/75 text-[#3a332a] dark:border-white/12 dark:bg-[#0b0d12]/55 dark:text-white',
  hairline: 'border-[#3a332a]/10 dark:border-white/10',
  mute: 'text-[#6b5f4e]/80 dark:text-white/45',
  soft: 'text-[#4a4136]/85 dark:text-white/65',
  strong: 'text-[#2e2922]/95 dark:text-white/90',
  accent: 'text-[#a03226] dark:text-[#e8cd84]',
  row: 'border-[#3a332a]/10 bg-white/45 hover:bg-white/70 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10',
  rowSelected: 'border-[#a03226]/55 bg-[#a03226]/10 dark:border-[#caa64a]/70 dark:bg-[#caa64a]/10',
  tabOn: 'bg-[#3a332a]/90 text-[#f6f1e4] dark:bg-white/90 dark:text-stone-900',
  tabOff:
    'bg-[#3a332a]/10 text-[#4a4136]/85 hover:bg-[#3a332a]/20 dark:bg-white/10 dark:text-white/70 dark:hover:bg-white/20',
  divider: 'bg-[#3a332a]/20 dark:bg-white/20',
  input:
    'border-[#3a332a]/20 bg-white/60 text-[#3a332a]/90 placeholder:text-[#6b5f4e]/50 focus:ring-[#a03226]/50 dark:border-white/15 dark:bg-white/5 dark:text-white/85 dark:placeholder:text-white/30 dark:focus:ring-[#caa64a]/60',
  aiBtn:
    'border-[#a03226]/45 bg-[#a03226]/10 text-[#a03226] hover:bg-[#a03226]/20 dark:border-[#caa64a]/50 dark:bg-[#caa64a]/15 dark:text-[#e8cd84] dark:hover:bg-[#caa64a]/25',
  glyphTile:
    'bg-gradient-to-b from-[#efe7d4] to-[#e2d7bf] text-[#a03226]/85 dark:from-[#17151a] dark:to-[#0c0b10] dark:text-[#caa64a]/90',
  checkbox: 'accent-[#a03226] dark:accent-[#caa64a]',
};

/**
 * 藏閣 — the collector's vault. The inventory panel curates: pick a 佈置,
 * check what to exhibit, give the AI curator an instruction (it arranges AND
 * lights every piece), then fine-tune by hand.
 */
export function ChamberView({ characterId }: { characterId: string }) {
  const isDark = useIsDark();
  const [inventory, setInventory] = useState<VaultInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [poemIdx, setPoemIdx] = useState(0);
  const [inkOverlay, setInkOverlay] = useState(true);
  // 佈置方案
  const [roomsState, setRoomsState] = useState<ArrangementsState | null>(null);
  // 自由布局
  const [arrange, setArrange] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [tMode, setTMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  // AI 策展
  const [instruction, setInstruction] = useState('');
  const [curating, setCurating] = useState(false);
  const [curateError, setCurateError] = useState<string | null>(null);
  // 展品庫 篩選
  const [invFilter, setInvFilter] = useState<'all' | 'still' | 'curio'>('all');
  const [invSearch, setInvSearch] = useState('');
  const aliveRef = useRef(true);

  // load inventory (server pieces + locally acquired 戲坊 wares) + 佈置
  useEffect(() => {
    aliveRef.current = true;
    setLoading(true);
    getVaultInventory(characterId)
      .then((server) => {
        if (!aliveRef.current) return;
        const bought = acquiredVaultItems(loadAcquired());
        const inv: VaultInventory = {
          stills: [...server.stills, ...bought.stills],
          curios: [...server.curios, ...bought.curios],
        };
        setInventory(inv);
        const saved = loadRooms(characterId);
        if (saved && saved.rooms.length > 0) {
          setRoomsState(saved);
        } else {
          const first: Arrangement = {
            id: `room-${Math.random().toString(36).slice(2, 8)}`,
            name: '佈置一',
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
    (mutate: (r: Arrangement) => Arrangement) => {
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
    const base: SceneDesign = buildVaultDesign(stills, curios, { bright: !isDark });
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
  }, [inventory, room, characterId, isDark]);

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

  // 另存新佈置 — duplicates the active arrangement (same pieces, ready to re-dress)
  const addRoom = useCallback(() => {
    setRoomsState((prev) => {
      if (!prev) return prev;
      const active = prev.rooms.find((r) => r.id === prev.activeId);
      const dup: Arrangement = {
        id: `room-${Math.random().toString(36).slice(2, 8)}`,
        name: `佈置${CN_NUM[prev.rooms.length] ?? prev.rooms.length + 1}`,
        keys: [...(active?.keys ?? [])],
        overrides: { ...(active?.overrides ?? {}) },
        lights: { ...(active?.lights ?? {}) },
        note: active?.note,
      };
      const next = { activeId: dup.id, rooms: [...prev.rooms, dup] };
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
    if (!inventory || !room) return;
    setCurating(true);
    setCurateError(null);
    // Pass the full inventory so the AI can re-select which items to exhibit.
    const selectedKeys = new Set(room.keys);
    const items = [
      ...inventory.stills.map((s) => ({ key: s.key, title: s.title, type: 'still' as const, selected: selectedKeys.has(s.key) })),
      ...inventory.curios.map((c) => ({ key: c.key, title: c.title, type: 'curio' as const, selected: selectedKeys.has(c.key) })),
    ];
    const current = layout?.design?.elements
      .map((el, i) => ({ el, k: elKey(el, i) }))
      .filter(({ el, k }) => selectedKeys.has(k) && (el.kind === 'display_still' || el.kind === 'display_curio'))
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
      // If the AI selected a different set of items, apply it; else keep current keys.
      keys: res.result!.selectedKeys ?? r.keys,
      overrides: { ...r.overrides, ...overrides },
      lights: { ...r.lights, ...lights },
      note: res.result!.note,
    }));
    // Clear gizmo selection: the element list may have changed, stale index → invalid ref.
    setSelected(null);
    if (audioUnlocked()) playRevealMotif();
    setCurating(false);
  }, [inventory, room, layout, instruction, updateRoom]);

  const exhibitedCount = room?.keys.length ?? 0;

  // Filtered inventory for the panel list
  const allInventoryItems = inventory ? [...inventory.stills, ...inventory.curios] : [];
  const filteredInventoryItems = allInventoryItems.filter((it) => {
    const isStill = 'url' in it;
    if (invFilter === 'still' && !isStill) return false;
    if (invFilter === 'curio' && isStill) return false;
    if (invSearch) {
      const q = invSearch.toLowerCase();
      return it.title.toLowerCase().includes(q) || it.subtitle.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div
      className="relative h-full w-full overflow-hidden bg-[#e9e2d2] dark:bg-[#07080c]"
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

      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#efe8d8]/70 to-transparent dark:from-black/40" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#d8cdb6]/60 to-transparent dark:from-black/45" />

      {/* top bar */}
      <div className="absolute left-5 top-4 z-20">
        <Link href="/chamber" className={UI.pill}>
          ← 名冊
        </Link>
      </div>
      <div className="absolute right-5 top-4 z-20 flex items-center gap-2">
        <span className={['rounded-full px-3 py-1 text-xs backdrop-blur-md', UI.chip].join(' ')}>
          {room?.name ?? '佈置'} · 展出 {exhibitedCount} 件
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
          className={[UI.pill, arrange ? UI.pillActive : ''].join(' ')}
        >
          {arrange ? '完成布局' : '布局'}
        </button>
        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          className={[UI.pill, panelOpen ? UI.pillActive : ''].join(' ')}
        >
          展品庫
        </button>
      </div>

      {/* 畫題 + 印章 */}
      <div className="pointer-events-none absolute bottom-24 left-7 z-20 flex items-start gap-3">
        <h1
          style={{ writingMode: 'vertical-rl' }}
          className="font-serif text-2xl leading-snug tracking-[0.4em] text-[#3a332a]/95 drop-shadow-[0_1px_6px_rgba(255,250,238,0.6)] dark:text-white/95 dark:drop-shadow-[0_2px_10px_rgba(0,0,0,0.65)]"
        >
          我的藏閣
        </h1>
        <span className="grid h-9 w-9 rotate-2 place-items-center rounded-[3px] bg-[#a03226] font-serif text-lg leading-none text-[#f3e7d3] shadow-lg">
          藏
        </span>
      </div>

      {/* 策展語 — gallery wall text, centred clear of the 畫題 and the panel */}
      {room?.note && !arrange ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-32">
          <p className="max-w-xl text-center text-xs leading-relaxed tracking-widest text-[#4a4136]/85 dark:text-white/65 dark:drop-shadow">
            策展語：{room.note}
          </p>
        </div>
      ) : null}

      {/* 自由布局 toolbar */}
      {arrange ? (
        <div className="absolute inset-x-0 bottom-5 z-20 flex justify-center">
          <div className="flex items-center gap-2 rounded-full border border-[#3a332a]/20 bg-[#fbf7ec]/75 px-3 py-2 backdrop-blur-md dark:border-white/15 dark:bg-black/35">
            <span className={['px-1 text-xs tracking-wider', UI.soft].join(' ')}>
              點選藏品{selected != null ? ` · 已選 #${selected + 1}` : ''}
            </span>
            <span className="h-5 w-px bg-[#3a332a]/20 dark:bg-white/20" />
            {(['translate', 'rotate', 'scale'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setTMode(m)}
                className={[
                  'rounded-full px-3 py-1 text-xs transition-colors',
                  tMode === m ? UI.tabOn : UI.tabOff,
                ].join(' ')}
              >
                {m === 'translate' ? '移動' : m === 'rotate' ? '旋轉' : '縮放'}
              </button>
            ))}
            <span className="h-5 w-px bg-[#3a332a]/20 dark:bg-white/20" />
            <button
              type="button"
              onClick={resetLayout}
              className={['rounded-full px-3 py-1 text-xs transition-colors', UI.tabOff].join(' ')}
            >
              還原
            </button>
            <span className={['px-1 text-[10px]', UI.mute].join(' ')}>本地保存 · 鏈上保存待部署</span>
          </div>
        </div>
      ) : null}

      {/* 展品庫 — 佈置方案 + inventory + AI curator */}
      {panelOpen ? (
        <aside
          className={[
            'absolute bottom-20 right-5 top-16 z-20 flex w-[23rem] flex-col overflow-hidden rounded-xl border shadow-2xl backdrop-blur-xl',
            UI.panel,
          ].join(' ')}
        >
          {/* 卷首 — title + 佈置方案 */}
          <div className={['border-b px-4 pb-3 pt-4', UI.hairline].join(' ')}>
            <div className="flex items-baseline justify-between">
              <h2 className={['font-serif text-base tracking-[0.3em]', UI.strong].join(' ')}>展品庫</h2>
              <span className={['text-[10px] tracking-widest', UI.mute].join(' ')}>
                {exhibitedCount} 件展出
              </span>
            </div>
            <div className="mt-3 flex items-center gap-1.5 overflow-x-auto">
              {(roomsState?.rooms ?? []).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => switchRoom(r.id)}
                  className={[
                    'shrink-0 rounded-full px-3 py-1 text-xs transition-colors',
                    r.id === roomsState?.activeId ? UI.tabOn : UI.tabOff,
                  ].join(' ')}
                >
                  {r.name}
                </button>
              ))}
              <button
                type="button"
                onClick={addRoom}
                className={['shrink-0 rounded-full px-2.5 py-1 text-xs transition-colors', UI.tabOff].join(' ')}
                title="另存新佈置（複製目前佈置再改）"
              >
                ＋
              </button>
            </div>
          </div>

          {/* 篩選列 — filter tabs + search */}
          <div className={['border-b px-3 pb-2 pt-2', UI.hairline].join(' ')}>
            <div className="flex items-center gap-1.5">
              {(['all', 'still', 'curio'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setInvFilter(f)}
                  className={[
                    'rounded-full px-2.5 py-0.5 text-[11px] transition-colors',
                    invFilter === f ? UI.tabOn : UI.tabOff,
                  ].join(' ')}
                >
                  {f === 'all' ? '全部' : f === 'still' ? '劇照' : '珍玩'}
                </button>
              ))}
              <input
                type="search"
                value={invSearch}
                onChange={(e) => setInvSearch(e.target.value)}
                placeholder="搜尋…"
                className={[
                  'ml-auto w-24 rounded-md border px-2 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:w-32 transition-all',
                  UI.input,
                ].join(' ')}
              />
            </div>
          </div>

          {/* inventory — thumbnail rows, check to exhibit */}
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <p className={['mb-2 px-1 text-[10px] tracking-widest', UI.mute].join(' ')}>
              勾選展出{arrange ? ' · 點列可選取調整' : ''}
            </p>
            {loading ? (
              <p className={['px-1 text-sm', UI.soft].join(' ')}>啟封中…</p>
            ) : inventory ? (
              filteredInventoryItems.length === 0 ? (
                <p className={['px-1 text-xs', UI.mute].join(' ')}>
                  {invSearch ? '沒有符合的展品' : '此分類沒有展品'}
                </p>
              ) : (
              <ol className="flex flex-col gap-1.5">
                {filteredInventoryItems.map((it) => {
                  const checked = room?.keys.includes(it.key) ?? false;
                  const idx = layout?.design?.elements.findIndex(
                    (el, i) => elKey(el, i) === it.key,
                  );
                  const isSel = arrange && selected != null && idx === selected;
                  const isStill = 'url' in it;
                  return (
                    <li
                      key={it.key}
                      className={[
                        'flex items-center gap-2.5 rounded-lg border p-2 text-xs transition-colors',
                        arrange && checked ? 'cursor-pointer' : '',
                        isSel ? UI.rowSelected : UI.row,
                        !checked ? 'opacity-55' : '',
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
                        className={UI.checkbox}
                      />
                      {/* 縮圖 — the piece at a glance */}
                      {isStill ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={(it as { url: string }).url}
                          alt={it.title}
                          loading="lazy"
                          className="h-12 w-12 shrink-0 rounded-md border border-black/20 object-cover"
                        />
                      ) : (
                        <span
                          className={[
                            'grid h-12 w-12 shrink-0 place-items-center rounded-md font-serif text-xl',
                            UI.glyphTile,
                          ].join(' ')}
                        >
                          {CURIO_GLYPH[(it as { tag?: string }).tag ?? ''] ?? '玩'}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className={['truncate font-serif text-[13px]', UI.strong].join(' ')}>
                            {it.title}
                          </span>
                          <span className={['shrink-0 text-[10px]', UI.accent].join(' ')}>
                            {isStill ? '劇照' : '珍玩'}
                          </span>
                        </div>
                        <p className={['mt-0.5 truncate', UI.mute].join(' ')}>{it.subtitle}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
              )
            ) : (
              <p className={['px-1 text-sm', UI.mute].join(' ')}>展品庫載入失敗。</p>
            )}
          </div>

          {/* AI curator */}
          <div className={['border-t px-4 py-3', UI.hairline].join(' ')}>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="給策展人的指示，例：只展柳生春相關、白蛇傳三張排成一排、整體燈光冷一點…"
              rows={2}
              className={[
                'w-full resize-none rounded-md border p-2 text-xs focus:outline-none focus:ring-1',
                UI.input,
              ].join(' ')}
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className={['min-w-0 truncate text-[10px]', UI.mute].join(' ')}>
                {curating ? '策展人佈展中…' : curateError ? curateError : 'AI 擺位＋逐件配燈'}
              </span>
              <button
                type="button"
                onClick={runCurate}
                disabled={curating || loading || allInventoryItems.length === 0}
                className={[
                  'shrink-0 rounded-full border px-4 py-1.5 text-xs transition-colors disabled:opacity-40',
                  UI.aiBtn,
                ].join(' ')}
              >
                ✨ AI 佈置
              </button>
            </div>
          </div>
        </aside>
      ) : null}

      {/* 墨暈 opening overlay — CSS dark: variants so even the SSR frame is
          correctly day/night before hydration */}
      {loading && inkOverlay ? (
        <div className="absolute inset-0 z-40 grid place-items-center bg-gradient-to-b from-[#efe9db]/94 to-[#e0d6c2]/96 transition-opacity duration-700 dark:from-[#0b0d12]/92 dark:to-[#06070b]/96">
          <div className="flex flex-col items-center gap-6">
            <div className="h-16 w-16 animate-pulse rounded-full bg-[radial-gradient(circle,rgba(94,84,66,0.55),rgba(140,126,100,0.2)_55%,transparent_72%)] dark:bg-[radial-gradient(circle,rgba(222,228,236,0.85),rgba(86,100,118,0.3)_55%,transparent_72%)]" />
            <p className="font-serif text-base tracking-[0.4em] text-[#4a4136]/90 dark:text-white/80">
              {POEMS[poemIdx]}
            </p>
            <p className="text-xs tracking-wider text-[#6b5f4e]/70 dark:text-white/40">啟封藏閣…</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
