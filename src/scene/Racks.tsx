// 서버실 랙 (InstancedMesh). 랙 본체 · 장비 전면 · 블랭킹 패널 · rPDU A/B 스트립.

import { useCursor } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Color, Group, InstancedMesh, Object3D } from 'three';
import { RACK } from '../data/building';
import { DEVICE_COLOR, RACKS, type Rack } from '../data/racks';
import { traceMarkOf, useView } from '../store/useView';
import { useRoomTherm } from '../ui/useStatus';
import { SelectionFrame, useDim } from './common';
import { rackColorOf } from './rackColor';

const U_H = 0.0445;
const PLINTH = 0.1;
const tmp = new Object3D();
const col = new Color();
const dark = new Color('#151a20');

export function RackRows({ roomId }: { roomId: string }) {
  const racks = useMemo(() => RACKS.filter((r) => r.room === roomId), [roomId]);
  const devices = useMemo(() => racks.flatMap((r) => r.devices.map((d) => ({ r, d }))), [racks]);
  const pduStrips = useMemo(
    () =>
      racks.flatMap((r) =>
        r.feed === 'STS'
          ? [{ r, side: 0, color: '#be4bdb' }]
          : [
              { r, side: -1, color: '#3d8bfd' },
              { r, side: 1, color: '#fd7e14' },
            ],
      ),
    [racks],
  );

  // 장비가 없는 U 구간 (블랭킹 패널 자리)
  const gaps = useMemo(
    () =>
      racks.flatMap((r) => {
        const used = new Set<number>();
        r.devices.forEach((d) => {
          for (let u = d.u; u < d.u + d.h; u++) used.add(u);
        });
        const out: { r: Rack; u: number; h: number }[] = [];
        for (let u = 1; u <= RACK.U; u++) {
          if (used.has(u)) continue;
          let h = 1;
          while (u + h <= RACK.U && !used.has(u + h)) h++;
          out.push({ r, u, h });
          u += h - 1;
        }
        return out;
      }),
    [racks],
  );
  const label = racks[0].serverRoom;
  const blanking = useView((s) => s.airCfg[label].blanking);

  const cabRef = useRef<InstancedMesh>(null);
  const blankRef = useRef<InstancedMesh>(null);
  // 앞 · 뒤 구분: 앞면 = 반투명 메시 문 + 파란 상단 띠(흡기, 냉복도), 뒷면 = 어두운 문 + 빨간 상단 띠(배기, 열복도)
  const frontDoorRef = useRef<InstancedMesh>(null);
  const rearDoorRef = useRef<InstancedMesh>(null);
  const frontBandRef = useRef<InstancedMesh>(null);
  const rearBandRef = useRef<InstancedMesh>(null);
  const devRef = useRef<InstancedMesh>(null);
  const pduRef = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const cab = cabRef.current!;
    racks.forEach((r, i) => {
      tmp.position.set(r.x, r.y + RACK.h / 2, r.z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(1, 1, 1);
      tmp.updateMatrix();
      cab.setMatrixAt(i, tmp.matrix);
      cab.setColorAt(i, col.set(r.uUsed === 0 ? '#2a3038' : '#151a20'));
    });
    cab.instanceMatrix.needsUpdate = true;
    if (cab.instanceColor) cab.instanceColor.needsUpdate = true;

    const dev = devRef.current!;
    devices.forEach(({ r, d }, i) => {
      const h = d.h * U_H - 0.006;
      tmp.position.set(r.x, r.y + PLINTH + (d.u - 1) * U_H + h / 2, r.z + r.facing * (RACK.d / 2 + 0.012));
      tmp.scale.set(RACK.w - 0.1, h, 0.024);
      tmp.updateMatrix();
      dev.setMatrixAt(i, tmp.matrix);
      dev.setColorAt(i, col.set(DEVICE_COLOR[d.kind]));
    });
    dev.instanceMatrix.needsUpdate = true;
    if (dev.instanceColor) dev.instanceColor.needsUpdate = true;

    const face = (ref: InstancedMesh, side: 1 | -1, y: number, h: number, depth: number, off: number) => {
      racks.forEach((r, i) => {
        tmp.position.set(r.x, r.y + y, r.z + side * r.facing * (RACK.d / 2 + off));
        tmp.rotation.set(0, 0, 0);
        tmp.scale.set(RACK.w - 0.04, h, depth);
        tmp.updateMatrix();
        ref.setMatrixAt(i, tmp.matrix);
      });
      ref.instanceMatrix.needsUpdate = true;
    };
    face(frontDoorRef.current!, 1, RACK.h / 2, RACK.h - 0.06, 0.012, 0.04);
    face(rearDoorRef.current!, -1, RACK.h / 2, RACK.h - 0.06, 0.012, 0.005);
    face(frontBandRef.current!, 1, RACK.h - 0.03, 0.05, 0.06, 0.03);
    face(rearBandRef.current!, -1, RACK.h - 0.03, 0.05, 0.06, 0.03);

    const blank = blankRef.current!;
    gaps.forEach(({ r, u, h }, i) => {
      const hh = h * U_H - 0.004;
      tmp.position.set(r.x, r.y + PLINTH + (u - 1) * U_H + hh / 2, r.z + r.facing * (RACK.d / 2 + 0.01));
      tmp.scale.set(RACK.w - 0.1, hh, 0.02);
      tmp.updateMatrix();
      blank.setMatrixAt(i, tmp.matrix);
    });
    blank.instanceMatrix.needsUpdate = true;

    const pdu = pduRef.current!;
    pduStrips.forEach(({ r, side, color }, i) => {
      tmp.position.set(r.x + side * 0.2, r.y + PLINTH + 0.95, r.z - r.facing * (RACK.d / 2 + 0.02));
      tmp.scale.set(0.06, 1.8, 0.04);
      tmp.updateMatrix();
      pdu.setMatrixAt(i, tmp.matrix);
      pdu.setColorAt(i, col.set(color));
    });
    pdu.instanceMatrix.needsUpdate = true;
    if (pdu.instanceColor) pdu.instanceColor.needsUpdate = true;
  }, [racks, devices, pduStrips, gaps]);

  // 추적 · 묶음에 포함된 랙은 본체 색으로 표시, 이 서버실 랙이 하나도 안 들어가면 통째로 흐리게
  const traced = useView((s) => s.traced);
  const highlight = useView((s) => s.highlight);
  // 랙 색칠 (U 사용률 · 전력 사용률 · 흡기 온도)
  const colorMode = useView((s) => s.rackColor);
  const therm = useRoomTherm(label);
  const itLoad = useView((s) => s.itLoad);
  const scen = useView((s) => s.scenSnap);
  useLayoutEffect(() => {
    const cab = cabRef.current!;
    racks.forEach((r, i) => {
      const id = `rack:${r.id}`;
      const m = traceMarkOf(traced, id);
      const inGroup = highlight?.kind === 'group' && highlight.nodes.has(id);
      // 시나리오: 배터리 · 발전기 전원으로 버티는 동안 랙 본체에 그 색을 살짝 입힌다
      const src = scen?.nodes[id]?.src;
      const c = src === 'battery' ? '#8a7420' : src === 'gen' ? '#5b7f24' : rackColorOf(colorMode, r, therm, itLoad);
      // 온도 색은 랙 장비 앞면과 섞여 보이도록 어둡게 덜어낸다
      const paint = c ? `#${col.set(c).lerp(dark, colorMode === 'temp' ? 0.55 : 0.2).getHexString()}` : null;
      cab.setColorAt(i, col.set(m === 'up' ? '#1d5c4e' : m === 'down' ? '#6b2b47' : inGroup ? '#1f4a6b' : (paint ?? (r.uUsed === 0 ? '#2a3038' : '#151a20'))));
    });
    if (cab.instanceColor) cab.instanceColor.needsUpdate = true;
  }, [racks, traced, highlight, colorMode, therm, itLoad, scen]);
  const roomDim = useView((s) => !!s.highlight && !racks.some((r) => s.highlight!.nodes.has(`rack:${r.id}`)));
  const whole = useRef<Group>(null);
  useDim(whole, roomDim);

  const [over, setOver] = useState(false);
  useCursor(over);
  const selectedId = useView((s) => s.selectedId);
  const hoveredId = useView((s) => s.hoveredId);

  const idOf = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.instanceId != null ? `rack:${racks[e.instanceId].id}` : null);

  const marked = (id: string | null): Rack | null => {
    if (!id?.startsWith('rack:')) return null;
    const r = racks.find((k) => `rack:${k.id}` === id);
    return r ?? null;
  };
  const sel = marked(selectedId);
  const hov = marked(hoveredId);
  // 고객사를 고르면 그 고객사 랙 전부에 테두리
  const custRacks = useMemo(
    () => (selectedId?.startsWith('customer:') ? racks.filter((r) => `customer:${r.customer}` === selectedId) : []),
    [racks, selectedId],
  );

  return (
    <group ref={whole}>
      <instancedMesh
        ref={cabRef}
        args={[undefined, undefined, racks.length]}
        userData={{ rackIds: racks.map((r) => r.id) }}
        onPointerMove={(e) => {
          e.stopPropagation();
          const id = idOf(e);
          setOver(true);
          if (id && useView.getState().hoveredId !== id) useView.getState().hover(id);
        }}
        onPointerOut={() => {
          setOver(false);
          if (useView.getState().hoveredId?.startsWith('rack:')) useView.getState().hover(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          const id = idOf(e);
          if (id) useView.getState().select(id);
        }}
      >
        <boxGeometry args={[RACK.w - 0.02, RACK.h, RACK.d]} />
        <meshStandardMaterial metalness={0.4} roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={devRef} args={[undefined, undefined, Math.max(1, devices.length)]} raycast={() => null}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={frontDoorRef} args={[undefined, undefined, racks.length]} raycast={() => null} renderOrder={2}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#b9c7d6" transparent opacity={0.16} depthWrite={false} metalness={0.6} roughness={0.3} />
      </instancedMesh>
      <instancedMesh ref={rearDoorRef} args={[undefined, undefined, racks.length]} raycast={() => null}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#0b0e12" roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={frontBandRef} args={[undefined, undefined, racks.length]} raycast={() => null}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#4dabf7" toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={rearBandRef} args={[undefined, undefined, racks.length]} raycast={() => null}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#ff6b6b" toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={blankRef} args={[undefined, undefined, Math.max(1, gaps.length)]} raycast={() => null} visible={blanking}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#4a525c" roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={pduRef} args={[undefined, undefined, pduStrips.length]} raycast={() => null}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial emissiveIntensity={0.3} />
      </instancedMesh>
      {custRacks.map((r) => (
        <group key={r.id} position={[r.x, r.y, r.z]}>
          <SelectionFrame size={[RACK.w, RACK.h, RACK.d]} color="#ffd43b" />
        </group>
      ))}
      {[sel, hov].map((r, k) =>
        r && (k === 0 || r !== sel) ? (
          <group key={k} position={[r.x, r.y, r.z]}>
            <SelectionFrame size={[RACK.w, RACK.h, RACK.d]} color={k === 0 ? '#ffd43b' : '#e9ecef'} />
          </group>
        ) : null,
      )}
    </group>
  );
}
