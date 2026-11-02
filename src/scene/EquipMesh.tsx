// 장비유형별 3D 형상. 로컬 좌표: 바닥 중심 원점, 전면 = +z, size = [폭, 높이, 깊이].

import { Line } from '@react-three/drei';
import { useMemo } from 'react';
import { raisedOf } from '../data/building';
import type { Equip } from '../data/equipment';
import { Box, Cyl, Led, type V3 } from './common';

const A_COLOR = '#3d8bfd';
const B_COLOR = '#fd7e14';

function systemColor(e: Equip) {
  if (e.system?.startsWith('A')) return A_COLOR;
  if (e.system?.startsWith('B')) return B_COLOR;
  return '#adb5bd';
}

// 반(盤) 라인업: 여러 면으로 나눠진 캐비닛
function Cabinets({
  size,
  color,
  accent,
  sectionW = 0.8,
  face = 'panel',
}: {
  size: V3;
  color: string;
  accent: string;
  sectionW?: number;
  face?: 'panel' | 'ups' | 'breakers' | 'switch';
}) {
  const [w, h, d] = size;
  const n = Math.max(1, Math.round(w / sectionW));
  const sw = w / n;
  return (
    <group>
      <Box position={[0, 0.05, 0]} size={[w, 0.1, d]} color="#1c1f24" />
      {Array.from({ length: n }, (_, i) => {
        const x = -w / 2 + sw * (i + 0.5);
        return (
          <group key={i} position={[x, 0, 0]}>
            <Box position={[0, h / 2 + 0.05, 0]} size={[sw - 0.03, h - 0.1, d]} color={color} />
            {/* 전면 세부 */}
            {face === 'panel' && (
              <>
                <Box position={[0, h * 0.72, d / 2 + 0.005]} size={[sw * 0.55, h * 0.16, 0.01]} color="#2b3036" />
                <Led position={[-sw * 0.2, h * 0.52, d / 2 + 0.02]} color={i % 3 === 0 ? '#ff6b6b' : '#51cf66'} />
                <Led position={[0, h * 0.52, d / 2 + 0.02]} color="#51cf66" />
                <Box position={[sw * 0.3, h * 0.4, d / 2 + 0.01]} size={[0.04, 0.2, 0.03]} color="#868e96" />
              </>
            )}
            {face === 'breakers' &&
              [0.3, 0.45, 0.6, 0.75].map((k) => (
                <Box key={k} position={[0, h * k, d / 2 + 0.005]} size={[sw * 0.7, h * 0.08, 0.01]} color="#495057" />
              ))}
            {face === 'ups' && (
              <>
                <Box position={[0, h * 0.78, d / 2 + 0.005]} size={[sw * 0.5, h * 0.12, 0.01]} color="#0b7285" emissive="#0b7285" emissiveIntensity={0.6} />
                <Box position={[0, h * 0.4, d / 2 + 0.005]} size={[sw * 0.8, h * 0.5, 0.01]} color="#1f2328" />
                <Led position={[sw * 0.3, h * 0.92, d / 2 + 0.02]} color="#51cf66" />
              </>
            )}
            {face === 'switch' && (
              <>
                <Box position={[0, h * 0.7, d / 2 + 0.005]} size={[sw * 0.6, h * 0.2, 0.01]} color="#2b3036" />
                <Led position={[-sw * 0.15, h * 0.7, d / 2 + 0.02]} color="#51cf66" size={0.06} />
                <Led position={[sw * 0.15, h * 0.7, d / 2 + 0.02]} color="#495057" size={0.06} />
              </>
            )}
          </group>
        );
      })}
      {/* 계통 색 띠 */}
      <Box position={[0, h + 0.02, d / 2 - 0.05]} size={[w, 0.04, 0.1]} color={accent} emissive={accent} emissiveIntensity={0.5} />
    </group>
  );
}

function Kepco({ e }: { e: Equip }) {
  const [w, h, d] = e.size;
  return (
    <group>
      <Box position={[0, h / 2, 0]} size={[w, h, d]} color="#9aa3ad" />
      <Box position={[0, h * 0.85, d / 2 + 0.01]} size={[w * 0.8, 0.12, 0.01]} color="#fab005" emissive="#fab005" emissiveIntensity={0.3} />
      {/* 지중 인입 관로: 벽을 지나 지상 개폐기까지 */}
      <Cyl position={[-2.2, 0.5, 0]} r={0.14} h={3.6} rotation={[0, 0, Math.PI / 2]} color="#495057" />
      <Cyl position={[-4.0, 3.0, 0]} r={0.14} h={5.0} color="#495057" />
      <Box position={[-4.0, 5.5 + 0.6, 0]} size={[1.2, 1.2, 1.0]} color="#7d8b6a" />
    </group>
  );
}

