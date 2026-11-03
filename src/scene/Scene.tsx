import { CameraControls } from '@react-three/drei';
import { Canvas, events as defaultEvents, useFrame, useThree, type RootState } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Path, Plane, Raycaster, Shape, Vector2, Vector3, type Intersection, type Mesh, type MeshBasicMaterial, type Object3D } from 'three';
import type { UseBoundStore, StoreApi } from 'zustand';
import { FOOTPRINT } from '../data/building';
import { useView } from '../store/useView';
import { onLongPress, TAP_SLOP } from '../ui/touch';
import { deviceOf, useDevice } from '../store/device';
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

// 휴대폰 · 태블릿 렌더링 품질 (docs/research/03-mobile-responsive.md §6)
//   픽셀 비율 상한: PC 2, 휴대폰 · 태블릿 1.5 (devicePixelRatio 3 그대로면 픽셀이 4배 → 발열 · 메모리)
//   휴대폰은 안티에일리어싱을 끄고(1.5배에서는 차이가 작다), 휴대폰 · 태블릿은 저전력 GPU 설정
//   (iOS에서 메모리를 넘으면 Safari가 페이지를 말없이 새로 고친다는 보고가 있어 아낀다)
const TOUCH_DPR_MAX = 1.5;

export function Scene() {
  const [ready, setReady] = useState(false);
  const { device } = useDevice();
  const touch = device !== 'desktop';
  // 회전 중 프레임이 떨어져 낮춘 픽셀 비율 (null이면 기본 범위). Canvas가 다시 그려져도 되돌아가지 않게 여기서 들고 있는다
  const [dprCap, setDprCap] = useState<number | null>(null);
  // Canvas gl 옵션은 처음 만들 때만 정해지므로 시작할 때 기기로 고른다
  const [gl] = useState(() => (deviceOf() === 'desktop' ? {} : { antialias: deviceOf() !== 'phone', powerPreference: 'default' as const }));
  const [lost, setLost] = useState(false);
  return (
    <>
      {!ready && <div className="scene-loading">3D 화면을 준비하고 있습니다…</div>}
      {lost && (
        <div className="scene-lost" role="alert">
          <b>3D 화면이 멈췄습니다</b>
          <span>기기 메모리가 부족했을 수 있습니다. 다시 불러오면 지금 보던 층 · 선택이 그대로 열립니다.</span>
          <button onClick={() => location.reload()}>다시 불러오기</button>
        </div>
      )}
      <Canvas
        camera={{ position: overviewPose('explode').position, fov: CAMERA_FOV, near: 0.1, far: 600 }}
        dpr={dprCap ?? [1, touch ? TOUCH_DPR_MAX : 2]}
        gl={gl}
        // 변화가 있을 때만 그린다 (가만히 있으면 GPU · CPU를 쓰지 않음). 다시 그리는 때는 InvalidateOnChange · 각 애니메이션이 알린다
        frameloop="demand"
        events={events}
        onPointerMissed={() => useView.getState().select(null)}
        onCreated={({ gl: r }) => {
          // three가 복구를 기다리도록 기본 동작을 막아 두므로, 복구되면 안내를 거둔다
          r.domElement.addEventListener('webglcontextlost', () => setLost(true));
          r.domElement.addEventListener('webglcontextrestored', () => setLost(false));
        }}
      >
        <color attach="background" args={['#0d1117']} />
        <fog attach="fog" args={['#0d1117', 140, 320]} />
        <hemisphereLight args={['#dfe7f0', '#1a1f24', 0.9]} />
        <directionalLight position={[30, 60, 40]} intensity={1.4} />
        <directionalLight position={[-40, 30, -30]} intensity={0.4} />
        <InvalidateOnChange />
        <CameraRig />
        <LabelProjector />
        <Ground />
        <BuildingFloors />
        <Connections />
        <OrbitPing />
        {touch && <AdaptiveDpr onDecline={setDprCap} />}
        {!ready && <FirstFrames onReady={() => setReady(true)} />}
        {import.meta.env.DEV && <DevHandle />}
      </Canvas>
    </>
  );
}

// 회전 · 애니메이션으로 이어서 그리는 동안 프레임이 30fps 밑이면 픽셀 비율을 0.25씩 낮춘다(최저 1, 되올리지 않음).
// drei PerformanceMonitor는 쉬는 동안의 빈틈까지 느린 프레임으로 세어 '변화가 있을 때만 그리기'와 맞지 않아 직접 잰다
const SLOW_FPS = 30;
const SAMPLE = 60; // 이어 그린 프레임 수
function AdaptiveDpr({ onDecline }: { onDecline: (dpr: number) => void }) {
  const run = useRef({ last: 0, n: 0, sum: 0 });
  useFrame(({ viewport }) => {
    const now = performance.now();
    const r = run.current;
    const dt = now - r.last;
    r.last = now;
    // 0.1초 넘게 쉬었다 그린 프레임은 쉬던 중이므로 새로 센다
    if (dt > 100) {
      r.n = 0;
      r.sum = 0;
      return;
    }
    r.n++;
    r.sum += dt;
    if (r.n < SAMPLE) return;
    const fps = (1000 * r.n) / r.sum;
    r.n = 0;
    r.sum = 0;
    if (fps < SLOW_FPS && viewport.dpr > 1) onDecline(Math.max(1, viewport.dpr - 0.25));
  });
  return null;
}

