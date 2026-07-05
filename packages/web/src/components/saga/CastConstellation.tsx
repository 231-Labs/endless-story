'use client';

import { useMemo, useRef, useState } from 'react';
import type {
  Character,
  CharacterLiveState,
  RelationshipEdge,
  SagaLocation,
  Scene,
} from '@endless-story/shared';
import { SCENE_POSITIONS } from './sceneLayout';
import {
  MOON_DOOR,
  SAGA,
  TONE_COLOR,
  TONE_DASH,
  TONE_LABEL,
  VIEWBOX_H,
  VIEWBOX_W,
  WALL_Y,
  clamp,
  dedupeById,
  dedupeEdges,
  relaxOverlaps,
  relationshipLayout,
  useIsDark,
  useIsMobile,
  type PositionedCharacter,
  type Zone,
} from './constellationLayout';
import { ConstellationBackdrop, ConstellationNode } from './ConstellationNode';

/**
 * Cast-positions map (top-down floor plan) — same on-chain world as the handscroll,
 * seen from above.
 *
 *  · A square saga plan — top half theater zone, bottom half courtyard zone, with a
 *    horizontal dividing wall and moon-gate in the middle.
 *  · Each scene is a "room", positioned via SCENE_POSITIONS.
 *  · Each character (cast / wild) is placed in their current scene's room (clustering when many).
 *  · A character with no currentScene but a liveState.location → placed outside the saga walls,
 *    tagged with their "now at" label (e.g. Tan in another troupe's alley; Boss Jiang now in
 *    row 7 of the main stage → which lands inside the saga!).
 *  · Edges (bonds) are ink-brush curves — cross-wall lines are immediately visible.
 */

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
  /** Designate the center node (enlarged). Unset or not in cast → auto-pick the most-bonded one. */
  centerId?: string;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // 觸控的 tap 會在 click 前觸發合成 mouseenter（把 hoveredId 設好），
  // 所以「第一次點先聚焦」要用 pointerdown 當下的聚焦狀態來判斷。
  const hoveredAtPointerDownRef = useRef<string | null>(null);
  const isDark = useIsDark();
  const isMobile = useIsMobile();
  const ink = (a: number) => (isDark ? `rgba(220, 206, 176, ${a})` : `rgba(40, 38, 44, ${a})`);

  // Portrait viewBox on phones so the relationship web fills the tall screen
  // instead of squashing into a short landscape strip. Desktop unchanged.
  const VW = isMobile ? 760 : VIEWBOX_W;
  const VH = isMobile ? 1180 : VIEWBOX_H;
  const saga = isMobile ? { x: 70, y: 100, w: 620, h: 980 } : SAGA;
  const wallY = saga.y + saga.h / 2;
  const moonR = 40;
  const moon = { x1: saga.x + saga.w / 2 - moonR, x2: saga.x + saga.w / 2 + moonR, r: moonR };

  // ── Defensive dedupe ──
  const uniqCast = useMemo(() => dedupeById(cast), [cast]);
  const uniqWildCast = useMemo(() => {
    const castIds = new Set(uniqCast.map((c) => c.id));
    return dedupeById(wildCast).filter((c) => !castIds.has(c.id));
  }, [wildCast, uniqCast]);
  const uniqEdges = useMemo(() => dedupeEdges(edges), [edges]);

  // Center node: use the caller-specified id if it's actually in cast; else
  // enlarge the most-bonded one. (Old version hard-coded char_shen_huaiyin,
  // so other sagas had no center node.)
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

  // Scene's zone (inferred from location name)
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

  // Per-character scene-appearance history — for the hover panel's "usual haunts"
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

  // currentScene by char — projection of the on-chain "now at"
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

  // ── Layout ──
  //
  // Two independent data sources (same pattern as SagaHandscroll, not fallbacks for each other):
  //   - chain scene: carries posX / posY (% of saga box)
  //   - mock scene : no pos, uses sceneLayout.ts's slug dictionary
  // If neither resolves, return null and the character falls back to placeExternal (outside the walls).
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

  // Gather everyone in each scene's room, to compute jitter
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

  // Precompute each wild's strongest cast link (used to position outsiders)
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

  // Outer-ring slot allocation (keeps outsiders from overlapping)
  const usedExternalSlots = new Set<string>();
  const placeExternal = (char: Character, anchorId: string | undefined, kind: PositionedCharacter['kind']) => {
    // Derive the outward direction from the anchor cast's position relative to saga center
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

  // Place cast first (look up by character id in currentSceneByCharId)
  for (const ch of uniqCast) {
    const sc = currentSceneByCharId.get(ch.id);
    const kind: PositionedCharacter['kind'] = ch.id === centerId ? 'center' : 'cast';
    if (sc) placeInScene(ch, sc, kind);
    else placeExternal(ch, undefined, kind);
  }
  // Then place wild: in a saga scene → into the room; otherwise outer ring
  for (const ch of uniqWildCast) {
    const sc = currentSceneByCharId.get(ch.id);
    if (sc) placeInScene(ch, sc, 'wild');
    else placeExternal(ch, wildPrimaryCast.get(ch.id), 'wild');
  }

  // ── Relationship layout ──
  // Position by WHO-IS-TIED-TO-WHOM, not by physical scene: the scene-based
  // placement above (kept for the hover panel's 現在在) piled the whole cast into
  // one opening room and broke on mobile. relationshipLayout re-lays them as a
  // web that fills the space (bonded near, everyone spread); relaxOverlaps then
  // guarantees no avatar sits on another.
  relationshipLayout(positioned, uniqEdges, VW, VH);
  relaxOverlaps(positioned, VW, VH);

  const posById = new Map(positioned.map((p) => [p.char.id, p]));
  const validEdges = uniqEdges.filter((e) => posById.has(e.fromId) && posById.has(e.toId));

  // 方向保真索引：`from::to` → 該方向最強的一條邊。dedupeEdges 會把「同 tone 的雙向」
  // 摺成一條（畫線用），這裡用原始 edges 重建方向，供面板呈現「A 戀慕 B、B 卻無感」。
  const directedBest = new Map<string, RelationshipEdge>();
  for (const e of edges) {
    if (!posById.has(e.fromId) || !posById.has(e.toId)) continue;
    const k = `${e.fromId}::${e.toId}`;
    const prev = directedBest.get(k);
    if (!prev || (e.weight ?? 0) > (prev.weight ?? 0)) directedBest.set(k, e);
  }

  const hoveredEdges = hoveredId
    ? validEdges.filter((e) => e.fromId === hoveredId || e.toId === hoveredId).sort((a, b) => b.weight - a.weight)
    : [];
  // 牽絆面板：每位相關角色一列，分開「此人所感 →」與「← 對方所感」。
  // 缺向＝無感；雙向皆平淡者不列。星圖連線與節點高亮仍用完整 hoveredEdges。
  const hoveredPairs = (() => {
    if (!hoveredId) return [];
    const partners = new Set<string>();
    for (const e of hoveredEdges) partners.add(e.fromId === hoveredId ? e.toId : e.fromId);
    return [...partners]
      .map((otherId) => {
        const out = directedBest.get(`${hoveredId}::${otherId}`);
        const inc = directedBest.get(`${otherId}::${hoveredId}`);
        return { otherId, out, inc, w: Math.max(out?.weight ?? 0, inc?.weight ?? 0) };
      })
      .filter(
        (r) =>
          (r.out?.tone && r.out.tone !== 'neutral') || (r.inc?.tone && r.inc.tone !== 'neutral'),
      )
      .sort((a, b) => b.w - a.w);
  })();

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

  return (
    <section
      className="relative flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-hidden bg-canvas"
      onClick={() => setHoveredId(null)}
    >
      <ConstellationBackdrop ink={ink} />

      {/* 標題 — 留白配合頂 safe-area（膠囊導覽已改至視窗底部） */}
      <div className="pointer-events-none absolute left-[max(1.25rem,env(safe-area-inset-left))] top-[max(5rem,calc(env(safe-area-inset-top,0px)+4.75rem))] z-20 sm:left-10 sm:top-24">
        <div className="flex items-center gap-4">
          <div className="h-px w-8 bg-cinnabar/60" />
          <h2 className="font-serif text-3xl tracking-[0.25em] text-ink drop-shadow-sm sm:text-4xl">人物方位</h2>
        </div>
        <p className="mt-2 pl-12 text-2xs tracking-[0.25em] text-mute/70 sm:hidden">
          左右平移 · 點人物看牽絆
        </p>
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

            <ul className="mt-3 max-h-[34vh] space-y-1.5 overflow-y-auto overscroll-contain pr-1">
              {hoveredPairs.length > 0 ? (
                hoveredPairs.map(({ otherId, out, inc }) => {
                  const target = posById.get(otherId)?.char;
                  const mutual = out?.tone && inc?.tone && out.tone === inc.tone;
                  return (
                    <li key={otherId} className="flex items-baseline justify-between gap-3">
                      <span className="shrink-0 text-sm text-ink/90">{target?.name}</span>
                      {mutual ? (
                        <span
                          className="inline-flex items-center text-2xs tracking-[0.25em]"
                          style={{ color: TONE_COLOR[out!.tone!] }}
                        >
                          ⇄ {TONE_LABEL[out!.tone!]}
                          <IntensityDots weight={Math.max(out!.weight ?? 0, inc!.weight ?? 0)} color={TONE_COLOR[out!.tone!]} />
                        </span>
                      ) : (
                        <span className="flex items-center gap-2 text-2xs tracking-[0.2em]">
                          <BondToneTag edge={out} dir="→" />
                          <span className="text-mute/30">·</span>
                          <BondToneTag edge={inc} dir="←" />
                        </span>
                      )}
                    </li>
                  );
                })
              ) : (
                <li className="text-xs italic text-mute">尚無深刻牽絆</li>
              )}
            </ul>
            {hoveredPairs.some(({ out, inc }) => !(out?.tone && inc?.tone && out.tone === inc.tone)) ? (
              <p className="mt-2 text-right text-[10px] tracking-[0.2em] text-mute/55">
                → 此人所感 · ← 對方所感
              </p>
            ) : null}
            <p className="mt-2 hidden text-[10px] tracking-[0.2em] text-mute/55 [@media(hover:none)]:block">
              再點一次頭像，開啟人物檔案
            </p>

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

          </div>
        ) : (
          <span className="sr-only">懸浮或聚焦人物節點以檢視牽絆與所在</span>
        )}
      </div>

      {/* 平面圖 — 手機：橫向可平移的寬畫布；sm+：整幅置中 */}
      <div
        className="no-scrollbar relative z-10 mx-auto w-full max-w-[calc(100vw-1.5rem)] px-2 sm:max-w-[calc(100vw-4rem)] sm:px-0 lg:max-w-[calc(85vh*1.5)]"
      >
        {/* Nodes are laid out relationally now, so the whole web fits the
            viewport — no 185vw horizontal scroll (that caused the mobile pile-up).
            container-type lets the nodes size in cqw so they scale WITH the box
            (fixed-px nodes were huge on a small mobile box → the overlap). */}
        <div
          className="relative mx-auto w-full [container-type:inline-size]"
          style={{ aspectRatio: `${VW}/${VH}`, maxHeight: isMobile ? '72dvh' : undefined, maxWidth: isMobile ? `calc(72dvh * ${VW / VH})` : undefined }}
        >
          <svg
            viewBox={`0 0 ${VW} ${VH}`}
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-hidden
          >
            {/* saga 外牆 */}
            <rect
              x={saga.x} y={saga.y} width={saga.w} height={saga.h}
              rx="6"
              fill="rgba(var(--color-cinnabar) / 0.025)"
              stroke={ink(0.35)} strokeWidth="1.4"
            />

            {/* 內牆（戲樓 / 院落 分隔），月洞門斷開 */}
            <line x1={saga.x} y1={wallY} x2={moon.x1} y2={wallY}
              stroke={ink(0.28)} strokeWidth="1.2" strokeDasharray="0" />
            <line x1={moon.x2} y1={wallY} x2={saga.x + saga.w} y2={wallY}
              stroke={ink(0.28)} strokeWidth="1.2" />
            {/* 月洞門拱 */}
            <path
              d={`M ${moon.x1} ${wallY} A ${moon.r} ${moon.r} 0 0 1 ${moon.x2} ${wallY}`}
              stroke={ink(0.4)} strokeWidth="1.4" fill="none"
            />
            <path
              d={`M ${moon.x1 + 6} ${wallY} A ${moon.r - 6} ${moon.r - 6} 0 0 1 ${moon.x2 - 6} ${wallY}`}
              stroke="rgb(var(--color-cinnabar))" strokeOpacity="0.32" strokeWidth="1" fill="none"
            />

            {/* scene 占位（淡圈，不額外標字）—— 用場景平面座標，portrait 下省略 */}
            {!isMobile && scenes.map((s) => {
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

            {/* edges — 雙弧：每個方向一條、各自彎向自己那側。誰更愛誰（粗細、
                亮度）站著就看得見，不用 hover；單向的邊自然只有一條弧。 */}
            {[...directedBest.values()]
              .filter((e) => posById.has(e.fromId) && posById.has(e.toId))
              .map((edge, idx) => {
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
              const sign = edge.fromId < edge.toId ? 1 : -1;
              const offset = len * 0.12 * sign;
              const cx = midX + nx * offset;
              const cy = midY + ny * offset;

              const reverse = directedBest.get(`${edge.toId}::${edge.fromId}`);
              const mutualSameTone = !!(reverse && (reverse.tone ?? 'neutral') === (edge.tone ?? 'neutral'));
              const t = 0.62;
              const mt = 1 - t;
              const chevX = mt * mt * from.x + 2 * mt * t * cx + t * t * to.x;
              const chevY = mt * mt * from.y + 2 * mt * t * cy + t * t * to.y;
              const tanX = 2 * mt * (cx - from.x) + 2 * t * (to.x - cx);
              const tanY = 2 * mt * (cy - from.y) + 2 * t * (to.y - cy);
              const chevAngle = (Math.atan2(tanY, tanX) * 180) / Math.PI;

              return (
                <g key={`${edge.fromId}::${edge.toId}::${edge.tone ?? 'none'}::${idx}`}>
                  <path
                    d={`M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`}
                    stroke={stroke} strokeWidth={strokeWidth}
                    strokeDasharray={finalDash || undefined}
                    strokeLinecap="round" fill="none" opacity={opacity}
                    className="transition-all duration-500"
                  />
                  {/* 每條弧都有向 — 箭羽常駐（隨線的明暗呼吸），不必 hover 才知道誰指向誰。 */}
                  <path
                    d="M -5 -3.8 L 1.6 0 L -5 3.8"
                    transform={`translate(${chevX} ${chevY}) rotate(${chevAngle})`}
                    stroke={stroke} strokeWidth={Math.max(1.3, strokeWidth * 0.8)}
                    strokeLinecap="round" strokeLinejoin="round" fill="none"
                    opacity={mutualSameTone ? opacity * 0.7 : opacity}
                    className="transition-all duration-500"
                  />
                </g>
              );
            })}
          </svg>

          {/* 節點 */}
          {positioned.map((p, idx) => {
            const isDimmed = hoveredId ? !connectedIds.has(p.char.id) : false;
            return (
              <ConstellationNode
                key={`${p.char.id}::${p.kind}::${idx}`}
                positioned={p} isDimmed={isDimmed} vw={VW} vh={VH}
                onMouseEnter={() => setHoveredId(p.char.id)}
                onMouseLeave={() => {
                  // 觸控裝置：tap 後瀏覽器會發合成 mouseleave，會把剛聚焦的人物清掉；
                  // 無 hover 環境改由「點空白處」收合（見 section onClick）。
                  if (typeof window !== 'undefined' && window.matchMedia?.('(hover: none)').matches) return;
                  setHoveredId(null);
                }}
                onFocus={() => setHoveredId(p.char.id)}
                onPointerDown={() => {
                  hoveredAtPointerDownRef.current = hoveredId;
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  // 觸控裝置（無 hover）：第一次點選只聚焦顯示牽絆，第二次才開人物檔案。
                  if (
                    typeof window !== 'undefined' &&
                    window.matchMedia?.('(hover: none)').matches &&
                    hoveredAtPointerDownRef.current !== p.char.id
                  ) {
                    e.preventDefault();
                    setHoveredId(p.char.id);
                  }
                }}
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
                  left: `${(p.x / VW) * 100}%`,
                  top: `calc(${(p.y / VH) * 100}% + 3cqw)`,
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

/** 牽絆面板的方向 tone 標籤：→ 此人所感 / ← 對方所感；缺向＝無感。 */
/** Bond depth (accumulated tie weight) as three dots — so the panel shows not
 *  just the KIND of feeling but how DEEP it runs, and the asymmetry reads. */
function IntensityDots({ weight, color }: { weight?: number; color: string }) {
  const w = weight ?? 0;
  const filled = w >= 4 ? 3 : w >= 2 ? 2 : 1;
  return (
    <span className="ml-1 inline-flex items-center gap-[2px] align-middle" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-[3px] w-[3px] rounded-full"
          style={{ backgroundColor: color, opacity: i < filled ? 0.9 : 0.2 }}
        />
      ))}
    </span>
  );
}

function BondToneTag({ edge, dir }: { edge?: RelationshipEdge; dir: '→' | '←' }) {
  if (!edge?.tone || edge.tone === 'neutral') {
    return (
      <span className="italic text-mute/45">
        {dir} {edge?.tone === 'neutral' ? '平淡' : '無感'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center" style={{ color: TONE_COLOR[edge.tone] }}>
      {dir} {TONE_LABEL[edge.tone]}
      <IntensityDots weight={edge.weight} color={TONE_COLOR[edge.tone]} />
    </span>
  );
}
