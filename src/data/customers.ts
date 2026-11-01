// 고객사 (코로케이션 임대). 서버실 B(4F) 증설 블록을 고객사에 빌려준다.
// 케이지는 랙과 그 앞 · 뒤 통로까지 철망으로 두른 전용 구역이다. 통로를 이웃 열과 함께 쓰는 배치에서는
// 케이지 안으로 앞면이 들어오는 이웃 열 칸에 랙을 둘 수 없다 → 케이지가 랙 수보다 넓은 면적을 차지한다.

import { AISLE_W, BLOCK_LEN, EXPANSION_BLOCK, RACK, RAISED_H, ROW_OFFSETS, SERVER_ROOMS, rackX, type FloorId } from './building';

export type CustomerId = 'A' | 'B' | 'C' | 'D';

export interface Slot {
  row: number; // 0~5
  bi: number; // 증설 블록 안 칸 0~11 (서쪽부터)
}

export interface Cage {
  x: [number, number];
  z: [number, number];
  door: 'east' | 'west'; // 출입문이 난 면
  reserved: Slot[]; // 케이지 안이라 랙을 두지 않는 칸
}

export interface Customer {
  id: CustomerId;
  name: string;
  color: string;
  floor: FloorId;
  room: string;
  summary: string;
  slots: Slot[];
  kind: 'server' | 'gpu' | 'mixed';
  designKw: number;
  cage?: Cage;
}

const SR = SERVER_ROOMS.find((s) => s.label === 'B')!;
const X0 = SR.blocks[EXPANSION_BLOCK];
const X1 = X0 + BLOCK_LEN;
const rowZ = (r: number) => SR.cz + ROW_OFFSETS[r].dz;
const range = (row: number, from: number, to: number): Slot[] => Array.from({ length: to - from + 1 }, (_, i) => ({ row, bi: from + i }));
// 케이지 동쪽 끝은 블록 끝에서 한 칸(0.6m) 더 나가 출입문 앞 여유를 둔다
const DOOR_GAP = 0.6;

export const CUSTOMERS: Customer[] = [
  {
    id: 'A',
    name: '고객사 A',
    color: '#f783ac',
    floor: SR.floor,
    room: SR.roomId,
    summary: '1·2열(첫 포드) 두 줄 24대를 한 케이지로 씁니다. 2열 앞 냉복도까지 케이지 안이라, 같은 통로를 바라보는 3열 칸은 비워 둡니다.',
    slots: [...range(0, 0, 11), ...range(1, 0, 11)],
    kind: 'server',
    designKw: 5,
    cage: {
      // 1열 앞 바깥 냉복도부터 2열 앞 냉복도까지
      x: [X0 - 0.05, X1 + DOOR_GAP],
      z: [rowZ(0) - RACK.d / 2 - AISLE_W, rowZ(1) + RACK.d / 2 + AISLE_W],
      door: 'east',
      reserved: range(2, 0, 11),
    },
  },
  {
    id: 'B',
    name: '고객사 B',
    color: '#63e6be',
    floor: SR.floor,
    room: SR.roomId,
    summary: '6열 동쪽 끝 랙 4대(GPU 고밀도)를 작은 케이지로 씁니다. 뒷면 열복도까지 케이지 안이라, 맞은편 5열 네 칸은 비워 둡니다.',
    slots: range(5, 8, 11),
    kind: 'gpu',
    designKw: 10,
    cage: {
      // 6열 뒤 열복도부터 앞 바깥 냉복도까지
      x: [rackX(SR, EXPANSION_BLOCK, 8) - RACK.w / 2 - 0.05, X1 + DOOR_GAP],
      z: [rowZ(4) + RACK.d / 2, rowZ(5) + RACK.d / 2 + AISLE_W],
      door: 'east',
      reserved: range(4, 8, 11),
    },
  },
  {
    id: 'C',
    name: '고객사 C',
    color: '#a9e34b',
    floor: SR.floor,
    room: SR.roomId,
    summary: '랙 1대만 빌려 씁니다. 케이지 없이 잠금 랙 문으로만 구분합니다.',
    slots: [{ row: 3, bi: 3 }],
    kind: 'server',
    designKw: 5,
  },
  {
    id: 'D',
    name: '고객사 D',
    color: '#ffa8a8',
    floor: SR.floor,
    room: SR.roomId,
    summary: '랙 1대만 빌려 씁니다. 케이지 없이 잠금 랙 문으로만 구분합니다.',
    slots: [{ row: 4, bi: 2 }],
    kind: 'mixed',
    designKw: 4,
  },
];

export const CUSTOMER_BY_ID = Object.fromEntries(CUSTOMERS.map((c) => [c.id, c])) as Record<CustomerId, Customer>;

// 서버실 B 증설 블록 칸 → 고객사 / 케이지 예약 여부
export function slotOwner(room: string, row: number, bi: number): { customer?: Customer; reserved?: Customer } {
  for (const c of CUSTOMERS) {
    if (c.room !== room) continue;
    if (c.slots.some((s) => s.row === row && s.bi === bi)) return { customer: c };
    if (c.cage?.reserved.some((s) => s.row === row && s.bi === bi)) return { reserved: c };
  }
  return {};
}

export const CAGE_H = RAISED_H + 2.6; // 케이지 철망 꼭대기 (층 바닥 기준)
