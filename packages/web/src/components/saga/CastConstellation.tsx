'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type {
  Character,
  CharacterLiveState,
  RelationshipEdge,
  RelationshipTone,
  SagaLocation,
  Scene,
} from '@endless-story/shared';
import { characterPortraitTone } from '@/components/common/CharacterPortrait';
import { BlobImage } from '@/components/common/BlobImage';
import { SCENE_POSITIONS } from './sceneLayout';

/**
 * 春雪社人物方位圖（平面 / 俯瞰）— 與手卷同一個鏈上世界，但換成俯視。
 *
 *  · 一張方形 saga 平面 — 上半 戲樓 zone、下半 院落 zone，中段橫向隔牆有月洞門。
 *  · 每個 scene 是一間「房」，依 SCENE_POSITIONS 標位。
 *  · 每個角色（cast / wild）依其當下 currentScene 擺進房裡（多人聚成小團）。
 *  · 沒有 currentScene 但有 liveState.location 的角色 → 擺在 saga 牆外，帶上他的「現在在」標籤
 *    例：譚四郎 在永聲社後巷、江老闆 此刻坐在 主台第七排（→ 落在 saga 內了！）。
 *  · 邊線（牽絆）一樣是墨筆曲線 — 跨牆的線在視覺上立即可見。
 */

const VIEWBOX_W = 1200;
const VIEWBOX_H = 800;
const SAGA = { x: 200, y: 100, w: 800, h: 600 };
const WALL_Y = SAGA.y + SAGA.h / 2; // 戲樓 / 院落 分隔
const MOON_DOOR = { x1: 560, x2: 640, cx: 600, r: 40 };
const CAST_NODE_PX_CENTER = 76;
const CAST_NODE_PX_OTHER = 60;
const WILD_NODE_PX = 48;

type Zone = 'theater' | 'compound' | 'outside';

interface PositionedCharacter {
  char: Character;
  x: number;
  y: number;
  /** saga 內哪個 scene；外人 = null */
  scene: Scene | null;
  /** liveState.location 字串 — 外人專用 */
  externalLabel?: string;
  kind: 'center' | 'cast' | 'wild';
}

const TONE_COLOR: Record<RelationshipTone, string> = {
  affection: 'rgb(var(--color-cinnabar))',
  romance: 'rgb(var(--color-cinnabar))',
  mentorship: 'rgb(var(--color-jade))',
  rivalry: 'rgb(var(--color-cinnabar))',
  wary: 'rgb(var(--color-mute))',
  tension: 'rgb(var(--color-cinnabar))',
  estrangement: 'rgb(var(--color-mute))',
  acquaintance: 'rgb(var(--color-jade))',
  neutral: 'rgb(var(--color-hairline))',
};

const TONE_DASH: Record<RelationshipTone, string> = {
  affection: '',
  romance: '',
  mentorship: '',
  rivalry: '',
  wary: '2 5',
  tension: '',
  estrangement: '1 6',
  acquaintance: '4 4',
  neutral: '',
};

const TONE_LABEL: Record<RelationshipTone, string> = {
  affection: '親近',
  romance: '戀慕',
  mentorship: '師承',
  rivalry: '競爭',
  wary: '戒備',
  tension: '緊張',
  estrangement: '疏離',
  acquaintance: '故舊',
  neutral: '平淡',
};

