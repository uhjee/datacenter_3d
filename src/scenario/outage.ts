// 시나리오: 한전 완전 정전 (docs/PLAN.md §11)
// 시간 t(초)에서 각 장비 · 연결이 어떤 전원으로 살아 있는지와, 배터리 · 발전기 · 온도 같은 연속값을 계산한다.
// 실제 시간을 일부 줄였다(ATS 복귀 대기 5분 → 60초, 발전기 냉각 운전 5분 → 120초). 줄인 곳은 단계 설명에 적는다.

import { CONNECTIONS, HUBS, type Conn } from '../data/connections';
import { EQUIPMENT } from '../data/equipment';
import { RACKS } from '../data/racks';
import { phaseAt, sigOf, SRC_META, STARTING_COLOR, type EdgeState, type LogItem, type NodeState, type NodeStatus, type Phase, type ScenarioDef, type Snapshot, type Src } from './core';

export interface ScenarioParams {
  upsOut: { A: number; B: number }; // UPS 출력 kW
  facilityKw: number; // 정전 중 발전기가 감당할 전체 부하 (IT + 냉각 + 기타)
  baseInlet: { A: number; B: number }; // 평상시 최고 흡기 °C
  genFail: boolean; // 발전기-2 기동 실패 (N+1 확인)
  alts?: number; // 한전 1회선 정전: 본선 정전 후 ALTS가 예비선으로 절체하기까지 초 (없으면 완전 정전)
}

// ── 타임라인 (초) ──
export const T = {
  out: 5, // 한전 본선 · 예비선 모두 정전
  genStart: 6, // 정전 감지 후 기동 신호
  genRated: 16, // 전압 · 주파수 확립 (≤10초)
  ats: 18, // ATS가 발전기 쪽으로 절체
  walkIn: 10, // UPS 정류기가 발전기 부하를 천천히 넘겨받는 시간
  back: 600, // 한전 복전
  retransfer: 660, // 복전 안정 확인 후 ATS 복귀 (실제 약 5분 → 60초로 줄임)
  genStop: 780, // 냉각 운전 후 발전기 정지 (실제 약 5분 → 120초로 줄임)
  end: 800,
};

// 시각표. 1회선 정전은 예비선이 alts초 뒤 살아나는 정전으로 본다.
// ATS는 발전기가 정격에 도달해야 넘어가므로, 그 전에 예비선이 살아나면 ATS는 상용 쪽 그대로 있고 발전기는 무부하로 돌다 선다.
export interface Timeline {
  out: number;
  genStart: number;
  genRated: number;
  ats: number;
  walkIn: number;
  back: number;
  retransfer: number;
  genStop: number;
  end: number;
  onGen: boolean; // ATS가 발전기로 넘어가는지
  mccBack: number; // 공조 동력반에 전기가 다시 들어오는 시각
}

const RESTART_CHILLER = 240;

export function tl(p: ScenarioParams): Timeline {
  if (p.alts == null) return { ...T, onGen: true, mccBack: T.ats };
  const back = T.out + p.alts;
  const onGen = T.ats < back;
  const retransfer = onGen ? back + 60 : Math.max(back, T.genRated);
  const genStop = retransfer + 120;
  const mccBack = onGen ? T.ats : back;
  return { ...T, back, retransfer, genStop, onGen, mccBack, end: Math.max(genStop, mccBack + RESTART_CHILLER) + 60 };
}

// ATS가 다시 살아난 뒤 공조 설비가 돌기까지 걸리는 시간(초). 동시에 켜면 기동 전류가 몰려 순서대로 켠다.
const RESTART: Record<string, number> = {
  crah: 5, // 팬만 있으면 바로
  pump: 8,
  coolingTower: 15,
  crac: 45, // 압축기 재기동 보호 시간
  condenser: 45, // 압축기와 함께
  chiller: 240, // 냉동기 재기동 (오일 · 냉매 압력 안정)
};
export const RESTART_DELAY = RESTART;

