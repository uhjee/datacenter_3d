// 계통 묶음 (docs/PLAN.md §5.3)
// 연결로 이어진 장비 집합에 이름을 붙인 것. 모두 연결 데이터에서 규칙으로 뽑는다.

import { FLOORS, SERVER_ROOMS, type FloorId, type RoomLabel } from './building';
import { CONNECTIONS, HUBS, type Conn } from './connections';
import { EQUIPMENT } from './equipment';
import { CONN_BY_ID, nodeInfo, traceFrom, traceNodes } from './graph';
import { RACKS } from './racks';

export type GroupCat = 'power' | 'cooling' | 'floor';

export interface Group {
  id: string;
  cat: GroupCat;
  name: string;
  short: string; // 목록 버튼용 짧은 이름
  desc: string;
  nodes: Set<string>;
  edges: Set<string>;
  tab: 'power' | 'cooling';
  floor?: FloorId;
}

function fromConns(pred: (c: Conn) => boolean) {
  const edges = new Set<string>();
  const nodes = new Set<string>();
  for (const c of CONNECTIONS)
    if (pred(c)) {
      edges.add(c.id);
      nodes.add(c.from);
      nodes.add(c.to);
    }
  return { nodes, edges };
}

function fromTrace(origins: string[], dir: 'up' | 'down') {
  const edges = new Set<string>();
  const nodes = new Set<string>();
  for (const o of origins) {
    const t = traceFrom(o, dir, false);
    t.edges.forEach((e) => edges.add(e));
    traceNodes(t).forEach((n) => nodes.add(n));
  }
  return { nodes, edges };
}

const idsOf = (type: string) => EQUIPMENT.filter((e) => e.type === type).map((e) => e.id);
const isCoolingNode = (id: string) => nodeInfo(id)?.domain === 'cooling';
const COOLING_KINDS = new Set(['refrig', 'chw', 'cw']);

// 서버실을 식히는 장비: 항온항습기에서 상류로 공조 연결만 따라간 것 + 그 서버실 온습도 센서
function roomCooling(units: string[], roomId: string) {
  const t = fromTrace(units, 'up');
  const edges = new Set([...t.edges].filter((id) => COOLING_KINDS.has(CONN_BY_ID[id].kind)));
  const nodes = new Set([...t.nodes].filter(isCoolingNode));
  EQUIPMENT.filter((e) => e.room === roomId && e.type === 'sensor').forEach((e) => nodes.add(e.id));
  return { nodes, edges };
}

function merge(a: { nodes: Set<string>; edges: Set<string> }, b: { nodes: Set<string>; edges: Set<string> }) {
  return { nodes: new Set([...a.nodes, ...b.nodes]), edges: new Set([...a.edges, ...b.edges]) };
}

const roomRacks = (room: RoomLabel) => RACKS.filter((r) => r.serverRoom === room).map((r) => `rack:${r.id}`);

