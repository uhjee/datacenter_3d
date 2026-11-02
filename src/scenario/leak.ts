// 시나리오: 누수 (docs/PLAN.md §11.5)
// 서버실 B 이중마루 아래, 수냉식 항온항습기로 가는 냉수 분기 배관 이음부에서 물이 샌다.
// 감지 → 위치 확인 → 분기 밸브 차단까지 걸린 시간만큼 물이 번진다. 밸브를 닫으면 그 항온항습기는 냉수를 못 받아 멈추고 대기기가 대신한다.
// 대응 방식(감지선 + 자동 차단 / 감지선 + 수동 차단 / 점형 감지기 + 수동)에 따라 번지는 범위가 크게 달라지는 것을 보여준다.

import { CONNECTIONS } from '../data/connections';
import { EQUIP_BY_ID } from '../data/equipment';
import { RACKS } from '../data/racks';
import { integrateCooling, standbyOf, unitId, unitName, type CracFailParams, type CracFailSeries, type UnitState } from './cracFail';
import { FAULT_COLOR, phaseAt, sigOf, SRC_META, STARTING_COLOR, type EdgeState, type LogItem, type NodeState, type NodeStatus, type Phase, type ScenarioDef, type Snapshot } from './core';
import { NORMAL_PARAMS, snapshot as outageSnapshot } from './outage';

export type LeakResponse = 'auto' | 'manual' | 'spot';

export interface LeakParams {
  unit: number; // 새는 분기: 서버실 B의 항온항습기(수냉식) 자리 (1 · 3 · 5번, 나머지는 공냉식)
  response: LeakResponse;
  rate: number; // L/분
  loadKw: number;
  unitKw: number;
  supply: number;
}

export interface LeakSeries {
  cool: CracFailSeries;
}

export const RESPONSE_NAME: Record<LeakResponse, string> = {
  auto: '감지선 + 자동 차단 밸브',
  manual: '감지선 + 수동 차단',
  spot: '점형 감지기 + 수동 차단',
};

const START = 5;
const FILM_MM = 3; // 바닥에 번지는 물 두께
const DETECTOR = 'leak-4f';

// 시각표: 감지 · 위치 확인 · 차단 · 물 제거 · 수리
export function lt(p: LeakParams) {
  const detect = START + (p.response === 'spot' ? 120 : 20); // 점형은 물이 감지기까지 번져야 울린다
  const locate = p.response === 'spot' ? detect + 180 : detect; // 점형은 구역만 알려 마루판을 들어 찾는다
  const close = p.response === 'auto' ? detect + 5 : p.response === 'spot' ? locate + 60 : detect + 150; // 수동: 작업자가 현장까지
  const cleanup = close + 60;
  const dry = close + 240;
  const repair = close + 300;
  return { start: START, detect, locate, close, cmd: close + 5, on: close + 35, cleanup, dry, repair, end: repair + 60 };
}

// 누수 지점: 그 항온항습기 앞 이중마루 아래 냉수 분기
export function leakPoint(p: LeakParams) {
  const u = EQUIP_BY_ID[unitId('B', p.unit)].pos;
  return { x: u[0] - 1.8, z: u[2] };
}
// 감지선은 동쪽 벽 감지기 함에서 배관을 따라 깔려 있다 (위치 표시형, ±1m)
const cablePos = (p: LeakParams) => {
  const d = EQUIP_BY_ID[DETECTOR].pos;
  const lp = leakPoint(p);
  return +(Math.abs(lp.z - d[2]) + Math.abs(lp.x - d[0]) + 1.5).toFixed(1);
};

const crac = (p: LeakParams): CracFailParams => ({ room: 'B', unit: p.unit, second: false, loadKw: p.loadKw, unitKw: p.unitKw, supply: p.supply });

function unitStates(t: number, p: LeakParams): UnitState[] {
  const L = lt(p);
  const sb = standbyOf(crac(p));
  return Array.from({ length: 6 }, (_, i) => {
    const n = i + 1;
    if (n === p.unit) return t >= L.close && t < L.repair ? 'fault' : 'run';
    if (n === sb) return t < L.cmd || t >= L.repair ? 'standby' : t < L.on ? 'starting' : 'run';
    return 'run';
  });
}

// 바닥의 물 (L): 차단 전까지 rate로 늘고, 물 제거를 시작하면 마를 때까지 줄어든다
export function waterAt(t: number, p: LeakParams) {
  const L = lt(p);
  const max = (p.rate * (L.close - L.start)) / 60;
  if (t < L.start) return 0;
  if (t < L.close) return (p.rate * (t - L.start)) / 60;
  if (t < L.cleanup) return max;
  if (t < L.dry) return max * (1 - (t - L.cleanup) / (L.dry - L.cleanup));
  return 0;
}
// 물이 번진 반지름 (m). 마르는 동안에도 젖었던 자리는 그대로 두지 않고 남은 물 기준으로 줄인다
export const radiusOf = (liters: number) => Math.sqrt(liters / 1000 / (FILM_MM / 1000) / Math.PI);

