// 누수 시나리오 3D 표시: 이중마루 아래로 번지는 물, 새는 동안 퍼지는 물결, 위치 표시 (서버실 B 층 그룹 안에서 그린다)

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Group, Mesh, MeshBasicMaterial } from 'three';
import { RAISED_H } from '../data/building';
import { leakView, waterAt } from '../scenario/leak';
import { isFloorVisible, useView } from '../store/useView';
import { htmlPortal } from './htmlPortal';

const WATER = '#4dabf7';

export function LeakMark() {
  const params = useView((s) => (s.scenario?.id === 'leak' ? s.scenario.params : null));
  // 이름표 숫자는 1L 단위로만 다시 그린다
  const liters = useView((s) => (s.scenario?.id === 'leak' ? Math.round(waterAt(s.scenario.t, s.scenario.params)) : 0));
  const shown = useView((s) => isFloorVisible('4F', s.floorFocus));
  const puddle = useRef<Mesh>(null);
  const edge = useRef<Mesh>(null);
  const ring = useRef<Mesh>(null);
  const drop = useRef<Group>(null);

  // 물 크기 · 물결은 매 프레임 저장소에서 읽어 바로 반영 (리렌더 없이)
  useFrame(({ clock, invalidate }) => {
    const sc = useView.getState().scenario;
    if (!sc || sc.id !== 'leak') return;
    invalidate(); // 물결은 누수 시나리오 중 계속 움직인다
    const v = leakView(sc.t, sc.params);
    const r = Math.max(0.001, v.radius);
    puddle.current?.scale.set(r, r, 1);
    edge.current?.scale.set(r, r, 1);
    if (edge.current) edge.current.visible = v.radius > 0.05;
    if (ring.current) {
      const k = (clock.elapsedTime % 1.6) / 1.6;
      ring.current.visible = v.leaking;
      ring.current.scale.setScalar(0.3 + k * 1.6);
      (ring.current.material as MeshBasicMaterial).opacity = 0.7 * (1 - k);
    }
    if (drop.current) {
      drop.current.visible = v.radius > 0.05 || v.leaking;
      drop.current.position.y = RAISED_H + 1.1 + Math.sin(clock.elapsedTime * 3) * 0.08;
    }
  });

  if (!params) return null;
  const v = leakView(useView.getState().scenario!.t, params);
  return (
    <group position={[v.x, 0, v.z]}>
      {/* 마루 아래 슬래브 위에 고인 물 (이중마루 투시로 보인다) */}
      <mesh ref={puddle} position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null} renderOrder={2}>
        <circleGeometry args={[1, 48]} />
        <meshBasicMaterial color={WATER} transparent opacity={0.7} depthWrite={false} />
      </mesh>
      {/* 번진 범위 테두리: 랙 · 마루판에 가려도 보이도록 마루 위에 함께 그린다 */}
      <mesh ref={edge} position={[0, RAISED_H + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null} renderOrder={3}>
        <ringGeometry args={[0.94, 1, 64]} />
        <meshBasicMaterial color={WATER} transparent opacity={0.9} depthWrite={false} depthTest={false} />
      </mesh>
      {/* 새는 동안 마루 위로 퍼지는 물결 */}
      <mesh ref={ring} position={[0, RAISED_H + 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null} renderOrder={3}>
        <ringGeometry args={[0.85, 1, 48]} />
        <meshBasicMaterial color={WATER} transparent opacity={0.6} depthWrite={false} />
      </mesh>
      {/* 위치 표시 물방울 */}
      <group ref={drop}>
        <mesh position={[0, 0.12, 0]} raycast={() => null}>
          <coneGeometry args={[0.16, 0.32, 20]} />
          <meshStandardMaterial color={WATER} emissive={WATER} emissiveIntensity={0.5} />
        </mesh>
        <mesh raycast={() => null}>
          <sphereGeometry args={[0.16, 20, 16]} />
          <meshStandardMaterial color={WATER} emissive={WATER} emissiveIntensity={0.5} />
        </mesh>
      </group>
      <Html portal={htmlPortal} position={[0, RAISED_H + 1.8, 0]} center zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
        <div className="leak-tag" style={{ display: shown && liters > 0 ? undefined : 'none' }}>
          누수 · {liters}L
        </div>
      </Html>
    </group>
  );
}
