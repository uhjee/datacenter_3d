// 서버실 기류 · 온도 근사 모델 (docs/PLAN.md §3.3~3.4)
// 실제 CFD가 아니라, 봉쇄 · 블랭킹 · 급기 온도가 랙 흡기 온도를 어느 방향으로 얼마나 바꾸는지 보여주기 위한 단순 모델이다.
//   흡기 온도 = 급기 온도 + 재순환 비율 r × 배기 온도 상승분 / (1 − r)
//   재순환 r: 봉쇄 없음일 때 크고, 랙 위쪽 · 열 끝에서 더 크다(계수는 경향을 보이기 위한 값). 블랭킹 패널이 없으면 랙 내부 역류가 더해진다.

import { BLOCK_LEN, coldAisleDZ, hotAisleDZ, RACK, RAISED_H, SERVER_ROOMS, type FloorId } from './building';
import { EQUIPMENT } from './equipment';
import { RACKS, type Rack } from './racks';

export type Containment = 'none' | 'CAC' | 'HAC';
export type RoomLabel = 'A' | 'B';

export interface AirCfg {
  containment: Containment;
  blanking: boolean;
  supply: number; // 항온항습기 급기 설정 온도 °C
  xray: boolean; // 이중마루 투시
  plenum: boolean; // 천장 리턴 플레넘
}

export const DEFAULT_AIR: AirCfg = { containment: 'CAC', blanking: true, supply: 20, xray: true, plenum: false }; // 이중마루 아래 냉기 흐름이 보이도록 투시를 켜 둔다
// 두 서버실 모두 랙이 등을 맞댄 안쪽 통로가 열복도, 포드 사이 · 바깥 통로가 냉복도. 서버실 A(3F)는 열복도를 봉쇄(천장 리턴으로 배출), 서버실 B(4F)는 봉쇄 없음.
// 봉쇄가 없으면 섞이는 열기만큼 급기를 낮춰 운전하는 것이 보통이라 B는 18°C
export const DEFAULT_AIR_BY_ROOM: Record<RoomLabel, AirCfg> = { A: { ...DEFAULT_AIR, containment: 'HAC' }, B: { ...DEFAULT_AIR, containment: 'none', supply: 18 } };

export type TempStatus = 'cold' | 'ok' | 'warn' | 'hot';

export interface RackTherm {
  kw: number;
  dT: number; // 배기 − 흡기
  inlet: [number, number, number]; // 하 · 중 · 상
  exhaust: [number, number, number];
  status: TempStatus; // 가장 높은 흡기 기준
}

export interface RoomTherm {
  racks: Record<string, RackTherm>;
  avgInlet: number;
  maxInlet: number;
  over: number; // 권장 상한(27°C) 넘는 랙 수
  loaded: number;
  returnT: number; // 항온항습기로 돌아오는 공기 온도
  bypass: number; // 랙을 거치지 않고 돌아가는 냉기 비율
  recirc: number; // 평균 재순환 비율
  loadKw: number;
  capKw: number; // N+1: 1대를 예비로 뺀 냉각 용량
  unitKw: number;
  units: number;
}

export const RECOMMENDED: [number, number] = [18, 27]; // ASHRAE 권장 흡기
export const ALLOWABLE_MAX = 32; // ASHRAE A1 허용 상한

export function statusOf(t: number): TempStatus {
  if (t < RECOMMENDED[0]) return 'cold';
  if (t <= RECOMMENDED[1]) return 'ok';
  if (t <= ALLOWABLE_MAX) return 'warn';
  return 'hot';
}

export const STATUS_META: Record<TempStatus, { name: string; color: string }> = {
  cold: { name: '권장보다 낮음', color: '#74c0fc' },
  ok: { name: '권장 범위', color: '#69db7c' },
  warn: { name: '권장 초과 (허용 범위)', color: '#ff922b' }, // 노란색은 선택 전용이라 주황
  hot: { name: '허용 초과', color: '#ff6b6b' },
};

