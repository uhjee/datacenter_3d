// 서버실 공조 상세: 컨테인먼트(CAC / HAC) 패널, 천장 리턴 플레넘, 기류 파티클 (docs/PLAN.md §3.3~3.4)
// 모두 층 그룹 안(층 바닥 기준 좌표)에 그린다.

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, EdgesGeometry, Points, PointsMaterial, Vector3 } from 'three';
import { RAISED_H } from '../data/building';
import { RACKS, type Rack } from '../data/racks';
import { AIR_LAYOUT, tempRGB, type AirCfg, type AirLayout, type RoomLabel, type RoomTherm } from '../data/thermal';
import { useView } from '../store/useView';
import { useRoomTherm } from '../ui/useStatus';
import { floorAnimY } from './floorAnim';

const F = RAISED_H;
const PANEL = { cold: '#4dabf7', hot: '#ff8787' };

export function AirRoom({ label }: { label: RoomLabel }) {
  const cfg = useView((s) => s.airCfg[label]);
  const airOn = useView((s) => s.airOn);
  const active = useView((s) => s.airRoom === label);
  const L = AIR_LAYOUT[label];
  const plenum = cfg.plenum || cfg.containment === 'HAC';
  return (
    <group>
      {cfg.containment === 'CAC' && <ColdContainment L={L} />}
      {cfg.containment === 'HAC' && <HotContainment L={L} />}
      {plenum && <Ceiling L={L} />}
      {airOn && active && <Particles label={label} />}
    </group>
  );
}

// 더운 공기 통로 상자: 반투명 면 + 진한 테두리 (실내 공기와 섞이지 않는 경계)
function HotBox({ pos, size, opacity }: { pos: [number, number, number]; size: [number, number, number]; opacity: number }) {
  const edges = useMemo(() => new EdgesGeometry(new BoxGeometry(...size)), [size[0], size[1], size[2]]);
  return (
    <group position={pos}>
      <mesh raycast={() => null} renderOrder={3}>
        <boxGeometry args={size} />
        <meshBasicMaterial color={PANEL.hot} transparent opacity={opacity} depthWrite={false} />
      </mesh>
      <lineSegments geometry={edges} raycast={() => null}>
        <lineBasicMaterial color={PANEL.hot} transparent opacity={0.75} />
      </lineSegments>
    </group>
  );
}

function Panel({ pos, size, color, opacity = 0.18 }: { pos: [number, number, number]; size: [number, number, number]; color: string; opacity?: number }) {
  return (
    <mesh position={pos} raycast={() => null} renderOrder={3}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} transparent opacity={opacity} depthWrite={false} roughness={0.2} metalness={0.1} />
    </mesh>
  );
}

// 통로 z에서 side(±1) 쪽에 랙 열이 있는지 (바깥 통로는 한쪽에만 랙이 있다)
function useRackSide(label: RoomLabel) {
  return useMemo(() => {
    const zs = RACKS.filter((r) => r.serverRoom === label).map((r) => r.z);
    return (z: number, side: number) => zs.some((rz) => Math.abs(rz - (z + side * 1.2)) < 0.1);
  }, [label]);
}

// 냉복도 봉쇄: 블록마다 냉복도 위 지붕 + 양 끝 문 (랙이 없는 쪽은 바닥부터 벽)
function ColdContainment({ L }: { L: AirLayout }) {
  const h = L.rackTop - F;
  const hasRack = useRackSide(L.label);
  return (
    <group>
      {L.blocks.flatMap(([bx0, bx1]) =>
        L.coldZ.map((z) => (
          <group key={`${bx0}|${z}`}>
            <Panel pos={[(bx0 + bx1) / 2, L.rackTop + 0.02, z]} size={[bx1 - bx0, 0.04, 1.2]} color={PANEL.cold} opacity={0.28} />
            {[bx0 - 0.02, bx1 + 0.02].map((x) => (
              <Panel key={x} pos={[x, F + h / 2, z]} size={[0.04, h, 1.2]} color={PANEL.cold} />
            ))}
            {[-1, 1]
              .filter((s) => !hasRack(z, s))
              .map((s) => (
                <Panel key={s} pos={[(bx0 + bx1) / 2, F + h / 2, z + s * 0.6]} size={[bx1 - bx0, h, 0.04]} color={PANEL.cold} />
              ))}
          </group>
        )),
      )}
    </group>
  );
}

