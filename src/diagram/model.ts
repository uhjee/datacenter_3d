// 흐름도 모델 (docs/PLAN.md §5.2)
// 노드 · 연결은 connections.ts의 연결 데이터에서 만들고, 화면 위치만 아래 배치표로 정한다.
// 랙 96대와 공조 동력의 부하는 묶음 노드 하나로 줄여 보여준다.

import { CONNECTIONS, HUB_BY_ID, KIND_META, connColor, type ConnKind } from '../data/connections';
import { EQUIP_BY_ID, EQUIPMENT } from '../data/equipment';
import { TYPE_BY_ID, type TypeId } from '../data/equipTypes';
import { nodeInfo } from '../data/graph';
import { RACK_BY_ID, RACKS } from '../data/racks';
import type { FloorId } from '../data/building';

export type DiagramId = 'power' | 'cooling';
export type Flow = 'down' | 'right'; // 위→아래(단선도) / 왼쪽→오른쪽(공조)

export interface DNode {
  id: string; // 흐름도 노드 id. 장비 · 연결 지점은 그래프 id와 같다
  ref: string | null; // 클릭 시 선택할 그래프 노드 (묶음은 null)
  members: string[]; // 강조 판단에 쓰는 그래프 노드
  name: string;
  sub: string;
  floor: FloorId | string;
  type: TypeId | 'hub' | 'group' | 'mech';
  sys?: 'A' | 'B';
  x: number; // 중심
  y: number;
  w: number;
  h: number;
  goto?: DiagramId; // 누르면 다른 흐름도로
}

export interface DEdge {
  id: string;
  from: string;
  to: string;
  conns: string[];
  kind: ConnKind;
  color: string;
  standby: boolean;
  pipe: boolean;
}

export interface Label {
  text: string;
  x: number;
  y: number;
  anchor?: 'start' | 'middle' | 'end';
  big?: boolean;
}

export interface Band {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
}

export interface Diagram {
  id: DiagramId;
  flow: Flow;
  nodes: DNode[];
  edges: DEdge[];
  labels: Label[];
  bands: Band[];
}

const NODE_W = 140;
const NODE_H = 46;

// 대표 성능 하나를 노드 아랫줄에 보여준다
const SUB_KEYS = ['용량', '출력', '냉각 용량', '냉동 용량', '방열 용량', '열교환 용량', '정격 전류', '정격', '차단기', '주차단기', '전압', '유량'];
function subOf(id: string) {
  const e = EQUIP_BY_ID[id];
  if (!e) return '';
  for (const k of SUB_KEYS) {
    const s = e.specs.find(([key]) => key === k);
    if (s) return s[1].replace(/\s*\(.*\)$/, '');
  }
  return e.system ?? '';
}

function sysOf(id: string): 'A' | 'B' | undefined {
  const s = EQUIP_BY_ID[id]?.system ?? '';
  // 'A/B 선택'(STS) · 'A·B 연계'(연계 ACB)는 어느 한 계통이 아니므로 'A계통' · 'B계통'만 계통 색을 칠한다
  if (s.startsWith('A계통')) return 'A';
  if (s.startsWith('B계통')) return 'B';
  return undefined;
}

// 이름 끝의 괄호 설명은 아랫줄로 내린다 (예: "한전 인입 (본선)" → "한전 인입" / "본선 · ...")
function splitName(name: string): [string, string] {
  const m = name.match(/^(.*\S)\s*\(([^)]*)\)$/);
  return m ? [m[1], m[2]] : [name, ''];
}

function equipNode(id: string, x: number, y: number, extra: Partial<DNode> = {}): DNode {
  const n = nodeInfo(id)!;
  const isHub = id.startsWith('hub:');
  const [name, note] = splitName(n.name);
  const rating = isHub ? '연결 지점' : subOf(id);
  return {
    id,
    ref: id,
    members: [id],
    name,
    sub: [note, rating].filter(Boolean).join(' · '),
    floor: n.floor,
    type: isHub ? 'hub' : EQUIP_BY_ID[id].type,
    sys: sysOf(id),
    x,
    y,
    w: NODE_W,
    h: NODE_H,
    ...extra,
  };
}

