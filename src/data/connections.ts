// 장비 간 연결 (docs/PLAN.md §5.1)
// 방향은 "공급하는 쪽 → 받는 쪽". 전력은 전기가 흐르는 방향, 공조는 냉각을 제공하는 방향
// (실외기 → 항온항습기, 냉각탑 → 냉동기 → 항온항습기)이다. 배관은 공급·환수 한 쌍으로 그린다.

import type { FloorId } from './building';
import type { Domain } from './equipTypes';
import { SERVER_ROOMS } from './building';
import { EQUIPMENT, pduId, pduIndex } from './equipment';
import { RACKS } from './racks';

export type ConnKind =
  | 'hv' // 특고압
  | 'lv' // 저압
  | 'gen' // 발전기
  | 'fuel' // 연료
  | 'dc' // 직류 (배터리)
  | 'upsA' // UPS 출력 A
  | 'upsB' // UPS 출력 B
  | 'sts' // STS 출력
  | 'mech' // 공조 동력
  | 'refrig' // 냉매
  | 'chw' // 냉수
  | 'cw'; // 냉각수

// 연결선 표시 필터 묶음
export type LinkGroup = 'power' | 'rack' | 'mech' | 'refrig' | 'chw' | 'cw';

export interface KindMeta {
  name: string;
  color: string;
  domain: Domain;
  group: LinkGroup;
  pipe?: { supply: string; ret: string }; // 배관: 공급·환수 설명
  desc: string;
}

export const KIND_META: Record<ConnKind, KindMeta> = {
  hv: { name: '특고압', color: '#ff6b6b', domain: 'power', group: 'power', desc: '22.9kV 고압 케이블' },
  lv: { name: '저압', color: '#adb5bd', domain: 'power', group: 'power', desc: '380/220V 저압 케이블' },
  gen: { name: '발전기', color: '#a9e34b', domain: 'power', group: 'power', desc: '발전기 출력 (정전 시에만 사용)' },
  fuel: { name: '연료', color: '#b08968', domain: 'power', group: 'power', desc: '경유 이송 배관' },
  dc: { name: '직류 (배터리)', color: '#ffe066', domain: 'power', group: 'power', desc: '배터리 ↔ UPS 직류 링크' },
  upsA: { name: 'UPS 출력 A', color: '#3d8bfd', domain: 'power', group: 'power', desc: '무정전 전원 A계통' },
  upsB: { name: 'UPS 출력 B', color: '#fd7e14', domain: 'power', group: 'power', desc: '무정전 전원 B계통' },
  sts: { name: 'STS 출력', color: '#be4bdb', domain: 'power', group: 'power', desc: 'A/B 중 하나를 골라 단일전원 랙에 공급' },
  mech: { name: '공조 동력', color: '#ced4da', domain: 'power', group: 'mech', desc: '공조 설비 모터·압축기 전원 (UPS 미경유)' },
  refrig: {
    name: '냉매',
    color: '#9775fa',
    domain: 'cooling',
    group: 'refrig',
    pipe: { supply: '액관 (응축된 냉매)', ret: '가스관 (열을 머금은 냉매)' },
    desc: '실외기와 항온항습기(공냉식)를 잇는 냉매 배관',
  },
  chw: {
    name: '냉수',
    color: '#22b8cf',
    domain: 'cooling',
    group: 'chw',
    pipe: { supply: '공급 7°C', ret: '환수 12°C' },
    desc: '냉동기에서 만든 찬물을 항온항습기(수냉식)로 보내는 배관',
  },
  cw: {
    name: '냉각수',
    color: '#20c997',
    domain: 'cooling',
    group: 'cw',
    pipe: { supply: '공급 32°C', ret: '환수 37°C' },
    desc: '냉동기의 열을 냉각탑으로 버리는 배관',
  },
};

export const LINK_GROUPS: { key: LinkGroup; name: string; color: string }[] = [
  { key: 'power', name: '전력 계통', color: '#3d8bfd' },
  { key: 'rack', name: '랙 급전', color: '#be4bdb' },
  { key: 'mech', name: '공조 동력', color: '#ced4da' },
  { key: 'refrig', name: '냉매', color: '#9775fa' },
  { key: 'chw', name: '냉수', color: '#22b8cf' },
  { key: 'cw', name: '냉각수', color: '#20c997' },
];

export const SYS_COLOR = { A: '#3d8bfd', B: '#fd7e14' } as const;

