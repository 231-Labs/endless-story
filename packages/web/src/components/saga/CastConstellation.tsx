'use client';

import { useMemo, useState } from 'react';
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
  useIsDark,
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
  const isDark = useIsDark();
  const ink = (a: number) => (isDark ? `rgba(220, 206, 176, ${a})` : `rgba(40, 38, 44, ${a})`);

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

  // ── De-overlap ──
  // At opening the whole cast often lands in one scene (a single opening storylet).
  // placeInScene's small-radius jitter leaves 60-76px avatars piled up, with bond
  // curves shrunk to stubs hidden under them. Run a few rounds of collision
  // relaxation: any two too-close nodes push apart until they're visible and curves
  // have length. Semantics (who's in which room) still come from the initial
  // placement; this only spreads out the pile.
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