// 그래프 노드 → 흐름도 노드 (묶음 반영)
function buildEdges(nodeOf: (graphId: string, kind: ConnKind) => string | null, kinds: ConnKind[]): DEdge[] {
  const map = new Map<string, DEdge>();
  for (const c of CONNECTIONS) {
    if (!kinds.includes(c.kind)) continue;
    const from = nodeOf(c.from, c.kind);
    const to = nodeOf(c.to, c.kind);
    if (!from || !to) continue;
    const key = `${from}>${to}`;
    const e = map.get(key);
    if (e) e.conns.push(c.id);
    else
      map.set(key, {
        id: key,
        from,
        to,
        conns: [c.id],
        kind: c.kind,
        color: connColor(c),
        standby: !!c.standby,
        pipe: !!KIND_META[c.kind].pipe,
      });
  }
  return [...map.values()];
}

// ════════ 전력 흐름도 (단선도) ════════
const PC = 156; // 열 간격
const PR = 92; // 행 간격

const POWER_POS: Record<string, [number, number]> = {
  'kepco-main': [-1, 0],
  'kepco-standby': [1, 0],
  'hv-in': [0, 1],
  'hv-a': [-2, 2],
  'hv-b': [2, 2],
  'tr-a': [-2, 3],
  'tr-b': [2, 3],
  'lv-a': [-2, 4],
  'lv-tie': [0, 4],
  'lv-b': [2, 4],
  'fuel-main': [5, 1],
  'fuel-1': [4.5, 2],
  'fuel-2': [5.5, 2],
  'gen-1': [4.5, 3],
  'gen-2': [5.5, 3],
  'hub:gen-bus': [5, 4],
  'ats-a': [-2, 5],
  'ats-b': [2, 5],
  'bat-a': [-3.2, 6],
  'ups-a': [-2, 6],
  'mcc-a': [-0.6, 6],
  'mcc-b': [0.6, 6],
  'ups-b': [2, 6],
  'bat-b': [3.2, 6],
  'sts-1': [-1.5, 7],
  'sts-2': [1.5, 7],
  'pdu-s1': [-1.5, 8],
  'pdu-s2': [1.5, 8],
};

// PDU는 서버실 · 계통마다 9대씩이라 흐름도에서는 한 묶음 노드로 보여준다
const PDU_GROUPS: { id: string; sys: 'A' | 'B'; room: 'A' | 'B'; col: number }[] = [
  { id: 'pdus:a1', sys: 'A', room: 'A', col: -3.5 },
  { id: 'pdus:b1', sys: 'B', room: 'A', col: -2.5 },
  { id: 'pdus:a2', sys: 'A', room: 'B', col: 2.5 },
  { id: 'pdus:b2', sys: 'B', room: 'B', col: 3.5 },
];
const pduGroupOf = (id: string) => {
  const m = id.match(/^pdu-([ab])([12])-\d+$/);
  return m ? `pdus:${m[1]}${m[2]}` : null;
};

const POWER_ROWS = ['한전 수전', '수전 · 절체 (ALTS)', '특고압 차단 (VCB)', '변압 (TR)', '저압 배전', '상용 ⇄ 발전기 절체 (ATS)', '무정전 (UPS)', '분배 (PDU) · 절체 (STS)', '단일전원 분배 (PDU-S)', '랙 (rPDU)'];