export interface Conn {
  id: string;
  from: string;
  to: string;
  kind: ConnKind;
  sys?: 'A' | 'B';
  standby?: boolean; // 평상시 쓰지 않는 대기 경로 (점선)
  via?: string; // 층을 넘을 때 지나는 샤프트
  note?: string;
}

// ── 연결 지점: 장비유형은 아니지만 여러 장비가 모이는 배관 헤더·모선 ──
export interface Hub {
  id: string; // 'hub:...'
  name: string;
  floor: FloorId;
  room: string;
  domain: Domain;
  pos: [number, number, number]; // 중심 (층 바닥 기준)
  size: [number, number, number];
  summary: string;
}

export const HUBS: Hub[] = [
  {
    id: 'hub:gen-bus',
    name: '발전기 모선',
    floor: 'B1',
    room: 'b1-gen',
    domain: 'power',
    pos: [-8.6, 3.4, 6.3],
    size: [0.3, 0.3, 6.0],
    summary: '발전기 2대의 출력을 하나로 모아(병렬 운전) ATS-A·ATS-B로 보내는 모선입니다. 한 대가 고장 나도 나머지 한 대가 모선을 유지합니다(N+1).',
  },
  {
    id: 'hub:chw',
    name: '냉수 헤더',
    floor: 'B1',
    room: 'b1-chiller',
    domain: 'cooling',
    pos: [7.2, 3.2, -0.6],
    size: [0.4, 0.4, 13.0],
    summary: '냉동기 3대가 만든 냉수를 한 배관에 모았다가 4F 항온항습기(수냉식) 6대로 나눠 보냅니다. 어느 냉동기가 멈춰도 모든 항온항습기가 냉수를 받습니다(다대다 연결).',
  },
];

export const HUB_BY_ID: Record<string, Hub> = Object.fromEntries(HUBS.map((h) => [h.id, h]));

// ── 연결 목록 ──
const list: Omit<Conn, 'id'>[] = [];
const C = (from: string, to: string, kind: ConnKind, opt: Partial<Omit<Conn, 'id' | 'from' | 'to' | 'kind'>> = {}) =>
  list.push({ from, to, kind, ...opt });

// 수전 · 특고압
C('kepco-main', 'hv-in', 'hv', { note: '상시 수전' });
C('kepco-standby', 'hv-in', 'hv', { standby: true, note: '본선 정전 시 ALTS가 예비선으로 절체' });
C('hv-in', 'hv-a', 'hv', { sys: 'A' });
C('hv-in', 'hv-b', 'hv', { sys: 'B' });
C('hv-a', 'tr-a', 'hv', { sys: 'A' });
C('hv-b', 'tr-b', 'hv', { sys: 'B' });

// 저압
C('tr-a', 'lv-a', 'lv', { sys: 'A' });
C('tr-b', 'lv-b', 'lv', { sys: 'B' });
C('lv-tie', 'lv-a', 'lv', { standby: true, note: 'TR-B 단독 운전 시 저압 배전반 B → A 공급' });
C('lv-tie', 'lv-b', 'lv', { standby: true, note: 'TR-A 단독 운전 시 저압 배전반 A → B 공급' });
C('lv-a', 'ats-a', 'lv', { sys: 'A', note: 'ATS 상용 입력' });
C('lv-b', 'ats-b', 'lv', { sys: 'B', note: 'ATS 상용 입력' });

// 비상 전원
C('fuel-main', 'fuel-1', 'fuel');
C('fuel-main', 'fuel-2', 'fuel');
C('fuel-1', 'gen-1', 'fuel');
C('fuel-2', 'gen-2', 'fuel');
C('gen-1', 'hub:gen-bus', 'gen');
C('gen-2', 'hub:gen-bus', 'gen');
C('hub:gen-bus', 'ats-a', 'gen', { standby: true, note: '상용 정전 시 ATS가 발전기 쪽으로 절체' });
C('hub:gen-bus', 'ats-b', 'gen', { standby: true, note: '상용 정전 시 ATS가 발전기 쪽으로 절체' });

// ATS 하류
C('ats-a', 'ups-a', 'lv', { sys: 'A', note: 'UPS 입력' });
C('ats-b', 'ups-b', 'lv', { sys: 'B', note: 'UPS 입력' });
C('ats-a', 'mcc-a', 'lv', { sys: 'A' });
C('ats-b', 'mcc-b', 'lv', { sys: 'B' });

