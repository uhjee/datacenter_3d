// 시나리오: 항온항습기 고장 (docs/PLAN.md §11.3)
// 서버실마다 6대 중 5대 운전 · 1대 대기(N+1). 한 대가 멈추면 대기기가 자동으로 들어와 버티고, 그사이 고장 유닛 주변 랙 흡기가 잠깐 오른다.
// 대기기까지 쓴 뒤 한 대가 더 멈추면 예비가 없어 용량이 열부하에 못 미치고 급기 · 흡기 온도가 오른다.
// 근사 모델: 정상 상태 온도(thermal.ts) 위에 ① 운전 대수 부족에 따른 급기 상승 ② 고장 유닛 주변 국부 상승을 시간에 따라 더한다.

import { CONNECTIONS } from '../data/connections';
import { EQUIP_BY_ID } from '../data/equipment';
import { RACK_BY_ID } from '../data/racks';
import { RECOMMENDED, statusOf, type RoomLabel, type RoomTherm } from '../data/thermal';
import { FAULT_COLOR, phaseAt, sigOf, SRC_META, STARTING_COLOR, type EdgeState, type LogItem, type NodeState, type NodeStatus, type Phase, type ScenarioDef, type Snapshot } from './core';
import { snapshot as outageSnapshot } from './outage';

export interface CracFailParams {
  room: RoomLabel;
  unit: number; // 먼저 고장 나는 유닛 1~6
  second: boolean; // 대기기 투입 뒤 이웃 유닛 하나 더 고장
  loadKw: number; // 시작할 때 서버실 열부하
  unitKw: number; // 유닛 1대 냉각 용량
  supply: number; // 급기 설정 °C
}

export const CT = {
  fail: 5,
  alarm: 6,
  cmd: 10, // BMS가 대기기에 기동 명령
  onA: 130, // 공냉식: 압축기 재기동 보호 시간 뒤 냉각 (실제 3~5분 → 2분)
  onB: 40, // 수냉식: 냉수 밸브 열고 팬만 돌리면 됨 (약 30초)
  second: 240,
  repair: 480, // 첫 고장 유닛 수리 완료
  end: 560,
};

const UNITS = 6;
const K_CAP = 0.06; // 환기가 1°C 따뜻해질 때 코일 용량이 느는 비율
const TAU_SUPPLY = 90; // 급기 온도 시정수(초)
const TAU_LOCAL = 45; // 국부 온도 시정수(초)
const HOT = 5; // 고장 유닛 바로 앞의 국부 상승 (°C). 이중마루 압력이 빠진 구역은 실제로 수 °C 이상 오른다
const RESIDUAL = 0.3; // 대기기가 들어온 뒤 남는 국부 상승 비율 (대기기는 다른 자리에서 불어 넣는다)

export const unitId = (room: RoomLabel, n: number) => `${room === 'A' ? 'crac' : 'crah'}-${n}`;
export const unitName = (room: RoomLabel, n: number) => `항온항습기(${room === 'A' ? '공냉식' : '수냉식'})-${n}`;
export const standbyOf = (p: CracFailParams) => (p.unit === UNITS ? UNITS - 1 : UNITS);
// 두 번째 고장: 첫 고장 유닛의 이웃(대기기 제외) → 같은 구역에 열이 몰리는 최악의 경우
export function secondOf(p: CracFailParams) {
  const sb = standbyOf(p);
  const cand = [p.unit + 1, p.unit - 1, p.unit + 2, p.unit - 2].filter((n) => n >= 1 && n <= UNITS && n !== sb);
  return cand[0];
}
const onAt = (p: CracFailParams) => (p.room === 'A' ? CT.onA : CT.onB);

export type UnitState = 'run' | 'standby' | 'starting' | 'fault';
function unitStates(t: number, p: CracFailParams): UnitState[] {
  const sb = standbyOf(p);
  const s2 = secondOf(p);
  return Array.from({ length: UNITS }, (_, i) => {
    const n = i + 1;
    if (n === p.unit) return t >= CT.fail && t < CT.repair ? 'fault' : t >= CT.repair ? (p.second ? 'run' : 'standby') : 'run';
    if (n === sb) return t < CT.cmd ? 'standby' : t < onAt(p) ? 'starting' : 'run';
    if (p.second && n === s2 && t >= CT.second) return 'fault';
    return 'run';
  });
}

