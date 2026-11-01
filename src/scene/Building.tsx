// 층 단위 건물 렌더링: 슬래브, 실, 벽, 샤프트, 이중마루, 랙, 장비.

import { Html, useCursor } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import { CanvasTexture, Group, RepeatWrapping, SRGBColorSpace } from 'three';
import {
  AISLE_W,
  BLOCK_LEN,
  coldAisleDZ,
  FLOORS,
  FOOTPRINT,
  RAISED_H,
  ROOMS,
  SERVER_ROOMS,
  SHAFTS,
  SLAB,
  type Floor,
  type Room,
  type ServerRoomLayout,
  type Shaft,
} from '../data/building';
import { EQUIPMENT } from '../data/equipment';
import { TYPE_BY_ID } from '../data/equipTypes';
import { floorWorldY, isFloorVisible, useView } from '../store/useView';
import { HUBS } from '../data/connections';
import { floorAnimY } from './floorAnim';
import { htmlPortal } from './htmlPortal';
import { focusFloor } from './focus';
import { Box, Cyl, Selectable, SelectionFrame } from './common';
import { EquipMesh } from './EquipMesh';
import { AirRoom } from './Airflow';
import { LeakMark } from './LeakMark';
import { FireMark } from './FireMark';
import { Cages } from './Cages';
import { Heatmap } from './Heatmap';
import { MergeStatic } from './merge';
import { RackRows } from './Racks';

export function BuildingFloors() {
  return (
    <>
      {FLOORS.map((f) => (
        <FloorGroup key={f.id} floor={f} />
      ))}
    </>
  );
}

function FloorGroup({ floor }: { floor: Floor }) {
  const ref = useRef<Group>(null);
  const viewMode = useView((s) => s.viewMode);
  const focus = useView((s) => s.floorFocus);
  const layers = useView((s) => s.layers);
  const visible = isFloorVisible(floor.id, focus);
  const targetY = floorWorldY(floor.id, viewMode);

  useFrame(({ invalidate }, dt) => {
    const g = ref.current;
    if (!g) return;
    const d = targetY - g.position.y;
    if (Math.abs(d) < 0.001) {
      g.position.y = targetY;
    } else {
      // 층이 제자리에 닿을 때까지 이어 그린다 (변화가 있을 때만 그리는 방식)
      g.position.y += d * (1 - Math.exp(-Math.min(dt, 0.1) * 6));
      invalidate();
    }
    floorAnimY[floor.id] = g.position.y;
  });

  const rooms = useMemo(() => ROOMS.filter((r) => r.floor === floor.id), [floor.id]);
  const equips = useMemo(() => EQUIPMENT.filter((e) => e.floor === floor.id), [floor.id]);
  const shafts = useMemo(() => SHAFTS.filter((s) => s.floors.includes(floor.id)), [floor.id]);
  const servers = useMemo(() => SERVER_ROOMS.filter((s) => s.floor === floor.id), [floor.id]);
  const hubs = useMemo(() => HUBS.filter((h) => h.floor === floor.id), [floor.id]);
  const isRoof = floor.id === 'PH';

  return (
    <group ref={ref} position={[0, floor.y, 0]} visible={visible}>
      <Slab floor={floor} />
      {rooms.map((r) => (
        <RoomFloor key={r.id} room={r} />
      ))}
      {!isRoof && (
        <group visible={layers.walls}>
          <MergeStatic>
            <Walls floor={floor} rooms={rooms} />
          </MergeStatic>
        </group>
      )}
      {isRoof && <Parapet />}
      {rooms
        .filter((r) => r.kind !== 'corridor')
        .map((r) => (
          <RoomLabel key={r.id} room={r} floor={floor} hidden={!visible || !layers.labels || focus !== floor.id} />
        ))}
      <FloorTag floor={floor} hidden={!visible} />
      <FireMark floor={floor.id} />
      {shafts.map((s) => (
        <ShaftSegment key={s.id} shaft={s} floor={floor} shown={layers.shafts} labelHidden={!visible || !layers.shafts} />
      ))}
      {servers.map((s) => {
        const room = rooms.find((r) => r.id === s.roomId)!;
        return (
          <group key={s.roomId}>
            <RaisedFloor room={room} sr={s} />
            <group visible={layers.it}>
              <RackRows roomId={s.roomId} />
            </group>
            <AirRoom label={s.label} />
            <Heatmap label={s.label} />
            {s.label === 'B' && <LeakMark />}
            <Cages floor={floor.id} />
          </group>
        );
      })}
      {equips.map((e) => {
        const domain = TYPE_BY_ID[e.type].domain;
        if (!layers[domain]) return null;
        return (
          <Selectable key={e.id} id={e.id} size={e.size} position={e.pos} rotationY={e.rotY}>
            {/* 장비 모양은 정적이라 같은 재질 부품을 합쳐 그리기 호출을 줄인다 */}
            <MergeStatic>
              <EquipMesh e={e} />
            </MergeStatic>
          </Selectable>
        );
      })}
      {hubs.map((h) =>
        layers[h.domain] ? (
          <Selectable key={h.id} id={h.id} size={h.size} position={[h.pos[0], h.pos[1] - h.size[1] / 2, h.pos[2]]}>
            <MergeStatic>
              <HubMesh hub={h} />
            </MergeStatic>
          </Selectable>
        ) : null,
      )}
    </group>
  );
}