function Generator({ e }: { e: Equip }) {
  const [w, h, d] = e.size;
  return (
    <group>
      <Box position={[0, 0.15, 0]} size={[w, 0.3, d]} color="#343a40" />
      {/* 엔진 */}
      <Box position={[-w * 0.08, 0.3 + h * 0.3, 0]} size={[w * 0.5, h * 0.6, d * 0.75]} color="#d9a53b" />
      {/* 발전기(알터네이터) */}
      <Cyl position={[-w * 0.4, 0.3 + h * 0.28, 0]} r={d * 0.33} h={w * 0.18} rotation={[0, 0, Math.PI / 2]} color="#c4922e" />
      {/* 라디에이터 */}
      <Box position={[w * 0.36, 0.3 + h * 0.36, 0]} size={[w * 0.2, h * 0.72, d * 0.9]} color="#5c636a" />
      {[0.15, 0.3, 0.45, 0.6].map((k) => (
        <Box key={k} position={[w * 0.465, 0.3 + h * k, 0]} size={[0.02, 0.06, d * 0.8]} color="#343a40" />
      ))}
      {/* 배기관 */}
      <Cyl position={[-w * 0.05, h + 0.9, -d * 0.2]} r={0.13} h={2.0} color="#6c757d" />
      <Box position={[-w * 0.3, h * 0.75, d * 0.38]} size={[0.5, 0.35, 0.05]} color="#212529" />
    </group>
  );
}

function FuelTank({ e }: { e: Equip }) {
  const [w, h, d] = e.size;
  if (d > w * 1.5) {
    // 횡형 저장탱크 (z 방향)
    const r = Math.min(w, h) / 2;
    return (
      <group>
        {[-d * 0.35, d * 0.35].map((z) => (
          <Box key={z} position={[0, 0.25, z]} size={[w * 0.9, 0.5, 0.3]} color="#343a40" />
        ))}
        <Cyl position={[0, r + 0.05, 0]} r={r} h={d} rotation={[Math.PI / 2, 0, 0]} color="#6f7f8f" />
        <Box position={[0, 2 * r + 0.2, 0]} size={[0.4, 0.3, 0.4]} color="#495057" />
      </group>
    );
  }
  return (
    <group>
      <Box position={[0, 0.1, 0]} size={[w, 0.2, d]} color="#343a40" />
      <Box position={[0, h / 2 + 0.1, 0]} size={[w * 0.95, h - 0.2, d * 0.95]} color="#7b8794" />
      <Box position={[w * 0.3, h * 0.6, d / 2 + 0.01]} size={[0.08, h * 0.5, 0.02]} color="#ffd43b" />
    </group>
  );
}

function Battery({ e }: { e: Equip }) {
  const [w, h, d] = e.size;
  const accent = systemColor(e);
  const racks = 12;
  const rw = w / racks;
  const rows = [-d / 2 + 0.4, d / 2 - 0.4];
  return (
    <group>
      {rows.map((z, ri) => (
        <group key={ri} position={[0, 0, z]} rotation={[0, ri === 0 ? 0 : Math.PI, 0]}>
          {Array.from({ length: racks }, (_, i) => {
            const x = -w / 2 + rw * (i + 0.5);
            return (
              <group key={i} position={[x, 0, 0]}>
                <Box position={[0, h / 2, 0]} size={[rw - 0.04, h, 0.8]} color="#2a2f35" />
                {Array.from({ length: 8 }, (_, m) => (
                  <Box key={m} position={[0, 0.2 + m * 0.21, 0.405]} size={[rw - 0.12, 0.16, 0.01]} color="#3b4a42" />
                ))}
                <Led position={[0, h - 0.12, 0.42]} color="#51cf66" size={0.035} />
              </group>
            );
          })}
          <Box position={[0, h + 0.03, 0.35]} size={[w, 0.05, 0.08]} color={accent} emissive={accent} emissiveIntensity={0.5} />
        </group>
      ))}
    </group>
  );
}