export function phases(p: CracFailParams): Phase[] {
  const u = unitName(p.room, p.unit);
  const sb = unitName(p.room, standbyOf(p));
  const capN = (UNITS - 2) * p.unitKw;
  const list: Phase[] = [
    {
      t: 0,
      title: '정상 운전 (N+1)',
      body: `서버실 ${p.room} 항온항습기 6대 중 5대가 운전하고 1대(${sb})는 대기합니다. 5대 용량 ${5 * p.unitKw}kW로 열부하 ${Math.round(p.loadKw)}kW를 감당하고, 1대가 멈춰도 대기기가 대신합니다.`,
    },
    {
      t: CT.fail,
      title: `${u} 고장`,
      body: `${p.room === 'A' ? '압축기 과부하로 트립' : '송풍기 모터 고장'}되어 ${u}가 멈췄습니다. 남은 4대 용량은 ${4 * p.unitKw}kW로 열부하${4 * p.unitKw < p.loadKw ? '보다 작습니다' : '를 겨우 감당합니다'}. 무엇보다 이 유닛이 불어 넣던 이중마루 구역의 압력이 떨어져, 가까운 랙의 흡기 온도부터 오릅니다.`,
    },
    { t: CT.alarm, title: '경보', body: '항온항습기 고장 경보와 함께 주변 온습도 센서 값이 오르기 시작합니다. 통합관제실이 BMS 화면에서 확인합니다.' },
    {
      t: CT.cmd,
      title: '대기기 자동 기동',
      body:
        p.room === 'A'
          ? `BMS가 ${sb}에 기동 명령을 보냅니다. 공냉식은 팬이 먼저 돌고, 압축기는 재기동 보호 시간이 지나야 냉각을 시작합니다(실제 3~5분, 여기서는 2분).`
          : `BMS가 ${sb}에 기동 명령을 보냅니다. 수냉식은 냉수 밸브를 열고 팬만 돌리면 되므로 30초 안팎에 냉각을 시작합니다. 냉수는 이미 헤더에 돌고 있습니다.`,
    },
    {
      t: onAt(p),
      title: '대기기 냉각 시작 → N 상태',
      body: `${sb}가 냉각을 시작해 다시 5대가 운전합니다. 흡기 온도는 회복되지만 이제 예비가 없는 N 상태입니다. 고장 유닛 자리의 냉기는 대기기가 멀리서 채워 주므로 그 앞 랙은 조금 더 따뜻하게 남습니다.`,
    },
  ];
  if (p.second)
    list.push({
      t: CT.second,
      title: `${unitName(p.room, secondOf(p))} 추가 고장`,
      body: `예비가 없는 상태에서 한 대가 더 멈췄습니다. 4대 용량 ${capN}kW${capN < p.loadKw ? `가 열부하 ${Math.round(p.loadKw)}kW보다 작아` : '로 겨우 버티지만'} 급기 온도가 설정값보다 오르고, 고장 난 두 유닛 앞 구역이 가장 뜨거워집니다. 실제로는 IT 부하 이전, 이동식 냉방기, 수리 서두르기로 대응합니다.`,
    });
  list.push({
    t: CT.repair,
    title: `${u} 수리 완료`,
    body: p.second
      ? `${u}가 수리를 마치고 운전에 들어갑니다. 5대 운전으로 돌아와 온도가 회복되지만, 두 번째 고장 유닛을 고칠 때까지 예비는 없습니다.`
      : `${u}가 수리를 마치고 대기로 돌아갑니다. 다시 5대 운전 · 1대 대기의 N+1 상태입니다.`,
  });
  return list;
}

export interface CracFailSeries {
  dS: number[]; // 급기 온도 상승 °C
  hot: number[][]; // 유닛별 국부 상승 °C [초][유닛]
}

