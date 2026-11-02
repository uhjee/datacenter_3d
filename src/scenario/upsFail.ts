// 시나리오: UPS 고장 (docs/PLAN.md §11.2)
// UPS 한 대의 출력이 끊겨도 2N이라 랙은 멈추지 않는다. 이중전원 랙은 남은 쪽 rPDU로, 단일전원 랙은 STS가 4~8ms 안에 절체한다.
// UPS는 서버실마다 한 쌍이라 영향은 고장 난 UPS가 맡던 서버실에만 머문다.
// 대신 남은 UPS 한 대가 전부를 떠안아 예비가 없는 N 상태가 된다. 정비 바이패스로 고장 쪽 계통을 상용 직결로 임시 복구할 수 있다.
// 실제 수리 시간(수 시간)은 줄였다: 고장 → 수리 완료 약 8분.

import { SR_BY_LABEL, type RoomLabel } from '../data/building';
import { CONNECTIONS } from '../data/connections';
import { EQUIPMENT } from '../data/equipment';
import { UPS_KW } from '../data/metrics';
import { RACKS } from '../data/racks';
import { FAULT_COLOR, phaseAt, sigOf, SRC_META, STARTING_COLOR, type EdgeState, type LogItem, type NodeState, type Phase, type ScenarioDef, type Snapshot } from './core';
import { NORMAL_PARAMS, snapshot as outageSnapshot } from './outage';

export interface UpsFailParams {
  room: RoomLabel; // 고장 나는 UPS가 맡은 서버실
  side: 'A' | 'B'; // 고장 나는 UPS (계통)
  bypass: boolean; // 정비 바이패스로 고장 쪽 계통을 상용 직결 복구
  ab: number; // 그 서버실 이중전원 랙 kW (A · B가 절반씩)
  sts: number; // 그 서버실 단일전원(STS) 랙 kW (평상시 A계통 UPS)
}

export const UT = {
  fail: 5, // 인버터 고장 → 출력 차단기 개방
  alarm: 6, // 통합관제실 경보
  check: 30, // 현장 확인
  bypass: 90, // 정비 바이패스 투입
  repair: 480, // 수리 완료, 인버터 재기동 시작
  back: 500, // 바이패스 → 인버터 (무순단) 또는 출력 투입
  sts: 520, // STS 우선 입력(A) 복귀
  end: 560,
};

// 서버실별 랙 대수 (이중전원 · 단일전원)
export const upsFailCounts = (room: RoomLabel) => {
  const racks = RACKS.filter((r) => r.serverRoom === room);
  const single = racks.filter((r) => r.feed === 'STS').length;
  // 계통별 PDU 대수 (A · B 같음, PDU-S 제외)
  const pdu = EQUIPMENT.filter((e) => e.type === 'pdu' && e.id.startsWith(`pdu-a${SR_BY_LABEL[room].num}-`)).length;
  return { dual: racks.length - single, single, pdu };
};
const lo = (s: 'A' | 'B') => s.toLowerCase() as 'a' | 'b';
const other = (s: 'A' | 'B') => (s === 'A' ? 'B' : 'A');
// UPS 이름 (UPS-A1 = 서버실 A의 A계통)
const upsName = (side: 'A' | 'B', room: RoomLabel) => `UPS-${side}${SR_BY_LABEL[room].num}`;
const hasSts = (room: RoomLabel) => upsFailCounts(room).single > 0;