// 연결 지점 (장비유형 아님): 냉수 헤더는 공급·환수 배관 두 줄, 발전기 모선은 막대 모양
function HubMesh({ hub }: { hub: (typeof HUBS)[number] }) {
  const [w, h, d] = hub.size;
  const supports = [-d / 2 + 0.6, 0, d / 2 - 0.6];
  if (hub.id === 'hub:chw') {
    return (
      <group>
        <Cyl position={[-0.12, h / 2, 0]} r={0.14} h={d} rotation={[Math.PI / 2, 0, 0]} color="#22b8cf" metalness={0.5} roughness={0.35} />
        <Cyl position={[0.22, h / 2 + 0.22, 0]} r={0.12} h={d} rotation={[Math.PI / 2, 0, 0]} color="#167a88" metalness={0.5} roughness={0.35} />
        {supports.map((z) => (
          <Box key={z} position={[0.05, -(hub.pos[1] - h / 2) / 2, z]} size={[0.06, hub.pos[1] - h / 2, 0.06]} color="#495057" />
        ))}
      </group>
    );
  }
  return (
    <group>
      <Box position={[0, h / 2, 0]} size={[w, h, d]} color="#5c7a2e" metalness={0.5} roughness={0.4} />
      <Box position={[0, h + 0.02, 0]} size={[w * 0.6, 0.04, d - 0.2]} color="#a9e34b" emissive="#a9e34b" emissiveIntensity={0.4} />
      {supports.map((z) => (
        <Box key={z} position={[0, -(hub.pos[1] - h / 2) / 2, z]} size={[0.06, hub.pos[1] - h / 2, 0.06]} color="#495057" />
      ))}
    </group>
  );
}

function Slab({ floor }: { floor: Floor }) {
  const w = FOOTPRINT.x[1] - FOOTPRINT.x[0];
  const d = FOOTPRINT.z[1] - FOOTPRINT.z[0];
  return (
    <group>
      <Box position={[0, -SLAB / 2, 0]} size={[w, SLAB, d]} color={floor.id === 'PH' ? '#3a3f45' : '#2b3036'} />
      {/* 북측 샤프트·코어 띠 */}
      <Box position={[0, 0.005, -11]} size={[w, 0.01, 2]} color="#202328" />
    </group>
  );
}

