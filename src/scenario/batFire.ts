// 시나리오: 배터리실 화재 (docs/PLAN.md §11.6)
// 배터리실 A의 리튬이온 셀 하나가 내부 단락으로 열폭주에 이른다. 가스 소화로 불꽃은 잦아들어도 셀 내부 반응은 계속돼 다시 타오르고,
// 결국 소방대가 모듈을 분리하고 물로 냉각해야 끈다. 이때 감전 위험 때문에 전원을 끊는데, 배터리 · UPS · 전력선이 방화구획으로
// 나뉘어 있느냐에 따라 끊어야 하는 범위(= 서비스 영향)가 갈린다. 2022 판교 · 2025 국정자원 화재에서 드러난 문제를 조건으로 넣었다.
// 시간은 크게 줄였다(실제 진화까지 수 시간).

import { CONNECTIONS } from '../data/connections';
import { EQUIPMENT } from '../data/equipment';
import { phaseAt, sigOf, SRC_META, STARTING_COLOR, FAULT_COLOR, type EdgeState, type LogItem, type NodeState, type Phase, type ScenarioDef, type Snapshot } from './core';
import { snapshot as outageSnapshot } from './outage';

export interface BatFireParams {
  offgas: boolean; // 오프가스 감지기로 연기 전 조기 경보 → 배터리 분리
  separated: boolean; // 배터리실 · UPS실 · 전력선이 방화구획으로 분리 (이 건물의 설계)
}

const PRE = 5; // 셀 내부 단락 시작 (전조)

export function bt(p: BatFireParams) {
  const offgas = p.offgas ? 65 : null; // 연기보다 수 분 먼저 전해액 증기
  const runaway = p.offgas ? 200 : 125; // 분리로 충 · 방전이 멈춰 열이 덜 쌓인다고 보고 늦춤 (근사)
  const isolate = p.offgas ? 70 : runaway + 5; // 오프가스 연동 분리 / 없으면 BMS 과온 차단
  const smokeA = runaway + 5;
  const smokeB = runaway + 15;
  const discharge = smokeB + 30; // 방출 지연 30초 (대피)
  const reignite = discharge + 90; // 리튬이온은 가스로 꺼도 셀 내부 반응이 남아 다시 탄다
  const call = p.offgas ? (offgas as number) + 10 : smokeA; // 119 신고
  const arrive = call + 180;
  const cut = Math.max(arrive, reignite) + 20; // 소방대 진입 전 전원 차단
  const water = cut + 40; // 모듈 분리 · 물 냉각
  const out = water + 240;
  return { pre: PRE, offgas, isolate, runaway, smokeA, smokeB, discharge, reignite, call, arrive, cut, water, out, end: out + 60 };
}

// 가장 뜨거운 셀 온도 (°C, 근사 곡선)
export function cellTemp(t: number, p: BatFireParams) {
  const B = bt(p);
  const lerp = (a: number, b: number, k: number) => a + (b - a) * Math.max(0, Math.min(1, k));
  if (t < B.pre) return 25;
  if (t < B.runaway) return lerp(25, 85, (t - B.pre) / (B.runaway - B.pre));
  if (t < B.discharge) return lerp(85, 620, (t - B.runaway) / 12);
  if (t < B.reignite) return lerp(620, 380, (t - B.discharge) / 60);
  if (t < B.water) return lerp(380, 650, (t - B.reignite) / 10);
  return lerp(650, 45, (t - B.water) / (B.out - B.water));
}

