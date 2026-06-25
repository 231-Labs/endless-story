'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import type { ChamberLayout, SceneDesign, SceneElement } from '@endless-story/chamber-3d';
import type { CurateProp } from '@endless-story/llm/prompts';
import { isDeployed, read, tx as endlessTx } from '@endless-story/sdk';

import { getVaultInventory, type VaultInventory } from '@/lib/actions/vault-collection';
import { curateVault } from '@/lib/actions/curate-vault';
import { uploadVaultLayout } from '@/lib/actions/save-vault-layout';
import { buildVaultDesign } from '@/lib/chamber/vault-design-build';
import { acquiredVaultItems, loadAcquired } from '@/lib/chamber/shop-catalog';
import { fetchVaultLayout, serializeVaultLayout, type VaultLayoutRoom } from '@/lib/chamber/vault-layout';
import { audioUnlocked, playPluck, playRevealMotif, unlockAudio } from '@/lib/chamber/sound';
import { InkFluid } from '@/components/common/InkFluid';
import { CreateVaultGate } from './CreateVaultGate';
import { PurchasePanel } from './PurchasePanel';

const ChamberCanvas = dynamic(
  () => import('@endless-story/chamber-3d').then((m) => m.ChamberCanvas),
  { ssr: false, loading: () => null },
);

const POEMS = ['啟匣焚香', '塵掩珠光，拂之即明', '一瞬既藏，歲月不散'];
const CURIO_GLYPH: Record<string, string> = { fan: '扇', huqin: '琴', vase: '盞', chest: '匣' };
const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const CHAIN_KEY = 'chain:';

interface PersonalVaultRef {
  vaultId: string;
  owner: string;
  kioskId: string;
  layoutBlobId: string | null;
  layoutVersion: number;
}

interface LayoutOverride {
  pos: [number, number, number];
  yawDeg: number;
  scale?: number;
}

/** One 佈置 — a named arrangement of the wallet's collection. */
interface Room {
  id: string;
  name: string;
  keys: string[];
  overrides: Record<string, LayoutOverride>;
  lights: Record<string, { color: string; intensity: number }>;
  note?: string;
  props?: CurateProp[];
}

interface RoomsState {
  activeId: string;
  rooms: Room[];
}

function roomsKey(vaultId: string): string {
  return `vault-rooms:v3:${vaultId}`;
}
function loadRooms(vaultId: string): RoomsState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(roomsKey(vaultId));
    return raw ? (JSON.parse(raw) as RoomsState) : null;
  } catch {
    return null;
  }
}
function saveRooms(vaultId: string, state: RoomsState): void {
  try {
    localStorage.setItem(roomsKey(vaultId), JSON.stringify(state));
  } catch {
    // storage blocked — in-memory only
  }
}
function newRoomId(): string {
  return `room-${Math.random().toString(36).slice(2, 8)}`;
}

/** dedup-merge server inventory with the owner's locally-acquired demo wares. */
function mergeInventory(server: VaultInventory, includeBought: boolean): VaultInventory {
  const bought = includeBought ? acquiredVaultItems(loadAcquired()) : { stills: [], curios: [] };
  const seenUrl = new Set<string>();
  const stills = [...server.stills, ...bought.stills].filter((s) => {
    if (!s.url || !seenUrl.has(s.url)) {
      if (s.url) seenUrl.add(s.url);
      return true;
    }
    return false;
  });
  return { stills, curios: [...server.curios, ...bought.curios] };
}

/** stable element identity: item key, else structural fallback. */
function elKey(el: SceneElement, i: number): string {
  return (el.params?.key as string | undefined) ?? `${el.kind}:${i}`;
}

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
  input:
    'border-[#3a332a]/20 bg-white/60 text-[#3a332a]/90 placeholder:text-[#6b5f4e]/50 focus:ring-[#a03226]/50 dark:border-white/15 dark:bg-white/5 dark:text-white/85 dark:placeholder:text-white/30 dark:focus:ring-[#caa64a]/60',
  aiBtn:
    'border-[#a03226]/45 bg-[#a03226]/10 text-[#a03226] hover:bg-[#a03226]/20 dark:border-[#caa64a]/50 dark:bg-[#caa64a]/15 dark:text-[#e8cd84] dark:hover:bg-[#caa64a]/25',
  glyphTile:
    'bg-gradient-to-b from-[#efe7d4] to-[#e2d7bf] text-[#a03226]/85 dark:from-[#17151a] dark:to-[#0c0b10] dark:text-[#caa64a]/90',
  checkbox: 'accent-[#a03226] dark:accent-[#caa64a]',
};