export const PHASES: Phase[] = [
  { t: 0, title: '정상 운전', body: '한전 22.9kV 본선으로 받은 전기가 TR → 저압 배전반 → ATS(상용) → UPS → 랙으로 갑니다. 발전기는 대기 중입니다.' },
  {
    t: T.out,
    title: '한전 완전 정전 → UPS 배터리 운전',
    body: '본선과 예비선이 모두 끊겼습니다. ALTS가 절체할 곳도 없습니다. UPS는 끊김 없이(0초) 리튬이온 배터리로 넘어가 랙은 그대로 동작합니다. 반면 UPS를 거치지 않는 공조 설비는 모두 멈춥니다.',
  },
  {
    t: T.genStart,
    title: '비상 발전기 기동',
    body: '정전을 감지한 발전기 2대가 기동합니다. 엔진이 돌고 전압 · 주파수가 안정되기까지 10초 안팎이 걸리며, 그동안 배터리가 IT 부하를 받칩니다.',
  },
  {
    t: T.ats,
    title: 'ATS 절체 → 발전기 전원',
    body: '발전기 모선이 정격에 도달하자 ATS-A · B가 발전기 쪽으로 넘어갑니다. UPS 정류기는 약 10초에 걸쳐 부하를 천천히 넘겨받고(발전기 급부하 방지) 배터리 방전이 멈춥니다.',
  },
  {
    t: T.ats + RESTART.crac,
    title: '공조 순차 재기동',
    body: '공조 동력반이 다시 살아나 팬 → 펌프 → 냉각탑 → 압축기 순으로 켜집니다. 공냉식 항온항습기는 압축기 보호 시간 뒤에 냉각을 재개합니다. 정전 동안 냉각이 멈춰 흡기 온도가 올랐습니다.',
  },
  {
    t: T.ats + RESTART.chiller,
    title: '냉동기 재기동',
    body: '냉동기는 재기동에 몇 분이 걸립니다. 그동안 서버실 B는 배관에 남은 냉수로 버티지만 냉수 온도가 올라 흡기 온도도 오릅니다. 냉동기를 UPS에 물리거나 축냉조를 두는 이유입니다.',
  },
  { t: 300, title: '발전기 운전 지속', body: '모든 부하가 발전기로 돌아갑니다. 연료 저장탱크로 약 40시간(2대 정격 운전 기준)을 버틸 수 있습니다.' },
  { t: T.back, title: '한전 복전', body: '한전 전원이 돌아왔습니다. ATS는 바로 넘어가지 않고 전압이 안정적인지 일정 시간(실제 약 5분, 여기서는 60초) 지켜봅니다.' },
  {
    t: T.retransfer,
    title: 'ATS 복귀 (상용)',
    body: 'ATS가 상용 쪽으로 돌아갑니다. 순간 정전 없이 넘기는 폐쇄 전환(closed transition)으로 가정합니다. 발전기는 부하 없이 냉각 운전을 합니다.',
  },
  { t: T.genStop, title: '발전기 정지 · 정상 복귀', body: '냉각 운전을 마친 발전기가 멈추고 다시 대기 상태가 됩니다. 배터리는 천천히 재충전됩니다.' },
];

export const phaseOf = (t: number) => phaseAt(PHASES, t);

// ── 이산 상태 ──
const utilityOn = (t: number, L: Timeline) => t < L.out || t >= L.back;
type GenState = 'off' | 'starting' | 'rated' | 'cooldown';
function genState(t: number, which: 1 | 2, p: ScenarioParams, L: Timeline): GenState {
  if (which === 2 && p.genFail) return 'off';
  if (t < L.genStart || t >= L.genStop) return 'off';
  if (t < L.genRated) return 'starting';
  if (t < L.retransfer) return 'rated';
  return 'cooldown';
}
const atsOnGen = (t: number, L: Timeline) => L.onGen && t >= L.ats && t < L.retransfer;
type UpsMode = 'normal' | 'battery' | 'walkin' | 'gen';
function upsMode(t: number, L: Timeline): UpsMode {
  if (t < L.out) return 'normal';
  // 발전기로 넘어가기 전에 예비선이 살아나면 그 순간 상용으로 돌아온다
  if (!L.onGen) return t < L.back ? 'battery' : 'normal';
  if (t >= L.retransfer) return 'normal';
  if (t < L.ats) return 'battery';
  if (t < L.ats + L.walkIn) return 'walkin';
  return 'gen';
}

const MECH_TYPE: Record<string, string> = Object.fromEntries(EQUIPMENT.map((e) => [e.id, e.type]));