export function phases(p: BatFireParams): Phase[] {
  const B = bt(p);
  const list: Phase[] = [
    {
      t: 0,
      title: '정상 운전',
      body: '배터리실 A의 리튬인산철 배터리 300kWh가 UPS-A 직류 링크에 물려 대기합니다. 배터리실 A는 UPS실 · 배터리실 B와 방화구획으로 나뉘어 있습니다.',
    },
    { t: B.pre, title: '셀 내부 단락 (전조)', body: '모듈 하나의 셀에서 내부 단락이 시작돼 천천히 뜨거워집니다. 셀 전압 · 온도 변화가 작아 BMS가 이상으로 보지 못할 수 있습니다(판교 화재 때도 직전까지 BMS 이상 기록이 없었습니다).' },
  ];
  if (p.offgas && B.offgas != null)
    list.push({
      t: B.offgas,
      title: '오프가스 감지 → 배터리 분리',
      body: '셀이 부풀며 새어 나온 전해액 증기를 오프가스 감지기가 잡았습니다. 연기보다 몇 분 먼저입니다. BMS가 배터리 랙 직류 차단기를 열어 UPS-A에서 분리하고, 관제실은 바로 119에 신고합니다. UPS-A는 상용으로 계속 운전하지만 배터리 백업은 없습니다.',
    });
  list.push(
    {
      t: B.runaway,
      title: '열폭주 · 발화',
      body: `셀 온도가 수백 °C로 치솟으며 불꽃과 짙은 연기가 납니다. 옆 셀로 열이 번질 수 있습니다.${p.offgas ? '' : ' BMS 과온 차단으로 이제야 배터리가 UPS-A에서 분리됩니다.'}`,
    },
    { t: B.smokeA, title: '연기 감지 (교차회로)', body: '화재 감지기 A가 울리고, 10초 뒤 B까지 울려 교차회로가 성립합니다. 소화 수신반이 경보 방송을 하고 30초 방출 지연에 들어갑니다(사람 대피, 출입문 · 댐퍼 닫힘).' },
    { t: B.discharge, title: '가스 소화약제 방출', body: '배터리실 A에 할로겐화합물 소화약제가 방출되어 불꽃이 잦아듭니다. 하지만 가스는 셀 안의 화학 반응과 열까지 식히지는 못합니다.' },
    { t: B.reignite, title: '재발화', body: '꺼진 듯하던 모듈이 다시 타오릅니다. 리튬이온 배터리 화재가 가스 소화만으로 끝나지 않는 이유입니다. 판교 화재에서도 자동 소화설비가 작동했지만 초기 진화에 실패했습니다.' },
    {
      t: B.cut,
      title: p.separated ? '전원 차단: 배터리실 A 계통만' : '전원 차단: 전기실 전체',
      body: p.separated
        ? '소방대가 감전 위험 때문에 전원 차단을 요구합니다. 배터리실 A는 UPS실 · 다른 배터리실과 방화구획으로 나뉘고 전력선도 위로 지나가지 않아, UPS-A만 비상 정지(EPO)하면 됩니다. A계통이 멈춰도 이중전원 랙은 B로, 단일전원 랙은 STS가 B로 넘겨 랙은 모두 계속 동작합니다.'
        : '배터리 · UPS · 전력선이 한 공간에 있어 범위를 좁힐 수 없습니다. 소방대 요청으로 UPS A · B와 수전까지 끊자 2N이었던 랙이 모두 꺼지고 공조도 멈춥니다. 판교 화재가 서비스 장애로 번진 구조입니다.',
    },
    { t: B.water, title: '모듈 분리 · 물로 냉각', body: '소방대가 타는 모듈의 연결을 끊고 물을 뿌려 셀을 식힙니다. 셀 온도가 충분히 내려갈 때까지 오래 걸립니다.' },
    { t: B.out, title: '진화 완료', body: '셀 온도가 떨어지고 진화를 마쳤습니다. 손상 모듈은 들어내 물에 담가 두고, 배터리실 A 복구 전까지 UPS-A는 배터리 없이 운전합니다(정전이 나면 A계통은 끊김 없이 넘기지 못합니다).' },
  );
  return list.sort((a, b) => a.t - b.t);
}

const NORMAL_PARAMS = { upsOut: { A: 0, B: 0 }, facilityKw: 0, baseInlet: { A: 0, B: 0 }, genFail: false };