// 열복도 봉쇄: 블록마다 열복도 양옆을 천장까지 막고(랙이 없는 바깥쪽은 바닥부터) 끝 문, 천장으로 이어지는 굴뚝
function HotContainment({ L }: { L: AirLayout }) {
  const top = L.ceiling;
  const hasRack = useRackSide(L.label);
  return (
    <group>
      {L.blocks.flatMap(([bx0, bx1]) =>
        L.hotZ.map((z) => {
          return (
            <group key={`${bx0}|${z}`}>
              {[-1, 1].map((s) => {
                const full = !hasRack(z, s);
                const y0 = full ? F : L.rackTop;
                return <Panel key={s} pos={[(bx0 + bx1) / 2, (y0 + top) / 2, z + s * 0.6]} size={[bx1 - bx0, top - y0, 0.04]} color={PANEL.hot} opacity={0.24} />;
              })}
              {[bx0 - 0.02, bx1 + 0.02].map((x) => (
                <Panel key={x} pos={[x, (F + top) / 2, z]} size={[0.04, top - F, 1.2]} color={PANEL.hot} />
              ))}
            </group>
          );
        }),
      )}
    </group>
  );
}

// 천장 리턴 플레넘: 반투명 천장 + 그 위 더운 공기 층 + 열복도 위 리턴 그릴 + 항온항습기로 내려가는 환기 덕트
const PLENUM_H = 0.75;
function Ceiling({ L }: { L: AirLayout }) {
  const sx = L.label === 'A' ? [-19.8, 13.8] : [-13.8, 19.8];
  const ductH = L.ceiling - (F + 2.0);
  return (
    <group>
      <mesh position={[(sx[0] + sx[1]) / 2, L.ceiling, 1]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null} renderOrder={3}>
        <planeGeometry args={[sx[1] - sx[0], 21.8]} />
        <meshStandardMaterial color="#adb5bd" transparent opacity={0.2} depthWrite={false} side={2} />
      </mesh>
      {/* 천장 위 플레넘: 더운 공기만 지나는 층. 테두리로 실내와 경계를 드러낸다 */}
      <HotBox pos={[(sx[0] + sx[1]) / 2, L.ceiling + PLENUM_H / 2, 1]} size={[sx[1] - sx[0], PLENUM_H, 21.8]} opacity={0.07} />
      {/* 환기 덕트: 천장에서 항온항습기 윗면(흡입구)까지 막힌 통로 */}
      {L.units.map((u) => (
        <HotBox key={`duct-${u.id}`} pos={[u.x, F + 2.0 + ductH / 2, u.z]} size={[0.95, ductH, 1.7]} opacity={0.26} />
      ))}
      {L.hotZ.map((z) => (
        <mesh key={z} position={[L.rcx, L.ceiling - 0.01, z]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
          <planeGeometry args={[L.x1 - L.x0, 1.0]} />
          <meshBasicMaterial color="#ff8787" transparent opacity={0.22} depthWrite={false} side={2} />
        </mesh>
      ))}
      {L.units.map((u) => (
        <mesh key={u.id} position={[u.x, L.ceiling - 0.01, u.z]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
          <planeGeometry args={[1.0, 2.0]} />
          <meshBasicMaterial color="#ff8787" transparent opacity={0.3} depthWrite={false} side={2} />
        </mesh>
      ))}
    </group>
  );
}

// ── 기류 파티클 ──
// 경로: ① 항온항습기 하부 급기 → ② 이중마루 하부 → ③ 타공판 → ④ 냉복도 → ⑤ 랙 흡기 → ⑥ 랙 배기
//       → ⑦ 열복도 → ⑧ 천장 · 리턴 → ⑨ 항온항습기 흡입 → ⑩ 코일에서 열 전달
// 봉쇄가 없으면 일부가 랙 위로 넘어가 재순환하거나 랙을 거치지 않고 돌아간다(바이패스).
// 블랭킹 패널이 없으면 빈 칸으로 배기가 앞으로 되돌아온다(내부 역류).

interface Path {
  pts: number[]; // x,y,z 반복
  temps: number[];
  cum: number[]; // 누적 길이
}

const N = 900;
const SPEED = 2.4;

function makePath(L: AirLayout, cfg: AirCfg, th: RoomTherm, racks: Rack[], rnd: () => number): Path {
  const pts: number[] = [];
  const temps: number[] = [];
  const P = (x: number, y: number, z: number, t: number) => {
    pts.push(x, y, z);
    temps.push(t);
  };
  const Ts = cfg.supply;
  const plenum = cfg.plenum || cfg.containment === 'HAC';
  const yRet = plenum ? L.ceiling + 0.35 : 3.4;
  const u = L.units[Math.floor(rnd() * L.units.length)];
  const ret = (fromX: number, fromZ: number, t: number) => {
    P(fromX, yRet, fromZ, t); // ⑧
    if (plenum) {
      // 천장 리턴 플레넘: 천장 위로 항온항습기 바로 위까지 간 뒤 환기 덕트를 따라 곧게 내려간다 (실내 공기와 섞이지 않음)
      const dx = (rnd() - 0.5) * 0.5;
      const dz = (rnd() - 0.5) * 1.2;
      P(u.x + dx, yRet, u.z + dz, th.returnT);
      P(u.x + dx, F + 2.05, u.z + dz, th.returnT); // ⑨
    } else {
      P(u.x + u.dir * 0.9, yRet, u.z + (rnd() - 0.5) * 0.6, th.returnT);
      P(u.x, F + 2.05, u.z, th.returnT); // ⑨
    }
    P(u.x, F + 1.0, u.z, (th.returnT + Ts) / 2); // ⑩
    P(u.x, F + 0.2, u.z, Ts);
  };

  P(u.x + u.dir * 0.7, 0.28, u.z + (rnd() - 0.5) * 0.6, Ts); // ①
  const cz = L.coldZ[Math.floor(rnd() * L.coldZ.length)];
  const block = rnd() < 0.5 ? 0 : 1;
  const [bx0, bx1] = L.blocks[block];
  const ax = bx0 + 0.15 + rnd() * (bx1 - bx0 - 0.3);
  const az = cz + (rnd() - 0.5) * 0.9;
  P(ax, 0.28, az, Ts + 0.2); // ②
  P(ax, F + 0.05, az, Ts + 0.3); // ③

  // 바이패스: 랙에 들어가지 않고 위로 빠져 바로 돌아감
  if (cfg.containment === 'none' && rnd() < th.bypass) {
    P(ax, L.rackTop + 0.4, az, Ts + 1);
    ret(ax, az, Ts + 2);
    return finish(pts, temps);
  }

  // 바깥 냉복도는 한쪽에만 랙이 있다: 랙이 있는 쪽으로 들어간다
  const sides = [-1, 1].filter((s) => racks.some((r) => Math.abs(r.z - (cz + s * 1.2)) < 0.1));
  const side = sides.length === 1 ? sides[0] : rnd() < 0.5 ? -1 : 1;
  const frontZ = cz + side * 0.6;
  const backZ = frontZ + side * 1.2;
  const hotZ = backZ + side * 0.6;
  const idx = block * 12 + Math.min(11, Math.max(0, Math.floor((ax - bx0) / 0.6)));
  const row = racks.find((r) => Math.abs(r.z + r.facing * 0.6 - frontZ) < 0.2 && r.index === idx);
  const rt = row ? th.racks[row.id] : null;
  const h = F + 0.15 + rnd() * 1.95;
  const lv = h < F + 0.75 ? 0 : h < F + 1.5 ? 1 : 2;
  const tin = rt ? rt.inlet[lv] : Ts;
  const tex = rt && rt.kw > 0 ? rt.exhaust[lv] : tin;

  P(ax, h, az + (frontZ - az) * 0.4, (Ts + tin) / 2); // ④
  P(ax, h, frontZ, tin); // ⑤
  P(ax, h, backZ, tex); // ⑥
  // 블랭킹 패널 없음: 빈 칸을 통해 배기가 앞으로 역류
  if (!cfg.blanking && row && row.uUsed < 40 && rnd() < 0.3) {
    P(ax + 0.05, h + 0.15, frontZ + side * 0.1, tex - 1);
    P(ax + 0.05, h + 0.1, backZ, tex + 1.5);
  }
  P(ax, h + 0.2, hotZ, tex); // ⑦
  // 봉쇄 없음: 랙 위로 넘어 냉복도로 재순환한 뒤 다시 흡기
  if (cfg.containment === 'none' && rnd() < 0.28) {
    const topIn = rt ? rt.inlet[2] : Ts;
    const topEx = rt && rt.kw > 0 ? rt.exhaust[2] : topIn;
    P(ax, L.rackTop + 0.3, hotZ - side * 0.3, tex - 0.5);
    P(ax, L.rackTop + 0.3, frontZ - side * 0.4, tex - 2);
    P(ax, F + 1.9, frontZ - side * 0.3, topIn + 1);
    P(ax, F + 1.9, frontZ, topIn);
    P(ax, F + 1.9, backZ, topEx);
    P(ax, F + 2.0, hotZ, topEx);
  }
  if (cfg.containment === 'HAC') P(ax, L.ceiling - 0.1, hotZ, tex);
  ret(ax, hotZ, tex - 0.5);
  return finish(pts, temps);
}

function finish(pts: number[], temps: number[]): Path {
  const cum = [0];
  for (let i = 3; i < pts.length; i += 3) {
    cum.push(cum[cum.length - 1] + Math.hypot(pts[i] - pts[i - 3], pts[i + 1] - pts[i - 2], pts[i + 2] - pts[i - 1]));
  }
  return { pts, temps, cum };
}

let seed = 12345;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.8)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  return new CanvasTexture(c);
}