export function phases(p: LeakParams): Phase[] {
  const L = lt(p);
  const u = unitName('B', p.unit);
  const sb = unitName('B', standbyOf(crac(p)));
  const list: Phase[] = [
    {
      t: 0,
      title: '정상 운전',
      body: '지하 냉동기실에서 올라온 냉수가 이중마루 아래 냉수 헤더에서 항온항습기(수냉식) 6대로 갈라집니다. 배관을 따라 누수 감지선이 깔려 있고, 분기마다 차단 밸브가 있습니다.',
    },
    {
      t: L.start,
      title: '냉수 분기 이음부 누수',
      body: `${u}로 가는 냉수 분기 이음부에서 분당 ${p.rate}L가 새기 시작합니다. 이중마루 아래라 눈에 보이지 않고, 바닥을 따라 랙 쪽으로 번집니다. 마루 아래에는 랙 전원 케이블과 바닥 콘센트가 지나갑니다.`,
    },
    {
      t: L.detect,
      title: p.response === 'spot' ? '점형 감지기 경보 (구역만)' : '감지선 경보 (위치 표시)',
      body:
        p.response === 'spot'
          ? '물이 번져 가장 가까운 점형 감지기에 닿고서야 경보가 울립니다. 점형 감지기는 "서버실 B 동쪽 구역"처럼 구역만 알려 줘, 어느 배관인지는 마루판을 들어 찾아야 합니다.'
          : `감지선에 물이 닿자마자 경보가 울리고, 감지기가 "감지선 ${cablePos(p)}m 지점(±1m)"을 알려 줍니다. ${u} 분기라는 것을 바로 알 수 있습니다.`,
    },
  ];
  if (p.response === 'spot') list.push({ t: L.locate, title: '마루판을 들어 위치 확인', body: `작업자가 구역의 마루판을 차례로 들어 ${u} 분기에서 새는 것을 찾았습니다. 그동안에도 물은 계속 번졌습니다.` });
  list.push(
    {
      t: L.close,
      title: p.response === 'auto' ? '자동 차단 밸브 닫힘' : '분기 밸브 수동 차단',
      body:
        (p.response === 'auto'
          ? '감지선 위치와 연동된 전동 밸브가 5초 만에 그 분기를 닫았습니다. '
          : '작업자가 현장에 도착해 분기 밸브를 손으로 닫았습니다. ') +
        `물은 멈췄지만 ${u}는 냉수를 받지 못해 냉각을 멈춥니다. 그 앞 랙 흡기가 오르기 시작합니다.`,
    },
    { t: L.on, title: '대기기 냉각 시작 (N 상태)', body: `BMS가 ${sb}를 기동해 다시 5대가 운전합니다. 예비는 없습니다. 수냉식이라 밸브를 열고 팬만 돌리면 되어 30초 안팎이면 냉각을 시작합니다.` },
    { t: L.cleanup, title: '물 제거 · 점검', body: '흡수포와 습식 청소기로 마루 아래 물을 걷어 내고, 물이 닿은 구역의 전원 케이블 · 바닥 콘센트 · 감지선을 점검합니다. 감지선은 젖은 구간을 말리거나 바꿔야 다시 감지할 수 있습니다.' },
    { t: L.repair, title: '이음부 교체 · 재가동', body: `이음부를 바꾼 뒤 밸브를 열어 ${u}가 다시 운전하고, ${sb}는 대기로 돌아갑니다. N+1이 회복됩니다.` },
  );
  return list;
}

export interface LeakValues {
  water: number;
  maxWater: number;
  radius: number;
  area: number;
  racksWet: number;
  detected: boolean;
  located: boolean;
  valveClosed: boolean;
  states: UnitState[];
  running: number;
  standby: UnitState;
  cablePos: number;
}

export function values(t: number, p: LeakParams): LeakValues {
  const L = lt(p);
  const water = waterAt(t, p);
  const r = radiusOf(water);
  const lp = leakPoint(p);
  const racksWet = r < 0.1 ? 0 : RACKS.filter((k) => k.serverRoom === 'B' && Math.hypot(k.x - lp.x, k.z - lp.z) < r + 0.3).length;
  const states = unitStates(t, p);
  return {
    water,
    maxWater: (p.rate * (L.close - L.start)) / 60,
    radius: r,
    area: Math.PI * r * r,
    racksWet,
    detected: t >= L.detect,
    located: t >= L.locate,
    valveClosed: t >= L.close && t < L.repair,
    states,
    running: states.filter((x) => x === 'run').length,
    standby: states[standbyOf(crac(p)) - 1],
    cablePos: cablePos(p),
  };
}

