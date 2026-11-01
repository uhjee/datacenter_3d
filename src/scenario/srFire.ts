// 시나리오: 서버실 화재 (docs/PLAN.md §11.7)
// 랙 하나에서 서버 전원부가 과열돼 연기가 난다. 공기흡입형 초미세 연기 감지(VESDA)가 불꽃 전에 단계별로 경보를 올리고,
// 그 사이 사람이 랙 전원을 끊으면(조기 대응) 화재로 번지지 않는다. 놓치면 연기감지기 교차회로 → 방출 지연 → 가스 소화로 끈다.
// 가스 소화약제는 전자장비를 적시지 않아 나머지 랙은 계속 동작한다(물 소화와의 차이). 시간은 줄였다.

import { CONNECTIONS } from '../data/connections';
import { RACK_BY_ID, RACKS } from '../data/racks';
import { ROOM_BY_ID, SERVER_ROOMS, FLOOR_BY_ID } from '../data/building';
import type { RoomLabel } from '../data/thermal';
import { phaseAt, sigOf, SRC_META, STARTING_COLOR, FAULT_COLOR, type EdgeState, type LogItem, type NodeState, type Phase, type ScenarioDef, type Snapshot } from './core';
import { snapshot as outageSnapshot } from './outage';

export interface SrFireParams {
  room: RoomLabel;
  early: boolean; // VESDA 경보 단계에서 사람이 랙 전원을 끊음
}

export const fireRack = (p: SrFireParams) => `${p.room}-2-08`;

export function st(p: SrFireParams) {
  const base = { pre: 5, alert: 25, action: 45 };
  if (p.early) {
    const cut = 75; // 담당자가 현장에서 연기 나는 랙을 찾아 rPDU A · B 차단
    return { ...base, cut, fire1: null, smokeA: null, smokeB: null, discharge: null, vent: null, clear: cut + 80, end: cut + 140 };
  }
  const fire1 = 90;
  const smokeA = 95;
  const smokeB = 105;
  const discharge = smokeB + 30;
  const vent = discharge + 240; // 약제 유지 뒤 배출 · 재진입 (실제 10분 이상 → 4분)
  return { ...base, cut: smokeA + 15, fire1, smokeA, smokeB, discharge, vent, clear: vent, end: vent + 60 };
}

export function phases(p: SrFireParams): Phase[] {
  const S = st(p);
  const rack = `랙 ${fireRack(p)}`;
  const list: Phase[] = [
    { t: 0, title: '정상 운전', body: `서버실 ${p.room} 천장 배관이 공기를 계속 빨아들여 초미세 연기(VESDA)를 감시하고, 천장에는 교차회로 연기감지기 A · B가 있습니다. 소화는 가스 약제 방식입니다.` },
    { t: S.pre, title: '전원부 과열 · 미세 연기', body: `${rack}의 서버 전원부가 과열돼 눈에 안 보이는 미세 연기가 납니다. 일반 연기감지기는 아직 반응하지 않습니다.` },
    { t: S.alert, title: 'VESDA 경보 1단계 (Alert)', body: '공기흡입형 감지기가 평소보다 높은 연기 농도를 잡아 관제실에 알립니다. 아직 화재가 아닐 수도 있는 단계입니다.' },
    { t: S.action, title: 'VESDA 경보 2단계 (Action)', body: '농도가 더 올라 현장 확인을 지시하는 단계입니다. 이때 사람이 원인 랙을 찾아 전원을 끊으면 불로 번지지 않습니다.' },
  ];
  if (p.early) {
    list.push(
      { t: S.cut, title: '조기 대응: 랙 전원 차단', body: `담당자가 열화상 카메라로 ${rack}을 찾아 rPDU A · B 차단기를 내렸습니다. 열원이 사라져 연기가 걷힙니다. 이 랙의 서버만 멈추고 나머지는 그대로입니다.` },
      { t: S.clear, title: '환기 · 점검', body: '연기를 빼고 전원부를 점검합니다. 가스 소화약제는 쓰지 않았고 다른 랙은 영향이 없습니다.' },
    );
  } else {
    list.push(
      { t: S.fire1 as number, title: 'VESDA 화재 단계 · 발화', body: `대응이 늦어 ${rack} 안에서 불꽃이 일었습니다.` },
      { t: S.smokeA as number, title: '연기감지기 교차회로', body: '연기감지기 A에 이어 B가 울려 교차회로가 성립합니다. 경보 방송과 함께 30초 방출 지연에 들어가고, 사람은 대피합니다. 외기 댐퍼가 닫히고 항온항습기는 실내 순환을 이어 갑니다(설계에 따라 정지하기도 합니다).' },
      {
        t: S.discharge as number,
        title: '가스 소화약제 방출',
        body: '서버실 전체에 가스 약제가 방출돼 산소와 반응을 끊어 불을 끕니다. 물이 아니라서 나머지 랙의 서버는 젖지 않고 계속 동작합니다. 불이 난 랙은 차단기가 떨어져 멈췄습니다.',
      },
      { t: S.vent as number, title: '약제 배출 · 재진입', body: '약제 농도를 유지한 뒤 배기하고 재진입합니다. 불탄 랙을 들어내고 주변 랙 · 케이블을 점검합니다.' },
    );
  }
  return list;
}

