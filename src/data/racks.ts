// 서버실 랙. IT 장비는 추후 상세화하며, 지금은 공간(U)·전력 할당과 rPDU A/B 표시용이다.

import { EXPANSION_BLOCK, RACK, RACKS_PER_BLOCK, RAISED_H, ROW_OFFSETS, SERVER_ROOMS, rackX, rowFacing, type FloorId, type ServerRoomLayout } from './building';

export type DeviceKind = 'server' | 'storage' | 'gpu' | 'network' | 'patch';

export interface Device {
  kind: DeviceKind;
  u: number; // 시작 U (1 = 최하단)
  h: number;
}

export interface Rack {
  id: string; // 예: A-3-07 (서버실-열-번호)
  name: string;
  serverRoom: 'A' | 'B';
  floor: FloorId;
  room: string;
  row: number; // 0~5
  index: number; // 0~35 (0~11 서쪽 블록, 12~23 동쪽 블록, 24~35 증설 블록)
  block: 0 | 1 | 2;
  pod: number; // 안쪽 통로를 공유하는 두 열 묶음 0~2
  x: number;
  y: number;
  z: number;
  facing: 1 | -1;
  devices: Device[];
  uUsed: number;
  designKw: number;
  feed: 'AB' | 'STS';
}

export const DEVICE_COLOR: Record<DeviceKind, string> = {
  server: '#34495e',
  storage: '#4a3f5c',
  gpu: '#2f5446',
  network: '#5c4a2f',
  patch: '#3d3d3d',
};

// 열별 용도와 설계 전력(kW/랙): 1 네트워크·서버, 2 서버, 3 스토리지, 4 GPU(고밀도), 5 서버, 6 서버·네트워크
type RowKind = 'mixed' | 'server' | 'storage' | 'gpu';
const ROW_KIND: RowKind[] = ['mixed', 'server', 'storage', 'gpu', 'server', 'mixed'];
const ROW_DESIGN_KW = [4, 5, 5, 10, 5, 4];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fill(kind: RowKind, empty: boolean, rnd: () => number): Device[] {
  if (empty) return [];
  const out: Device[] = [];
  let u = 1;
  const limit = RACK.U - 2;
  const push = (k: DeviceKind, h: number) => {
    if (u + h - 1 > limit) return;
    out.push({ kind: k, u, h });
    u += h;
  };
  const target = limit * (kind === 'gpu' ? 0.45 : 0.45 + rnd() * 0.45);
  while (u < target) {
    const r = rnd();
    if (kind === 'gpu') {
      push('gpu', 4);
      u += 1;
    } else if (kind === 'storage') push(r < 0.4 ? 'storage' : 'server', r < 0.4 ? 4 : 2);
    else if (kind === 'mixed') push(r < 0.5 ? 'network' : 'server', 1);
    else push('server', r < 0.6 ? 1 : 2);
  }
  out.push({ kind: 'network', u: RACK.U - 1, h: 1 });
  out.push({ kind: 'patch', u: RACK.U, h: 1 });
  return out;
}

function makeRack(sr: ServerRoomLayout, r: number, block: 0 | 1 | 2, bi: number, devices: Device[], feed: Rack['feed']): Rack {
  const i = block * RACKS_PER_BLOCK + bi;
  const id = `${sr.label}-${r + 1}-${String(i + 1).padStart(2, '0')}`;
  return {
    id,
    name: `랙 ${id}`,
    serverRoom: sr.label,
    floor: sr.floor,
    room: sr.roomId,
    row: r,
    index: i,
    block,
    pod: Math.floor(r / 2),
    x: rackX(sr, block, bi),
    y: RAISED_H,
    z: sr.cz + ROW_OFFSETS[r].dz,
    facing: rowFacing(sr, r),
    devices,
    uUsed: devices.reduce((s, d) => s + d.h, 0),
    designKw: ROW_DESIGN_KW[r],
    feed,
  };
}

function build(): Rack[] {
  const rnd = mulberry32(20261031);
  const racks: Rack[] = [];
  // 개소분 두 블록
  for (const sr of SERVER_ROOMS) {
    ROW_OFFSETS.forEach((_, r) => {
      for (let i = 0; i < RACKS_PER_BLOCK * 2; i++) {
        const block = (i < RACKS_PER_BLOCK ? 0 : 1) as 0 | 1;
        const bi = i % RACKS_PER_BLOCK;
        // 1 · 3 · 5열에서 가운데 통로 쪽 끝 두 칸은 비워 둔 예약 랙 (공간 여유)
        const empty = r % 2 === 0 && (block === 0 ? bi >= RACKS_PER_BLOCK - 2 : bi < 2);
        // 6열 동쪽 블록 끝 두 랙은 단일전원 장비 → STS 경유
        racks.push(makeRack(sr, r, block, bi, fill(ROW_KIND[r], empty, rnd), r === 5 && block === 1 && bi >= RACKS_PER_BLOCK - 2 ? 'STS' : 'AB'));
      }
    });
  }
  // 증설 블록: 랙은 여섯 열 모두 세웠고, 장비는 1 · 2열(첫 포드)에만 들어왔다. 나머지는 장비 입고를 기다리는 빈 랙.
  // 개소분 배치가 바뀌지 않도록 난수열을 따로 쓴다
  const rndX = mulberry32(20261101);
  for (const sr of SERVER_ROOMS)
    ROW_OFFSETS.forEach((_, r) => {
      for (let bi = 0; bi < RACKS_PER_BLOCK; bi++) racks.push(makeRack(sr, r, EXPANSION_BLOCK, bi, fill(ROW_KIND[r], r > 1, rndX), 'AB'));
    });
  return racks;
}

export const RACKS = build();
export const RACK_BY_ID: Record<string, Rack> = Object.fromEntries(RACKS.map((r) => [r.id, r]));