const NODE: Record<UnitState, NodeStatus> = { run: 'on', standby: 'standby', starting: 'starting', fault: 'fault' };

export function snapshot(t: number, p: LeakParams): Snapshot {
  const base = outageSnapshot(0, NORMAL_PARAMS);
  const nodes: Record<string, NodeState> = { ...base.nodes };
  const edges: Record<string, EdgeState> = { ...base.edges };
  const L = lt(p);
  const st = unitStates(t, p);
  st.forEach((x, k) => (nodes[unitId('B', k + 1)] = { src: x === 'fault' ? 'none' : 'utility', status: NODE[x] }));
  // 감지기: 감시 중 → 경보 (마를 때까지)
  nodes[DETECTOR] = { src: 'none', status: t >= L.detect && t < L.dry ? 'alarm' : 'on' };
  const pos = new Map(st.map((x, k) => [unitId('B', k + 1), x]));
  for (const c of CONNECTIONS) {
    const x = pos.get(c.to);
    if (!x || c.kind !== 'chw') continue;
    edges[c.id] = x === 'run' ? 'flow' : x === 'fault' ? 'none' : 'idle';
  }
  const phase = phaseAt(phases(p), t);
  return { phase, nodes, edges, sig: sigOf(phase, nodes) };
}

export function eventLog(p: LeakParams): LogItem[] {
  const L = lt(p);
  const u = unitName('B', p.unit);
  const items: LogItem[] = [
    { t: L.start, text: `${u} 냉수 분기 이음부 누수 시작 (분당 ${p.rate}L)` },
    {
      t: L.detect,
      text: p.response === 'spot' ? '점형 감지기 경보: 서버실 B 동쪽 구역' : `감지선 경보: ${cablePos(p)}m 지점 (±1m) → ${u} 분기`,
    },
  ];
  if (p.response === 'spot') items.push({ t: L.locate, text: `마루판 확인으로 누수 위치 찾음: ${u} 분기` });
  items.push(
    { t: L.close, text: `${p.response === 'auto' ? '전동 밸브 자동 차단' : '분기 밸브 수동 차단'}, 누수 멈춤 (바닥 물 ${Math.round((p.rate * (L.close - L.start)) / 60)}L)` },
    { t: L.close, text: `${u} 냉수 끊김 → 냉각 정지` },
    { t: L.cmd, text: `BMS: ${unitName('B', standbyOf(crac(p)))} 기동 명령` },
    { t: L.on, text: '대기기 냉각 시작, 운전 5대 (예비 없음)' },
    { t: L.cleanup, text: '마루 아래 물 제거 · 전원 케이블 점검 시작' },
    { t: L.dry, text: '물 제거 완료, 감지기 경보 해제' },
    { t: L.repair, text: `이음부 교체 완료, ${u} 재가동 · 대기기 대기 복귀` },
  );
  return items;
}

const WATER = '#4dabf7';

export const LEAK: ScenarioDef<LeakParams, LeakSeries> = {
  id: 'leak',
  name: '누수',
  end: 0,
  endOf: (p) => lt(p).end,
  phases,
  snapshot,
  prepare: (p) => ({ cool: integrateCooling(crac(p), lt(p).end, (t) => unitStates(t, p)) }),
  eventLog,
  // 타임라인 바탕 = 물이 새는 동안 · 차단 뒤 냉각 공백 · 예비 없음
  segments: (p) => {
    const L = lt(p);
    return [
      { from: 0, to: L.start, color: SRC_META.utility.color },
      { from: L.start, to: L.close, color: WATER },
      { from: L.close, to: L.on, color: FAULT_COLOR },
      { from: L.on, to: L.repair, color: STARTING_COLOR },
      { from: L.repair, to: L.end, color: SRC_META.utility.color },
    ];
  },
  legend: [
    { color: SRC_META.utility.color, name: '정상 (N+1)' },
    { color: WATER, name: '누수 중' },
    { color: FAULT_COLOR, name: '차단 · 냉각 공백' },
    { color: STARTING_COLOR, name: 'N · 예비 없음' },
  ],
  note: '근사 모델입니다. 감지 · 이동 · 수리 시간은 줄였습니다.',
  assume: [
    ['누수량', '분당 20L'],
    ['번지는 모양', '바닥에 3mm 두께로 고르게'],
  ],
};

// 3D 표시용: 시나리오 시각의 누수 지점 · 물 반지름
export function leakView(t: number, p: LeakParams) {
  const L = lt(p);
  return { ...leakPoint(p), radius: radiusOf(waterAt(t, p)), leaking: t >= L.start && t < L.close, alarm: t >= L.detect && t < L.dry };
}