function CoolingUnit({ e, water, front = false }: { e: Equip; water: boolean; front?: boolean }) {
  const [w, h, d] = e.size;
  // 이중마루가 있는 서버실은 마루 아래 받침대 + 하부 토출, 없는 서버실(전면 토출형)은 바닥에 바로 선다
  const floorH = raisedOf(e.room);
  const bodyH = h - floorH;
  const stripe = water ? '#22b8cf' : front ? '#f783ac' : '#9775fa';
  return (
    <group>
      {floorH > 0 && (
        <>
          <Box position={[0, floorH / 2, 0]} size={[w * 0.95, floorH, d * 0.95]} color="#212529" opacity={0.85} />
          <Box position={[0, floorH / 2, d / 2 + 0.01]} size={[w * 0.8, floorH * 0.7, 0.02]} color="#0b1a26" />
        </>
      )}
      {/* 본체 */}
      <Box position={[0, floorH + bodyH / 2, 0]} size={[w, bodyH, d]} color="#e3e6ea" roughness={0.5} />
      {front ? (
        // 전면 토출 루버: 정면 가운데 넓은 어두운 면에 가로 날개
        <>
          <Box position={[0, floorH + bodyH * 0.45, d / 2 + 0.006]} size={[w * 0.86, bodyH * 0.5, 0.01]} color="#1c2a36" />
          {[0.27, 0.36, 0.45, 0.54, 0.63].map((k) => (
            <Box key={k} position={[0, floorH + bodyH * k, d / 2 + 0.02]} size={[w * 0.84, 0.03, 0.04]} color="#adb5bd" />
          ))}
        </>
      ) : (
        /* 전면 그릴 */
        [0.2, 0.45, 0.7].map((k) => <Box key={k} position={[0, floorH + bodyH * k, d / 2 + 0.005]} size={[w * 0.82, bodyH * 0.18, 0.01]} color="#adb5bd" />)
      )}
      {/* 상부 흡입 그릴 */}
      <Box position={[0, h + 0.005, 0]} size={[w * 0.85, 0.01, d * 0.7]} color="#495057" />
      <Box position={[0, floorH + bodyH * 0.92, d / 2 + 0.01]} size={[w, 0.08, 0.01]} color={stripe} emissive={stripe} emissiveIntensity={0.6} />
      <Box position={[w * 0.32, floorH + bodyH * 0.86, d / 2 + 0.015]} size={[0.3, 0.16, 0.01]} color="#0b7285" emissive="#0b7285" emissiveIntensity={0.5} />
    </group>
  );
}

function Fan({ position, r }: { position: V3; r: number }) {
  return (
    <group position={position}>
      <Cyl r={r} h={0.06} color="#212529" />
      {[0, 1, 2, 3].map((k) => (
        <Box key={k} position={[0, 0.05, 0]} size={[r * 1.7, 0.02, r * 0.25]} rotation={[0, (k * Math.PI) / 4, 0]} color="#868e96" />
      ))}
    </group>
  );
}

function Condenser({ e }: { e: Equip }) {
  const [w, h, d] = e.size;
  return (
    <group>
      <Box position={[0, 0.1, 0]} size={[w, 0.2, d]} color="#343a40" />
      <Box position={[0, h / 2 + 0.1, 0]} size={[w, h - 0.2, d]} color="#dee2e6" />
      {[0.3, 0.5, 0.7].map((k) => (
        <Box key={k} position={[0, h * k, d / 2 + 0.005]} size={[w * 0.9, 0.05, 0.01]} color="#868e96" />
      ))}
      <Fan position={[-w * 0.24, h + 0.03, 0]} r={Math.min(w, d) * 0.3} />
      <Fan position={[w * 0.24, h + 0.03, 0]} r={Math.min(w, d) * 0.3} />
    </group>
  );
}

