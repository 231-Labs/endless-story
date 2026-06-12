'use client';

import { Suspense, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Group } from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { MeshReflectorMaterial, TransformControls } from '@react-three/drei';
import { ChamberLights } from './ChamberLights.js';
import { SkyBackdrop } from './SkyBackdrop.js';
import { VaultBackdrop } from './VaultBackdrop.js';
import { DisplayCurio, DisplayStill } from './VaultDisplays.js';
import { Weather } from './Weather.js';
import { DriftingMist } from './Mist.js';
import {
  Bamboo,
  Guqin,
  Incense,
  Lantern,
  MoonGate,
  OperaStage,
  PlumBranch,
  ScholarRock,
  Screen,
  TableChairs,
} from './SceneElements.js';
import { GlbProp } from './GlbProp.js';
import { PropPrimitive } from './PropPrimitive.js';
import { ScrollQuad, FallbackQuad } from './ScrollQuad.js';
import { CharacterAvatar } from './CharacterAvatar.js';
import { ErrorBoundary } from './ErrorBoundary.js';
import { paletteForEnv } from './environment.js';
import type { ChamberAvatar, ChamberEnvironment, RoomDims } from './types.js';
import type { FloorType, SceneDesign, SceneElement, TableItem } from './scene-design.js';

const GLB_RE = /\.(glb|gltf)(\?|#|$)/i;

const WATER: Record<string, string> = {
  day: '#3f5a60',
  dawn: '#46545e',
  dusk: '#2a3142',
  night: '#161e2a',
};

/** polished dark stage floor — the whole ground IS the stage. */
const LACQUER: Record<string, string> = {
  day: '#332b26',
  dawn: '#352d28',
  dusk: '#262019',
  night: '#1a1512',
};

function Floor({
  type,
  color,
  y = 0,
  dims,
  timeOfDay,
}: {
  type: FloorType;
  color?: string;
  y?: number;
  dims: RoomDims;
  timeOfDay: string;
}) {
  if (type === 'void') return null;
  const w = dims.width * 2.6;
  const d = dims.depth * 1.8;
  if (type === 'water' || type === 'lacquer') {
    const base = type === 'lacquer' ? LACQUER : WATER;
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, -dims.depth * 0.1]}>
        <planeGeometry args={[w, d]} />
        <MeshReflectorMaterial
          resolution={512}
          blur={type === 'lacquer' ? [340, 120] : [420, 180]}
          mixBlur={type === 'lacquer' ? 0.85 : 1.1}
          mixStrength={type === 'lacquer' ? 1.9 : 2.4}
          roughness={type === 'lacquer' ? 0.55 : 0.75}
          depthScale={1.1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.3}
          color={color ?? base[timeOfDay] ?? base.day}
          metalness={type === 'lacquer' ? 0.25 : 0.55}
        />
      </mesh>
    );
  }
  const flat = type === 'wood' ? (color ?? '#6e5238') : (color ?? '#9a9386');
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, -dims.depth * 0.1]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <meshStandardMaterial color={flat} roughness={type === 'wood' ? 0.82 : 0.9} metalness={0.04} />
    </mesh>
  );
}

/** Element kinds the collector can re-arrange in 自由布局. */
const MOVABLE = new Set(['display_still', 'display_curio', 'character', 'incense']);

function Element({
  el,
  avatars,
  index,
  editable,
  onSelect,
  setRef,
}: {
  el: SceneElement;
  avatars: ChamberAvatar[];
  index: number;
  editable?: boolean;
  onSelect?: (index: number) => void;
  setRef?: (index: number, group: Group | null) => void;
}) {
  const pos = el.pos;
  const rot: [number, number, number] = [0, ((el.yaw ?? 0) * Math.PI) / 180, 0];
  const scale = el.scale ?? 1;
  const selectable = !!editable && MOVABLE.has(el.kind);
  const wrap = (node: ReactNode) => (
    <group
      ref={(g) => setRef?.(index, g)}
      position={pos}
      rotation={rot}
      scale={scale}
      onClick={
        selectable
          ? (e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              onSelect?.(index);
            }
          : undefined
      }
    >
      {node}
    </group>
  );

  const light = el.params?.light as { color?: string; intensity?: number } | undefined;

  switch (el.kind) {
    case 'display_still':
      return wrap(
        <DisplayStill
          url={el.assetUrl}
          title={el.label ?? '劇照'}
          subtitle={String(el.params?.subtitle ?? '')}
          phase={(el.params?.phase as number) ?? 0}
          lightColor={light?.color}
          lightIntensity={light?.intensity}
        />,
      );
    case 'display_curio':
      return wrap(
        <DisplayCurio
          assetUrl={el.assetUrl}
          fitHeight={el.fitHeight}
          tag={el.tag}
          title={el.label ?? '珍玩'}
          subtitle={String(el.params?.subtitle ?? '')}
          phase={(el.params?.phase as number) ?? 0}
          lightColor={light?.color}
          lightIntensity={light?.intensity}
        />,
      );
    case 'stage':
      return wrap(<OperaStage />);
    case 'table_chairs':
      return wrap(<TableChairs item={(el.params?.item as TableItem) ?? 'lamp'} />);
    case 'moon_gate':
      return wrap(<MoonGate />);
    case 'bamboo':
      return wrap(<Bamboo />);
    case 'scholar_rock':
      return wrap(<ScholarRock />);
    case 'lantern':
      return wrap(<Lantern />);
    case 'guqin':
      return wrap(<Guqin />);
    case 'incense':
      return wrap(<Incense />);
    case 'screen':
      return wrap(<Screen />);
    case 'plum_branch':
      return wrap(<PlumBranch />);
    case 'scroll':
      return wrap(
        el.assetUrl ? (
          <Suspense fallback={<FallbackQuad />}>
            <ErrorBoundary fallback={<FallbackQuad />}>
              <ScrollQuad url={el.assetUrl} />
            </ErrorBoundary>
          </Suspense>
        ) : (
          <FallbackQuad />
        ),
      );
    case 'prop':
      if (el.assetUrl && GLB_RE.test(el.assetUrl)) {
        return wrap(
          <Suspense fallback={<PropPrimitive tag={el.tag} />}>
            <ErrorBoundary fallback={<PropPrimitive tag={el.tag} />}>
              <GlbProp url={el.assetUrl} fitHeight={el.fitHeight} />
            </ErrorBoundary>
          </Suspense>,
        );
      }
      return wrap(<PropPrimitive tag={el.tag} />);
    case 'character': {
      const a = avatars[el.characterIndex ?? 0];
      if (!a) return null;
      return wrap(<CharacterAvatar isSelf={a.isSelf} portraitUrl={a.portraitUrl} />);
    }
    default:
      return null;
  }
}