function buildPower(): Diagram {
  const nodes: DNode[] = Object.entries(POWER_POS).map(([id, [c, r]]) => equipNode(id, c * PC, r * PR));

  for (const g of PDU_GROUPS) {
    const ids = EQUIPMENT.filter((e) => e.type === 'pdu' && pduGroupOf(e.id) === g.id).map((e) => e.id);
    const racks = CONNECTIONS.filter((c) => ids.includes(c.from) && c.to.startsWith('rack:')).length;
    nodes.push({
      id: g.id,
      ref: null,
      members: ids,
      name: `PDU-${g.sys}${g.room === 'A' ? 1 : 2}-1~${ids.length}`,
      sub: `${ids.length}대 · 랙 ${racks}대`,
      floor: g.room === 'A' ? '3F' : '4F',
      type: 'pdu',
      sys: g.sys,
      x: g.col * PC,
      y: 7 * PR,
      w: NODE_W,
      h: NODE_H,
    });
  }

  // 랙 묶음: 서버실별 이중전원 / 단일전원
  const groups: { id: string; room: 'A' | 'B'; feed: 'AB' | 'STS'; col: number }[] = [
    { id: 'grp:A-AB', room: 'A', feed: 'AB', col: -3 },
    { id: 'grp:A-STS', room: 'A', feed: 'STS', col: -1.5 },
    { id: 'grp:B-STS', room: 'B', feed: 'STS', col: 1.5 },
    { id: 'grp:B-AB', room: 'B', feed: 'AB', col: 3 },
  ];
  for (const g of groups) {
    const racks = RACKS.filter((r) => r.serverRoom === g.room && r.feed === g.feed);
    nodes.push({
      id: g.id,
      ref: null,
      members: racks.map((r) => `rack:${r.id}`),
      name: `서버실 ${g.room} 랙 ${racks.length}대`,
      sub: g.feed === 'AB' ? '이중전원 (rPDU-A·B)' : '단일전원 (STS · PDU-S 경유)',
      floor: racks[0].floor,
      type: 'group',
      x: g.col * PC,
      y: 9 * PR,
      w: g.feed === 'AB' ? 150 : NODE_W,
      h: NODE_H,
    });
  }

  // 공조 동력 부하 묶음
  for (const s of ['A', 'B'] as const) {
    const targets = CONNECTIONS.filter((c) => c.kind === 'mech' && c.sys === s).map((c) => c.to);
    nodes.push({
      id: `mech:${s}`,
      ref: null,
      members: targets,
      name: `공조 설비 ${targets.length}대`,
      sub: '공조 흐름도에서 보기 →',
      floor: '여러 층',
      type: 'mech',
      sys: s,
      x: (s === 'A' ? -0.5 : 0.5) * PC,
      y: 7 * PR + 4,
      w: 112,
      h: NODE_H,
      goto: 'cooling',
    });
  }

  const nodeOf = (id: string, kind: ConnKind) => {
    if (id.startsWith('rack:')) {
      const r = RACK_BY_ID[id.slice(5)];
      return `grp:${r.serverRoom}-${r.feed}`;
    }
    if (kind === 'mech' && !id.startsWith('mcc')) return `mech:${CONNECTIONS.find((c) => c.kind === 'mech' && c.to === id)!.sys}`;
    return pduGroupOf(id) ?? (POWER_POS[id] ? id : null);
  };
  const edges = buildEdges(nodeOf, ['hv', 'lv', 'gen', 'fuel', 'dc', 'upsA', 'upsB', 'sts', 'mech']);

  const left = -4.85 * PC;
  const labels: Label[] = POWER_ROWS.map((t, r) => ({ text: t, x: left, y: r * PR, anchor: 'start' }));
  const bands: Band[] = [
    { x: 4.0 * PC - 4, y: 0.55 * PR, w: 2 * PC + 8, h: 3.9 * PR, text: '비상 전원 (정전 시)' },
    { x: -4.15 * PC, y: 6.55 * PR, w: 3.55 * PC, h: 3.0 * PR, text: '서버실 A (3F)' },
    { x: 0.95 * PC, y: 6.55 * PR, w: 3.6 * PC, h: 3.0 * PR, text: '서버실 B (4F)' },
  ];
  return { id: 'power', flow: 'down', nodes, edges, labels, bands };
}

// ════════ 공조 흐름도 ════════
const CC = 178;
const CR = 62;