export function snapshot(t: number, p: BatFireParams): Snapshot {
  const base = outageSnapshot(0, NORMAL_PARAMS);
  let nodes: Record<string, NodeState> = { ...base.nodes };
  let edges: Record<string, EdgeState> = { ...base.edges };
  const B = bt(p);
  const cut = t >= B.cut;

  if (cut && !p.separated) {
    // 전기실 전체 차단: 살아 있던 전력 · 공조가 모두 끊긴다
    nodes = Object.fromEntries(Object.entries(nodes).map(([id, n]) => [id, n.src === 'none' ? n : { src: 'none', status: 'off' }]));
    edges = Object.fromEntries(Object.entries(edges).map(([id, e]) => [id, e === 'idle' ? e : 'none']));
  } else if (cut) {
    // UPS-A 비상 정지 → A계통 PDU 정지, STS는 B로
    nodes['ups-a'] = { src: 'none', status: 'off' };
    for (const e of EQUIPMENT) if (e.type === 'pdu' && e.id.startsWith('pdu-a')) nodes[e.id] = { src: 'none', status: 'off' };
    for (const c of CONNECTIONS) {
      if ((c.from === 'ups-a' && c.to.startsWith('pdu-')) || c.from.startsWith('pdu-a')) edges[c.id] = 'none';
      if (c.to.startsWith('sts-')) edges[c.id] = c.from === 'ups-a' ? 'none' : 'utility';
      if (c.to === 'ups-a' && c.kind === 'lv') edges[c.id] = 'idle';
    }
  }

  // 배터리 · 감지 · 소화
  const isolated = t >= B.isolate;
  nodes['bat-a'] = t >= B.runaway ? { src: 'none', status: 'fault' } : B.offgas != null && t >= B.offgas ? { src: 'none', status: 'alarm' } : isolated ? { src: 'none', status: 'off' } : nodes['bat-a'];
  for (const c of CONNECTIONS) if (c.from === 'bat-a') edges[c.id] = isolated ? 'none' : edges[c.id];
  const detected = t >= B.smokeA || (B.offgas != null && t >= B.offgas);
  nodes['fd-bat-a'] = { src: 'none', status: detected && t < B.out ? 'alarm' : 'on' };
  nodes['fire-panel'] = { src: 'none', status: t >= B.smokeA && t < B.out ? 'alarm' : 'on' };
  nodes['gas-system'] = { src: 'none', status: t < B.smokeB ? 'standby' : t < B.discharge ? 'starting' : 'on' };

  const phase = phaseAt(phases(p), t);
  return { phase, nodes, edges, sig: sigOf(phase, nodes) };
}

export function eventLog(p: BatFireParams): LogItem[] {
  const B = bt(p);
  const items: LogItem[] = [{ t: B.pre, text: '배터리실 A 모듈 셀 내부 단락 시작 (BMS 이상 없음)' }];
  if (B.offgas != null)
    items.push(
      { t: B.offgas, text: '오프가스 감지기 경보 (전해액 증기)' },
      { t: B.isolate, text: 'BMS: 배터리 랙 직류 차단기 개방, UPS-A 배터리 없이 운전' },
      { t: B.call, text: '관제실 119 신고' },
    );
  items.push({ t: B.runaway, text: '열폭주 · 발화' });
  if (B.offgas == null) items.push({ t: B.isolate, text: 'BMS 과온 차단: 배터리 분리' }, { t: B.call, text: '연기 감지로 119 신고' });
  items.push(
    { t: B.smokeA, text: '화재 감지기 A 경보' },
    { t: B.smokeB, text: '화재 감지기 B 경보 → 교차회로 성립, 방출 지연 30초' },
    { t: B.discharge, text: '배터리실 A 가스 소화약제 방출' },
    { t: B.reignite, text: '재발화 (셀 내부 반응 지속)' },
    { t: B.arrive, text: '소방대 도착' },
    { t: B.cut, text: p.separated ? 'UPS-A 비상 정지(EPO): A계통 정지, 랙은 B계통으로 유지' : '전기실 전체 차단: UPS A · B, 수전 차단 → 랙 전체 정지' },
    { t: B.water, text: '모듈 연결 분리 · 물 냉각 시작' },
    { t: B.out, text: '진화 완료' },
  );
  return items;
}

