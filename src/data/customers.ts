// 고객사 (코로케이션 임대). 5F 서버실 C 전 구역을 고객사 케이지로 빌려준다.
// 케이지는 랙과 그 앞 · 뒤 통로까지 철망으로 두른 전용 구역이다. 통로를 이웃 열과 함께 쓰는 배치에서는
// 케이지 안으로 앞면 · 뒷면이 들어오는 이웃 열 칸에 랙을 둘 수 없다 → 케이지가 랙 수보다 넓은 면적을 차지한다.
// 블록 바깥 끝에는 사업자 PDU가 줄지어 서므로, 케이지 출입문은 PDU 반대쪽(블록 사이 이동 통로) 끝에 낸다.

import {
  AISLE_W,
  EXPANSION_BLOCK,
  RACK,
  RACKS_PER_BLOCK,
  ROW_OFFSETS,
  SR_BY_LABEL,
  rackX,
  type FloorId,
} from "./building";

export type CustomerId = "A" | "B" | "C" | "D" | "E";

export interface Slot {
  row: number; // 0~5
  block: number; // 0 서쪽 · 1 동쪽 · 2 증설 블록
  bi: number; // 블록 안 칸 0~11 (서쪽부터)
}

export interface Cage {
  x: [number, number];
  z: [number, number];
  door: "east" | "west"; // 출입문이 난 면
  reserved: Slot[]; // 케이지 안이라 랙을 두지 않는 칸
}

// 회로(브레이커) 규격: 연속 부하는 정격의 80%까지만 쓴다
export type CircuitKind = '1P32' | '3P32';
export const CIRCUIT: Record<CircuitKind, { name: string; kva: number; cont: number }> = {
  '1P32': { name: '단상 220V 32A', kva: 7.0, cont: +((220 * 32 * 0.8) / 1000).toFixed(1) },
  '3P32': { name: '3상 380V 32A', kva: 21.1, cont: +((Math.sqrt(3) * 380 * 32 * 0.8) / 1000).toFixed(1) },
};

// 코로케이션 계약 (예시 값)
export interface Contract {
  kw: number; // 계약 전력: 사업자가 확보해 두기로 약정한 전력
  billing: string; // 과금 방식
  circuit: CircuitKind; // 랙당 A · B 회로 각 1개
  start: string; // 'YYYY-MM'
  end: string;
  autoRenew: boolean;
  crossConnects: number; // 통신사 · 다른 고객과 잇는 회선
  remoteHands: [number, number]; // 이번 달 사용 / 포함 시간
  access: number; // 출입 인가자 수
}

// 계약 정보의 기준 시점 (예시 데이터가 날짜에 따라 바뀌지 않도록 고정)
export const AS_OF = '2026-11';

export interface Customer {
  id: CustomerId;
  name: string;
  color: string;
  floor: FloorId;
  room: string;
  summary: string;
  slots: Slot[];
  kind: "server" | "gpu" | "mixed" | "storage";
  designKw: number;
  cage?: Cage;
  contract: Contract;
}

const SR = SR_BY_LABEL.C;
const rowZ = (r: number) => SR.cz + ROW_OFFSETS[r].dz;
// 케이지 출입문 앞 여유 (블록 끝에서 한 칸 더)
const DOOR_GAP = 0.6;

// 블록 하나의 열 r0~r1 · 칸 bi0~bi1을 두르는 케이지.
// 위아래 통로(냉복도 또는 열복도)까지 케이지 안이므로, 그 통로를 함께 쓰는 바로 위 · 아래 열의 같은 칸은 비운다(reserved).
function cageOf(block: number, r0: number, r1: number, bi0 = 0, bi1 = RACKS_PER_BLOCK - 1): { slots: Slot[]; cage: Cage } {
  const slots: Slot[] = [];
  for (let row = r0; row <= r1; row++) for (let bi = bi0; bi <= bi1; bi++) slots.push({ row, block, bi });
  const reserved: Slot[] = [];
  for (const row of [r0 - 1, r1 + 1]) if (row >= 0 && row <= 5) for (let bi = bi0; bi <= bi1; bi++) reserved.push({ row, block, bi });
  // 출입문은 PDU 반대쪽 끝
  const door = SR.pduSide[block] === 1 ? "west" : "east";
  const xa = rackX(SR, block, bi0) - RACK.w / 2 - 0.05;
  const xb = rackX(SR, block, bi1) + RACK.w / 2 + 0.05;
  const x: [number, number] = door === "east" ? [xa, xb + DOOR_GAP] : [xa - DOOR_GAP, xb];
  const z: [number, number] = [rowZ(r0) - RACK.d / 2 - AISLE_W, rowZ(r1) + RACK.d / 2 + AISLE_W];
  return { slots, cage: { x, z, door, reserved } };
}