export function snapshot(t: number, p: ScenarioParams): Snapshot {
  const nodes: Record<string, NodeState> = {};
  const edges: Record<string, EdgeState> = {};
  const L = tl(p);
  const single = p.alts != null;
  const util: Src = utilityOn(t, L) ? 'utility' : 'none';
  const g1 = genState(t, 1, p, L);
  const g2 = genState(t, 2, p, L);
  const genLive = (s: GenState) => s === 'rated' || s === 'cooldown';
  const busLive = genLive(g1) || genLive(g2);
  const mode = upsMode(t, L);
  const onGen = atsOnGen(t, L);

  const set = (id: string, src: Src, status: NodeStatus = src === 'none' ? 'off' : 'on') => (nodes[id] = { src, status });

  // 수전 · 특고압 · 저압 (ALTS: 본선 우선, 없으면 예비선)
  if (single) {
    // 1회선 정전: 본선은 끝까지 죽어 있고, 예비선은 살아 있다가 ALTS가 붙이는 순간부터 공급
    set('kepco-main', t < L.out ? 'utility' : 'none');
    nodes['kepco-standby'] = { src: 'utility', status: t >= L.back ? 'on' : 'standby' };
  } else {
    set('kepco-main', util);
    set('kepco-standby', util);
  }
  for (const id of ['hv-in', 'hv-a', 'hv-b', 'tr-a', 'tr-b', 'lv-a', 'lv-b']) set(id, util);
  set('lv-tie', 'none', 'standby');
  // 비상 전원
  const gNode = (s: GenState): NodeState => ({ src: genLive(s) ? 'gen' : 'none', status: s === 'off' ? 'standby' : s === 'starting' ? 'starting' : 'on' });
  nodes['gen-1'] = gNode(g1);
  nodes['gen-2'] = gNode(g2);
  nodes['hub:gen-bus'] = { src: busLive ? 'gen' : 'none', status: busLive ? 'on' : 'standby' };
  const fuelOn = g1 !== 'off' || g2 !== 'off';
  for (const id of ['fuel-main', 'fuel-1', 'fuel-2']) nodes[id] = { src: 'none', status: fuelOn ? 'on' : 'standby' };
  // ATS · UPS
  const atsSrc: Src = onGen ? (busLive ? 'gen' : 'none') : util;
  for (const s of ['a', 'b']) {
    set(`ats-${s}`, atsSrc);
    set(`mcc-${s}`, atsSrc);
    const upsSrc: Src = mode === 'battery' ? 'battery' : atsSrc;
    set(`ups-${s}`, upsSrc);
    nodes[`bat-${s}`] = { src: mode === 'battery' || mode === 'walkin' ? 'battery' : 'none', status: mode === 'battery' || mode === 'walkin' ? 'on' : 'standby' };
  }
  const upsSrc = nodes['ups-a'].src;
  for (const e of EQUIPMENT) if (e.type === 'pdu' || e.type === 'sts') set(e.id, upsSrc);
  for (const r of RACKS) set(`rack:${r.id}`, upsSrc);

  // 공조: 공조 동력반이 살아난 시점부터 장비별 재기동 시간
  // 정전 전에는 계속 운전 중, 정전 뒤에는 ATS가 발전기로 넘어간 순간부터 (복귀는 폐쇄 전환이라 끊김 없음)
  const mccOnSince = t < L.out ? -Infinity : atsSrc !== 'none' ? L.mccBack : Infinity;
  for (const c of CONNECTIONS) {
    if (c.kind !== 'mech') continue;
    const type = MECH_TYPE[c.to];
    const src = nodes[c.from].src;
    let status: NodeStatus = 'on';
    if (src === 'none') status = 'off';
    else if (t < mccOnSince + (RESTART[type] ?? 5) && mccOnSince > -Infinity) status = 'starting';
    nodes[c.to] = { src: status === 'off' ? 'none' : src, status };
  }
  // 냉수 헤더: 냉수 펌프가 하나라도 돌면 흐름
  const pumpsOn = ['pump-chw-1', 'pump-chw-2', 'pump-chw-3'].some((id) => nodes[id].status === 'on');
  for (const h of HUBS) if (h.id === 'hub:chw') nodes[h.id] = { src: 'none', status: pumpsOn ? 'on' : 'off' };
  nodes['hx-1'] = { src: 'none', status: 'standby' };

  // 연결: 실제로 전기가 흐르는지
  const conducting = (c: Conn): EdgeState => {
    const from = nodes[c.from];
    const to = nodes[c.to];
    if (!from || !to) return 'none';
    switch (c.kind) {
      case 'hv':
        if (c.from === 'kepco-standby') return single && t >= L.back ? 'utility' : 'idle'; // 평소 예비선은 대기, 1회선 정전 땐 ALTS 절체 뒤 공급
        return from.src;
      case 'lv':
        if (c.from === 'lv-tie') return 'idle';
        if (c.to.startsWith('ats')) return onGen ? (from.src === 'none' ? 'none' : 'idle') : from.src;
        return from.src;
      case 'gen':
        if (c.from === 'hub:gen-bus') return onGen && busLive ? 'gen' : 'idle';
        return from.src === 'gen' ? 'gen' : 'idle';
      case 'fuel':
        return to.status === 'on' || to.status === 'starting' ? 'flow' : 'idle';
      case 'dc':
        return from.src === 'battery' ? 'battery' : 'idle';
      case 'mech':
        return from.src;
      case 'refrig':
      case 'chw':
      case 'cw':
        if (c.standby) return 'idle';
        return from.status === 'on' && to.status === 'on' ? 'flow' : 'none';
      default:
        // UPS 출력 · STS 출력 (PDU → 랙 포함)
        return from.src;
    }
  };
  for (const c of CONNECTIONS) edges[c.id] = conducting(c);

  const phase = phaseOf(t);
  const sig = sigOf(phase, nodes);
  return { phase, nodes, edges, sig };
}