export interface BatFireValues {
  cell: number;
  isolated: boolean;
  stage: 'normal' | 'pre' | 'offgas' | 'fire' | 'suppressed' | 'reignite' | 'cooling' | 'out';
  gas: 'standby' | 'delay' | 'done';
  delayLeft: number;
  cut: boolean;
}

export function values(t: number, p: BatFireParams): BatFireValues {
  const B = bt(p);
  const stage: BatFireValues['stage'] =
    t < B.pre ? 'normal'
    : B.offgas != null && t >= B.offgas && t < B.runaway ? 'offgas'
    : t < B.runaway ? 'pre'
    : t < B.discharge ? 'fire'
    : t < B.reignite ? 'suppressed'
    : t < B.water ? 'reignite'
    : t < B.out ? 'cooling'
    : 'out';
  return {
    cell: Math.round(cellTemp(t, p)),
    isolated: t >= B.isolate,
    stage,
    gas: t < B.smokeB ? 'standby' : t < B.discharge ? 'delay' : 'done',
    delayLeft: Math.max(0, Math.ceil(B.discharge - t)),
    cut: t >= B.cut,
  };
}

// 3D 표시: 불꽃 · 연기 · 약제 세기 (0~1)
export function fireView(t: number, p: BatFireParams) {
  const B = bt(p);
  const k = (a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));
  const flame = t < B.runaway ? 0 : t < B.discharge ? 1 : t < B.reignite ? 0.25 : t < B.water ? 1 : 1 - k(B.water, B.out);
  const smoke = t < B.runaway ? (B.offgas != null && t >= B.offgas ? 0.2 : 0) : t < B.out ? Math.max(0.35, flame) : 0;
  const gas = t < B.discharge ? 0 : t < B.water ? 1 : 1 - k(B.water, B.water + 60);
  return { flame, smoke, gas };
}

export const BAT_FIRE: ScenarioDef<BatFireParams, null> = {
  id: 'batFire',
  name: '배터리실 화재',
  end: 0,
  endOf: (p) => bt(p).end,
  phases,
  snapshot,
  prepare: () => null,
  eventLog,
  segments: (p) => {
    const B = bt(p);
    const segs = [{ from: 0, to: B.pre, color: SRC_META.utility.color }];
    if (B.offgas != null) segs.push({ from: B.pre, to: B.offgas, color: '#868e96' }, { from: B.offgas, to: B.runaway, color: STARTING_COLOR });
    else segs.push({ from: B.pre, to: B.runaway, color: '#868e96' });
    segs.push({ from: B.runaway, to: B.water, color: FAULT_COLOR }, { from: B.water, to: B.out, color: '#4dabf7' }, { from: B.out, to: B.end, color: SRC_META.utility.color });
    return segs;
  },
  legend: [
    { color: SRC_META.utility.color, name: '정상' },
    { color: '#868e96', name: '전조 (감지 안 됨)' },
    { color: STARTING_COLOR, name: '오프가스 경보' },
    { color: FAULT_COLOR, name: '화재' },
    { color: '#4dabf7', name: '물 냉각' },
  ],
  note: '근사 모델입니다. 실제 진화까지 수 시간 걸리는 과정을 약 10분으로 줄였고, 셀 온도는 경향만 보이는 곡선입니다. 오프가스 감지 시 열폭주가 늦춰지는 정도는 가정입니다.',
};

// 3D 표시 위치: 배터리실 A 범위와 불이 난 모듈
export const BAT_ROOM = { floor: '2F' as const, x: [-20, -4] as [number, number], z: [1, 12] as [number, number], height: 4.5, src: { x: -12, z: 6.5, y: 1.2 } };
