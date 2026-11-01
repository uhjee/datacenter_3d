import { CameraControls } from '@react-three/drei';
import { Canvas, events as defaultEvents, useFrame, useThree, type RootState } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Path, Plane, Raycaster, Shape, Vector2, Vector3, type Intersection, type Mesh, type MeshBasicMaterial, type Object3D } from 'three';
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
        <OrbitPing />
        {!ready && <FirstFrames onReady={() => setReady(true)} />}
        {import.meta.env.DEV && <DevHandle />}
      </Canvas>
    </>
  );
}

// 개발 중 브라우저 콘솔에서 렌더러 통계(그리기 호출 · 삼각형 · 텍스처)를 볼 수 있게
function DevHandle() {
  const state = useThree();
  useEffect(() => {
    Object.assign(window, { __three: state });
  }, [state]);
  return null;
}

// 장면이 실제로 몇 프레임 그려진 뒤 준비 완료로 본다 (셰이더 컴파일이 첫 프레임에 몰림)
function FirstFrames({ onReady }: { onReady: () => void }) {
  const n = useRef(0);
  useFrame(() => {
    if (++n.current === 3) onReady();
  });
  return null;
}

// 새 회전 중심: 잠깐 퍼졌다 사라지는 고리 (화면을 향하게)
const PING_SEC = 0.9;
function OrbitPing() {
  const ping = useView((s) => s.orbitPing);
  const ref = useRef<Mesh>(null);
  const born = useRef(0);
  useEffect(() => {
    born.current = performance.now();
  }, [ping]);
  useFrame(({ camera }) => {
    const m = ref.current;
    if (!m || !ping) return;
    const t = (performance.now() - born.current) / 1000 / PING_SEC;
    m.visible = t < 1;
    if (t >= 1) return;
    // 거리에 비례한 크기 → 멀리서 봐도 같은 크기로 보인다
    const s = camera.position.distanceTo(m.position) * 0.02 * (0.6 + t);
    m.scale.setScalar(s);
    m.quaternion.copy(camera.quaternion);
    (m.material as MeshBasicMaterial).opacity = 1 - t;
  });
  if (!ping) return null;
  return (
    <mesh ref={ref} position={ping.pos} raycast={() => null} renderOrder={10}>
      <ringGeometry args={[0.7, 1, 32]} />
      <meshBasicMaterial color="#ffd43b" transparent depthTest={false} depthWrite={false} />
    </mesh>
  );
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
    // 더블클릭으로 옮긴 회전 중심(초점 어긋남)을 풀고 목표를 화면 가운데로
    ref.current.setFocalOffset(0, 0, 0, true);
    ref.current.setLookAt(...goal.position, ...goal.target, true);
  }, [goal]);

  // 더블클릭한 지점을 회전 중심으로 (카메라는 그 자리에 둔다)
  const { gl, camera, scene } = useThree();
  useEffect(() => {
    const el = gl.domElement;
    const ray = new Raycaster();
    const ndc = new Vector2();
    const onDbl = (e: MouseEvent) => {
      const c = ref.current;
      if (!c) return;
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(scene.children, true).find((h) => (h.object as Mesh).isMesh && shown(h.object));
      const p = hit?.point ?? ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -c.getTarget(new Vector3()).y), new Vector3());
      if (!p) return;
      c.stop();
      c.setOrbitPoint(p.x, p.y, p.z);
      useView.getState().pingOrbit([p.x, p.y, p.z]);
    };
    el.addEventListener('dblclick', onDbl);
    return () => el.removeEventListener('dblclick', onDbl);
  }, [gl, camera, scene]);

  // 확대 · 축소 버튼: 지금 거리의 25%씩 당기거나 민다
  useEffect(() => {
    const c = ref.current;
    if (!zoom || !c) return;
    c.dolly(c.distance * 0.25 * zoom.dir, true);
  }, [zoom]);

  // dollyToCursor: 휠은 화면 가운데가 아니라 마우스가 가리키는 곳으로 다가간다
  return <CameraControls ref={ref} makeDefault dollyToCursor minDistance={3} maxDistance={220} maxPolarAngle={Math.PI * 0.62} smoothTime={0.45} />;
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