// UPS · 배터리
C('bat-a', 'ups-a', 'dc', { sys: 'A', note: '정전 순간부터 발전기 기동까지 직류로 공급' });
C('bat-b', 'ups-b', 'dc', { sys: 'B', note: '정전 순간부터 발전기 기동까지 직류로 공급' });
// UPS → PDU (서버실마다 A · B 6대씩) · STS
for (const e of EQUIPMENT) {
  if (e.type !== 'pdu') continue;
  const sys = e.system?.startsWith('A') ? 'A' : 'B';
  C(`ups-${sys.toLowerCase()}`, e.id, sys === 'A' ? 'upsA' : 'upsB', { sys });
}
for (const n of [1, 2]) {
  C('ups-a', `sts-${n}`, 'upsA', { sys: 'A', note: 'STS 우선 입력' });
  C('ups-b', `sts-${n}`, 'upsB', { sys: 'B', note: 'STS 대체 입력' });
}

// PDU · STS → 랙 rPDU. 랙이 속한 포드 · 블록의 PDU-A · PDU-B에서 한 회로씩
for (const r of RACKS) {
  const sr = SERVER_ROOMS.find((k) => k.label === r.serverRoom)!;
  const rack = `rack:${r.id}`;
  if (r.feed === 'STS') C(`sts-${r.serverRoom === 'A' ? 1 : 2}`, rack, 'sts', { note: 'rPDU (단일)' });
  else {
    const n = pduIndex(r.pod, r.block);
    C(pduId('a', sr, n), rack, 'upsA', { sys: 'A', note: 'rPDU-A' });
    C(pduId('b', sr, n), rack, 'upsB', { sys: 'B', note: 'rPDU-B' });
  }
}

// 공조 동력 (공조 동력반 → 공조 설비). 번호가 홀수면 A, 짝수면 B — 같은 역할의 설비를 두 동력반에 번갈아 물린다
const MECH_TYPES = new Set(['crac', 'crah', 'condenser', 'chiller', 'pump', 'coolingTower']);
for (const e of EQUIPMENT) {
  if (!MECH_TYPES.has(e.type)) continue;
  const n = Number(e.id.split('-').pop());
  if (n % 2 === 1) C('mcc-a', e.id, 'mech', { sys: 'A' });
  else C('mcc-b', e.id, 'mech', { sys: 'B' });
}

// 공냉식: 실외기-n → 항온항습기(공냉식)-n (1:1)
for (let i = 1; i <= 6; i++) C(`cond-${i}`, `crac-${i}`, 'refrig', { note: `냉매 쌍 ${i}` });

// 수냉식: 냉각탑-n → 냉각수 펌프-n → 냉동기-n → 냉수 펌프-n → 냉수 헤더 → 항온항습기(수냉식) ×6
for (let i = 1; i <= 3; i++) {
  C(`ct-${i}`, `pump-cw-${i}`, 'cw', { note: `냉각수 조 ${i}` });
  C(`pump-cw-${i}`, `chiller-${i}`, 'cw', { note: `냉각수 조 ${i}` });
  C(`chiller-${i}`, `pump-chw-${i}`, 'chw');
  C(`pump-chw-${i}`, 'hub:chw', 'chw');
  C(`pump-cw-${i}`, 'hx-1', 'cw', { standby: true, note: '프리쿨링 시 냉동기 대신 판형 열교환기로' });
}
C('hx-1', 'hub:chw', 'chw', { standby: true, note: '프리쿨링 시 냉동기를 거치지 않고 냉수 생산' });
for (let i = 1; i <= 6; i++) C('hub:chw', `crah-${i}`, 'chw');

// 층을 넘는 연결의 샤프트 지정
function defaultVia(c: Omit<Conn, 'id'>): string | undefined {
  if (c.kind === 'refrig') return 'ref';
  if (c.kind === 'chw' || c.kind === 'cw') return 'ps';
  if (c.sys === 'A') return 'eps-a';
  if (c.sys === 'B') return 'eps-b';
  return undefined;
}

export const CONNECTIONS: Conn[] = list.map((c, i) => ({ ...c, id: `c${i}`, via: c.via ?? defaultVia(c) }));

export function connColor(c: Conn) {
  const k = KIND_META[c.kind];
  if (c.sys && (c.kind === 'hv' || c.kind === 'lv')) return SYS_COLOR[c.sys];
  return k.color;
}