export function prepare(p: CracFailParams): CracFailSeries {
  return integrateCooling(p, CT.end, (t) => unitStates(t, p));
}

// 시각별 유닛 상태로 급기 · 국부 온도 상승을 1초 간격으로 적분 (누수 시나리오도 함께 쓴다)
export function integrateCooling(p: CracFailParams, end: number, statesAt: (t: number) => UnitState[]): CracFailSeries {
  const out: CracFailSeries = { dS: [], hot: [] };
  let dS = 0;
  const hot = Array(UNITS).fill(0);
  for (let s = 0; s <= end; s++) {
    out.dS.push(+dS.toFixed(2));
    out.hot.push(hot.map((h) => +h.toFixed(2)));
    const st = statesAt(s);
    const running = st.filter((x) => x === 'run').length;
    const cap = Math.max(1, running) * p.unitKw;
    // 용량이 모자라면 환기가 따뜻해져 코일 용량이 늘어나는 지점까지 급기가 오른다
    const target = Math.max(0, (p.loadKw / cap - 1) / K_CAP);
    dS += (target - dS) / TAU_SUPPLY;
    const standbyOn = st[standbyOf(p) - 1] === 'run';
    st.forEach((x, i) => {
      const tgt = x === 'fault' ? HOT * (standbyOn ? RESIDUAL : 1) : 0;
      hot[i] += (tgt - hot[i]) / TAU_LOCAL;
    });
  }
  return out;
}

// 랙과 유닛 사이 거리에 따른 국부 영향 (유닛은 벽에 붙어 있고 이중마루로 앞쪽 구역에 바람을 보낸다)
const reach = (rx: number, rz: number, ux: number, uz: number) => Math.exp(-(Math.abs(rz - uz) + 0.25 * Math.abs(rx - ux)) / 5);

// 정상 상태 온도에 시나리오 상승분을 더한 서버실 온도
export function adjustTherm(base: RoomTherm, p: CracFailParams, ser: CracFailSeries, t: number): RoomTherm {
  const i = Math.max(0, Math.min(ser.dS.length - 1, Math.floor(t)));
  const dS = ser.dS[i];
  const hot = ser.hot[i];
  if (dS < 0.05 && hot.every((h) => h < 0.05)) return base;
  const units = Array.from({ length: UNITS }, (_, k) => EQUIP_BY_ID[unitId(p.room, k + 1)].pos);
  const racks: RoomTherm['racks'] = {};
  let sum = 0;
  let max = -Infinity;
  let over = 0;
  for (const [id, rt] of Object.entries(base.racks)) {
    if (rt.kw === 0) {
      racks[id] = rt;
      continue;
    }
    const r = RACK_BY_ID[id];
    const local = hot.reduce((s, h, k) => s + h * reach(r.x, r.z, units[k][0], units[k][2]), 0);
    // 위쪽일수록 섞인 열기를 더 받는다
    const inlet = rt.inlet.map((v, h) => +(v + dS + local * [0.8, 1, 1.25][h]).toFixed(1)) as [number, number, number];
    const exhaust = inlet.map((v) => +(v + rt.dT).toFixed(1)) as [number, number, number];
    const top = Math.max(...inlet);
    racks[id] = { ...rt, inlet, exhaust, status: statusOf(top) };
    sum += inlet[1];
    max = Math.max(max, top);
    if (top > RECOMMENDED[1]) over++;
  }
  return { ...base, racks, avgInlet: +(sum / Math.max(base.loaded, 1)).toFixed(1), maxInlet: +max.toFixed(1), over, returnT: +(base.returnT + dS).toFixed(1) };
}

export interface CracFailValues {
  states: UnitState[];
  running: number;
  cap: number;
  supplyT: number;
  standby: UnitState;
}

export function values(t: number, p: CracFailParams, ser: CracFailSeries): CracFailValues {
  const i = Math.max(0, Math.min(CT.end, Math.floor(t)));
  const states = unitStates(t, p);
  const running = states.filter((x) => x === 'run').length;
  return { states, running, cap: running * p.unitKw, supplyT: +(p.supply + ser.dS[i]).toFixed(1), standby: states[standbyOf(p) - 1] };
}