const W = 0; // 서쪽 블록
const E = 1; // 동쪽 블록 (항온항습기 쪽)
const X = EXPANSION_BLOCK; // 증설 블록 (서쪽 끝)

export const CUSTOMERS: Customer[] = [
  {
    id: "A",
    name: "고객사 A",
    color: "#f783ac",
    floor: SR.floor,
    room: SR.roomId,
    summary:
      "클라우드 사업자. 서쪽 블록 여섯 열 72대를 케이지 하나로 씁니다. 블록 전체를 두르므로 비우는 칸이 없습니다.",
    ...cageOf(W, 0, 5),
    kind: "server",
    designKw: 5,
    contract: {
      kw: 400,
      billing: '약정 kW + 초과분 kWh 1.5배 단가',
      circuit: '1P32',
      start: '2024-01',
      end: '2029-12',
      autoRenew: true,
      crossConnects: 24,
      remoteHands: [12, 40],
      access: 30,
    },
  },
  {
    id: "B",
    name: "고객사 B",
    color: "#63e6be",
    floor: SR.floor,
    room: SR.roomId,
    summary:
      "AI · GPU 서비스. 항온항습기와 가까운 동쪽 블록 1·2열 24대(고밀도)를 씁니다. 2열 앞 냉복도까지 케이지 안이라 같은 통로를 바라보는 3열은 비워 둡니다.",
    ...cageOf(E, 0, 1),
    kind: "gpu",
    designKw: 10,
    contract: {
      kw: 260,
      billing: '약정 kW + 초과분 kWh 1.5배 단가',
      circuit: '3P32',
      start: '2025-09',
      end: '2028-08',
      autoRenew: true,
      crossConnects: 8,
      remoteHands: [7, 10],
      access: 8,
    },
  },
  {
    id: "C",
    name: "고객사 C",
    color: "#a9e34b",
    floor: SR.floor,
    room: SR.roomId,
    summary:
      "금융사 재해복구 센터. 동쪽 블록 4~6열 36대를 씁니다. 4열 뒤 열복도까지 케이지 안이라 맞은편 3열은 비워 둡니다(B와 사이에 빈 줄).",
    ...cageOf(E, 3, 5),
    kind: "server",
    designKw: 5,
    contract: {
      kw: 180,
      billing: '랙당 월 고정 + 약정 kW',
      circuit: '1P32',
      start: '2024-06',
      end: '2027-05',
      autoRenew: true,
      crossConnects: 10,
      remoteHands: [2, 10],
      access: 12,
    },
  },
  {
    id: "D",
    name: "고객사 D",
    color: "#ffa8a8",
    floor: SR.floor,
    room: SR.roomId,
    summary: "게임 서비스. 증설 블록 1·2열 24대(서버 · 네트워크 혼합)를 씁니다. 같은 통로를 바라보는 3열은 비워 둡니다.",
    ...cageOf(X, 0, 1),
    kind: "mixed",
    designKw: 4,
    contract: {
      kw: 100,
      billing: '약정 kW + 초과분 kWh 1.5배 단가',
      circuit: '1P32',
      start: '2025-03',
      end: '2027-02',
      autoRenew: false,
      crossConnects: 6,
      remoteHands: [3, 5],
      access: 10,
    },
  },
  {
    id: "E",
    name: "고객사 E",
    color: "#91a7ff",
    floor: SR.floor,
    room: SR.roomId,
    summary: "공공 SI · 백업. 증설 블록 4~6열 36대(스토리지 위주)를 씁니다. 맞은편 3열은 비워 둡니다(D와 사이에 빈 줄).",
    ...cageOf(X, 3, 5),
    kind: "storage",
    designKw: 5,
    contract: {
      kw: 180,
      billing: '랙당 월 고정 (5kW 포함)',
      circuit: '1P32',
      start: '2026-01',
      end: '2028-12',
      autoRenew: true,
      crossConnects: 4,
      remoteHands: [1, 5],
      access: 6,
    },
  },
];

export const CUSTOMER_BY_ID = Object.fromEntries(
  CUSTOMERS.map((c) => [c.id, c]),
) as Record<CustomerId, Customer>;

// 서버실 칸 → 고객사 / 케이지 예약 여부
export function slotOwner(
  room: string,
  row: number,
  block: number,
  bi: number,
): { customer?: Customer; reserved?: Customer } {
  const hit = (s: Slot) => s.row === row && s.block === block && s.bi === bi;
  for (const c of CUSTOMERS) {
    if (c.room !== room) continue;
    if (c.slots.some(hit)) return { customer: c };
  }
  for (const c of CUSTOMERS) {
    if (c.room !== room) continue;
    if (c.cage?.reserved.some(hit)) return { reserved: c };
  }
  return {};
}

// 케이지 철망 꼭대기 (층 바닥 기준). 서버실 C는 이중마루가 없어 바닥부터 잰다
export const CAGE_H = SR.raised + 2.6;
export const CAGE_BASE = SR.raised;