function useIsDark() {
  const [isDark, setIsDark] = useState(false);
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

export function CastConstellation({
  cast,
  wildCast = [],
  edges,
  scenes = [],
  locations = [],
  liveStatesById = {},
  centerId: centerIdProp,
}: {
  cast: Character[];
  wildCast?: Character[];
  edges: RelationshipEdge[];
  scenes?: Scene[];
  locations?: SagaLocation[];
  liveStatesById?: Record<string, CharacterLiveState>;
  /** 指定主角節點（放大）。不給或不在 cast 內 → 自動挑牽絆最多的那位。 */
  centerId?: string;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const isDark = useIsDark();
  const ink = (a: number) => (isDark ? `rgba(220, 206, 176, ${a})` : `rgba(40, 38, 44, ${a})`);

  // ── 防禦性去重 ──
  const uniqCast = useMemo(() => dedupeById(cast), [cast]);
  const uniqWildCast = useMemo(() => {
    const castIds = new Set(uniqCast.map((c) => c.id));
    return dedupeById(wildCast).filter((c) => !castIds.has(c.id));
  }, [wildCast, uniqCast]);
  const uniqEdges = useMemo(() => dedupeEdges(edges), [edges]);

  // 主角節點：用呼叫端指定且確實在 cast 裡的；否則挑牽絆最多的那位放大。
  // （舊版寫死 char_shen_huaiyin，換 saga 後沒有任何節點被當主角。）
  const centerId = useMemo(() => {
    if (centerIdProp && uniqCast.some((c) => c.id === centerIdProp)) return centerIdProp;
    const castIds = new Set(uniqCast.map((c) => c.id));
    const deg = new Map<string, number>();
    for (const e of uniqEdges) {
      if (castIds.has(e.fromId)) deg.set(e.fromId, (deg.get(e.fromId) ?? 0) + 1);
      if (castIds.has(e.toId)) deg.set(e.toId, (deg.get(e.toId) ?? 0) + 1);
    }
    let best = uniqCast[0]?.id;
    let bestN = -1;
    for (const c of uniqCast) {
      const d = deg.get(c.id) ?? 0;
      if (d > bestN) {
        bestN = d;
        best = c.id;
      }
    }
    return best;
  }, [centerIdProp, uniqCast, uniqEdges]);

  // scene 所屬 zone（由 location name 推）
  const sceneZoneById = useMemo(() => {
    const locZone = new Map<string, Zone>();
    for (const loc of locations) {
      if (loc.name.includes('戲樓') || /theater|stage/i.test(loc.name)) locZone.set(loc.id, 'theater');
      else if (loc.name.includes('院落') || /compound|courtyard/i.test(loc.name)) locZone.set(loc.id, 'compound');
    }
    return new Map<string, Zone>(
      scenes.map((s) => [s.id, (s.locationId ? locZone.get(s.locationId) : undefined) ?? 'outside'])
    );
  }, [scenes, locations]);

  // 每角色的場景出現史 — 給 hover panel 「常駐之地」
  const charScenesById = useMemo(() => {
    const map = new Map<string, { scene: Scene; weight: number; zone: Zone }[]>();
    for (const ch of [...uniqCast, ...uniqWildCast]) {
      const out: { scene: Scene; weight: number; zone: Zone }[] = [];
      for (const s of scenes) {
        const inCurrent = s.currentCharacterIds.includes(ch.id);
        const quoteCount = s.ghostQuotes?.filter((q) => q.characterId === ch.id).length ?? 0;
        const w = (inCurrent ? 2 : 0) + quoteCount;
        if (w > 0) out.push({ scene: s, weight: w, zone: sceneZoneById.get(s.id) ?? 'outside' });
      }
      out.sort((a, b) => b.weight - a.weight);
      map.set(ch.id, out);
    }
    return map;
  }, [uniqCast, uniqWildCast, scenes, sceneZoneById]);

  // currentScene by char — 鏈上「現在在」投影
  const currentSceneByCharId = useMemo(() => {
    const map = new Map<string, Scene>();
    for (const s of scenes) {
      for (const cid of s.currentCharacterIds) {
        if (!map.has(cid)) map.set(cid, s);
      }
    }
    return map;
  }, [scenes]);

  if (uniqCast.length === 0) {
    return (
      <section className="relative flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-hidden bg-canvas">
        <ConstellationBackdrop ink={ink} />

        {/* 標題 — 與有資料時一致 */}
        <div className="pointer-events-none absolute left-[max(1.25rem,env(safe-area-inset-left))] top-[max(5rem,calc(env(safe-area-inset-top,0px)+4.75rem))] z-20 sm:left-10 sm:top-24">
          <div className="flex items-center gap-4">
            <div className="h-px w-8 bg-cinnabar/60" />
            <h2 className="font-serif text-3xl tracking-[0.25em] text-ink drop-shadow-sm sm:text-4xl">人物方位</h2>
          </div>
        </div>

        <div className="relative z-10 flex max-w-sm flex-col items-center gap-3 px-8 text-center">
          <p className="font-serif text-base tracking-[0.3em] text-ink/80 sm:text-lg">名冊未錄一人</p>
          <p className="text-2xs leading-relaxed tracking-[0.2em] text-mute/80 sm:text-xs">
            此卷尚無人物登場。待春雪社的角色入冊，方位圖便會在此鋪展。
          </p>
        </div>
      </section>
    );
  }

  // ── 排版 ──
  //
  // 兩條獨立資料源（跟 SagaHandscroll 同 pattern，不互為 fallback）：
  //   - chain scene: 帶著 posX / posY (% of saga box)
  //   - mock scene : 沒 pos，靠 sceneLayout.ts 的 slug 字典
  // 兩條都拿不到就回 null，角色 fallback 到 placeExternal 擺在 saga 牆外。
  const scenePlanXY = (scene: Scene): { x: number; y: number } | null => {
    if (scene.posX != null && scene.posY != null) {
      return {
        x: SAGA.x + (scene.posX / 100) * SAGA.w,
        y: SAGA.y + (scene.posY / 100) * SAGA.h,
      };
    }
    const pos = SCENE_POSITIONS[scene.id];
    if (!pos) return null;
    return {
      x: SAGA.x + (pos.x / 100) * SAGA.w,
      y: SAGA.y + (pos.y / 100) * SAGA.h,
    };
  };

  // 把每個 scene 在房間裡的人收齊，方便算 jitter
  const sceneOccupants = new Map<string, string[]>();
  for (const ch of [...uniqCast, ...uniqWildCast]) {
    const sc = currentSceneByCharId.get(ch.id);
    if (!sc) continue;
    const list = sceneOccupants.get(sc.id) ?? [];
    list.push(ch.id);
    sceneOccupants.set(sc.id, list);
  }

  const positioned: PositionedCharacter[] = [];

  const placeInScene = (char: Character, scene: Scene, kind: PositionedCharacter['kind']) => {
    const base = scenePlanXY(scene);
    if (!base) return null;
    const occupants = sceneOccupants.get(scene.id) ?? [char.id];
    const idx = occupants.indexOf(char.id);
    const n = occupants.length;
    let ox = 0, oy = 0;
    if (n > 1) {
      const angle = (idx / n) * Math.PI * 2 - Math.PI / 2;
      const r = 30;
      ox = Math.cos(angle) * r;
      oy = Math.sin(angle) * r;
    }
    positioned.push({ char, x: base.x + ox, y: base.y + oy, scene, kind });
    return positioned[positioned.length - 1];
  };

  // 預計算 cast 連 wild 的方向（給外人擺位用）
  const castIds = new Set(uniqCast.map((c) => c.id));
  const wildPrimaryCast = new Map<string, string>(); // wildId → strongest cast id
  for (const e of uniqEdges) {
    const wildId = uniqWildCast.find((w) => w.id === e.fromId || w.id === e.toId)?.id;
    if (!wildId) continue;
    const sagaId = e.fromId === wildId ? e.toId : e.fromId;
    if (!castIds.has(sagaId)) continue;
    const prev = wildPrimaryCast.get(wildId);
    if (!prev) wildPrimaryCast.set(wildId, sagaId);
  }

  // 外圍象限佔位（避免外人重疊）
  const usedExternalSlots = new Set<string>();
  const placeExternal = (char: Character, anchorId: string | undefined, kind: PositionedCharacter['kind']) => {
    // 由 anchor cast 在 saga 中心的相對位置算朝外方向
    let baseAngle = -Math.PI / 2; // default = above
    if (anchorId) {
      const anchorPos = positioned.find((p) => p.char.id === anchorId);
      if (anchorPos) {
        baseAngle = Math.atan2(anchorPos.y - (SAGA.y + SAGA.h / 2), anchorPos.x - (SAGA.x + SAGA.w / 2));
      }
    }
    // jitter to avoid collisions
    let angle = baseAngle;
    let key = Math.round((angle * 180) / Math.PI / 20) * 20;
    while (usedExternalSlots.has(String(key))) {
      angle += Math.PI / 9;
      key = Math.round((angle * 180) / Math.PI / 20) * 20;
    }
    usedExternalSlots.add(String(key));
    const outR = Math.max(SAGA.w, SAGA.h) * 0.62;
    const x = SAGA.x + SAGA.w / 2 + Math.cos(angle) * outR;
    const y = SAGA.y + SAGA.h / 2 + Math.sin(angle) * outR;
    const live = liveStatesById[char.id];
    positioned.push({
      char,
      x: clamp(x, 60, VIEWBOX_W - 60),
      y: clamp(y, 60, VIEWBOX_H - 60),
      scene: null,
      externalLabel: live?.location,
      kind,
    });
  };

  // 先放 cast（按角色 id 在 currentSceneByCharId 找）
  for (const ch of uniqCast) {
    const sc = currentSceneByCharId.get(ch.id);
    const kind: PositionedCharacter['kind'] = ch.id === centerId ? 'center' : 'cast';
    if (sc) placeInScene(ch, sc, kind);
    else placeExternal(ch, undefined, kind);
  }
  // 再放 wild：若在 saga scene 裡 → 進房；否則外圍
  for (const ch of uniqWildCast) {
    const sc = currentSceneByCharId.get(ch.id);
    if (sc) placeInScene(ch, sc, 'wild');
    else placeExternal(ch, wildPrimaryCast.get(ch.id), 'wild');
  }

  // ── 去重疊 ──
  // 開場時全班常被放進同一個 scene（一條開場 storylet）。placeInScene 的小半徑
  // jitter 讓 60–76px 頭像疊成一團，房內牽絆曲線縮成藏在頭像底下的短線。做幾輪碰撞
  // 鬆弛：任兩節點靠太近就互推開，直到彼此露出、曲線有可見長度。語意（誰在哪間房）
  // 仍由初始落點承載，這裡只把擠在一起的撥開。
  relaxOverlaps(positioned);

  const posById = new Map(positioned.map((p) => [p.char.id, p]));
  const validEdges = uniqEdges.filter((e) => posById.has(e.fromId) && posById.has(e.toId));

  const hoveredEdges = hoveredId
    ? validEdges.filter((e) => e.fromId === hoveredId || e.toId === hoveredId).sort((a, b) => b.weight - a.weight)
    : [];

  const connectedIds = (() => {
    const set = new Set<string>();
    if (!hoveredId) return set;
    set.add(hoveredId);
    hoveredEdges.forEach((e) => {
      set.add(e.fromId);
      set.add(e.toId);
    });
    return set;
  })();

  const hoveredPos = hoveredId ? posById.get(hoveredId) : null;
  const hoveredTopScenes = hoveredId ? (charScenesById.get(hoveredId) ?? []).slice(0, 2) : [];
  const hoveredLive = hoveredId ? liveStatesById[hoveredId] : undefined;

  return (
    <section className="relative flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-hidden bg-canvas">
      <ConstellationBackdrop ink={ink} />

      {/* 標題 — 留白配合頂 safe-area（膠囊導覽已改至視窗底部） */}
      <div className="pointer-events-none absolute left-[max(1.25rem,env(safe-area-inset-left))] top-[max(5rem,calc(env(safe-area-inset-top,0px)+4.75rem))] z-20 sm:left-10 sm:top-24">
        <div className="flex items-center gap-4">
          <div className="h-px w-8 bg-cinnabar/60" />
          <h2 className="font-serif text-3xl tracking-[0.25em] text-ink drop-shadow-sm sm:text-4xl">人物方位</h2>
        </div>
      </div>

      {/* hover 便箋 — 上移避開視窗底部的固定膠囊；桌面靠右 */}
      <div className="pointer-events-none absolute bottom-[max(calc(env(safe-area-inset-bottom,0px)+5.75rem),6.5rem)] left-[max(1rem,env(safe-area-inset-left,0px))] right-[max(1rem,env(safe-area-inset-right,0px))] z-20 sm:right-10 sm:bottom-[max(calc(env(safe-area-inset-bottom,0px)+5.25rem),5.75rem)] sm:left-auto sm:max-w-[min(18rem,calc(100vw-6rem))] lg:right-10">
        {hoveredId && hoveredPos ? (
          <div className="w-full max-w-md rounded-2xl border border-hairline/45 bg-surface/85 px-4 py-3 shadow-2xl backdrop-blur-xl animate-fade-in-up dark:bg-elevated/85 sm:w-72 sm:px-5 sm:py-4">
            <div className="flex items-end gap-3 border-b border-hairline/40 pb-3">
              <span className="font-serif text-lg text-ink">{hoveredPos.char.name}</span>
              <span className="mb-0.5 text-2xs tracking-[0.3em] text-mute">的牽絆</span>
            </div>

            {/* 現在在 — chain state */}
            {hoveredPos.scene || hoveredPos.externalLabel ? (
              <div className="mt-3 rounded-md border border-cinnabar/30 bg-cinnabar/[0.04] px-3 py-2">
                <p className="text-2xs tracking-[0.35em] text-cinnabar/80">現在在</p>
                <p className="mt-1 font-serif text-sm text-ink/90">
                  {hoveredPos.scene
                    ? `${hoveredPos.scene.name}${hoveredPos.kind === 'wild' ? ' · 江湖中人在此' : ''}`
                    : hoveredPos.externalLabel ?? '無蹤'}
                </p>
              </div>
            ) : null}

            <ul className="mt-3 max-h-[26vh] space-y-2 overflow-y-auto overscroll-contain pr-1">
              {hoveredEdges.length > 0 ? (
                hoveredEdges.map((e) => {
                  const targetId = e.fromId === hoveredId ? e.toId : e.fromId;
                  const target = posById.get(targetId)?.char;
                  const toneLabel = e.tone ? TONE_LABEL[e.tone] : '平淡';
                  const toneColor = e.tone ? TONE_COLOR[e.tone] : TONE_COLOR.neutral;
                  return (
                    <li
                      key={`${e.fromId}::${e.toId}::${e.tone ?? 'none'}`}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="text-sm text-ink/90">{target?.name}</span>
                      <span className="text-2xs tracking-[0.3em]" style={{ color: toneColor }}>
                        {toneLabel}
                      </span>
                    </li>
                  );
                })
              ) : (
                <li className="text-xs italic text-mute">尚無深刻牽絆</li>
              )}
            </ul>

            {/* 常駐之地 — 歷史出現權重前 2 */}
            {hoveredTopScenes.length > 0 ? (
              <div className="mt-3 border-t border-hairline/35 pt-3">
                <p className="mb-1.5 text-2xs tracking-[0.35em] text-mute">常駐之地</p>
                <div className="flex flex-wrap gap-1.5">
                  {hoveredTopScenes.map(({ scene, zone }) => (
                    <span
                      key={scene.id}
                      className={`rounded border px-2 py-0.5 font-serif text-2xs tracking-widest ${
                        zone === 'theater'
                          ? 'border-cinnabar/40 text-cinnabar/90'
                          : zone === 'compound'
                            ? 'border-jade/40 text-jade'
                            : 'border-hairline/50 text-ink/80'
                      }`}
                    >
                      {scene.name}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {hoveredLive?.intent ? (
              <p className="mt-3 border-t border-hairline/35 pt-3 text-2xs italic leading-relaxed text-mute/90">
                「{hoveredLive.intent}」
              </p>
            ) : null}
          </div>
        ) : (
          <span className="sr-only">懸浮或聚焦人物節點以檢視牽絆與所在</span>
        )}
      </div>

      {/* 平面圖 */}
      {/* 平面圖 — 手機留白略增、避免緊貼邊緣 */}
      <div className="relative z-10 mx-auto w-[min(94vw,calc(100vw-3rem))] max-w-none sm:w-full sm:max-w-[calc(100vw-4rem)] lg:max-w-[calc(85vh*1.5)]">
        <div className="relative w-full" style={{ aspectRatio: `${VIEWBOX_W}/${VIEWBOX_H}` }}>
          <svg
            viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-hidden
          >
            {/* saga 外牆 */}
            <rect
              x={SAGA.x} y={SAGA.y} width={SAGA.w} height={SAGA.h}
              rx="6"
              fill="rgba(var(--color-cinnabar) / 0.025)"
              stroke={ink(0.35)} strokeWidth="1.4"
            />

            {/* 內牆（戲樓 / 院落 分隔），月洞門斷開 */}
            <line x1={SAGA.x} y1={WALL_Y} x2={MOON_DOOR.x1} y2={WALL_Y}
              stroke={ink(0.28)} strokeWidth="1.2" strokeDasharray="0" />
            <line x1={MOON_DOOR.x2} y1={WALL_Y} x2={SAGA.x + SAGA.w} y2={WALL_Y}
              stroke={ink(0.28)} strokeWidth="1.2" />
            {/* 月洞門拱 */}
            <path
              d={`M ${MOON_DOOR.x1} ${WALL_Y} A ${MOON_DOOR.r} ${MOON_DOOR.r} 0 0 1 ${MOON_DOOR.x2} ${WALL_Y}`}
              stroke={ink(0.4)} strokeWidth="1.4" fill="none"
            />
            <path
              d={`M ${MOON_DOOR.x1 + 6} ${WALL_Y} A ${MOON_DOOR.r - 6} ${MOON_DOOR.r - 6} 0 0 1 ${MOON_DOOR.x2 - 6} ${WALL_Y}`}
              stroke="rgb(var(--color-cinnabar))" strokeOpacity="0.32" strokeWidth="1" fill="none"
            />

            {/* scene 占位（淡圈，不額外標字） */}
            {scenes.map((s) => {
              const p = scenePlanXY(s);
              if (!p) return null;
              const isHovered = hoveredId && hoveredPos?.scene?.id === s.id;
              return (
                <g key={`scene-${s.id}`}>
                  <circle cx={p.x} cy={p.y} r="46"
                    fill="none"
                    stroke={ink(0.18)} strokeWidth="0.6"
                    strokeDasharray="2 4"
                    opacity={isHovered ? 0.75 : 0.4}
                  />
                </g>
              );
            })}

            {/* edges */}
            {validEdges.map((edge, idx) => {
              const from = posById.get(edge.fromId)!;
              const to = posById.get(edge.toId)!;
              const isCross = (from.scene === null) !== (to.scene === null);
              const strokeWidth = 0.6 + (edge.weight / 10) * (isCross ? 2 : 3.4);
              const stroke = edge.tone ? TONE_COLOR[edge.tone] : TONE_COLOR.neutral;
              const dash = edge.tone ? TONE_DASH[edge.tone] : '';
              const baseOpacity = isCross
                ? 0.28 + (edge.weight / 10) * 0.34
                : 0.36 + (edge.weight / 10) * 0.42;
              const finalDash = isCross && !dash ? '2 6' : dash;
              const isHovered = hoveredId ? (edge.fromId === hoveredId || edge.toId === hoveredId) : false;
              const opacity = hoveredId ? (isHovered ? Math.min(1, baseOpacity * 2.1) : 0.05) : baseOpacity;

              const midX = (from.x + to.x) / 2;
              const midY = (from.y + to.y) / 2;
              const dx = to.x - from.x;
              const dy = to.y - from.y;
              const len = Math.sqrt(dx * dx + dy * dy) || 1;
              const nx = -dy / len;
              const ny = dx / len;
              const offset = len * 0.12;
              const cx = midX + nx * offset;
              const cy = midY + ny * offset;

              return (
                <path
                  key={`${edge.fromId}::${edge.toId}::${edge.tone ?? 'none'}::${idx}`}
                  d={`M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`}
                  stroke={stroke} strokeWidth={strokeWidth}
                  strokeDasharray={finalDash || undefined}
                  strokeLinecap="round" fill="none" opacity={opacity}
                  className="transition-all duration-500"
                />
              );
            })}
          </svg>

          {/* 節點 */}
          {positioned.map((p, idx) => {
            const isDimmed = hoveredId ? !connectedIds.has(p.char.id) : false;
            return (
              <ConstellationNode
                key={`${p.char.id}::${p.kind}::${idx}`}
                positioned={p} isDimmed={isDimmed}
                onMouseEnter={() => setHoveredId(p.char.id)}
                onMouseLeave={() => setHoveredId(null)}
              />
            );
          })}

          {/* 外人 location 小標 — 角色身旁 */}
          {positioned
            .filter((p) => p.scene === null && p.externalLabel)
            .map((p) => (
              <span
                key={`ext-${p.char.id}`}
                aria-hidden
                className="pointer-events-none absolute z-[5] -translate-x-1/2 whitespace-nowrap rounded border border-hairline/40 bg-surface/70 px-1.5 py-0.5 font-serif text-[10px] tracking-widest text-mute/85 backdrop-blur-sm dark:bg-elevated/60"
                style={{
                  left: `${(p.x / VIEWBOX_W) * 100}%`,
                  top: `calc(${(p.y / VIEWBOX_H) * 100}% + 42px)`,
                }}
              >
                {p.externalLabel}
              </span>
            ))}
        </div>
      </div>
    </section>
  );
}

// ── Helpers ──

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** 節點碰撞半徑（viewBox 單位 ≈ 螢幕 px，容器寬約等於 viewBox 1200）：頭像半徑 + 名牌留白。 */
function nodeCollisionRadius(kind: PositionedCharacter['kind']): number {
  if (kind === 'center') return 46;
  if (kind === 'cast') return 38;
  return 32; // wild
}

/**
 * 碰撞鬆弛：把疊在一起的節點互相推開，直到牽絆曲線露得出來。
 * 純幾何、確定性（無亂數）；初始落點承載「誰在哪」的語意，這裡只解重疊。
 */
function relaxOverlaps(nodes: PositionedCharacter[]): void {
  const n = nodes.length;
  if (n < 2) return;
  const PAD = 10;

  // 完全重合的先用 index 角度撥開一點，鬆弛才有方向可推。
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (nodes[i].x === nodes[j].x && nodes[i].y === nodes[j].y) {
        const a = (j / n) * Math.PI * 2;
        nodes[j].x += Math.cos(a) * 0.5;
        nodes[j].y += Math.sin(a) * 0.5;
      }
    }
  }

  for (let iter = 0; iter < 90; iter++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.sqrt(dx * dx + dy * dy);
        const min = nodeCollisionRadius(a.kind) + nodeCollisionRadius(b.kind) + PAD;
        if (d >= min) continue;
        if (d < 1e-3) {
          dx = j - i;
          dy = (i + j) % 2 === 0 ? 1 : -1;
          d = Math.sqrt(dx * dx + dy * dy);
        }
        const push = (min - d) / 2;
        const ux = dx / d;
        const uy = dy / d;
        a.x -= ux * push;
        a.y -= uy * push;
        b.x += ux * push;
        b.y += uy * push;
        moved = true;
      }
    }
    for (const p of nodes) {
      p.x = clamp(p.x, 60, VIEWBOX_W - 60);
      p.y = clamp(p.y, 60, VIEWBOX_H - 60);
    }
    if (!moved) break;
  }
}

function dedupeById<T extends { id: string }>(arr: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function dedupeEdges(edges: RelationshipEdge[]): RelationshipEdge[] {
  const seen = new Set<string>();
  const out: RelationshipEdge[] = [];
  for (const e of edges) {
    const k = `${e.fromId}::${e.toId}::${e.tone ?? 'none'}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

function ConstellationBackdrop({ ink }: { ink: (a: number) => string }) {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-b from-canvas via-surface to-canvas dark:from-canvas dark:via-elevated/55 dark:to-canvas" />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 65% at 50% 50%, rgba(var(--color-cinnabar) / 0.04), transparent 70%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.6'/%3E%3C/svg%3E\")",
        }}
      />
      {/* 兩側枯枝 — 暗示「江湖」是真實的外世界 */}
      <svg viewBox="0 0 1600 900" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
        <g stroke={ink(0.32)} strokeWidth="1.1" fill="none" strokeLinecap="round">
          <g transform="translate(60, 110)">
            <path d="M 0 200 L 0 0" strokeWidth="1.8" />
            <path d="M 0 110 L -28 70" />
            <path d="M -28 70 L -42 45" />
            <path d="M 0 90 L 30 60" />
            <path d="M 0 150 L -22 120" />
          </g>
          <g transform="translate(1540, 130)">
            <path d="M 0 180 L 0 0" strokeWidth="1.8" />
            <path d="M 0 100 L 28 65" />
            <path d="M 28 65 L 42 40" />
            <path d="M 0 80 L -30 55" />
            <path d="M 0 140 L 22 110" />
          </g>
          <g transform="translate(120, 720)">
            <path d="M 0 150 L 0 0" strokeWidth="1.6" />
            <path d="M 0 80 L -24 50" />
            <path d="M 0 60 L 26 40" />
          </g>
        </g>
        {/* 一條極淡的遠山 */}
        <path
          d="M 0 720 Q 200 680 400 700 T 800 690 T 1200 700 T 1600 690 L 1600 900 L 0 900 Z"
          fill={ink(0.06)}
        />
      </svg>
    </>
  );
}

function ConstellationNode({
  positioned, isDimmed, onMouseEnter, onMouseLeave,
}: {
  positioned: PositionedCharacter;
  isDimmed: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const { char, x, y, kind, scene } = positioned;
  const tone = characterPortraitTone(char.role);
  const imageUrl = char.gallery?.anchor?.imageUrl;
  const sizePx = kind === 'center' ? CAST_NODE_PX_CENTER : kind === 'cast' ? CAST_NODE_PX_OTHER : WILD_NODE_PX;
  const ringClass =
    kind === 'wild'
      ? scene
        ? 'ring-2 ring-cinnabar/40 ring-offset-1 ring-offset-canvas/50'
        : 'ring-1 ring-mute/50'
      : kind === 'center'
        ? `ring-2 ring-cinnabar/55 ${tone.ring}`
        : `ring-2 ring-surface ${tone.ring}`;

  const sceneTag = scene?.name ?? null;

  return (
    <Link
      href={{ pathname: '/dossier', query: { id: char.id } }}
      title={`${char.name} · ${char.role}${kind === 'wild' ? ' · 江湖' : ''}${sceneTag ? ` · 現在於 ${sceneTag}` : ''}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`group absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 outline-none ring-offset-2 ring-offset-transparent transition-all duration-500 hover:scale-110 focus-visible:ring-2 focus-visible:ring-cinnabar active:scale-100 ${
        isDimmed ? 'opacity-25 grayscale-[0.5]' : 'opacity-100'
      }`}
      style={{ left: `${(x / VIEWBOX_W) * 100}%`, top: `${(y / VIEWBOX_H) * 100}%` }}
    >
      <span
        className={`relative overflow-hidden rounded-full shadow-md transition-transform duration-300 group-hover:scale-105 ${ringClass} ${
          kind === 'wild' ? 'bg-canvas/80 backdrop-blur-sm' : tone.bg
        }`}
        style={{ width: sizePx, height: sizePx }}
      >
        <span
          className={`absolute inset-0 flex items-center justify-center font-serif ${
            kind === 'wild' ? 'text-mute' : tone.text
          }`}
          style={{ fontSize: kind === 'center' ? 24 : kind === 'cast' ? 20 : 14 }}
        >
          {char.name[0]}
        </span>
        {imageUrl ? (
          <BlobImage src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
      </span>
      <span
        className={`whitespace-nowrap font-serif tracking-[0.18em] drop-shadow-sm transition-colors group-hover:text-ink ${
          kind === 'wild'
            ? 'text-2xs italic text-mute/90'
            : kind === 'center'
              ? 'text-sm text-ink'
              : 'text-xs text-ink/85'
        }`}
      >
        {char.name}
      </span>
    </Link>
  );
}