const NORMAL_PARAMS = { upsOut: { A: 0, B: 0 }, facilityKw: 0, baseInlet: { A: 0, B: 0 }, genFail: false };

export function snapshot(t: number, p: SrFireParams): Snapshot {
  const base = outageSnapshot(0, NORMAL_PARAMS);
  const nodes: Record<string, NodeState> = { ...base.nodes };
  const edges: Record<string, EdgeState> = { ...base.edges };
  const S = st(p);
  const rid = `rack:${fireRack(p)}`;
  if (t >= S.cut) {
    nodes[rid] = { src: 'none', status: p.early ? 'off' : 'fault' };
    for (const c of CONNECTIONS) if (c.to === rid) edges[c.id] = 'none';
  }
  const fd = `fd-sr-${p.room.toLowerCase()}`;
  const alarm = t >= S.alert && t < S.clear;
  nodes[fd] = { src: 'none', status: alarm ? 'alarm' : 'on' };
  nodes['fire-panel'] = { src: 'none', status: S.smokeA != null && t >= S.smokeA && t < S.clear ? 'alarm' : 'on' };
  nodes['gas-system'] = { src: 'none', status: S.smokeB == null || t < S.smokeB ? 'standby' : t < (S.discharge as number) ? 'starting' : 'on' };
  const phase = phaseAt(phases(p), t);
  return { phase, nodes, edges, sig: sigOf(phase, nodes) };
}

export function eventLog(p: SrFireParams): LogItem[] {
  const S = st(p);
  const rack = `랙 ${fireRack(p)}`;
  const items: LogItem[] = [
    { t: S.pre, text: `${rack} 서버 전원부 과열, 미세 연기` },
    { t: S.alert, text: 'VESDA Alert: 연기 농도 상승' },
    { t: S.action, text: 'VESDA Action: 현장 확인 지시' },
  ];
  if (p.early) items.push({ t: S.cut, text: `${rack} rPDU A · B 차단 (조기 대응)` }, { t: S.clear, text: '연기 해소 · 점검 완료 (가스 방출 없음)' });
  else
    items.push(
      { t: S.fire1 as number, text: `VESDA Fire: ${rack} 발화` },
      { t: S.smokeA as number, text: '연기감지기 A 경보' },
      { t: S.smokeB as number, text: '연기감지기 B 경보 → 교차회로 성립, 방출 지연 30초' },
      { t: S.cut, text: `${rack} 차단기 트립, 랙 정지` },
      { t: S.discharge as number, text: `서버실 ${p.room} 가스 소화약제 방출, 진화` },
      { t: S.vent as number, text: '약제 배출 · 재진입' },
    );
  return items;
}

export type SmokeLevel = '정상' | 'Alert' | 'Action' | 'Fire';
export interface SrFireValues {
  level: SmokeLevel;
  rackState: 'run' | 'cut' | 'burnt';
  gas: 'standby' | 'delay' | 'done';
  delayLeft: number;
  detA: boolean;
  detB: boolean;
  racksOn: number;
  racksTotal: number;
}