export function phases(p: UpsFailParams): Phase[] {
  const f = upsName(p.side, p.room);
  const o = upsName(other(p.side), p.room);
  const sr = SR_BY_LABEL[p.room];
  const sts = hasSts(p.room);
  const list: Phase[] = [
    {
      t: 0,
      title: '정상 운전 (2N)',
      body: `서버실 ${p.room}(${sr.floor})은 전용 UPS-A${sr.num} · B${sr.num}가 이중전원 랙의 부하를 절반씩 나눠 맡습니다${sts ? `. 단일전원 랙은 STS-${sr.num}이 우선 입력(UPS-A${sr.num})으로 받습니다` : ''}. 각 UPS 부하율은 50% 안팎입니다. 다른 서버실은 각자 UPS 한 쌍이 따로 있습니다.`,
    },
    {
      t: UT.fail,
      title: `${f} 고장 → 출력 차단`,
      body:
        `${f}의 인버터가 고장 나 출력 차단기가 열렸습니다. 이중전원 랙은 rPDU-${other(p.side)}만으로 계속 동작합니다(끊김 없음). ` +
        (!sts
          ? '이 서버실에는 단일전원 랙이 없어 STS가 없습니다. '
          : p.side === 'A'
            ? 'STS는 우선 입력(A)이 끊긴 것을 감지하고 4~8ms 안에 B로 절체합니다. 서버 전원부가 버티는 시간(약 10~20ms)보다 짧아 단일전원 랙도 꺼지지 않습니다.'
            : 'STS는 원래 A 우선 입력으로 받고 있어 절체할 필요가 없습니다.') +
        ` 다른 서버실은 전용 UPS라 영향이 없습니다.` +
        ' 많은 UPS는 인버터 고장 시 내부 정적 바이패스로 넘어가지만, 여기서는 출력 자체가 끊기는 고장을 가정했습니다.',
    },
    { t: UT.alarm, title: '통합관제실 경보', body: `${f} 고장 경보가 뜨고, ${o} 부하율이 두 배 가까이 뛴 것이 보입니다. 랙은 모두 정상이라 서비스 영향은 없습니다.` },
    {
      t: UT.check,
      title: '2N → N: 예비 없음',
      body: `지금은 ${o} 한 대가 서버실 ${p.room}의 IT 부하를 모두 받습니다. 정격 안이라 버티지만 예비가 없는 N 상태입니다. 이 상태에서 ${o}까지 멈추면 서버실 ${p.room}의 랙이 모두 꺼집니다. 그래서 2N에서는 평소 각 UPS를 50% 이하로 운영합니다.`,
    },
  ];
  if (p.bypass)
    list.push({
      t: UT.bypass,
      title: '정비 바이패스 투입',
      body: `작업자가 ${f}의 정비 바이패스 차단기를 넣어 ${p.side}계통 PDU에 상용 전원을 직접 보냅니다. 이중전원 랙이 다시 양쪽에서 받아 ${o} 부하가 절반으로 줄지만, ${p.side}계통은 UPS 보호가 없어 지금 정전이 나면 그쪽은 바로 끊깁니다.${sts ? ` STS는 보호되는 ${o} 쪽에 그대로 둡니다.` : ''}`,
    });
  list.push(
    {
      t: UT.repair,
      title: `${f} 수리 · 재기동`,
      body: `부품을 바꾼 ${f}가 정류기 · 인버터를 다시 세웁니다. 출력 전압 · 주파수가 맞을 때까지 부하는 ${p.bypass ? '바이패스' : o}에 그대로 둡니다. (실제 수리는 수 시간이 걸리지만 여기서는 줄였습니다.)`,
    },
    {
      t: UT.back,
      title: p.bypass ? '바이패스 → 인버터 복귀' : '출력 투입',
      body: p.bypass
        ? `동기를 맞춘 뒤 바이패스에서 인버터로 무순단 전환합니다. ${p.side}계통이 다시 UPS 보호를 받고 2N이 회복됩니다.`
        : `${f} 출력 차단기를 넣어 ${p.side}계통 PDU가 다시 살아납니다. 이중전원 랙은 양쪽에서 받게 되고 2N이 회복됩니다.`,
    },
  );
  if (p.side === 'A' && sts) list.push({ t: UT.sts, title: 'STS 우선 입력 복귀', body: 'STS를 우선 입력(A)으로 되돌립니다. 두 입력이 동기 상태라 끊김 없이 넘어갑니다. 정상 운전으로 돌아왔습니다.' });
  return list;
}

