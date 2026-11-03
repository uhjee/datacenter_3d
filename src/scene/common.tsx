import { useCursor } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { BoxGeometry, EdgesGeometry, type Group, type Material, type Mesh } from 'three';
import { frameColor } from '../scenario/core';
import { traceMarkOf, useView, type TraceMark } from '../store/useView';
import { TAP_SLOP } from '../ui/touch';

export type V3 = [number, number, number];

interface MatProps {
  color: string;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  metalness?: number;
  roughness?: number;
}

function Mat({ color, emissive, emissiveIntensity = 1, opacity = 1, metalness = 0.25, roughness = 0.65 }: MatProps) {
  return (
    <meshStandardMaterial
      color={color}
      emissive={emissive ?? '#000000'}
      emissiveIntensity={emissive ? emissiveIntensity : 0}
      transparent={opacity < 1}
      opacity={opacity}
      depthWrite={opacity >= 1}
      metalness={metalness}
      roughness={roughness}
    />
  );
}

// 중심 기준 박스
export function Box({ position = [0, 0, 0], size, rotation, ...mat }: { position?: V3; size: V3; rotation?: V3 } & MatProps) {
  return (
    <mesh position={position} rotation={rotation}>
      <boxGeometry args={size} />
      <Mat {...mat} />
    </mesh>
  );
}

export function Cyl({
  position = [0, 0, 0],
  r,
  r2,
  h,
  rotation,
  segments = 24,
  ...mat
}: { position?: V3; r: number; r2?: number; h: number; rotation?: V3; segments?: number } & MatProps) {
  return (
    <mesh position={position} rotation={rotation}>
      <cylinderGeometry args={[r2 ?? r, r, h, segments]} />
      <Mat {...mat} />
    </mesh>
  );
}

export function Led({ position, color, size = 0.05 }: { position: V3; color: string; size?: number }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[size, 8, 8]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

export const TRACE_COLOR: Record<TraceMark, string> = { up: '#63e6be', down: '#f783ac' };

const edgeCache = new Map<string, EdgesGeometry>();
function boxEdges(s: V3) {
  const k = s.map((v) => v.toFixed(2)).join(',');
  let g = edgeCache.get(k);
  if (!g) {
    g = new EdgesGeometry(new BoxGeometry(...s));
    edgeCache.set(k, g);
  }
  return g;
}

export function SelectionFrame({ size, color, center }: { size: V3; color: string; center?: V3 }) {
  const geo = useMemo(() => boxEdges([size[0] + 0.15, size[1] + 0.15, size[2] + 0.15]), [size]);
  return (
    <lineSegments position={center ?? [0, size[1] / 2, 0]} geometry={geo} raycast={() => null}>
      <lineBasicMaterial color={color} toneMapped={false} />
    </lineSegments>
  );
}

// 강조 중일 때 대상이 아닌 물체를 반투명하게. 원래 재질 값은 userData에 두었다가 되돌린다.
interface Saved {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}
export function useDim(ref: RefObject<Group | null>, dim: boolean) {
  useEffect(() => {
    ref.current?.traverse((o) => {
      if (!(o as Mesh).isMesh) return;
      const mats = ([] as Material[]).concat((o as Mesh).material);
      for (const m of mats) {
        const saved = m.userData.dimSaved as Saved | undefined;
        if (dim && !saved) {
          m.userData.dimSaved = { opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite };
          m.transparent = true;
          m.opacity = Math.min(m.opacity, 0.12);
          m.depthWrite = false;
          m.needsUpdate = true;
        } else if (!dim && saved) {
          m.opacity = saved.opacity;
          m.transparent = saved.transparent;
          m.depthWrite = saved.depthWrite;
          m.needsUpdate = true;
          delete m.userData.dimSaved;
        }
      }
    });
  }, [ref, dim]);
}

// 클릭·호버 가능한 장비 래퍼
export function Selectable({
  id,
  size,
  position,
  rotationY = 0,
  children,
}: {
  id: string;
  size: V3;
  position: V3;
  rotationY?: number;
  children: ReactNode;
}) {
  const selected = useView((s) => s.selectedId === id);
  const hovered = useView((s) => s.hoveredId === id);
  const mark = useView((s) => traceMarkOf(s.traced, id));
  // 시나리오 재생 중에는 정전된 장비를 흐리게, 배터리 · 발전기 · 바이패스 전원과 재기동 중 · 고장 장비에 테두리
  const scen = useView((s) => s.scenSnap?.nodes[id]);
  const dim = useView((s) => (s.scenSnap ? s.scenSnap.nodes[id]?.status === 'off' : !!s.highlight && !s.highlight.nodes.has(id) && s.selectedId !== id));
  const scenFrame = frameColor(scen);
  const inner = useRef<Group>(null);
  useDim(inner, dim);
  const [over, setOver] = useState(false);
  useCursor(over);

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setOver(true);
    useView.getState().hover(id);
  };
  const onOut = () => {
    setOver(false);
    if (useView.getState().hoveredId === id) useView.getState().hover(null);
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > TAP_SLOP) return; // 회전하려고 끌다 뗀 것
    useView.getState().select(id);
  };

  return (
    <group position={position} onPointerOver={onOver} onPointerOut={onOut} onClick={onClick}>
      <group rotation={[0, rotationY, 0]}>
        <group ref={inner}>{children}</group>
        {(selected || hovered) && <SelectionFrame size={size} color={selected ? '#ffd43b' : '#e9ecef'} />}
        {!selected && !hovered && mark && <SelectionFrame size={size} color={TRACE_COLOR[mark]} />}
        {!selected && !hovered && !mark && scenFrame && <SelectionFrame size={size} color={scenFrame} />}
      </group>
    </group>
  );
}