// 개발 중 브라우저 콘솔에서 렌더러 통계(그리기 호출 · 삼각형 · 텍스처)를 볼 수 있게
function DevHandle() {
  const state = useThree();
  useEffect(() => {
    Object.assign(window, { __three: state });
  }, [state]);
  return null;
}

// 화면 상태(저장소)가 바뀌면 다시 그린다. 저장소 변화를 받아 장면이 바뀌는 것(React 반영 · 인스턴스 색 갱신)이
// 다음 한두 프레임에 걸칠 수 있어 3프레임을 그린다
function InvalidateOnChange() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => useView.subscribe(() => invalidate(3)), [invalidate]);
  return null;
}

// 장면이 실제로 몇 프레임 그려진 뒤 준비 완료로 본다 (셰이더 컴파일이 첫 프레임에 몰림)
function FirstFrames({ onReady }: { onReady: () => void }) {
  const n = useRef(0);
  useFrame(({ invalidate }) => {
    if (++n.current === 3) onReady();
    else invalidate(); // 변화가 있을 때만 그리는 방식이라 3프레임까지 직접 이어 그린다
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
  useFrame(({ camera, invalidate }) => {
    const m = ref.current;
    if (!m || !ping) return;
    const t = (performance.now() - born.current) / 1000 / PING_SEC;
    m.visible = t < 1;
    if (t >= 1) return;
    invalidate(); // 퍼지는 동안 계속 그린다
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

  // 더블클릭 · 더블탭한 지점을 회전 중심으로 (카메라는 그 자리에 둔다)
  const { gl, camera, scene } = useThree();
  useEffect(() => {
    const el = gl.domElement;
    const ray = new Raycaster();
    const ndc = new Vector2();
    const orbitAt = (x: number, y: number) => {
      const c = ref.current;
      if (!c) return;
      const r = el.getBoundingClientRect();
      ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(scene.children, true).find((h) => (h.object as Mesh).isMesh && shown(h.object));
      const p = hit?.point ?? ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -c.getTarget(new Vector3()).y), new Vector3());
      if (!p) return;
      c.stop();
      c.setOrbitPoint(p.x, p.y, p.z);
      useView.getState().pingOrbit([p.x, p.y, p.z]);
    };
    const onDbl = (e: MouseEvent) => orbitAt(e.clientX, e.clientY);

    // 손가락: 터치에서는 dblclick이 오지 않거나 확대 제스처와 겹치므로 더블탭을 직접 센다 (300ms · 24px 안에 짧은 탭 두 번)
    // 길게 누르기는 그 자리에 마우스를 올린 것처럼 처리해 이름표 · 바닥 온도 · 랙 흡기를 보여 준다 (손을 떼면 사라짐)
    let down: { x: number; y: number; t: number } | null = null;
    let last = { x: 0, y: 0, t: 0 };
    let touching = false;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      touching = true;
      // 두 번째 손가락(핀치 · 이동)이 닿으면 탭이 아니다
      down = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
      if (!e.isPrimary) last.t = 0;
      onLongPress(e, (x, y) => {
        const ev = new PointerEvent('pointermove', { clientX: x, clientY: y, pointerType: 'mouse', bubbles: true });
        // R3F는 offsetX로 가리킨 곳을 찾는데, 만든 이벤트는 브라우저 · 화면 배율에 따라 값이 어긋날 수 있어 직접 넣는다
        const r = el.getBoundingClientRect();
        Object.defineProperties(ev, { offsetX: { value: x - r.left }, offsetY: { value: y - r.top } });
        el.dispatchEvent(ev);
      });
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !down) return;
      const now = performance.now();
      const tap = now - down.t < 300 && Math.hypot(e.clientX - down.x, e.clientY - down.y) <= TAP_SLOP;
      down = null;
      if (!tap) {
        last.t = 0;
        return;
      }
      if (now - last.t < 300 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 24) {
        last.t = 0;
        orbitAt(e.clientX, e.clientY);
      } else last = { x: e.clientX, y: e.clientY, t: now };
    };
    // 길게 누를 때 뜨는 브라우저 메뉴(이미지 저장 등)를 막는다. 마우스 우클릭은 그대로
    const onMenu = (e: Event) => touching && e.preventDefault();
    const onEnd = (e: PointerEvent) => {
      if (e.pointerType === 'touch' && e.isPrimary) setTimeout(() => (touching = false), 0);
    };
    el.addEventListener('dblclick', onDbl);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointerup', onEnd);
    el.addEventListener('pointercancel', onEnd);
    el.addEventListener('contextmenu', onMenu);
    return () => {
      el.removeEventListener('dblclick', onDbl);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointerup', onEnd);
      el.removeEventListener('pointercancel', onEnd);
      el.removeEventListener('contextmenu', onMenu);
    };
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