// 온도 → 색. ASHRAE A1 경계(허용 15 · 권장 18~27 · 허용 32)에 색이 바뀌도록 맞춘 연속 색표.
// 진한 파랑(과냉) → 하늘 → 초록(권장) → 노랑(권장 상한) → 주황(주의) → 빨강 → 진한 빨강(40°C 이상, 열복도 배기)
const STOPS: [number, [number, number, number]][] = [
  [15, [0x19, 0x71, 0xc2]],
  [18, [0x4d, 0xab, 0xf7]],
  [22, [0x51, 0xcf, 0x66]],
  [27, [0xff, 0xd4, 0x3b]],
  [32, [0xff, 0x92, 0x2b]],
  [36, [0xfa, 0x52, 0x52]],
  [40, [0xc2, 0x25, 0x5c]],
];
export function tempRGB(t: number): [number, number, number] {
  if (t <= STOPS[0][0]) return STOPS[0][1].map((v) => v / 255) as [number, number, number];
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i];
    if (t <= t1) {
      const [t0, c0] = STOPS[i - 1];
      const k = (t - t0) / (t1 - t0);
      return [0, 1, 2].map((j) => (c0[j] + (c1[j] - c0[j]) * k) / 255) as [number, number, number];
    }
  }
  return STOPS[STOPS.length - 1][1].map((v) => v / 255) as [number, number, number];
}
export function tempColor(t: number) {
  const [r, g, b] = tempRGB(t);
  const h = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}