// ── 연속값: 배터리 · 발전기 · 온도 ──
// 배터리 잔량 · 온도는 이력이 있어야 하므로 시나리오를 시작할 때 1초 간격으로 한 번 적분해 둔다.
export interface Values {
  t: number;
  utility: boolean;
  gen: [GenState, GenState];
  genLoadPct: number; // 운전 중인 발전기 정격 대비
  ats: '상용' | '발전기';
  ups: UpsMode;
  soc: { A: number; B: number }; // 0~1
  batteryMin: number; // 지금 잔량으로 배터리만으로 버틸 시간
  inlet: { A: number; B: number }; // 최고 흡기 °C
  chwT: number; // 냉수 공급 온도
  coolingOn: number;
  coolingTotal: number;
}

export interface Series {
  socA: number[];
  socB: number[];
  dA: number[];
  dB: number[];
  chw: number[];
  coolingOn: number[];
}

const BAT_KWH = 300;
const UPS_EFF = 0.95;
const HEAT_RATE = 0.05; // 냉각이 완전히 멈췄을 때 흡기 상승 속도 °C/초 (약 3°C/분)
const COOL_IDS = CONNECTIONS.filter((c) => c.kind === 'mech').map((c) => c.to);
const CRAC_IDS = EQUIPMENT.filter((e) => e.type === 'crac').map((e) => e.id);
const CRAH_IDS = EQUIPMENT.filter((e) => e.type === 'crah').map((e) => e.id);

export function prepare(p: ScenarioParams): Series {
  const out: Series = { socA: [], socB: [], dA: [], dB: [], chw: [], coolingOn: [] };
  let socA = 1;
  let socB = 1;
  let dA = 0;
  let dB = 0;
  let chw = 7;
  const L = tl(p);
  for (let s = 0; s <= L.end; s++) {
    const snap = snapshot(s, p);
    out.socA.push(socA);
    out.socB.push(socB);
    out.dA.push(dA);
    out.dB.push(dB);
    out.chw.push(chw);
    out.coolingOn.push(COOL_IDS.filter((id) => snap.nodes[id].status === 'on').length);
    // 배터리: 배터리 운전 중엔 전부, 부하 인수(walk-in) 중엔 점점 줄여 방전, 그 뒤 약 0.1C로 재충전
    const mode = upsMode(s, L);
    const share = mode === 'battery' ? 1 : mode === 'walkin' ? 1 - (s - L.ats) / L.walkIn : 0;
    socA -= (share * p.upsOut.A) / UPS_EFF / 3600 / BAT_KWH;
    socB -= (share * p.upsOut.B) / UPS_EFF / 3600 / BAT_KWH;
    if (share === 0) {
      socA = Math.min(1, socA + 20 / 3600 / BAT_KWH);
      socB = Math.min(1, socB + 20 / 3600 / BAT_KWH);
    }
    // 서버실 A: 압축기(항온항습기 공냉식)가 돌아야 냉각
    const cracOn = CRAC_IDS.filter((id) => snap.nodes[id].status === 'on').length;
    const cA = Math.min(1, cracOn / (CRAC_IDS.length - 1));
    dA += HEAT_RATE * (1 - cA) - (dA * cA) / 60;
    // 서버실 B: 냉동기가 서면 냉수가 데워지고, 팬 · 펌프가 서면 코일로 열을 못 옮김
    const chillerOn = ['chiller-1', 'chiller-2', 'chiller-3'].some((id) => snap.nodes[id].status === 'on');
    const pumpOn = snap.nodes['hub:chw'].status === 'on';
    const fanOn = CRAH_IDS.filter((id) => snap.nodes[id].status === 'on').length;
    if (chillerOn) chw += (7 - chw) / 120;
    else if (pumpOn) chw += 1 / 60; // 냉수 루프 열용량: 약 1°C/분
    const cB = pumpOn && fanOn > 0 ? Math.max(0, Math.min(1, 1 - (chw - 7) / 10)) * Math.min(1, fanOn / (CRAH_IDS.length - 1)) : 0;
    dB += HEAT_RATE * (1 - cB) - (dB * cB) / 60;
  }
  return out;
}

