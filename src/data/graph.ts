// 연결 그래프: 노드(장비 · 랙 · 연결 지점) 조회와 상류 · 하류 추적 (docs/PLAN.md §5.4)

import { FLOOR_BY_ID, type FloorId } from './building';
import { CONNECTIONS, HUB_BY_ID, type Conn } from './connections';
import { EQUIP_BY_ID } from './equipment';
import { TYPE_BY_ID, type Domain } from './equipTypes';
import { RACK_BY_ID, RACKS } from './racks';
import { CUSTOMER_BY_ID, type CustomerId } from './customers';
import { RACK } from './building';

type V3 = [number, number, number];

export const CONN_BY_ID: Record<string, Conn> = Object.fromEntries(CONNECTIONS.map((c) => [c.id, c]));

const OUT = new Map<string, Conn[]>();
const IN = new Map<string, Conn[]>();
for (const c of CONNECTIONS) {
  (OUT.get(c.from) ?? OUT.set(c.from, []).get(c.from)!).push(c);
  (IN.get(c.to) ?? IN.set(c.to, []).get(c.to)!).push(c);
}
export const outgoing = (id: string) => OUT.get(id) ?? [];
export const incoming = (id: string) => IN.get(id) ?? [];

export interface NodeInfo {
  name: string;
  floor: FloorId;
  domain: Domain;
  pos: V3; // 바닥 중심 (층 바닥 기준)
  size: V3; // 세계 축 기준 크기
  isRack?: boolean;
}

const infoCache = new Map<string, NodeInfo | null>();

export function nodeInfo(id: string): NodeInfo | null {
  if (infoCache.has(id)) return infoCache.get(id)!;
  let n: NodeInfo | null = null;
  if (id.startsWith('rack:')) {
    const r = RACK_BY_ID[id.slice(5)];
    if (r) n = { name: r.name, floor: r.floor, domain: 'it', pos: [r.x, r.y, r.z], size: [RACK.w, RACK.h, RACK.d], isRack: true };
  } else if (id.startsWith('customer:')) {
    // 고객사: 케이지(없으면 빌린 랙들)를 감싸는 상자
    const c = CUSTOMER_BY_ID[id.slice(9) as CustomerId];
    const racks = RACKS.filter((r) => r.customer === c?.id);
    if (c && racks.length) {
      const xs = c.cage ? c.cage.x : [Math.min(...racks.map((r) => r.x)) - RACK.w / 2, Math.max(...racks.map((r) => r.x)) + RACK.w / 2];
      const zs = c.cage ? c.cage.z : [Math.min(...racks.map((r) => r.z)) - RACK.d / 2, Math.max(...racks.map((r) => r.z)) + RACK.d / 2];
      n = { name: c.name, floor: c.floor, domain: 'it', pos: [(xs[0] + xs[1]) / 2, racks[0].y, (zs[0] + zs[1]) / 2], size: [xs[1] - xs[0], RACK.h, zs[1] - zs[0]] };
    }
  } else if (id.startsWith('hub:')) {
    const h = HUB_BY_ID[id];
    if (h) n = { name: h.name, floor: h.floor, domain: h.domain, pos: [h.pos[0], h.pos[1] - h.size[1] / 2, h.pos[2]], size: h.size };
  } else {
    const e = EQUIP_BY_ID[id];
    if (e) {
      const turned = e.rotY && Math.abs(Math.sin(e.rotY)) > 0.5;
      const size: V3 = turned ? [e.size[2], e.size[1], e.size[0]] : e.size;
      n = { name: e.name, floor: e.floor, domain: TYPE_BY_ID[e.type].domain, pos: e.pos, size };
    }
  }
  infoCache.set(id, n);
  return n;
}

export const nodeName = (id: string) => nodeInfo(id)?.name ?? id;

export type TraceDir = 'up' | 'down' | 'both';

export interface TraceResult {
  origin: string;
  dir: TraceDir;
  up: Map<string, boolean>; // 노드 → 대기 경로로만 닿는지
  down: Map<string, boolean>;
  edges: Set<string>;
}

// 공조 동력(mech)은 분야를 넘는 연결이라 cross가 꺼져 있으면 시작 장비에 직접 붙은 것만 따라간다
function walk(origin: string, upward: boolean, cross: boolean, edges: Set<string>) {
  const reached = new Map<string, boolean>();
  const allows = (c: Conn) => cross || c.kind !== 'mech' || c.from === origin || c.to === origin;
  // 1차: 평상시 경로만, 2차: 대기 경로 포함
  for (const withStandby of [false, true]) {
    const queue = [origin];
    const seen = new Set(queue);
    while (queue.length) {
      const id = queue.shift()!;
      for (const c of upward ? incoming(id) : outgoing(id)) {
        if (!allows(c) || (!withStandby && c.standby)) continue;
        edges.add(c.id);
        const next = upward ? c.from : c.to;
        if (seen.has(next)) continue;
        seen.add(next);
        // 분야를 넘지 않을 때는 공조 동력 연결 너머(공조 동력반의 상류, 공조 설비의 하류)로 더 가지 않는다
        if (cross || c.kind !== 'mech') queue.push(next);
        if (!reached.has(next)) reached.set(next, withStandby);
      }
    }
  }
  reached.delete(origin);
  return reached;
}

export function traceFrom(origin: string, dir: TraceDir, cross: boolean): TraceResult {
  const edges = new Set<string>();
  const up = dir === 'down' ? new Map<string, boolean>() : walk(origin, true, cross, edges);
  const down = dir === 'up' ? new Map<string, boolean>() : walk(origin, false, cross, edges);
  return { origin, dir, up, down, edges };
}

// 추적 결과에 포함된 노드 (출발 장비 포함)
export function traceNodes(t: TraceResult): Set<string> {
  return new Set([t.origin, ...t.up.keys(), ...t.down.keys()]);
}

export function floorOrder(id: string) {
  const n = nodeInfo(id);
  return n ? FLOOR_BY_ID[n.floor].index : -1;
}