function Chiller({ e }: { e: Equip }) {
  const [w, h, d] = e.size;
  const r = d * 0.22;
  return (
    <group>
      <Box position={[0, 0.15, 0]} size={[w, 0.3, d]} color="#343a40" />
      {/* 증발기(냉수) / 응축기(냉각수) 셸 */}
      <Cyl position={[0, 0.3 + r, d * 0.22]} r={r} h={w * 0.9} rotation={[0, 0, Math.PI / 2]} color="#4c6ef5" />
      <Cyl position={[0, 0.3 + r, -d * 0.22]} r={r} h={w * 0.9} rotation={[0, 0, Math.PI / 2]} color="#40c057" />
      {/* 압축기 */}
      <Box position={[-w * 0.1, 0.3 + 2 * r + 0.35, 0]} size={[w * 0.45, 0.7, d * 0.55]} color="#adb5bd" />
      <Cyl position={[w * 0.2, 0.3 + 2 * r + 0.3, 0]} r={0.3} h={w * 0.25} rotation={[0, 0, Math.PI / 2]} color="#868e96" />
      {/* 제어반 */}
      <Box position={[w * 0.42, h * 0.55, d * 0.4]} size={[0.6, h * 0.7, 0.3]} color="#ced4da" />
      <Box position={[w * 0.42, h * 0.7, d * 0.56]} size={[0.35, 0.25, 0.01]} color="#0b7285" emissive="#0b7285" emissiveIntensity={0.5} />
    </group>
  );
}

function CoolingTower({ e }: { e: Equip }) {
  const [w, h, d] = e.size;
  const bodyH = h - 0.9;
  return (
    <group>
      <Box position={[0, 0.2, 0]} size={[w, 0.4, d]} color="#343a40" />
      <Box position={[0, 0.4 + bodyH / 2, 0]} size={[w, bodyH, d]} color="#5f7486" />
      {/* 루버 */}
      {[0.15, 0.25, 0.35].map((k) => (
        <group key={k}>
          <Box position={[0, 0.4 + bodyH * k, d / 2 + 0.01]} size={[w * 0.9, 0.08, 0.02]} color="#3b4b59" />
          <Box position={[0, 0.4 + bodyH * k, -d / 2 - 0.01]} size={[w * 0.9, 0.08, 0.02]} color="#3b4b59" />
        </group>
      ))}
      {/* 팬 스택 */}
      <Cyl position={[0, 0.4 + bodyH + 0.35, 0]} r={w * 0.38} r2={w * 0.42} h={0.7} color="#4a5a68" />
      <Fan position={[0, 0.4 + bodyH + 0.5, 0]} r={w * 0.34} />
    </group>
  );
}

function Pump({ e }: { e: Equip }) {
  const [w, h, d] = e.size;
  const water = e.id.includes('chw') ? '#4c6ef5' : '#40c057';
  return (
    <group>
      <Box position={[0, 0.1, 0]} size={[w, 0.2, d]} color="#343a40" />
      <Cyl position={[-w * 0.18, 0.2 + h * 0.3, 0]} r={h * 0.28} h={w * 0.5} rotation={[0, 0, Math.PI / 2]} color="#495057" />
      <Cyl position={[w * 0.28, 0.2 + h * 0.32, 0]} r={h * 0.32} h={d * 0.5} rotation={[Math.PI / 2, 0, 0]} color={water} />
    </group>
  );
}

function HeatExchanger({ e }: { e: Equip }) {
  const [w, h, d] = e.size;
  const plates = 14;
  return (
    <group>
      <Box position={[0, 0.1, 0]} size={[w, 0.2, d]} color="#343a40" />
      <Box position={[-w / 2 + 0.1, h / 2, 0]} size={[0.15, h, d]} color="#1864ab" />
      <Box position={[w / 2 - 0.1, h / 2, 0]} size={[0.15, h, d]} color="#1864ab" />
      {Array.from({ length: plates }, (_, i) => (
        <Box key={i} position={[-w / 2 + 0.25 + (i * (w - 0.5)) / (plates - 1), h * 0.5, 0]} size={[0.05, h * 0.8, d * 0.85]} color="#ced4da" />
      ))}
    </group>
  );
}

function Sensor({ e }: { e: Equip }) {
  const [w, h, d] = e.size;
  return (
    <group>
      <Box position={[0, h / 2, 0]} size={[0.02, h, 0.02]} color="#868e96" />
      {[0.15, 0.5, 0.88].map((k) => (
        <group key={k}>
          <Box position={[0, h * k, 0]} size={[w, 0.12, d]} color="#f8f9fa" />
          <Led position={[0, h * k, d / 2 + 0.01]} color="#4dabf7" size={0.025} />
        </group>
      ))}
    </group>
  );
}