export function values(t: number, p: ScenarioParams, ser: Series): Values {
  const L = tl(p);
  const i = Math.max(0, Math.min(L.end, Math.floor(t)));
  const g: [GenState, GenState] = [genState(t, 1, p, L), genState(t, 2, p, L)];
  const running = g.filter((s) => s === 'rated').length;
  const onGen = atsOnGen(t, L);
  const soc = Math.min(ser.socA[i], ser.socB[i]);
  return {
    t,
    utility: utilityOn(t, L),
    gen: g,
    genLoadPct: onGen && running ? p.facilityKw / (running * 2000) : 0,
    ats: onGen ? '발전기' : '상용',
    ups: upsMode(t, L),
    soc: { A: ser.socA[i], B: ser.socB[i] },
    batteryMin: ((soc * BAT_KWH * 2 * UPS_EFF) / (p.upsOut.A + p.upsOut.B)) * 60,
    inlet: { A: +(p.baseInlet.A + ser.dA[i]).toFixed(1), B: +(p.baseInlet.B + ser.dB[i]).toFixed(1) },
    chwT: +ser.chw[i].toFixed(1),
    coolingOn: ser.coolingOn[i],
    coolingTotal: COOL_IDS.length,
  };
}

// 사건 기록 (시간순)
export function eventLog(p: ScenarioParams): LogItem[] {
  const items: LogItem[] = [
    { t: T.out, text: '한전 본선 · 예비선 정전 (ALTS 절체 불가)' },
    { t: T.out, text: 'UPS-A · B 배터리 운전 전환 (0초, 랙 무정전)' },
    { t: T.out, text: '공조 동력반 정전 → 항온항습기 · 냉동기 · 펌프 · 냉각탑 정지' },
    { t: T.genStart, text: p.genFail ? '발전기-1 기동, 발전기-2 기동 실패' : '발전기-1 · 2 기동 신호' },
    { t: T.genRated, text: p.genFail ? '발전기-1 단독 정격 도달 (N+1로 감당)' : '발전기 정격 도달, 병렬 운전' },
    { t: T.ats, text: 'ATS-A · B 발전기로 절체' },
    { t: T.ats + T.walkIn, text: 'UPS 정류기가 부하 인수 완료, 배터리 방전 종료' },
    { t: T.ats + RESTART.crah, text: '항온항습기(수냉식) 팬 재기동' },
    { t: T.ats + RESTART.pump, text: '냉수 · 냉각수 펌프 재기동' },
    { t: T.ats + RESTART.coolingTower, text: '냉각탑 팬 재기동' },
    { t: T.ats + RESTART.crac, text: '항온항습기(공냉식) 압축기 · 실외기 재기동' },
    { t: T.ats + RESTART.chiller, text: '냉동기 재기동, 냉수 온도 회복 시작' },
    { t: T.back, text: '한전 복전, ATS 복귀 대기' },
    { t: T.retransfer, text: 'ATS-A · B 상용 복귀 (폐쇄 전환)' },
    { t: T.genStop, text: '발전기 냉각 운전 종료, 대기' },
  ];
  return items;
}




// 시나리오 정의 (registry에 등록). 타임라인 바탕 = UPS가 어떤 전원으로 사는지
export const OUTAGE: ScenarioDef<ScenarioParams, Series> = {
  id: 'outage',
  name: '한전 완전 정전',
  end: T.end,
  phases: () => PHASES,
  snapshot,
  prepare,
  eventLog,
  segments: () => [
    { from: 0, to: T.out, color: SRC_META.utility.color },
    { from: T.out, to: T.ats, color: SRC_META.battery.color },
    { from: T.ats, to: T.retransfer, color: SRC_META.gen.color },
    { from: T.retransfer, to: T.end, color: SRC_META.utility.color },
  ],
  legend: [
    { color: SRC_META.utility.color, name: SRC_META.utility.name },
    { color: SRC_META.battery.color, name: SRC_META.battery.name },
    { color: SRC_META.gen.color, name: SRC_META.gen.name },
    { color: STARTING_COLOR, name: '재기동 중' },
    { color: SRC_META.none.color, name: '정전' },
  ],
  note: '근사 모델입니다.',
  scaled: [
    ['ATS 복귀 대기', '5분', '60초'],
    ['발전기 냉각 운전', '5분', '120초'],
  ],
};