function RoomFloor({ room }: { room: Room }) {
  const w = room.x[1] - room.x[0];
  const d = room.z[1] - room.z[0];
  return (
    <mesh position={[(room.x[0] + room.x[1]) / 2, 0.006, (room.z[0] + room.z[1]) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[w - 0.05, d - 0.05]} />
      <meshStandardMaterial color={room.color} roughness={0.9} />
    </mesh>
  );
}

interface Seg {
  a: [number, number];
  b: [number, number];
}

function Walls({ floor, rooms }: { floor: Floor; rooms: Room[] }) {
  const segs = useMemo(() => {
    const map = new Map<string, Seg>();
    const add = (a: [number, number], b: [number, number]) => {
      const [p, q] = a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]) ? [a, b] : [b, a];
      map.set(`${p}|${q}`, { a: p, b: q });
    };
    for (const r of rooms) {
      add([r.x[0], r.z[0]], [r.x[1], r.z[0]]);
      add([r.x[0], r.z[1]], [r.x[1], r.z[1]]);
      add([r.x[0], r.z[0]], [r.x[0], r.z[1]]);
      add([r.x[1], r.z[0]], [r.x[1], r.z[1]]);
    }
    // 건물 외곽 (북측 띠 포함)
    add([FOOTPRINT.x[0], FOOTPRINT.z[0]], [FOOTPRINT.x[1], FOOTPRINT.z[0]]);
    add([FOOTPRINT.x[0], FOOTPRINT.z[0]], [FOOTPRINT.x[0], -10]);
    add([FOOTPRINT.x[1], FOOTPRINT.z[0]], [FOOTPRINT.x[1], -10]);
    return [...map.values()];
  }, [rooms]);
  const h = floor.height - SLAB;
  return (
    <group>
      {segs.map((s, i) => {
        const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
        const cx = (s.a[0] + s.b[0]) / 2;
        const cz = (s.a[1] + s.b[1]) / 2;
        const alongX = s.a[1] === s.b[1];
        return (
          <group key={i} position={[cx, 0, cz]} rotation={[0, alongX ? 0 : Math.PI / 2, 0]}>
            <mesh position={[0, h / 2, 0]} raycast={() => null}>
              <boxGeometry args={[len, h, 0.12]} />
              <meshStandardMaterial color="#9aa5b1" transparent opacity={0.09} depthWrite={false} />
            </mesh>
            <mesh position={[0, 0.25, 0]} raycast={() => null}>
              <boxGeometry args={[len, 0.5, 0.14]} />
              <meshStandardMaterial color="#5c6670" />
            </mesh>
            <mesh position={[0, h, 0]} raycast={() => null}>
              <boxGeometry args={[len, 0.04, 0.14]} />
              <meshBasicMaterial color="#7d8894" />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function Parapet() {
  const w = FOOTPRINT.x[1] - FOOTPRINT.x[0];
  const d = FOOTPRINT.z[1] - FOOTPRINT.z[0];
  const h = 1.1;
  return (
    <group>
      <Box position={[0, h / 2, FOOTPRINT.z[0]]} size={[w, h, 0.2]} color="#495057" />
      <Box position={[0, h / 2, FOOTPRINT.z[1]]} size={[w, h, 0.2]} color="#495057" />
      <Box position={[FOOTPRINT.x[0], h / 2, 0]} size={[0.2, h, d]} color="#495057" />
      <Box position={[FOOTPRINT.x[1], h / 2, 0]} size={[0.2, h, d]} color="#495057" />
    </group>
  );
}

function RoomLabel({ room, floor, hidden }: { room: Room; floor: Floor; hidden: boolean }) {
  const y = floor.id === 'PH' ? 5.2 : floor.height - 0.9;
  return (
    <Html
      portal={htmlPortal}
      position={[(room.x[0] + room.x[1]) / 2, y, room.kind === 'roof' ? 11 : (room.z[0] + room.z[1]) / 2]}
      center
      zIndexRange={[5, 0]}
      style={{ pointerEvents: 'none' }}
    >
      <div className={`room-label room-${room.kind}`} style={{ display: hidden ? 'none' : undefined }}>
        {room.name}
      </div>
    </Html>
  );
}

// 층 이름표: 건물 남서쪽 모서리 바깥, 층 높이의 가운데
function FloorTag({ floor, hidden }: { floor: Floor; hidden: boolean }) {
  return (
    <Html portal={htmlPortal} position={[FOOTPRINT.x[0] - 1.5, floor.height / 2, FOOTPRINT.z[1] + 0.5]} center zIndexRange={[6, 0]}>
      {/* 층 번호만 보이고, 구성 설명은 마우스를 올리면 툴팁으로 */}
      <button className="floor-tag" style={{ display: hidden ? 'none' : undefined }} onClick={() => focusFloor(floor.id)} aria-label={`${floor.id} ${floor.summary}`}>
        <b>{floor.id}</b>
        <span className="floor-tip" role="tooltip">
          <em>{floor.name}</em>
          {floor.summary}
        </span>
      </button>
    </Html>
  );
}

function ShaftSegment({ shaft, floor, shown, labelHidden }: { shaft: Shaft; floor: Floor; shown: boolean; labelHidden: boolean }) {
  const id = `shaft:${shaft.id}`;
  const selected = useView((s) => s.selectedId === id);
  const hovered = useView((s) => s.hoveredId === id);
  const [over, setOver] = useState(false);
  useCursor(over);

  const w = shaft.x[1] - shaft.x[0];
  const d = shaft.z[1] - shaft.z[0];
  const isTop = floor.id === shaft.floors[shaft.floors.length - 1];
  const h = floor.id === 'PH' ? (shaft.id === 'core' ? 3.4 : 1.2) : floor.height - SLAB;
  const cx = (shaft.x[0] + shaft.x[1]) / 2;
  const cz = (shaft.z[0] + shaft.z[1]) / 2;
  const solid = floor.id === 'PH';
  return (
    <group
      position={[cx, 0, cz]}
      visible={shown}
      onPointerOver={(e) => {
        e.stopPropagation();
        setOver(true);
        useView.getState().hover(id);
      }}
      onPointerOut={() => {
        setOver(false);
        if (useView.getState().hoveredId === id) useView.getState().hover(null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        useView.getState().select(id);
      }}
    >
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w - 0.1, h, d - 0.1]} />
        <meshStandardMaterial
          color={shaft.color}
          transparent={!solid}
          opacity={solid ? 1 : selected || hovered ? 0.45 : 0.22}
          depthWrite={solid}
          roughness={0.8}
        />
      </mesh>
      {(selected || hovered) && <SelectionFrame size={[w - 0.1, h, d - 0.1]} color={selected ? '#ffd43b' : '#e9ecef'} />}
      {isTop && (
        <Html portal={htmlPortal} position={[0, h + 0.5, 0]} center zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
          <div className="shaft-label" style={{ display: labelHidden ? 'none' : undefined, borderColor: shaft.color }}>
            {shaft.name}
          </div>
        </Html>
      )}
    </group>
  );
}

// ── 이중마루 ──
function useTileTexture(kind: 'solid' | 'perf') {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = kind === 'perf' ? '#3d6f8f' : '#3a434d';
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#1f252b';
    g.lineWidth = 3;
    g.strokeRect(0, 0, 64, 64);
    if (kind === 'perf') {
      g.fillStyle = '#1b3445';
      for (let x = 8; x < 64; x += 8) for (let y = 8; y < 64; y += 8) g.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    const t = new CanvasTexture(c);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [kind]);
}

function RaisedFloor({ room, sr }: { room: Room; sr: ServerRoomLayout }) {
  const w = room.x[1] - room.x[0];
  const d = room.z[1] - room.z[0];
  const xray = useView((s) => s.airCfg[sr.label].xray);
  const solid = useTileTexture('solid');
  const perf = useTileTexture('perf');
  const solidTex = useMemo(() => {
    const t = solid.clone();
    t.repeat.set(w / 0.6, d / 0.6);
    t.needsUpdate = true;
    return t;
  }, [solid, w, d]);
  const perfTex = useMemo(() => {
    const t = perf.clone();
    t.repeat.set(BLOCK_LEN / 0.6, AISLE_W / 0.6);
    t.needsUpdate = true;
    return t;
  }, [perf]);
  const mx = (room.x[0] + room.x[1]) / 2;
  const mz = (room.z[0] + room.z[1]) / 2;
  return (
    <group>
      {/* 마루 아래 공간 표시 (측면). 투시 중에는 냉기 통로임을 강조 */}
      <mesh position={[mx, RAISED_H / 2, mz]} raycast={() => null}>
        <boxGeometry args={[w - 0.2, RAISED_H, d - 0.2]} />
        {/* 투시가 꺼져 있으면 옆면을 막아 마루 아래 기류가 비쳐 보이지 않게 한다 */}
        <meshStandardMaterial color={xray ? '#1c4f78' : '#0e2233'} transparent={xray} opacity={xray ? 0.25 : 1} depthWrite={!xray} />
      </mesh>
      <mesh position={[mx, RAISED_H + 0.002, mz]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[w - 0.2, d - 0.2]} />
        <meshStandardMaterial map={solidTex} roughness={0.85} transparent={xray} opacity={xray ? 0.18 : 1} depthWrite={!xray} />
      </mesh>
      {/* 냉복도 타공판: 냉복도 × 블록마다 (서버실 A는 포드 사이 · 바깥 통로가 냉복도) */}
      {coldAisleDZ(sr).flatMap((dz) =>
        sr.blocks.map((bx) => (
          <mesh key={`${dz}|${bx}`} position={[bx + BLOCK_LEN / 2, RAISED_H + 0.006, sr.cz + dz]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <planeGeometry args={[BLOCK_LEN, AISLE_W]} />
            <meshStandardMaterial map={perfTex} roughness={0.8} transparent={xray} opacity={xray ? 0.35 : 1} depthWrite={!xray} />
          </mesh>
        )),
      )}
    </group>
  );
}