function build(): Group[] {
  const g: Group[] = [];
  const add = (x: Omit<Group, 'nodes' | 'edges'>, s: { nodes: Set<string>; edges: Set<string> }) => g.push({ ...x, ...s });

  // ── 전력 ──
  for (const s of ['A', 'B'] as const) {
    add(
      { id: `sys-${s}`, cat: 'power', name: `${s}계통`, short: `${s}계통`, tab: 'power', desc: `특고압 수배전반 ${s}부터 TR-${s}, 저압 배전반 ${s}, ATS-${s}, 서버실별 UPS-${s}1~${s}3(리튬이온 배터리 ${s}1~${s}3), PDU를 거쳐 모든 랙의 rPDU-${s}까지 이어지는 ${s}계통 전원입니다. 한쪽 계통이 통째로 멈춰도 다른 계통만으로 모든 랙이 동작합니다(2N).` },
      fromConns((c) => c.sys === s && c.kind !== 'mech'),
    );
  }
  for (const sr of SERVER_ROOMS) {
    const s = sr.label;
    const t = fromTrace(roomRacks(s), 'up');
    add(
      { id: `feed-${s}`, cat: 'power', name: `서버실 ${s} 급전`, short: `서버실 ${s} 급전`, tab: 'power', desc: `서버실 ${s}(${sr.floor})의 랙에 전기를 주는 모든 장비를 한전 인입·발전기까지 거슬러 올라간 묶음입니다. 이 서버실 전용 UPS-A${sr.num} · B${sr.num}부터 위는 TR · 저압 배전반 · 발전기를 세 서버실이 함께 씁니다.` },
      t,
    );
  }
  // UPS 조: 서버실마다 A · B 한 대씩 (UPS-A1 = 서버실 A의 A계통)
  for (const sr of SERVER_ROOMS)
    for (const s of ['A', 'B'] as const) {
      const ups = `ups-${s.toLowerCase()}${sr.num}`;
      const bat = `bat-${s.toLowerCase()}${sr.num}`;
      const n = `${s}${sr.num}`;
      add(
        { id: `ups-${n}`, cat: 'power', name: `UPS 조 ${n}`, short: `UPS 조 ${n}`, tab: 'power', desc: `UPS-${n}와 리튬이온 배터리 ${n}, 그리고 UPS-${n}가 공급하는 서버실 ${sr.label}(${sr.floor})의 ${s}계통 PDU·STS·랙입니다. 정전 순간부터 발전기가 기동할 때까지 배터리가 이 묶음 전체를 받쳐 줍니다.` },
        merge(fromTrace([ups], 'down'), fromConns((c) => c.from === bat && c.to === ups)),
      );
    }
  add(
    { id: 'emergency', cat: 'power', name: '비상 전원', short: '비상 전원', tab: 'power', desc: '연료 저장탱크 → 서비스 탱크 → 비상 발전기 3대(N+1) → 발전기 모선 → ATS-A·B. 한전 전원이 끊기면 10초 안에 발전기가 기동하고 ATS가 발전기 쪽으로 절체합니다.' },
    fromConns((c) => c.kind === 'fuel' || c.kind === 'gen'),
  );
  for (const s of ['A', 'B'] as const) {
    const mcc = `mcc-${s.toLowerCase()}`;
    add(
      { id: `mech-${s}`, cat: 'power', name: `공조 동력 ${s}`, short: `공조 동력 ${s}`, tab: 'power', desc: `공조 동력반 ${s}와 그것이 전원을 주는 공조 설비입니다. 공조 설비는 UPS를 거치지 않으므로 정전 직후 발전기가 기동할 때까지 잠시 멈춥니다. 같은 역할의 설비를 A/B에 번갈아 물려 한쪽 동력반이 멈춰도 냉각이 이어지게 합니다.` },
      fromConns((c) => c.to === mcc || (c.kind === 'mech' && c.from === mcc)),
    );
  }

  // ── 공조 ──
  // 냉매 쌍: 실외기-B2 ↔ 항온항습기(공냉식)-B2 (4F 3쌍 · 5F 6쌍)
  for (const cond of idsOf('condenser')) {
    const tag = cond.slice(5).toUpperCase();
    const unit = EQUIPMENT.find((e) => e.id === cond.replace(/^cond/, 'crac'))!;
    add(
      { id: `ref-${tag}`, cat: 'cooling', name: `냉매 쌍 ${tag}`, short: `냉매 쌍 ${tag}`, tab: 'cooling', desc: `실외기-${tag}(옥상)와 ${unit.name}(${unit.floor})는 냉매 배관으로 1:1로 묶여 있습니다. 실외기가 멈추면 짝인 항온항습기도 냉각을 못 합니다.` },
      fromConns((c) => c.kind === 'refrig' && c.from === cond),
    );
  }
  add(
    { id: 'chw', cat: 'cooling', name: '냉수 계통', short: '냉수 계통', tab: 'cooling', desc: '냉동기 4대와 냉수 펌프가 만든 7°C 냉수를 냉수 헤더에 모아 항온항습기(수냉식) 9대(3F 6대 · 4F 3대)로 보냅니다. 판형 열교환기는 외기가 찰 때 냉동기 대신 냉수를 만듭니다(프리쿨링).' },
    fromConns((c) => c.kind === 'chw'),
  );
  for (let i = 1; i <= idsOf('chiller').length; i++) {
    const set = new Set([`ct-${i}`, `pump-cw-${i}`, `chiller-${i}`]);
    add(
      { id: `cw-${i}`, cat: 'cooling', name: `냉각수 조 ${i}`, short: `냉각수 조 ${i}`, tab: 'cooling', desc: `냉각탑-${i} → 냉각수 펌프-${i} → 냉동기-${i}는 1:1:1로 한 조입니다. 냉동기가 냉수를 만들며 생긴 열을 냉각수로 옥상 냉각탑까지 보내 버립니다.` },
      fromConns((c) => c.kind === 'cw' && set.has(c.from) && set.has(c.to)),
    );
  }
  const COOL_DESC: Record<RoomLabel, string> = {
    A: '항온항습기(수냉식) 6대, 냉수 헤더, 지하 냉동기·펌프·판형 열교환기, 옥상 냉각탑, 온습도 센서',
    B: '항온항습기(수냉식) 3대와 그 냉수 계통(냉동기·냉각탑), 항온항습기(공냉식) 3대와 짝 실외기 3대, 온습도 센서',
    C: '항온항습기(공냉식 전면 토출) 6대, 옥상 실외기 6대, 온습도 센서',
  };
  for (const sr of SERVER_ROOMS) {
    const units = EQUIPMENT.filter((e) => e.room === sr.roomId && (e.type === 'crah' || e.type === 'crac' || e.type === 'cracFront')).map((e) => e.id);
    add(
      { id: `cool-${sr.label}`, cat: 'cooling', name: `서버실 ${sr.label} 냉각`, short: `서버실 ${sr.label} 냉각`, tab: 'cooling', desc: `서버실 ${sr.label}(${sr.floor}, ${sr.coolName})를 식히는 모든 장비: ${COOL_DESC[sr.label]}.` },
      roomCooling(units, sr.roomId),
    );
  }

  // ── 층별 ──
  for (const f of [...FLOORS].reverse()) {
    const nodes = new Set<string>([
      ...EQUIPMENT.filter((e) => e.floor === f.id).map((e) => e.id),
      ...HUBS.filter((h) => h.floor === f.id).map((h) => h.id),
      ...RACKS.filter((r) => r.floor === f.id).map((r) => `rack:${r.id}`),
    ]);
    const edges = new Set(CONNECTIONS.filter((c) => nodes.has(c.from) || nodes.has(c.to)).map((c) => c.id));
    const cool = [...nodes].filter((n) => isCoolingNode(n)).length;
    const power = [...nodes].filter((n) => nodeInfo(n)?.domain === 'power').length;
    add(
      { id: `floor-${f.id}`, cat: 'floor', name: `${f.id} ${f.name}`, short: f.id, tab: cool > power ? 'cooling' : 'power', floor: f.id, desc: `${f.summary}. 이 층의 장비와 층을 넘어 이어지는 연결을 보여줍니다.` },
      { nodes, edges },
    );
  }
  return g;
}

export const GROUPS = build();
export const GROUP_BY_ID: Record<string, Group> = Object.fromEntries(GROUPS.map((g) => [g.id, g]));

export const GROUP_CATS: { key: GroupCat; name: string }[] = [
  { key: 'power', name: '전력' },
  { key: 'cooling', name: '공조' },
  { key: 'floor', name: '층별' },
];

// 이 노드가 속한 묶음 (층별 제외)
export function groupsOf(id: string) {
  return GROUPS.filter((g) => g.cat !== 'floor' && g.nodes.has(id));
}