// lo ~ hi 범위의 온도 색 그라데이션 (범례용 CSS)
export function tempGradient(lo: number, hi: number) {
  const n = 12;
  const stops = Array.from({ length: n + 1 }, (_, i) => `${tempColor(lo + ((hi - lo) * i) / n)} ${((i / n) * 100).toFixed(0)}%`);
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

// 온도 구간 (범례 · 2D 상면도 랙 칸). 판정은 흡기 기준, 열복도의 32°C 초과는 정상 배기
export const TEMP_BANDS: { lo: number; hi: number; name: string; color: string }[] = [
  { lo: -Infinity, hi: 15, name: '허용 미만 (과냉)', color: tempColor(14) },
  { lo: 15, hi: 18, name: '권장보다 낮음', color: tempColor(16.5) },
  { lo: 18, hi: 27, name: '권장 범위', color: tempColor(22) },
  { lo: 27, hi: 32, name: '주의 (권장 초과 · 허용 이내)', color: tempColor(30) },
  { lo: 32, hi: Infinity, name: '위험 (흡기) · 열복도는 정상 배기', color: tempColor(36) },
];

// ── 서버실 기하 (기류 경로 · 봉쇄 형상 공용) ──
export interface AirLayout {
  label: RoomLabel;
  roomId: string;
  floor: FloorId;
  blocks: [number, number][]; // 랙 블록의 x 범위 (블록마다 냉복도 봉쇄 · 열복도 봉쇄가 따로)
  x0: number; // 랙 영역 전체 시작 · 끝
  x1: number;
  rcx: number;
  cz: number;
  coldZ: number[];
  hotZ: number[];
  rackTop: number;
  ceiling: number; // 천장 높이 (층 바닥 기준)
  units: { id: string; x: number; z: number; dir: 1 | -1 }[];
}

export function airLayout(label: RoomLabel): AirLayout {
  const sr = SERVER_ROOMS.find((s) => s.label === label)!;
  const blocks = sr.blocks.map((x) => [x, x + BLOCK_LEN] as [number, number]);
  const x0 = Math.min(...blocks.map((b) => b[0]));
  const x1 = Math.max(...blocks.map((b) => b[1]));
  const type = label === 'A' ? 'crac' : 'crah';
  return {
    label,
    roomId: sr.roomId,
    floor: sr.floor,
    blocks,
    x0,
    x1,
    rcx: (x0 + x1) / 2,
    cz: sr.cz,
    coldZ: coldAisleDZ(sr).map((dz) => sr.cz + dz),
    hotZ: hotAisleDZ(sr).map((dz) => sr.cz + dz),
    rackTop: RAISED_H + RACK.h,
    ceiling: 3.8,
    units: EQUIPMENT.filter((e) => e.type === type).map((e) => ({ id: e.id, x: e.pos[0], z: e.pos[2], dir: label === 'A' ? 1 : -1 })),
  };
}

export const AIR_LAYOUT: Record<RoomLabel, AirLayout> = { A: airLayout('A'), B: airLayout('B') };

// ── 온도 계산 ──
const BASE_RECIRC: Record<Containment, number> = { none: 0.18, CAC: 0.03, HAC: 0.04 };
const BYPASS: Record<Containment, number> = { none: 0.3, CAC: 0.05, HAC: 0.03 };
const HEIGHT_K = [0.3, 0.8, 1.6];

const emptyFrac = (r: Rack) => (r.devices.length === 0 ? 1 : 1 - r.uUsed / RACK.U);
// 랙 실제 소비전력. load = IT 부하율(지표 패널 슬라이더, 1 = 기준)
export const rackKw = (r: Rack, load = 1) => (r.devices.length === 0 ? 0 : +(r.designKw * Math.min(1, r.uUsed / 36) * load).toFixed(1));
const deltaT = (kw: number) => (kw > 0 ? 11 + kw * 0.3 : 0);

export function computeRoom(label: RoomLabel, cfg: AirCfg, itLoad = 1): RoomTherm {
  const racks = RACKS.filter((r) => r.serverRoom === label);
  const plenumK = cfg.plenum || cfg.containment === 'HAC' ? 0.8 : 1;
  const out: Record<string, RackTherm> = {};
  let sum = 0;
  let max = -Infinity;
  let over = 0;
  let loaded = 0;
  let load = 0;
  let exSum = 0;
  let rSum = 0;
  for (const r of racks) {
    const kw = rackKw(r, itLoad);
    const dT = deltaT(kw);
    // 같은 열 · 같은 블록 이웃 랙(±1)의 배기가 재순환 열원
    const row = racks.filter((k) => k.row === r.row && k.block === r.block && Math.abs(k.index - r.index) <= 1);
    const dTl = row.reduce((s, k) => s + deltaT(rackKw(k, itLoad)), 0) / row.length;
    // 블록 양 끝(장비가 있는 첫 · 마지막 랙)은 옆으로 열기가 돌아 들어와 재순환이 더 크다
    const loadedIdx = racks.filter((k) => k.row === r.row && k.block === r.block && k.devices.length > 0).map((k) => k.index);
    const atEnd = r.index === Math.min(...loadedIdx) || r.index === Math.max(...loadedIdx);
    const endK = cfg.containment === 'none' && atEnd ? 1.4 : 1;
    const ri = cfg.blanking ? 0 : 0.15 * emptyFrac(r) * (kw > 0 ? 1 : 0);
    const inlet = HEIGHT_K.map((hk) => {
      const rh = BASE_RECIRC[cfg.containment] * hk * endK * plenumK;
      return +(cfg.supply + (rh * dTl + ri * dT) / (1 - rh - ri)).toFixed(1);
    }) as [number, number, number];
    const exhaust = inlet.map((t) => +(t + dT).toFixed(1)) as [number, number, number];
    const top = Math.max(...inlet);
    out[r.id] = { kw, dT, inlet, exhaust, status: statusOf(top) };
    if (kw > 0) {
      loaded++;
      load += kw;
      sum += inlet[1];
      max = Math.max(max, top);
      if (top > RECOMMENDED[1]) over++;
      exSum += exhaust[1] * kw;
      rSum += BASE_RECIRC[cfg.containment] * endK * plenumK + ri;
    }
  }
  const b = BYPASS[cfg.containment];
  const avgExhaust = exSum / Math.max(load, 1);
  const units = 6;
  const unitKw = label === 'A' ? 140 : 150;
  return {
    racks: out,
    avgInlet: +(sum / Math.max(loaded, 1)).toFixed(1),
    maxInlet: +max.toFixed(1),
    over,
    loaded,
    returnT: +(avgExhaust * (1 - b) + cfg.supply * b).toFixed(1),
    bypass: b,
    recirc: rSum / Math.max(loaded, 1),
    loadKw: +load.toFixed(0),
    capKw: (units - 1) * unitKw,
    unitKw,
    units,
  };
}

// 온습도 센서가 붙은 랙 (센서 위치에서 가장 가까운 랙)
export function sensorRack(sensorId: string): Rack | null {
  const e = EQUIPMENT.find((k) => k.id === sensorId);
  if (!e) return null;
  let best: Rack | null = null;
  let d = Infinity;
  for (const r of RACKS) {
    if (r.room !== e.room) continue;
    const k = Math.hypot(r.x - e.pos[0], r.z - e.pos[2]);
    if (k < d) {
      d = k;
      best = r;
    }
  }
  return best;
}