/**
 * Interprets a `SceneDesign` (LLM-authored or deterministic) into a 3D scene:
 * backdrop + floor + mood lighting/weather + every placed element. This is the
 * generic renderer that makes "GLM designs the whole scene" possible.
 */
export interface SceneEditProps {
  /** 自由布局: items become clickable and a transform gizmo attaches. */
  editable?: boolean;
  selectedIndex?: number | null;
  transformMode?: 'translate' | 'rotate' | 'scale';
  onSelect?: (index: number | null) => void;
  /** fired on gizmo release with the element's new pos / yaw / uniform scale. */
  onCommit?: (
    index: number,
    pos: [number, number, number],
    yawDeg: number,
    scale: number,
  ) => void;
}

export function SceneRenderer({
  design,
  env,
  avatars,
  dims,
  editable,
  selectedIndex,
  transformMode = 'translate',
  onSelect,
  onCommit,
}: {
  design: SceneDesign;
  env: ChamberEnvironment;
  avatars: ChamberAvatar[];
  dims: RoomDims;
} & SceneEditProps) {
  const palette = paletteForEnv(env);
  const refs = useRef(new Map<number, Group>());
  const setRef = (index: number, group: Group | null) => {
    if (group) refs.current.set(index, group);
    else refs.current.delete(index);
  };
  const selectedObject =
    editable && selectedIndex != null ? refs.current.get(selectedIndex) : undefined;

  return (
    <group>
      {design.backdrop.style === '藏閣' ? <VaultBackdrop /> : <SkyBackdrop env={env} />}
      <ChamberLights palette={palette} />
      <Floor
        type={design.floor.type}
        color={design.floor.color}
        y={design.floor.y ?? 0}
        dims={dims}
        timeOfDay={env.timeOfDay}
      />
      <Weather weather={env.weather} dims={dims} />
      {/* 雲氣 — the 虛無 layer: mist hugging the water plane */}
      <group position={[0, design.floor.y ?? 0, 0]}>
        <DriftingMist
          dims={dims}
          tone={env.timeOfDay === 'dusk' || env.timeOfDay === 'night' ? '#aab6c6' : '#f2f5f1'}
        />
      </group>
      {design.elements.map((el, i) => (
        <Element
          key={`${el.kind}:${i}`}
          el={el}
          avatars={avatars}
          index={i}
          editable={editable}
          onSelect={onSelect}
          setRef={setRef}
        />
      ))}

      {/* 自由布局 gizmo — translate on the floor plane / rotate about Y */}
      {selectedObject ? (
        <TransformControls
          object={selectedObject}
          mode={transformMode}
          showX={transformMode !== 'rotate'}
          showZ={transformMode !== 'rotate'}
          showY={transformMode !== 'translate'}
          size={0.8}
          onMouseUp={() => {
            if (selectedIndex == null) return;
            const o = refs.current.get(selectedIndex);
            if (!o || !onCommit) return;
            // keep scale uniform: average the gizmo's per-axis result
            const s = (o.scale.x + o.scale.y + o.scale.z) / 3;
            o.scale.set(s, s, s);
            onCommit(
              selectedIndex,
              [o.position.x, o.position.y, o.position.z],
              (o.rotation.y * 180) / Math.PI,
              s,
            );
          }}
        />
      ) : null}
    </group>
  );
}