function FireDetectors({ e }: { e: Equip }) {
  const pts = useMemo(() => {
    if (!e.area) return [[0, 0, 0]] as V3[];
    const out: V3[] = [];
    const [x0, x1] = e.area.x;
    const [z0, z1] = e.area.z;
    const nx = Math.max(2, Math.round((x1 - x0) / 6));
    const nz = Math.max(2, Math.round((z1 - z0) / 6));
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const x = x0 + ((i + 0.5) * (x1 - x0)) / nx;
        const z = z0 + ((j + 0.5) * (z1 - z0)) / nz;
        out.push([x - e.pos[0], 0, z - e.pos[2]]);
      }
    return out;
  }, [e]);
  return (
    <group>
      {pts.map((p, i) => (
        <group key={i} position={p}>
          <Cyl r={0.14} h={0.07} color="#f1f3f5" />
          <Led position={[0, -0.05, 0]} color="#ff6b6b" size={0.025} />
        </group>
      ))}
    </group>
  );
}

function LeakDetector({ e }: { e: Equip }) {
  const pts = useMemo(() => {
    if (!e.area) return null;
    const y = (e.floor === 'B1' ? 0.03 : 0.05) - e.pos[1];
    const [x0, x1] = e.area.x;
    const [z0, z1] = e.area.z;
    const ox = e.pos[0];
    const oz = e.pos[2];
    return [
      [x0 - ox, y, z0 - oz],
      [x1 - ox, y, z0 - oz],
      [x1 - ox, y, z1 - oz],
      [x0 - ox, y, z1 - oz],
      [x0 - ox, y, z0 - oz],
    ] as V3[];
  }, [e]);
  const [w, h, d] = e.size;
  return (
    <group>
      <Box position={[0, h / 2, 0]} size={[w, h, d]} color="#ffd43b" />
      {pts && <Line points={pts} color="#ffd43b" lineWidth={2} dashed dashSize={0.4} gapSize={0.2} />}
    </group>
  );
}

function GasSystem({ e }: { e: Equip }) {
  const [w, h, d] = e.size;
  const cols = 6;
  return (
    <group>
      {[-d * 0.25, d * 0.25].map((z, r) =>
        Array.from({ length: cols }, (_, i) => {
          const x = -w / 2 + 0.4 + (i * (w - 0.8)) / (cols - 1);
          return (
            <group key={`${r}-${i}`} position={[x, 0, z]}>
              <Cyl position={[0, h * 0.42, 0]} r={0.2} h={h * 0.84} color="#e03131" />
              <Cyl position={[0, h * 0.9, 0]} r={0.07} h={0.15} color="#adb5bd" />
            </group>
          );
        }),
      )}
      {/* 집합관 */}
      <Cyl position={[0, h + 0.05, 0]} r={0.06} h={w} rotation={[0, 0, Math.PI / 2]} color="#adb5bd" />
      {/* 기동용기 */}
      <Cyl position={[w / 2 + 0.3, 0.35, d / 2 - 0.2]} r={0.1} h={0.7} color="#fab005" />
    </group>
  );
}

function AccessControl({ e }: { e: Equip }) {
  const [w, h, d] = e.size;
  if (h < 1.5) {
    // 스피드게이트
    const n = 4;
    return (
      <group>
        {Array.from({ length: n }, (_, i) => {
          const x = -w / 2 + (i * w) / (n - 1);
          return <Box key={i} position={[x, h / 2, 0]} size={[0.18, h, d]} color="#adb5bd" />;
        })}
        {Array.from({ length: n - 1 }, (_, i) => {
          const x = -w / 2 + ((i + 0.5) * w) / (n - 1);
          return <Box key={i} position={[x, h * 0.7, 0]} size={[w / (n - 1) - 0.3, 0.4, 0.02]} color="#a5d8ff" opacity={0.5} />;
        })}
      </group>
    );
  }
  // 맨트랩 (유리 부스)
  return (
    <group>
      <Box position={[0, h / 2, 0]} size={[w, h, d]} color="#a5d8ff" opacity={0.18} />
      <Box position={[0, h + 0.05, 0]} size={[w, 0.1, d]} color="#868e96" />
      {[-w / 2, w / 2].map((x) => (
        <group key={x}>
          <Box position={[x, h / 2, 0]} size={[0.06, h, d * 0.5]} color="#dee2e6" opacity={0.5} />
          <Box position={[x + (x > 0 ? 0.1 : -0.1), 1.2, d * 0.35]} size={[0.04, 0.15, 0.1]} color="#212529" />
          <Led position={[x + (x > 0 ? 0.13 : -0.13), 1.3, d * 0.35]} color="#51cf66" size={0.025} />
        </group>
      ))}
    </group>
  );
}