/**
 * 藏閣 — a wallet's single on-chain collector vault (PersonalVault + Kiosk).
 * The owner keeps MANY named 佈置 (arrangements) inside one remote layout blob;
 * each 佈置 is shareable via `?vault=<id>&room=<roomId>`. A visitor opening such
 * a link sees that 佈置 read-only plus a purchase panel of the vault's listings.
 */
export function ChamberView({
  addressParam,
  vaultParam,
  roomParam,
}: {
  addressParam?: string;
  vaultParam?: string;
  roomParam?: string;
}) {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const isDark = useIsDark();
  const deployed = isDeployed();

  const [ownerAddr, setOwnerAddr] = useState<string | null>(addressParam ?? null);
  const [vault, setVault] = useState<PersonalVaultRef | null>(null);
  const [resolving, setResolving] = useState(true);

  const isOwner = !!account && !!ownerAddr && account.address === ownerAddr;

  const [inventory, setInventory] = useState<VaultInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [roomsState, setRoomsState] = useState<RoomsState | null>(null);
  const roomsLoadedRef = useRef<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [chainSaving, setChainSaving] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);

  // panel + editing
  const [panelOpen, setPanelOpen] = useState(true);
  const [purchaseOpen, setPurchaseOpen] = useState(true);
  const [panelMode, setPanelMode] = useState<'arrange' | 'sell'>('arrange');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [gizmo, setGizmo] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [tMode, setTMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [instruction, setInstruction] = useState('');
  const [curating, setCurating] = useState(false);
  const [curateError, setCurateError] = useState<string | null>(null);
  const [invFilter, setInvFilter] = useState<'all' | 'still' | 'curio'>('all');
  const [invSearch, setInvSearch] = useState('');
  // selling
  const [listingId, setListingId] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState<Record<string, string>>({});
  const [listError, setListError] = useState<string | null>(null);

  const [poemIdx, setPoemIdx] = useState(0);
  const [inkOverlay, setInkOverlay] = useState(true);
  const aliveRef = useRef(true);

  const room = roomsState?.rooms.find((r) => r.id === roomsState.activeId) ?? null;

  // ── resolve owner + the single vault ────────────────────────────────
  useEffect(() => {
    if (!deployed) {
      setResolving(false);
      return;
    }
    let cancelled = false;
    setResolving(true);
    (async () => {
      let owner = addressParam ?? null;
      let v: PersonalVaultRef | null = null;
      if (vaultParam) {
        v = await read.chamber.getPersonalVault(suiClient, vaultParam);
        if (v) owner = v.owner;
      } else if (addressParam) {
        const ticket = await read.chamber.findVaultTicket(suiClient, addressParam);
        if (ticket) v = await read.chamber.getPersonalVault(suiClient, ticket.vaultId);
      }
      if (cancelled) return;
      setOwnerAddr(owner);
      setVault(v);
    })()
      .catch(() => {
        if (!cancelled) setVault(null);
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deployed, account?.address, addressParam, vaultParam, suiClient]);

  // ── owner inventory (for rendering + editing) ───────────────────────
  useEffect(() => {
    if (!ownerAddr) return;
    aliveRef.current = true;
    setLoading(true);
    getVaultInventory(ownerAddr)
      .then((server) => {
        if (!aliveRef.current) return;
        setInventory(mergeInventory(server, isOwner));
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
  }, [ownerAddr, isOwner]);

  // silent refresh (after a listing) — no loading overlay flash
  const reloadInventory = useCallback(async () => {
    if (!ownerAddr) return;
    const server = await getVaultInventory(ownerAddr, true).catch(() => null);
    if (!server || !aliveRef.current) return;
    setInventory(mergeInventory(server, isOwner));
  }, [ownerAddr, isOwner]);

  // ── load the vault's 佈置 (chain blob → local for owner → default) ───
  useEffect(() => {
    if (!vault) return;
    const vaultId = vault.vaultId;
    if (roomsLoadedRef.current === vaultId) return;
    let cancelled = false;
    (async () => {
      const pickActive = (rooms: Room[], fallback: string) =>
        roomParam && rooms.some((r) => r.id === roomParam) ? roomParam : fallback;

      if (isOwner) {
        const local = loadRooms(vaultId);
        if (local && local.rooms.length) {
          roomsLoadedRef.current = vaultId;
          setRoomsState({ ...local, activeId: pickActive(local.rooms, local.activeId) });
          return;
        }
      }
      if (vault.layoutBlobId) {
        const blob = await fetchVaultLayout(vault.layoutBlobId);
        if (cancelled) return;
        if (blob && blob.rooms.length) {
          const rooms = blob.rooms as unknown as Room[];
          const state = { activeId: pickActive(rooms, blob.activeId), rooms };
          roomsLoadedRef.current = vaultId;
          setRoomsState(state);
          if (isOwner) saveRooms(vaultId, state);
          return;
        }
      }
      if (!inventory) return; // default needs inventory to pre-select everything
      const first: Room = {
        id: newRoomId(),
        name: '佈置一',
        keys: [...inventory.stills.map((s) => s.key), ...inventory.curios.map((c) => c.key)],
        overrides: {},
        lights: {},
      };
      const state = { activeId: first.id, rooms: [first] };
      roomsLoadedRef.current = vaultId;
      setRoomsState(state);
      if (isOwner) saveRooms(vaultId, state);
    })();
    return () => {
      cancelled = true;
    };
  }, [vault, isOwner, inventory, roomParam]);

  // loading overlay cadence
  useEffect(() => {
    if (!loading && !resolving) return;
    const t = setInterval(() => setPoemIdx((i) => (i + 1) % POEMS.length), 3200);
    return () => clearInterval(t);
  }, [loading, resolving]);
  useEffect(() => {
    if (!loading && !resolving) {
      setInkOverlay(false);
      return;
    }
    setInkOverlay(true);
    const t = setTimeout(() => setInkOverlay(false), 4200);
    return () => clearTimeout(t);
  }, [loading, resolving]);

  const firstTouchRef = useRef(false);
  const handleFirstPointer = useCallback(() => {
    unlockAudio();
    if (!firstTouchRef.current) {
      firstTouchRef.current = true;
      playPluck(146.8, 0.07);
    }
  }, []);

  const updateRoom = useCallback(
    (mutate: (r: Room) => Room) => {
      setRoomsState((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          rooms: prev.rooms.map((r) => (r.id === prev.activeId ? mutate(r) : r)),
        };
        if (vault) saveRooms(vault.vaultId, next);
        return next;
      });
      setDirty(true);
    },
    [vault],
  );

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
    const propElements: SceneElement[] = (room.props ?? []).map((p) => ({
      kind: p.kind as SceneElement['kind'],
      pos: p.pos,
      yaw: p.yaw ?? 0,
      scale: p.scale ?? 1,
    }));
    return {
      characterId: ownerAddr ?? '',
      avatars: [],
      params: null,
      design: { ...base, elements: [...elements, ...propElements] },
    };
  }, [inventory, room, ownerAddr, isDark]);

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
    updateRoom((r) => ({ ...r, overrides: {}, lights: {}, props: undefined, note: undefined }));
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

  const switchRoom = useCallback(
    (id: string) => {
      setEditingName(false);
      setRoomsState((prev) => {
        if (!prev) return prev;
        const next = { ...prev, activeId: id };
        if (vault && isOwner) saveRooms(vault.vaultId, next);
        return next;
      });
      setSelected(null);
      setGizmo(false);
      if (vault && typeof window !== 'undefined') {
        window.history.replaceState({}, '', `/chamber?vault=${vault.vaultId}&room=${id}`);
      }
    },
    [vault, isOwner],
  );

  // ＋新增佈置 — duplicate the active arrangement under a default name (no modal).
  const addRoom = useCallback(() => {
    setRoomsState((prev) => {
      if (!prev) return prev;
      const active = prev.rooms.find((r) => r.id === prev.activeId);
      const dup: Room = {
        id: newRoomId(),
        name: `佈置${CN_NUM[prev.rooms.length] ?? prev.rooms.length + 1}`,
        keys: [...(active?.keys ?? [])],
        overrides: { ...(active?.overrides ?? {}) },
        lights: { ...(active?.lights ?? {}) },
        props: active?.props ? [...active.props] : undefined,
        note: active?.note,
      };
      const next = { activeId: dup.id, rooms: [...prev.rooms, dup] };
      if (vault) saveRooms(vault.vaultId, next);
      return next;
    });
    setDirty(true);
    setSelected(null);
  }, [vault]);

  // inline rename
  const startRename = useCallback(() => {
    if (!room) return;
    setNameDraft(room.name);
    setEditingName(true);
  }, [room]);
  const commitName = useCallback(() => {
    const n = nameDraft.trim();
    if (n) updateRoom((r) => ({ ...r, name: n }));
    setEditingName(false);
  }, [nameDraft, updateRoom]);

  const shareRoom = useCallback(() => {
    if (!vault || !room || typeof window === 'undefined') return;
    const url = `${window.location.origin}/chamber?vault=${vault.vaultId}&room=${room.id}`;
    const done = (msg: string) => {
      setShareNote(msg);
      setTimeout(() => setShareNote(null), 2600);
    };
    navigator.clipboard?.writeText(url).then(
      () => done(dirty ? '已複製連結 · 記得先「鏈上保存」訪客才看得到' : '已複製分享連結'),
      () => done(url),
    );
  }, [vault, room, dirty]);

  // ── chain: create vault / save layout / list still ──────────────────
  const createVault = useCallback(
    async (firstRoomName: string) => {
      if (!account) {
        setChainError('請先連結錢包');
        return;
      }
      setChainError(null);
      setCreating(true);
      try {
        const first: Room = {
          id: newRoomId(),
          name: firstRoomName || '佈置一',
          keys: inventory
            ? [...inventory.stills.map((s) => s.key), ...inventory.curios.map((c) => c.key)]
            : [],
          overrides: {},
          lights: {},
        };
        const state: RoomsState = { activeId: first.id, rooms: [first] };
        const blob = serializeVaultLayout({ activeId: state.activeId, rooms: state.rooms });
        const uploaded = await uploadVaultLayout(blob);
        const initialLayoutBlobId = uploaded.ok ? uploaded.blobId ?? null : null;

        const tx = new Transaction();
        tx.add(endlessTx.chamber.createVault({ initialLayoutBlobId }));
        const res = await signAndExecute({ transaction: tx });
        const full = await suiClient.waitForTransaction({
          digest: res.digest,
          options: { showEffects: true },
        });
        if (full.effects?.status?.status !== 'success') {
          throw new Error(full.effects?.status?.error ?? '建立藏閣失敗');
        }
        const ticket = await read.chamber.findVaultTicket(suiClient, account.address);
        const v = ticket ? await read.chamber.getPersonalVault(suiClient, ticket.vaultId) : null;
        if (v) {
          roomsLoadedRef.current = v.vaultId;
          saveRooms(v.vaultId, state);
          setVault(v);
          setRoomsState(state);
          setDirty(false);
          if (typeof window !== 'undefined') {
            window.history.replaceState({}, '', `/chamber?vault=${v.vaultId}&room=${first.id}`);
          }
        }
      } catch (err) {
        setChainError(err instanceof Error ? err.message : String(err));
      } finally {
        setCreating(false);
      }
    },
    [account, inventory, signAndExecute, suiClient],
  );

  const saveToChain = useCallback(async () => {
    if (!roomsState || !vault) return;
    setChainError(null);
    setChainSaving(true);
    try {
      const blob = serializeVaultLayout({
        activeId: roomsState.activeId,
        rooms: roomsState.rooms as unknown as VaultLayoutRoom[],
      });
      const uploaded = await uploadVaultLayout(blob);
      if (!uploaded.ok || !uploaded.blobId) throw new Error(uploaded.error ?? '佈局上傳 Walrus 失敗');
      const tx = new Transaction();
      tx.add(endlessTx.chamber.saveLayout({ vault: vault.vaultId, blobId: uploaded.blobId }));
      const res = await signAndExecute({ transaction: tx });
      const full = await suiClient.waitForTransaction({
        digest: res.digest,
        options: { showEffects: true },
      });
      if (full.effects?.status?.status !== 'success') {
        throw new Error(full.effects?.status?.error ?? '鏈上保存失敗');
      }
      const v = await read.chamber.getPersonalVault(suiClient, vault.vaultId);
      if (v) setVault(v);
      setDirty(false);
    } catch (err) {
      setChainError(err instanceof Error ? err.message : String(err));
    } finally {
      setChainSaving(false);
    }
  }, [roomsState, vault, signAndExecute, suiClient]);

  const listStill = useCallback(
    async (stillId: string) => {
      if (!account || !vault) return;
      const priceSui = Number(priceDraft[stillId] ?? '');
      if (!(priceSui > 0)) {
        setListError('請輸入有效價格');
        return;
      }
      setListError(null);
      setListingId(stillId);
      try {
        const cap = await read.chamber.findKioskOwnerCap(suiClient, account.address, vault.kioskId);
        if (!cap) throw new Error('找不到此藏閣的 KioskOwnerCap');
        const tx = new Transaction();
        endlessTx.still.placeAndList(tx, {
          kiosk: vault.kioskId,
          kioskCap: cap,
          still: stillId,
          priceMist: BigInt(Math.round(priceSui * 1e9)),
        });
        const res = await signAndExecute({ transaction: tx });
        const full = await suiClient.waitForTransaction({
          digest: res.digest,
          options: { showEffects: true },
        });
        if (full.effects?.status?.status !== 'success') {
          throw new Error(full.effects?.status?.error ?? '上架失敗');
        }
        setPriceDraft((p) => {
          const n = { ...p };
          delete n[stillId];
          return n;
        });
        await reloadInventory();
      } catch (err) {
        setListError(err instanceof Error ? err.message : String(err));
      } finally {
        setListingId(null);
      }
    },
    [account, vault, priceDraft, signAndExecute, suiClient, reloadInventory],
  );

  // AI 策展
  const runCurate = useCallback(async () => {
    if (!inventory || !room) return;
    setCurating(true);
    setCurateError(null);
    const selectedKeys = new Set(room.keys);
    const items = [
      ...inventory.stills.map((s) => ({ key: s.key, title: s.title, type: 'still' as const, selected: selectedKeys.has(s.key) })),
      ...inventory.curios.map((c) => ({ key: c.key, title: c.title, type: 'curio' as const, selected: selectedKeys.has(c.key) })),
    ];
    const current = layout?.design?.elements
      .map((el, i) => ({ el, k: elKey(el, i) }))
      .filter(({ el, k }) => selectedKeys.has(k) && (el.kind === 'display_still' || el.kind === 'display_curio'))
      .map(({ el, k }) => ({ key: k, pos: el.pos, yaw: el.yaw ?? 0, scale: el.scale ?? 1 }));
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
    const arrangementKeys = res.result.arrangement.map((a) => a.key);
    const finalKeys = res.result.selectedKeys
      ? [...new Set([...res.result.selectedKeys, ...arrangementKeys])]
      : undefined;
    updateRoom((r) => ({
      ...r,
      keys: finalKeys ?? r.keys,
      overrides: { ...r.overrides, ...overrides },
      lights: { ...r.lights, ...lights },
      ...(res.result!.props?.length ? { props: res.result!.props } : {}),
      note: res.result!.note,
    }));
    setSelected(null);
    if (audioUnlocked()) playRevealMotif();
    setCurating(false);
  }, [inventory, room, layout, instruction, updateRoom]);

  const exhibitedCount = room?.keys.length ?? 0;
  const busyOverlay = resolving || loading;
  const sellable = inventory ? inventory.stills.filter((s) => s.key.startsWith(CHAIN_KEY)) : [];

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

  // ── gates ───────────────────────────────────────────────────────────
  if (!deployed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-canvas p-6">
        <p className="text-sm tracking-widest text-mute">合約尚未部署，藏閣暫不可用。</p>
      </div>
    );
  }

  const showMintGate =
    !resolving && !vault && (isOwner || (!account && !vaultParam && !!addressParam));
  if (showMintGate) {
    return (
      <CreateVaultGate busy={creating} error={chainError} needsWallet={!account} onCreate={createVault} />
    );
  }

  const rooms = roomsState?.rooms ?? [];

  return (
    <div
      className="relative h-full w-full overflow-hidden bg-[#e9e2d2] dark:bg-[#07080c]"
      onPointerDownCapture={handleFirstPointer}
    >
      <div className="absolute inset-0">
        <ChamberCanvas
          style={{ width: '100%', height: '100%' }}
          layout={layout ?? undefined}
          cinematic={!(gizmo && isOwner)}
          editable={gizmo && isOwner}
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
        <Link href="/" className={UI.pill}>
          ← 返回
        </Link>
      </div>
      <div className="absolute right-5 top-4 z-20 flex items-center gap-2">
        <span className={['rounded-full px-3 py-1 text-[10px] backdrop-blur-md', UI.chip].join(' ')}>
          鏈上 v{vault?.layoutVersion ?? 0}
          {isOwner && dirty ? ' · 未保存' : ''}
        </span>
        {isOwner ? (
          <>
            <button
              type="button"
              onClick={() => {
                setGizmo((v) => {
                  if (v) setSelected(null);
                  return !v;
                });
              }}
              disabled={!layout}
              className={[UI.pill, gizmo ? UI.pillActive : ''].join(' ')}
            >
              {gizmo ? '完成布局' : '布局'}
            </button>
            <button
              type="button"
              onClick={() => setPanelOpen((v) => !v)}
              className={[UI.pill, panelOpen ? UI.pillActive : ''].join(' ')}
            >
              展品庫
            </button>
          </>
        ) : (
          <>
            <span className={['rounded-full px-3 py-1 text-xs backdrop-blur-md', UI.chip].join(' ')}>訪客</span>
            {vault ? (
              <button
                type="button"
                onClick={() => setPurchaseOpen((v) => !v)}
                className={[UI.pill, purchaseOpen ? UI.pillActive : ''].join(' ')}
              >
                購買面板
              </button>
            ) : null}
          </>
        )}
      </div>

      {/* 佈置 switcher — shared by owner + visitor; owner gets inline rename + ＋ + 分享 */}
      {rooms.length > 0 ? (
        <div className="absolute left-5 top-16 z-20 flex max-w-[52vw] items-center gap-1.5 overflow-x-auto rounded-full border border-[#3a332a]/15 bg-[#fbf7ec]/70 px-2 py-1.5 backdrop-blur-md dark:border-white/12 dark:bg-black/30">
          {rooms.map((r) =>
            isOwner && editingName && r.id === roomsState?.activeId ? (
              <input
                key={r.id}
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitName();
                  else if (e.key === 'Escape') setEditingName(false);
                }}
                maxLength={24}
                className={['w-28 shrink-0 rounded-full border px-3 py-1 text-xs focus:outline-none focus:ring-1', UI.input].join(' ')}
              />
            ) : (
              <button
                key={r.id}
                type="button"
                onClick={() => (r.id === roomsState?.activeId && isOwner ? startRename() : switchRoom(r.id))}
                title={r.id === roomsState?.activeId && isOwner ? '點一下改名' : undefined}
                className={['shrink-0 rounded-full px-3 py-1 text-xs transition-colors', r.id === roomsState?.activeId ? UI.tabOn : UI.tabOff].join(' ')}
              >
                {r.name}
              </button>
            ),
          )}
          {isOwner ? (
            <>
              <button
                type="button"
                onClick={addRoom}
                title="新增佈置（複製目前佈置再改）"
                className={['shrink-0 rounded-full px-2.5 py-1 text-xs transition-colors', UI.tabOff].join(' ')}
              >
                ＋
              </button>
              <span className="mx-0.5 h-4 w-px shrink-0 bg-[#3a332a]/20 dark:bg-white/20" />
              <button
                type="button"
                onClick={shareRoom}
                title="複製此佈置的分享連結"
                className={['shrink-0 rounded-full px-2.5 py-1 text-xs transition-colors', UI.tabOff].join(' ')}
              >
                ⤴ 分享
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {shareNote ? (
        <div className="absolute left-5 top-28 z-30 max-w-[52vw]">
          <p className="rounded-full border border-[#a03226]/40 bg-surface/95 px-4 py-1.5 text-[11px] tracking-widest text-cinnabar shadow-lg backdrop-blur-md">
            {shareNote}
          </p>
        </div>
      ) : null}

      {/* 畫題 + 印章 */}
      <div className="pointer-events-none absolute bottom-24 left-7 z-20 flex items-start gap-3">
        <h1
          style={{ writingMode: 'vertical-rl' }}
          className="font-serif text-2xl leading-snug tracking-[0.4em] text-[#3a332a]/95 drop-shadow-[0_1px_6px_rgba(255,250,238,0.6)] dark:text-white/95 dark:drop-shadow-[0_2px_10px_rgba(0,0,0,0.65)]"
        >
          {room?.name ?? '我的藏閣'}
        </h1>
        <span className="grid h-9 w-9 rotate-2 place-items-center rounded-[3px] bg-[#a03226] font-serif text-lg leading-none text-[#f3e7d3] shadow-lg">
          藏
        </span>
      </div>

      {/* 策展語 */}
      {room?.note && !gizmo ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-32">
          <p className="max-w-xl text-center text-xs leading-relaxed tracking-widest text-[#4a4136]/85 dark:text-white/65 dark:drop-shadow">
            策展語：{room.note}
          </p>
        </div>
      ) : null}

      {/* 自由布局 toolbar (owner) */}
      {isOwner && gizmo ? (
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
                className={['rounded-full px-3 py-1 text-xs transition-colors', tMode === m ? UI.tabOn : UI.tabOff].join(' ')}
              >
                {m === 'translate' ? '移動' : m === 'rotate' ? '旋轉' : '縮放'}
              </button>
            ))}
            <span className="h-5 w-px bg-[#3a332a]/20 dark:bg-white/20" />
            <button type="button" onClick={resetLayout} className={['rounded-full px-3 py-1 text-xs transition-colors', UI.tabOff].join(' ')}>
              還原
            </button>
            <button
              type="button"
              onClick={saveToChain}
              disabled={chainSaving || !roomsState}
              className={['rounded-full px-3 py-1 text-xs transition-colors disabled:opacity-40', UI.aiBtn].join(' ')}
            >
              {chainSaving ? '上鏈中…' : '鏈上保存'}
            </button>
          </div>
        </div>
      ) : null}

      {chainError ? (
        <div className="absolute inset-x-0 top-[8.5rem] z-30 flex justify-center px-6">
          <p className="max-w-md rounded-lg border border-cinnabar/40 bg-surface/95 px-4 py-2 text-center text-xs text-cinnabar shadow-lg backdrop-blur-md">
            {chainError}
          </p>
        </div>
      ) : null}

      {/* 訪客購買面板（可收合） */}
      {!isOwner && vault && purchaseOpen ? (
        <PurchasePanel kioskId={vault.kioskId} vaultName={room?.name} />
      ) : null}

      {/* 訪客 — 空藏閣提示 */}
      {!isOwner && !vault && !resolving ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <p className="rounded-lg border border-hairline bg-surface/90 px-5 py-3 text-sm tracking-widest text-mute shadow-lg backdrop-blur-md">
            此地址尚無藏閣。
          </p>
        </div>
      ) : null}

      {/* owner 展品庫 */}
      {isOwner && panelOpen ? (
        <aside
          className={['absolute bottom-20 right-5 top-20 z-20 flex w-[23rem] flex-col overflow-hidden rounded-xl border shadow-2xl backdrop-blur-xl', UI.panel].join(' ')}
        >
          {/* 卷首 — title + mode toggle */}
          <div className={['border-b px-4 pb-3 pt-4', UI.hairline].join(' ')}>
            <div className="flex items-center justify-between">
              <div className="inline-flex rounded-full bg-[#3a332a]/8 p-0.5 dark:bg-white/8">
                {(['arrange', 'sell'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPanelMode(m)}
                    className={['rounded-full px-3 py-1 text-xs transition-colors', panelMode === m ? UI.tabOn : 'text-[#6b5f4e]/80 dark:text-white/55'].join(' ')}
                  >
                    {m === 'arrange' ? '布展' : '販售'}
                  </button>
                ))}
              </div>
              {panelMode === 'arrange' ? (
                <span className={['text-[10px] tracking-widest', UI.mute].join(' ')}>{exhibitedCount} 件展出</span>
              ) : (
                <span className={['text-[10px] tracking-widest', UI.mute].join(' ')}>{sellable.length} 張可上架</span>
              )}
            </div>
            {panelMode === 'arrange' ? (
              <button
                type="button"
                onClick={saveToChain}
                disabled={chainSaving || !roomsState || !dirty}
                className={['mt-3 w-full rounded-full border px-4 py-1.5 text-xs transition-colors disabled:opacity-40', UI.aiBtn].join(' ')}
              >
                {chainSaving ? '上鏈中…' : dirty ? '鏈上保存（所有佈置）' : '已是最新'}
              </button>
            ) : null}
          </div>

          {panelMode === 'arrange' ? (
            <>
              {/* 篩選列 */}
              <div className={['border-b px-3 pb-2 pt-2', UI.hairline].join(' ')}>
                <div className="flex items-center gap-1.5">
                  {(['all', 'still', 'curio'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setInvFilter(f)}
                      className={['rounded-full px-2.5 py-0.5 text-[11px] transition-colors', invFilter === f ? UI.tabOn : UI.tabOff].join(' ')}
                    >
                      {f === 'all' ? '全部' : f === 'still' ? '劇照' : '珍玩'}
                    </button>
                  ))}
                  <input
                    type="search"
                    value={invSearch}
                    onChange={(e) => setInvSearch(e.target.value)}
                    placeholder="搜尋…"
                    className={['ml-auto w-24 rounded-md border px-2 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:w-32 transition-all', UI.input].join(' ')}
                  />
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                <p className={['mb-2 px-1 text-[10px] tracking-widest', UI.mute].join(' ')}>
                  勾選展出{gizmo ? ' · 點列可選取調整' : ''}
                </p>
                {loading ? (
                  <p className={['px-1 text-sm', UI.soft].join(' ')}>啟封中…</p>
                ) : inventory ? (
                  filteredInventoryItems.length === 0 ? (
                    <p className={['px-1 text-xs', UI.mute].join(' ')}>{invSearch ? '沒有符合的展品' : '此分類沒有展品'}</p>
                  ) : (
                    <ol className="flex flex-col gap-1.5">
                      {filteredInventoryItems.map((it) => {
                        const checked = room?.keys.includes(it.key) ?? false;
                        const idx = layout?.design?.elements.findIndex((el, i) => elKey(el, i) === it.key);
                        const isSel = gizmo && selected != null && idx === selected;
                        const isStill = 'url' in it;
                        return (
                          <li
                            key={it.key}
                            className={['flex items-center gap-2.5 rounded-lg border p-2 text-xs transition-colors', gizmo && checked ? 'cursor-pointer' : '', isSel ? UI.rowSelected : UI.row, !checked ? 'opacity-55' : ''].join(' ')}
                            onClick={gizmo && checked && idx != null && idx >= 0 ? () => setSelected(idx) : undefined}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleItem(it.key)}
                              onClick={(e) => e.stopPropagation()}
                              className={UI.checkbox}
                            />
                            {isStill ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={(it as { url: string }).url} alt={it.title} loading="lazy" className="h-12 w-12 shrink-0 rounded-md border border-black/20 object-cover" />
                            ) : (
                              <span className={['grid h-12 w-12 shrink-0 place-items-center rounded-md font-serif text-xl', UI.glyphTile].join(' ')}>
                                {CURIO_GLYPH[(it as { tag?: string }).tag ?? ''] ?? '玩'}
                              </span>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-2">
                                <span className={['truncate font-serif text-[13px]', UI.strong].join(' ')}>{it.title}</span>
                                <span className={['shrink-0 text-[10px]', UI.accent].join(' ')}>{isStill ? '劇照' : '珍玩'}</span>
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
                  className={['w-full resize-none rounded-md border p-2 text-xs focus:outline-none focus:ring-1', UI.input].join(' ')}
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className={['min-w-0 truncate text-[10px]', UI.mute].join(' ')}>
                    {curating ? '策展人佈展中…' : curateError ? curateError : 'AI 擺位＋逐件配燈'}
                  </span>
                  <button
                    type="button"
                    onClick={runCurate}
                    disabled={curating || loading || allInventoryItems.length === 0}
                    className={['shrink-0 rounded-full border px-4 py-1.5 text-xs transition-colors disabled:opacity-40', UI.aiBtn].join(' ')}
                  >
                    ✨ AI 佈置
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* ── 販售 mode ── */
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <p className={['mb-2 px-1 text-[10px] leading-relaxed tracking-widest', UI.mute].join(' ')}>
                挑一張鏈上劇照標價上架，訪客開此藏閣的分享連結即可用 SUI 購買。
              </p>
              {sellable.length === 0 ? (
                <p className={['px-1 text-xs leading-relaxed', UI.mute].join(' ')}>
                  錢包裡還沒有鏈上劇照。先到任一角色的設定集「收進藏閣」鑄一張,即可在此上架。
                </p>
              ) : (
                <ol className="flex flex-col gap-1.5">
                  {sellable.map((s) => {
                    const stillId = s.key.slice(CHAIN_KEY.length);
                    const busy = listingId === stillId;
                    return (
                      <li key={s.key} className={['flex items-center gap-2.5 rounded-lg border p-2 text-xs', UI.row].join(' ')}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.url} alt={s.title} loading="lazy" className="h-12 w-12 shrink-0 rounded-md border border-black/20 object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className={['truncate font-serif text-[13px]', UI.strong].join(' ')}>{s.title}</p>
                          <p className={['mt-0.5 truncate', UI.mute].join(' ')}>{s.subtitle}</p>
                        </div>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={priceDraft[stillId] ?? ''}
                          onChange={(e) => setPriceDraft((p) => ({ ...p, [stillId]: e.target.value }))}
                          placeholder="SUI"
                          className={['w-16 shrink-0 rounded-md border px-2 py-1 text-[11px] focus:outline-none focus:ring-1', UI.input].join(' ')}
                        />
                        <button
                          type="button"
                          onClick={() => listStill(stillId)}
                          disabled={busy}
                          className={['shrink-0 rounded-full border px-3 py-1 text-[11px] transition-colors disabled:cursor-wait disabled:opacity-50', UI.aiBtn].join(' ')}
                        >
                          {busy ? '上架中…' : '上架'}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
              {listError ? <p className="mt-3 px-1 text-xs tracking-widest text-cinnabar">{listError}</p> : null}
            </div>
          )}
        </aside>
      ) : null}

      {/* opening overlay */}
      {busyOverlay && inkOverlay ? (
        <div className="absolute inset-0 z-40 overflow-hidden transition-opacity duration-700">
          <InkFluid className="absolute inset-0" />
          <div className="absolute inset-0 grid place-items-center">
            <div
              className="flex flex-col items-center gap-4 rounded-full px-10 py-6"
              style={{ background: 'radial-gradient(60% 60% at 50% 50%, rgb(var(--color-canvas) / 0.42), transparent 78%)' }}
            >
              <p className="font-serif text-base tracking-[0.4em] text-ink" style={{ textShadow: '0 1px 12px rgb(var(--color-canvas) / 0.7)' }}>
                {POEMS[poemIdx]}
              </p>
              <p className="text-xs tracking-wider text-mute" style={{ textShadow: '0 1px 10px rgb(var(--color-canvas) / 0.7)' }}>
                啟封藏閣…
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