export function values(t: number, p: SrFireParams): SrFireValues {
  const S = st(p);
  const smoke = fireView(t, p).smoke;
  const level: SmokeLevel = t < S.alert || smoke < 0.05 ? '정상' : S.fire1 != null && t >= S.fire1 && t < S.clear ? 'Fire' : t >= S.action ? 'Action' : 'Alert';
  const total = RACKS.filter((r) => r.serverRoom === p.room && r.devices.length > 0).length;
  const down = t >= S.cut ? 1 : 0;
  return {
    level,
    rackState: t < S.cut ? 'run' : p.early ? 'cut' : 'burnt',
    gas: S.smokeB == null || t < S.smokeB ? 'standby' : t < (S.discharge as number) ? 'delay' : 'done',
    delayLeft: S.discharge == null ? 0 : Math.max(0, Math.ceil(S.discharge - t)),
    detA: S.smokeA != null && t >= S.smokeA && t < S.clear,
    detB: S.smokeB != null && t >= S.smokeB && t < S.clear,
    racksOn: total - down,
    racksTotal: total,
  };
}

// 3D 표시: 불꽃 · 연기 · 약제 세기 (0~1)
export function fireView(t: number, p: SrFireParams) {
  const S = st(p);
  const k = (a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));
  let smoke = t < S.pre ? 0 : 0.12 + 0.3 * k(S.pre, S.action);
  if (p.early) smoke *= 1 - k(S.cut, S.clear);
  else smoke = t < (S.fire1 as number) ? smoke : t < (S.discharge as number) ? 0.5 + 0.5 * k(S.fire1 as number, S.discharge as number) : 1 - k(S.discharge as number, S.vent as number);
  const flame = p.early || t < (S.fire1 as number) || t >= (S.discharge as number) + 5 ? 0 : 0.55;
  const gas = p.early || t < (S.discharge as number) ? 0 : 1 - k(S.vent as number, (S.vent as number) + 40);
  return { flame, smoke: Math.max(0, smoke), gas };
}

export function srFireSpot(p: SrFireParams) {
  const sr = SERVER_ROOMS.find((s) => s.label === p.room)!;
  const room = ROOM_BY_ID[sr.roomId];
  const r = RACK_BY_ID[fireRack(p)];
  return { floor: sr.floor, x: room.x, z: room.z, height: FLOOR_BY_ID[sr.floor].height, src: { x: r.x, z: r.z, y: 2.2 } };
}

export const SR_FIRE: ScenarioDef<SrFireParams, null> = {
  id: 'srFire',
  name: '서버실 화재',
  end: 0,
  endOf: (p) => st(p).end,
  phases,
  snapshot,
  prepare: () => null,
  eventLog,
  segments: (p) => {
    const S = st(p);
    return p.early
      ? [
          { from: 0, to: S.pre, color: SRC_META.utility.color },
          { from: S.pre, to: S.alert, color: '#868e96' },
          { from: S.alert, to: S.cut, color: STARTING_COLOR },
          { from: S.cut, to: S.end, color: SRC_META.utility.color },
        ]
      : [
          { from: 0, to: S.pre, color: SRC_META.utility.color },
          { from: S.pre, to: S.alert, color: '#868e96' },
          { from: S.alert, to: S.fire1 as number, color: STARTING_COLOR },
          { from: S.fire1 as number, to: S.discharge as number, color: FAULT_COLOR },
          { from: S.discharge as number, to: S.vent as number, color: '#e9ecef' },
          { from: S.vent as number, to: S.end, color: SRC_META.utility.color },
        ];
  },
  legend: [
    { color: SRC_META.utility.color, name: '정상' },
    { color: '#868e96', name: '미세 연기 (감지 전)' },
    { color: STARTING_COLOR, name: 'VESDA 경보' },
    { color: FAULT_COLOR, name: '화재' },
    { color: '#e9ecef', name: '약제 유지' },
  ],
  note: '근사 모델입니다. VESDA 단계 이름은 대표적인 4단계(Alert · Action · Fire1 · Fire2)를 줄여 썼습니다.',
  scaled: [['소화약제 유지 · 배출', '10분 이상', '4분']],
};