function Cctv({ e }: { e: Equip }) {
  const [w] = e.size;
  return (
    <group>
      <Box position={[0, w * 0.5, 0]} size={[0.05, w * 0.6, 0.05]} color="#868e96" />
      <Box position={[0, w * 0.2, w * 0.25]} size={[w * 0.45, w * 0.4, w * 0.9]} rotation={[0.4, 0, 0]} color="#f1f3f5" />
    </group>
  );
}

export function EquipMesh({ e }: { e: Equip }) {
  const accent = systemColor(e);
  switch (e.type) {
    case 'kepco':
      return <Kepco e={e} />;
    case 'hvPanel':
      return <Cabinets size={e.size} color="#c9ced6" accent={e.id === 'hv-in' ? '#e03131' : accent} sectionW={1.1} />;
    case 'tr':
      return <Transformer e={e} />;
    case 'lvPanel':
      return <Cabinets size={e.size} color="#d6d1c4" accent={e.id === 'lv-tie' ? '#ae3ec9' : accent} sectionW={1.0} face="breakers" />;
    case 'ats':
      return <Cabinets size={e.size} color="#cfd4da" accent={accent} sectionW={1.4} face="switch" />;
    case 'mcc':
      return <Cabinets size={e.size} color="#b9c4cc" accent={accent} sectionW={0.8} face="breakers" />;
    case 'ups':
      return <Cabinets size={e.size} color="#2b3036" accent={accent} sectionW={0.83} face="ups" />;
    case 'pdu':
      return <Cabinets size={e.size} color="#3b4148" accent={accent} sectionW={0.8} face="breakers" />;
    case 'sts':
      return <Cabinets size={e.size} color="#3b4148" accent="#be4bdb" sectionW={1.2} face="switch" />;
    case 'generator':
      return <Generator e={e} />;
    case 'fuelTank':
      return <FuelTank e={e} />;
    case 'battery':
      return <Battery e={e} />;
    case 'crac':
      return <CoolingUnit e={e} water={false} />;
    case 'cracFront':
      return <CoolingUnit e={e} water={false} front />;
    case 'crah':
      return <CoolingUnit e={e} water />;
    case 'condenser':
      return <Condenser e={e} />;
    case 'chiller':
      return <Chiller e={e} />;
    case 'coolingTower':
      return <CoolingTower e={e} />;
    case 'pump':
      return <Pump e={e} />;
    case 'hx':
      return <HeatExchanger e={e} />;
    case 'sensor':
      return <Sensor e={e} />;
    case 'fireDetector':
      return <FireDetectors e={e} />;
    case 'leakDetector':
      return <LeakDetector e={e} />;
    case 'gasSystem':
      return <GasSystem e={e} />;
    case 'firePanel':
      return <Cabinets size={e.size} color="#c92a2a" accent="#ff8787" sectionW={1.4} />;
    case 'accessControl':
      return <AccessControl e={e} />;
    case 'cctv':
      return <Cctv e={e} />;
    default:
      return <Box position={[0, e.size[1] / 2, 0]} size={e.size} color="#868e96" />;
  }
}

// 몰드 변압기 + 보호 펜스
function Transformer({ e }: { e: Equip }) {
  const [w, h, d] = e.size;
  return (
    <group>
      <TransformerCore e={e} />
      <Box position={[0, h / 2, 0]} size={[w + 0.3, h + 0.2, d + 0.3]} color="#ced4da" opacity={0.08} />
    </group>
  );
}

function TransformerCore({ e }: { e: Equip }) {
  const [w, h, d] = e.size;
  const coilH = h * 0.62;
  return (
    <group>
      <Box position={[0, 0.1, 0]} size={[w, 0.2, d]} color="#343a40" />
      <Box position={[0, 0.35, 0]} size={[w * 0.92, 0.3, d * 0.5]} color="#495057" />
      <Box position={[0, h - 0.2, 0]} size={[w * 0.92, 0.3, d * 0.5]} color="#495057" />
      {[-1, 0, 1].map((k) => (
        <Cyl key={k} position={[k * w * 0.3, 0.5 + coilH / 2, 0]} r={Math.min(w * 0.13, d * 0.42)} h={coilH} color="#9c6b2f" roughness={0.4} />
      ))}
      {[-1, 0, 1].map((k) => (
        <Box key={k} position={[k * w * 0.3, h + 0.1, 0]} size={[0.1, 0.25, 0.1]} color="#ced4da" />
      ))}
    </group>
  );
}