// 시각별 상태 구분
type Mode = 'normal' | 'fault' | 'bypass' | 'starting' | 'restored';
function modeAt(t: number, p: UpsFailParams): Mode {
  if (t < UT.fail || t >= UT.back) return t >= UT.back ? 'restored' : 'normal';
  if (t >= UT.repair) return 'starting';
  if (p.bypass && t >= UT.bypass) return 'bypass';
  return 'fault';
}
// STS가 B로 받는 중인지 (A 고장일 때만 절체)
const stsOnB = (t: number, p: UpsFailParams) => p.side === 'A' && hasSts(p.room) && t >= UT.fail && t < UT.sts;

// 평상시 상태(정전 시나리오 0초)에서 출발해 UPS 계통만 덮어쓴다

export function snapshot(t: number, p: UpsFailParams): Snapshot {
  const base = outageSnapshot(0, NORMAL_PARAMS);
  const nodes: Record<string, NodeState> = { ...base.nodes };
  const edges: Record<string, EdgeState> = { ...base.edges };
  const mode = modeAt(t, p);
  // 고장 UPS · 그 서버실 PDU 접두어 (ups-a1, pdu-a1-)
  const n = SR_BY_LABEL[p.room].num;
  const f = `${lo(p.side)}${n}`;
  const down = mode === 'fault' || mode === 'bypass' || mode === 'starting';
  const pduSrc = mode === 'bypass' || (mode === 'starting' && p.bypass) ? 'bypass' : down ? 'none' : 'utility';
  const onB = stsOnB(t, p);

  if (down) {
    nodes[`ups-${f}`] = { src: 'none', status: mode === 'starting' ? 'starting' : 'fault' };
    nodes[`bat-${f}`] = { src: 'none', status: 'standby' };
  }
  for (const e of EQUIPMENT) if (e.type === 'pdu' && e.id.startsWith(`pdu-${f}-`)) nodes[e.id] = { src: pduSrc, status: pduSrc === 'none' ? 'off' : 'on' };

  for (const c of CONNECTIONS) {
    // 고장 UPS 입력: 전기는 와 있지만 쓰지 않음
    if (down && c.to === `ups-${f}` && c.kind === 'lv') edges[c.id] = 'idle';
    // 고장 쪽 UPS 출력 → PDU, PDU → 랙
    const fromPdu = c.from.startsWith(`pdu-${f}-`);
    if ((c.from === `ups-${f}` && c.to.startsWith('pdu-')) || fromPdu) edges[c.id] = pduSrc;
    // STS 입력: 받는 쪽만 흐름, 나머지는 대기(전기가 없으면 끊김)
    if (c.to === `sts-${n}`) {
      const fromA = c.from === `ups-a${n}`;
      const using = onB ? !fromA : fromA;
      const alive = c.from === `ups-${f}` ? !down || pduSrc === 'bypass' : true;
      edges[c.id] = using ? 'utility' : alive ? 'idle' : 'none';
    }
  }

  const phase = phaseAt(phases(p), t);
  return { phase, nodes, edges, sig: sigOf(phase, nodes) };
}

export interface UpsFailValues {
  mode: Mode;
  load: { A: number; B: number }; // UPS 출력 kW
  pct: { A: number; B: number };
  redundancy: string;
  stsOnB: boolean;
  pduSrc: 'utility' | 'bypass' | 'none';
}