function Particles({ label }: { label: RoomLabel }) {
  const L = AIR_LAYOUT[label];
  const cfg = useView((s) => s.airCfg[label]);
  const th = useRoomTherm(label);
  const racks = useMemo(() => RACKS.filter((r) => r.serverRoom === label), [label]);
  const tex = useMemo(dotTexture, []);
  const ref = useRef<Points>(null);
  const mat = useRef<PointsMaterial>(null);
  const center = useMemo(() => new Vector3(), []);

  const geo = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(N * 3), 3));
    return g;
  }, []);

  // 설정이 바뀌면 모든 입자의 경로를 새로 만든다 (진행 위치는 흩어 놓음)
  const state = useMemo(() => {
    const paths: Path[] = [];
    const s: number[] = [];
    const seg: number[] = [];
    for (let i = 0; i < N; i++) {
      const p = makePath(L, cfg, th, racks, rnd);
      paths.push(p);
      s.push(rnd() * p.cum[p.cum.length - 1]);
      seg.push(0);
    }
    return { paths, s, seg };
  }, [L, cfg, th, racks]);

  useFrame(({ camera }, dt) => {
    // 입자 크기는 기류 시점(약 15m) 기준. 줌을 빼거나 층 전체를 볼 때도 점이 보이도록 거리에 비례해 키운다
    if (mat.current) mat.current.size = Math.max(0.32, camera.position.distanceTo(center.set(L.rcx, floorAnimY[L.floor] + 1.5, L.cz)) * 0.016);
    const pos = geo.attributes.position as BufferAttribute;
    const col = geo.attributes.color as BufferAttribute;
    const step = Math.min(dt, 0.05) * SPEED;
    for (let i = 0; i < N; i++) {
      let p = state.paths[i];
      let s = state.s[i] + step;
      let k = state.seg[i];
      const total = p.cum[p.cum.length - 1];
      if (s >= total) {
        p = state.paths[i] = makePath(L, cfg, th, racks, rnd);
        s = 0;
        k = 0;
      }
      if (k >= p.cum.length - 1 || s < p.cum[k]) k = 0;
      while (k < p.cum.length - 2 && s > p.cum[k + 1]) k++;
      state.s[i] = s;
      state.seg[i] = k;
      const len = p.cum[k + 1] - p.cum[k] || 1;
      const f = (s - p.cum[k]) / len;
      const a = k * 3;
      pos.setXYZ(i, p.pts[a] + (p.pts[a + 3] - p.pts[a]) * f, p.pts[a + 1] + (p.pts[a + 4] - p.pts[a + 1]) * f, p.pts[a + 2] + (p.pts[a + 5] - p.pts[a + 2]) * f);
      // 색표는 sRGB 값이라 정점 색(선형)으로 바꿔 넣는다
      const [r, g, b] = tempRGB(p.temps[k] + (p.temps[k + 1] - p.temps[k]) * f);
      col.setXYZ(i, r ** 2.2, g ** 2.2, b ** 2.2);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  });

  return (
    <points ref={ref} geometry={geo} raycast={() => null} frustumCulled={false} renderOrder={6}>
      <pointsMaterial ref={mat} size={0.32} map={tex} vertexColors transparent alphaTest={0.05} depthWrite={false} sizeAttenuation toneMapped={false} />
    </points>
  );
}