const NODE: Record<UnitState, NodeStatus> = { run: 'on', standby: 'standby', starting: 'starting', fault: 'fault' };
const NORMAL_PARAMS = { upsOut: { A: 0, B: 0 }, facilityKw: 0, baseInlet: { A: 0, B: 0 }, genFail: false };

export function snapshot(t: number, p: CracFailParams): Snapshot {
  const base = outageSnapshot(0, NORMAL_PARAMS);
  const nodes: Record<string, NodeState> = { ...base.nodes };
  const edges: Record<string, EdgeState> = { ...base.edges };
  const st = unitStates(t, p);
  st.forEach((x, k) => {
    const n = k + 1;
    const ns: NodeState = { src: x === 'fault' ? 'none' : 'utility', status: NODE[x] };
    nodes[unitId(p.room, n)] = ns;
    if (p.room === 'A') nodes[`cond-${n}`] = ns; // 실외기는 짝 항온항습기와 함께 서고 선다
  });
  for (const c of CONNECTIONS) {
    const m = /^(crac|crah)-(\d)$/.exec(c.to);
    if (!m || (m[1] === 'crac') !== (p.room === 'A')) continue;
    const x = st[+m[2] - 1];
    if (c.kind === 'refrig' || c.kind === 'chw') edges[c.id] = x === 'run' ? 'flow' : x === 'fault' ? 'none' : 'idle';
  }
  const phase = phaseAt(phases(p), t);
  return { phase, nodes, edges, sig: sigOf(phase, nodes) };
}

export function eventLog(p: CracFailParams): LogItem[] {
  const u = unitName(p.room, p.unit);
  const sb = unitName(p.room, standbyOf(p));
  const items: LogItem[] = [
    { t: CT.fail, text: `${u} ${p.room === 'A' ? '압축기 트립' : '송풍기 정지'}, 운전 4대` },
    { t: CT.alarm, text: `경보: ${u} 고장, 주변 랙 흡기 상승 시작` },
    { t: CT.cmd, text: `BMS: ${sb} 기동 명령` },
    { t: onAt(p), text: `${sb} 냉각 시작, 운전 5대 (예비 없음)` },
  ];
  if (p.second) items.push({ t: CT.second, text: `${unitName(p.room, secondOf(p))} 추가 고장, 운전 4대 · 예비 없음` });
  items.push({ t: CT.repair, text: `${u} 수리 완료, ${p.second ? '운전 복귀 (5대)' : '대기 복귀 (N+1)'}` });
  return items;
}

const N_COLOR = '#ffa94d';

export const CRAC_FAIL: ScenarioDef<CracFailParams, CracFailSeries> = {
  id: 'cracFail',
  name: '항온항습기 고장',
  end: CT.end,
  phases,
  snapshot,
  prepare,
  eventLog,
  // 타임라인 바탕 = 예비 상태
  segments: (p) => {
    const on = onAt(p);
    const segs = [
      { from: 0, to: CT.fail, color: SRC_META.utility.color },
      { from: CT.fail, to: on, color: STARTING_COLOR },
    ];
    if (p.second) segs.push({ from: on, to: CT.second, color: N_COLOR }, { from: CT.second, to: CT.repair, color: FAULT_COLOR }, { from: CT.repair, to: CT.end, color: N_COLOR });
    else segs.push({ from: on, to: CT.repair, color: N_COLOR }, { from: CT.repair, to: CT.end, color: SRC_META.utility.color });
    return segs;
  },
  legend: [
    { color: SRC_META.utility.color, name: 'N+1 (정상)' },
    { color: STARTING_COLOR, name: '대기기 기동 중' },
    { color: N_COLOR, name: 'N · 예비 없음' },
    { color: FAULT_COLOR, name: '용량 부족' },
  ],
  note: '근사 모델입니다. 정상 상태 온도 위에 운전 대수 부족에 따른 급기 상승과 고장 유닛 주변 국부 상승을 더했습니다. 공냉식 압축기 재기동 보호 시간(실제 3~5분)은 2분으로 줄였습니다.',
};