export function values(t: number, p: UpsFailParams): UpsFailValues {
  const mode = modeAt(t, p);
  const onB = stsOnB(t, p);
  const f = p.side;
  const o = other(f);
  const half = p.ab / 2;
  const load = { A: half + (onB ? 0 : p.sts), B: half + (onB ? p.sts : 0) };
  if (mode === 'fault' || (mode === 'starting' && !p.bypass)) {
    load[o] += load[f];
    load[f] = 0;
  } else if (mode === 'bypass' || mode === 'starting') {
    // 바이패스 쪽 이중전원 부하는 UPS를 거치지 않는다
    load[f] = 0;
  }
  const pduSrc = mode === 'bypass' || (mode === 'starting' && p.bypass) ? 'bypass' : mode === 'fault' || mode === 'starting' ? 'none' : 'utility';
  const redundancy = mode === 'fault' || (mode === 'starting' && !p.bypass) ? 'N · 예비 없음' : mode === 'bypass' || mode === 'starting' ? `N + ${f} 바이패스` : '2N';
  return { mode, load, pct: { A: load.A / UPS_KW, B: load.B / UPS_KW }, redundancy, stsOnB: onB, pduSrc };
}

export function eventLog(p: UpsFailParams): LogItem[] {
  const f = upsName(p.side, p.room);
  const o = upsName(other(p.side), p.room);
  const n = SR_BY_LABEL[p.room].num;
  const cnt = upsFailCounts(p.room);
  const peak = ((p.ab + p.sts) / UPS_KW) * 100;
  const items: LogItem[] = [
    { t: UT.fail, text: `${f} 인버터 고장, 출력 차단기 개방 (서버실 ${p.room}만 영향)` },
    { t: UT.fail, text: `서버실 ${p.room} 이중전원 랙 ${cnt.dual}대: rPDU-${other(p.side)} 단독 공급 (끊김 없음)` },
  ];
  if (cnt.single > 0)
    items.push(
      p.side === 'A'
        ? { t: UT.fail, text: `STS-${n}: 우선 입력(A) 상실 → B로 절체 (4~8ms), 단일전원 랙 ${cnt.single}대 유지` }
        : { t: UT.fail, text: `STS-${n}: A 우선 입력 그대로 (절체 없음)` },
    );
  items.push(
    { t: UT.alarm, text: `통합관제실 경보: ${f} 고장, ${o} 부하율 ${Math.round(peak)}%` },
    { t: UT.check, text: `현장 확인: 2N → N, ${o}가 멈추면 서버실 ${p.room} 전체 정지` },
  );
  if (p.bypass) items.push({ t: UT.bypass, text: `${f} 정비 바이패스 투입 → ${p.side}계통 PDU 상용 직결 (UPS 보호 없음)` });
  items.push(
    { t: UT.repair, text: `${f} 수리 완료, 정류기 · 인버터 재기동` },
    { t: UT.back, text: p.bypass ? `${f} 바이패스 → 인버터 무순단 전환, 2N 회복` : `${f} 출력 차단기 투입, 2N 회복` },
  );
  if (p.side === 'A' && cnt.single > 0) items.push({ t: UT.sts, text: `STS-${n} 우선 입력(A) 복귀` });
  return items;
}

const N_COLOR = FAULT_COLOR;

export const UPS_FAIL: ScenarioDef<UpsFailParams, null> = {
  id: 'upsFail',
  name: 'UPS 고장',
  end: UT.end,
  phases,
  snapshot,
  prepare: () => null,
  eventLog,
  // 타임라인 바탕 = 이중화 상태
  segments: (p) => [
    { from: 0, to: UT.fail, color: SRC_META.utility.color },
    ...(p.bypass
      ? [
          { from: UT.fail, to: UT.bypass, color: N_COLOR },
          { from: UT.bypass, to: UT.back, color: SRC_META.bypass.color },
        ]
      : [{ from: UT.fail, to: UT.back, color: N_COLOR }]),
    { from: UT.back, to: UT.end, color: SRC_META.utility.color },
  ],
  legend: [
    { color: SRC_META.utility.color, name: '2N (정상)' },
    { color: N_COLOR, name: 'N · 예비 없음' },
    { color: SRC_META.bypass.color, name: '바이패스 (상용 직결)' },
    { color: STARTING_COLOR, name: '재기동 중' },
  ],
  note: '근사 모델입니다. 인버터 고장 시 출력이 끊기는 경우를 가정했습니다.',
  scaled: [['UPS 수리', '수 시간', '약 8분']],
};