// 서버실 A(공냉식): 0~5행, 서버실 B(수냉식): 7~12행. B의 냉동기 조 3개는 항온항습기 6대 사이에 고르게
const B0 = 7;
const COOL_POS: Record<string, [number, number]> = {
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].flatMap((n) => [
    [`cond-${n}`, [0, n - 1]],
    [`crac-${n}`, [5, n - 1]],
    [`crah-${n}`, [5, B0 + n - 1]],
  ])),
  ...Object.fromEntries([1, 2, 3].flatMap((n) => {
    const r = B0 + 0.75 + (n - 1) * 1.75;
    return [
      [`ct-${n}`, [0, r]],
      [`pump-cw-${n}`, [1, r]],
      [`chiller-${n}`, [2, r]],
      [`pump-chw-${n}`, [3, r]],
    ];
  })),
  'hx-1': [2, B0 + 5.6],
};

function mechOf(id: string) {
  const c = CONNECTIONS.find((k) => k.kind === 'mech' && k.to === id);
  return c ? ` · 동력 ${c.sys}` : '';
}

function buildCooling(): Diagram {
  const nodes: DNode[] = Object.entries(COOL_POS).map(([id, [c, r]]) => {
    const n = equipNode(id, c * CC, r * CR);
    const t = TYPE_BY_ID[EQUIP_BY_ID[id].type];
    n.sub = `${n.sub}${mechOf(id)}`;
    n.sys = undefined;
    if (t.id === 'crac' || t.id === 'crah') n.w = 150;
    return n;
  });
  const hub = HUB_BY_ID['hub:chw'];
  nodes.push(equipNode(hub.id, 4 * CC, (B0 + 2.5) * CR, { w: 40, h: 5.6 * CR, sub: '' }));

  const edges = buildEdges((id) => (COOL_POS[id] || id === 'hub:chw' ? id : null), ['refrig', 'chw', 'cw']);

  const top = -0.6 * CR;
  const labels: Label[] = [
    { text: '옥상 (PH) · 열 방출', x: 0, y: top, anchor: 'middle' },
    { text: '냉각수 펌프 (B1)', x: CC, y: (B0 - 0.6) * CR, anchor: 'middle' },
    { text: '냉동기 (B1)', x: 2 * CC, y: (B0 - 0.6) * CR, anchor: 'middle' },
    { text: '냉수 펌프 (B1)', x: 3 * CC, y: (B0 - 0.6) * CR, anchor: 'middle' },
    { text: '냉수 헤더', x: 4 * CC, y: (B0 - 0.6) * CR, anchor: 'middle' },
    { text: '서버실 · 항온항습기', x: 5 * CC, y: top, anchor: 'middle' },
    { text: '냉각탑 (PH)', x: 0, y: (B0 - 0.6) * CR, anchor: 'middle' },
    { text: '항온항습기(수냉식) (4F)', x: 5 * CC, y: (B0 - 0.6) * CR, anchor: 'middle' },
    { text: '← 열이 나가는 방향 · 냉각이 오는 방향 →', x: 2.5 * CC, y: top, anchor: 'middle' },
  ];
  const bands: Band[] = [
    { x: -0.55 * CC, y: -0.95 * CR, w: 6.1 * CC, h: 6.5 * CR, text: '서버실 A (3F) · 공냉식 — 실외기와 항온항습기가 냉매 배관으로 1:1' },
    {
      x: -0.55 * CC,
      y: (B0 - 0.95) * CR,
      w: 6.1 * CC,
      h: 6.9 * CR,
      text: '서버실 B (4F) · 수냉식 — 냉각탑 · 펌프 · 냉동기 1:1:1, 냉수 헤더에서 다대다',
    },
  ];
  return { id: 'cooling', flow: 'right', nodes, edges, labels, bands };
}

export const DIAGRAMS: Record<DiagramId, Diagram> = { power: buildPower(), cooling: buildCooling() };

// 그래프 노드가 어느 흐름도에 직접 나오는지
export function diagramOf(graphId: string): DiagramId | null {
  if (DIAGRAMS.cooling.nodes.some((n) => n.ref === graphId)) return 'cooling';
  if (DIAGRAMS.power.nodes.some((n) => n.ref === graphId || n.members.includes(graphId))) return 'power';
  return null;
}
