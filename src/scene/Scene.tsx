import { CameraControls } from '@react-three/drei';
import { Canvas, events as defaultEvents, useFrame, type RootState } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Path, Shape, type Intersection, type Object3D } from 'three';
import type { UseBoundStore, StoreApi } from 'zustand';
import { FOOTPRINT } from '../data/building';
import { useView } from '../store/useView';
import { BuildingFloors } from './Building';
import { Connections } from './Connections';
import { CAMERA_FOV, overviewPose } from './focus';
import { LabelProjector } from './HoverLabel';

// 숨긴 층·레이어의 물체는 클릭되지 않도록 걸러낸다
function shown(o: Object3D | null): boolean {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}
const events = (store: UseBoundStore<StoreApi<RootState>>) => ({
  ...defaultEvents(store),
  filter: (items: Intersection[]) => items.filter((h) => shown(h.object)),
});

export function Scene() {
  const [ready, setReady] = useState(false);
  return (
    <>
      {!ready && <div className="scene-loading">3D 화면을 준비하고 있습니다…</div>}
      <Canvas
        camera={{ position: overviewPose('explode').position, fov: CAMERA_FOV, near: 0.1, far: 600 }}
        dpr={[1, 2]}
        events={events}
        onPointerMissed={() => useView.getState().select(null)}
      >
        <color attach="background" args={['#0d1117']} />
        <fog attach="fog" args={['#0d1117', 140, 320]} />
        <hemisphereLight args={['#dfe7f0', '#1a1f24', 0.9]} />
        <directionalLight position={[30, 60, 40]} intensity={1.4} />
        <directionalLight position={[-40, 30, -30]} intensity={0.4} />
        <CameraRig />
        <LabelProjector />
        <Ground />
        <BuildingFloors />
        <Connections />
        {!ready && <FirstFrames onReady={() => setReady(true)} />}
      </Canvas>
    </>
  );
}

// 장면이 실제로 몇 프레임 그려진 뒤 준비 완료로 본다 (셰이더 컴파일이 첫 프레임에 몰림)
function FirstFrames({ onReady }: { onReady: () => void }) {
  const n = useRef(0);
  useFrame(() => {
    if (++n.current === 3) onReady();
  });
  return null;
}

function CameraRig() {
  const ref = useRef<CameraControls>(null);
  const goal = useView((s) => s.cameraGoal);
  const zoom = useView((s) => s.zoomCmd);

  useEffect(() => {
    const p = overviewPose('explode');
    ref.current?.setLookAt(...p.position, ...p.target, false);
  }, []);

  useEffect(() => {
    if (!goal || !ref.current) return;
    ref.current.setLookAt(...goal.position, ...goal.target, true);
  }, [goal]);

  // 확대 · 축소 버튼: 지금 거리의 25%씩 당기거나 민다
  useEffect(() => {
    const c = ref.current;
    if (!zoom || !c) return;
    c.dolly(c.distance * 0.25 * zoom.dir, true);
  }, [zoom]);

  return <CameraControls ref={ref} makeDefault minDistance={3} maxDistance={220} maxPolarAngle={Math.PI * 0.62} smoothTime={0.45} />;
}

// 지면 (건물 자리에 구멍 → 지하층이 보이도록)
function Ground() {
  const viewMode = useView((s) => s.viewMode);
  const focus = useView((s) => s.floorFocus);
  const shape = useMemo(() => {
    const s = new Shape();
    s.moveTo(-160, -160);
    s.lineTo(160, -160);
    s.lineTo(160, 160);
    s.lineTo(-160, 160);
    s.lineTo(-160, -160);
    const hole = new Path();
    const [x0, x1] = FOOTPRINT.x;
    const [z0, z1] = FOOTPRINT.z;
    hole.moveTo(x0, -z0);
    hole.lineTo(x0, -z1);
    hole.lineTo(x1, -z1);
    hole.lineTo(x1, -z0);
    hole.lineTo(x0, -z0);
    s.holes.push(hole);
    return s;
  }, []);
  const faded = viewMode === 'explode' || focus === 'B1';
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} raycast={() => null}>
        <shapeGeometry args={[shape]} />
        <meshStandardMaterial color="#1b2420" transparent opacity={faded ? 0.35 : 0.95} depthWrite={!faded} />
      </mesh>
    </group>
  );
}
