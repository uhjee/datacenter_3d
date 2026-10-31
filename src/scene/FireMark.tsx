// 화재 시나리오 3D 표시: 불꽃(빛), 피어오르는 연기, 방출된 가스 소화약제. 층 그룹 안에서 그 층 화재만 그린다

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Object3D, type InstancedMesh, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial, type PointLight } from 'three';
import type { FloorId } from '../data/building';
import { BAT_ROOM, fireView as batView } from '../scenario/batFire';
import { fireView as srView, srFireSpot } from '../scenario/srFire';
import { useView } from '../store/useView';

const SMOKE_N = 36;

// 지금 시나리오의 화재 위치 (배터리실 화재 · 서버실 화재가 아니면 null)
function useSpot() {
  const id = useView((s) => s.scenario?.id);
  const params = useView((s) => s.scenario?.params);
  return useMemo(() => {
    if (id === 'batFire') return BAT_ROOM;
    if (id === 'srFire' && params && 'early' in params) return srFireSpot(params);
    return null;
  }, [id, params]);
}

// 시각 t의 불꽃 · 연기 · 약제 세기
function levels() {
  const sc = useView.getState().scenario;
  if (sc?.id === 'batFire') return batView(sc.t, sc.params);
  if (sc?.id === 'srFire') return srView(sc.t, sc.params);
  return { flame: 0, smoke: 0, gas: 0 };
}

export function FireMark({ floor }: { floor: FloorId }) {
  const spot = useSpot();
  if (!spot || spot.floor !== floor) return null;
  return <FireAt spot={spot} />;
}

function FireAt({ spot }: { spot: { x: [number, number]; z: [number, number]; height: number; src: { x: number; z: number; y: number } } }) {
  const smoke = useRef<InstancedMesh>(null);
  const flame = useRef<Mesh>(null);
  const light = useRef<PointLight>(null);
  const gas = useRef<Mesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const seeds = useMemo(() => Array.from({ length: SMOKE_N }, (_, i) => ({ off: i / SMOKE_N, ang: i * 2.39996, spd: 0.12 + (i % 5) * 0.02 })), []);
  const top = spot.height - 0.3;

  useFrame(({ clock }) => {
    const lv = levels();
    const time = clock.elapsedTime;
    // 연기: 열원에서 천장까지 올라가며 퍼지고 커진다
    const sm = smoke.current;
    if (sm) {
      sm.visible = lv.smoke > 0.01;
      (sm.material as MeshBasicMaterial).opacity = 0.32 * lv.smoke;
      seeds.forEach((s, i) => {
        const k = (time * s.spd + s.off) % 1;
        const spread = 0.3 + k * 2.4 * (0.4 + lv.smoke);
        dummy.position.set(spot.src.x + Math.cos(s.ang) * spread, spot.src.y + k * (top - spot.src.y), spot.src.z + Math.sin(s.ang) * spread);
        dummy.scale.setScalar((0.25 + k * 0.9) * (0.5 + lv.smoke));
        dummy.updateMatrix();
        sm.setMatrixAt(i, dummy.matrix);
      });
      sm.instanceMatrix.needsUpdate = true;
    }
    // 불꽃: 흔들리는 빛
    const fl = lv.flame * (0.85 + 0.15 * Math.sin(time * 17) * Math.sin(time * 7.3));
    if (flame.current) {
      flame.current.visible = lv.flame > 0.01;
      flame.current.scale.set(0.6 + fl * 0.6, 0.4 + fl * 1.4, 0.6 + fl * 0.6);
      (flame.current.material as MeshStandardMaterial).emissiveIntensity = 1.5 + fl * 2;
    }
    if (light.current) light.current.intensity = fl * 30;
    // 가스 소화약제: 방 전체를 옅게 채운다
    if (gas.current) {
      gas.current.visible = lv.gas > 0.01;
      (gas.current.material as MeshBasicMaterial).opacity = 0.16 * lv.gas;
    }
  });

  const cx = (spot.x[0] + spot.x[1]) / 2;
  const cz = (spot.z[0] + spot.z[1]) / 2;
  return (
    <group>
      <instancedMesh ref={smoke} args={[undefined, undefined, SMOKE_N]} raycast={() => null} renderOrder={4}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshBasicMaterial color="#8a9099" transparent opacity={0} depthWrite={false} />
      </instancedMesh>
      <mesh ref={flame} position={[spot.src.x, spot.src.y, spot.src.z]} raycast={() => null}>
        <coneGeometry args={[0.35, 1, 16]} />
        <meshStandardMaterial color="#ff8c2c" emissive="#ff5a1f" emissiveIntensity={2} transparent opacity={0.85} />
      </mesh>
      <pointLight ref={light} position={[spot.src.x, spot.src.y + 0.6, spot.src.z]} color="#ff7a2c" distance={10} decay={1.6} intensity={0} />
      <mesh ref={gas} position={[cx, spot.height / 2, cz]} raycast={() => null} renderOrder={5}>
        <boxGeometry args={[spot.x[1] - spot.x[0] - 0.3, spot.height - 0.2, spot.z[1] - spot.z[0] - 0.3]} />
        <meshBasicMaterial color="#eef6ff" transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
