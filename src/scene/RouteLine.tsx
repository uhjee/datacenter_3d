// 현장 모드 길 안내 3D 표시: 바닥 경로 점선(보고 있는 층만), 내 위치(걷는 · 보는 방향 화살표), 목적지 고리.
// 길 안내가 없어도 내 위치를 정했으면 내 위치만 보인다
// 층 바닥 높이는 층 묶음과 같은 floorWorldY, 이중마루 서버실은 마루 위

import { Line } from '@react-three/drei';
import { useMemo } from 'react';
import { floorTopAt } from '../data/route';
import { floorWorldY, useView } from '../store/useView';
import { herePose, poseOf, useGuide } from '../ui/field/guide';

const LIFT = 0.06; // 바닥에 묻히지 않게

export function RouteLine() {
  const g = useGuide();
  const here = useView((s) => s.fieldHere);
  const floor = useView((s) => s.floorFocus);
  const mode = useView((s) => s.viewMode);
  const pts = useMemo(() => {
    if (!g || !floor) return [];
    const base = floorWorldY(floor, mode);
    return g.route.points.filter((p) => p.floor === floor).map((p) => [p.x, base + floorTopAt(floor, p.x, p.z) + LIFT, p.z] as [number, number, number]);
  }, [g, floor, mode]);
  if (!floor) return null;
  // 길 안내가 없으면 내 위치(QR · 고르기로 정한 곳)만
  if (!g) {
    const p = here && herePose();
    if (!p || p.floor !== floor) return null;
    return <Me x={p.x} y={floorWorldY(floor, mode) + floorTopAt(floor, p.x, p.z) + LIFT} z={p.z} dx={p.dx} dz={p.dz} />;
  }
  const me = poseOf(g.route, g.step);
  const to = g.route.to;
  const base = floorWorldY(floor, mode);
  return (
    <group>
      {pts.length >= 2 && <Line points={pts} color="#ffd43b" lineWidth={4} dashed dashSize={0.6} gapSize={0.35} depthTest={false} renderOrder={20} />}
      {me.floor === floor && <Me x={me.x} y={base + floorTopAt(floor, me.x, me.z) + LIFT} z={me.z} dx={me.dx} dz={me.dz} />}
      {to.floor === floor && <Goal x={to.x} y={base + floorTopAt(floor, to.x, to.z) + LIFT} z={to.z} />}
    </group>
  );
}

// 내 위치: 파란 원판 + 걷는 방향(앞, +z) 삼각형
function Me({ x, y, z, dx, dz }: { x: number; y: number; z: number; dx: number; dz: number }) {
  const rot = Math.atan2(dx, dz);
  return (
    <group position={[x, y, z]} rotation={[0, rot, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={21}>
        <circleGeometry args={[0.45, 32]} />
        <meshBasicMaterial color="#4dabf7" depthTest={false} transparent opacity={0.95} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0.75]} renderOrder={22}>
        <circleGeometry args={[0.32, 3, -Math.PI / 2]} />
        <meshBasicMaterial color="#4dabf7" depthTest={false} />
      </mesh>
    </group>
  );
}

// 목적지: 노란 고리 + 가운데 점 (움직이지 않게 둔다: 가만히 있을 때 다시 그리지 않도록)
function Goal({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <group position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh renderOrder={21}>
        <ringGeometry args={[0.5, 0.75, 40]} />
        <meshBasicMaterial color="#ffd43b" depthTest={false} transparent opacity={0.9} />
      </mesh>
      <mesh renderOrder={21}>
        <circleGeometry args={[0.18, 20]} />
        <meshBasicMaterial color="#ffd43b" depthTest={false} />
      </mesh>
    </group>
  );
}
