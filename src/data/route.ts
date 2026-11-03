// 현장 모드 길 안내: 장소 · 경로망 · 최단 경로 · 단계 문구 (docs/research/03-mobile-responsive.md §13)
//
// 장소(Place): 층 코어 앞(계단 · 승강기) · 실 출입문 · 냉복도 끝(열 끝) · 랙 앞 · 장비 앞. QR 라벨 · 주소 #here= 의 단위
// 경로망: 실마다 '보이는 점끼리 직선으로 잇는' 그래프 (실은 직사각형이라 벽 안에서는 곧게 걸을 수 있다)
//   장애물 = 랙 블록 · 장비 바닥 면적(0.45m 부풀림). 점 = 코어 앞 · 출입문 · 장애물 모서리(0.5m 바깥) · 출발 · 도착
//   랙 블록 모서리가 냉복도 · 열복도 한가운데에 오므로, 통로를 따라 걷는 길이 저절로 생긴다
//   실과 실은 출입문으로, 층과 층은 코어(계단 · 승강기)로 잇는다
// 가상 건물이라 복도가 따로 없다: 코어 앞은 층마다 그 자리 실(서버실 층은 서버실)에 바로 닿는다고 본다.
// 실제 건물로 바꿀 때는 출입문 · 복도(전실)를 DOORS에 넣으면 된다

import { FLOORS, ROOMS, SERVER_ROOMS, SHAFTS, RACK, BLOCK_LEN, ROW_OFFSETS, AISLE_W, type FloorId, type Room } from './building';
import { EQUIPMENT, EQUIP_BY_ID } from './equipment';
import { RACK_BY_ID, RACKS, type Rack } from './racks';
import { incoming } from './graph';

export type Face = 'N' | 'S' | 'E' | 'W';
export interface Place {
  id: string; // core:3F · door:3f-sr-a · row:A-3:W · rack:A-3-07 · 장비 id
  name: string;
  floor: FloorId;
  room: string; // 실 id
  x: number;
  z: number;
}
export interface RouteStep {
  text: string;
  floor: FloorId;
  x: number;
  z: number;
}
export interface Route {
  from: Place;
  to: Place;
  points: { floor: FloorId; x: number; z: number }[]; // 걷는 길 (층이 바뀌는 곳은 코어 앞 두 점)
  steps: RouteStep[];
  length: number; // m (층 이동은 층당 4m로 친다)
}

const CORE = SHAFTS.find((s) => s.id === 'core')!;
// 코어 앞: 코어 남쪽 면 한가운데에서 0.6m 안쪽
const CORE_X = (CORE.x[0] + CORE.x[1]) / 2;
const CORE_Z = CORE.z[1] + 0.6;
const FLOOR_STEP = 4; // 층 이동 1층 = 4m 걷는 것으로 친다 (승강기 · 계단을 짧게)
const INFLATE = 0.45; // 장애물 부풀림 (지나가는 사람 폭 절반)
const CORNER = 0.5; // 모서리 점은 장애물보다 조금 바깥

// ── 출입문 (가상 건물: 실이 맞닿는 벽에 하나씩) ──
const DOORS: { id: string; a: string; b: string; x: number; z: number }[] = [
  // B1: 코어 앞은 저압 전기실
  { id: 'b1-hv', a: 'b1-lv', b: 'b1-hv', x: -6, z: -5 },
  { id: 'b1-gen', a: 'b1-lv', b: 'b1-gen', x: 0, z: 0 },
  { id: 'b1-chiller', a: 'b1-lv', b: 'b1-chiller', x: 6, z: -5 },
  // 1F: 코어 앞은 로비
  { id: '1f-noc', a: '1f-lobby', b: '1f-noc', x: 2, z: -6 },
  { id: '1f-dock', a: '1f-lobby', b: '1f-dock', x: 2, z: 8 },
  // 2F: 코어 앞은 복도
  { id: '2f-ups-a', a: '2f-corr', b: '2f-ups-a', x: -4, z: -5 },
  { id: '2f-bat-a', a: '2f-corr', b: '2f-bat-a', x: -4, z: 1.5 },
  { id: '2f-agent', a: '2f-corr', b: '2f-agent', x: 0, z: 2 },
  { id: '2f-ups-b', a: '2f-corr', b: '2f-ups-b', x: 4, z: -5 },
  { id: '2f-bat-b', a: '2f-corr', b: '2f-bat-b', x: 4, z: 1.5 },
  // 3F ~ 5F: 서버실 ↔ 전실 (코어 앞은 서버실)
  { id: '3f-ante', a: '3f-sr-a', b: '3f-ante', x: 14, z: 1 },
  { id: '4f-ante', a: '4f-sr-b', b: '4f-ante', x: -14, z: 1 },
  { id: '5f-ante', a: '5f-sr-c', b: '5f-ante', x: -14, z: 1 },
];

const roomShort = (r: Room) => r.name.replace(/\s*\(.*\)$/, '');
const inRect = (x: number, z: number, r: { x: [number, number]; z: [number, number] }, m = 0) =>
  x >= r.x[0] + m && x <= r.x[1] - m && z >= r.z[0] + m && z <= r.z[1] - m;
const roomAt = (floor: FloorId, x: number, z: number) => ROOMS.find((r) => r.floor === floor && inRect(x, z, r));
// 그 자리 바닥 윗면 높이 (층 바닥 기준, 이중마루 서버실이면 마루 위)
export const floorTopAt = (floor: FloorId, x: number, z: number) => {
  const r = roomAt(floor, x, z);
  return r ? (SERVER_ROOMS.find((s) => s.roomId === r.id)?.raised ?? 0) : 0;
};

// ── 장애물 ──
interface Box {
  x: [number, number];
  z: [number, number];
}
const obstacleCache = new Map<string, Box[]>();
function obstacles(roomId: string): Box[] {
  const hit = obstacleCache.get(roomId);
  if (hit) return hit;
  const out: Box[] = [];
  const sr = SERVER_ROOMS.find((s) => s.roomId === roomId);
  if (sr) {
    for (const row of ROW_OFFSETS) {
      const z = sr.cz + row.dz;
      for (const bx of sr.blocks) out.push({ x: [bx, bx + BLOCK_LEN], z: [z - RACK.d / 2, z + RACK.d / 2] });
    }
  }
  for (const e of EQUIPMENT) {
    if (e.room !== roomId || e.area) continue;
    const turned = e.rotY && Math.abs(Math.sin(e.rotY)) > 0.5;
    const [w, , d] = turned ? [e.size[2], e.size[1], e.size[0]] : e.size;
    if (w < 0.2 && d < 0.2) continue; // 벽에 붙은 작은 것(감지기 등)은 길을 막지 않는다
    out.push({ x: [e.pos[0] - w / 2, e.pos[0] + w / 2], z: [e.pos[2] - d / 2, e.pos[2] + d / 2] });
  }
  obstacleCache.set(roomId, out);
  return out;
}
const grow = (b: Box, m: number): Box => ({ x: [b.x[0] - m, b.x[1] + m], z: [b.z[0] - m, b.z[1] + m] });

// 선분이 상자 안을 지나는지 (Liang–Barsky). 끝점이 경계에 닿는 것은 괜찮다
function crosses(ax: number, az: number, bx: number, bz: number, r: Box) {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  const clip = (p: number, q: number) => {
    if (p === 0) return q > 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  if (!clip(-dx, ax - r.x[0]) || !clip(dx, r.x[1] - ax) || !clip(-dz, az - r.z[0]) || !clip(dz, r.z[1] - az)) return false;
  return t1 - t0 > 1e-6;
}
const clear = (roomId: string, ax: number, az: number, bx: number, bz: number) => obstacles(roomId).every((b) => !crosses(ax, az, bx, bz, grow(b, INFLATE)));
const freeAt = (roomId: string, x: number, z: number) => obstacles(roomId).every((b) => !inRect(x, z, grow(b, INFLATE)));
// 장비 · 벽에 막힌 점이면 실 안에서 가장 가까운 빈 곳으로 (벽에 붙은 배전반 앞의 코어, 랙 사이 센서 등)
function snapFree(roomId: string, x: number, z: number) {
  const room = ROOMS.find((r) => r.id === roomId)!;
  if (inRect(x, z, room, 0.3) && freeAt(roomId, x, z)) return { x, z };
  for (let rad = 0.25; rad <= 4; rad += 0.25)
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const px = x + Math.cos(a) * rad;
      const pz = z + Math.sin(a) * rad;
      if (inRect(px, pz, room, 0.3) && freeAt(roomId, px, pz)) return { x: px, z: pz };
    }
  return { x, z };
}
// 층마다 코어 앞 (그 층에서 코어 남쪽 면 앞의 빈 곳)
const coreFront = (floor: FloorId) => {
  const room = roomAt(floor, CORE_X, CORE_Z);
  return room ? { room, ...snapFree(room.id, CORE_X, CORE_Z) } : null;
};

// ── 경로망 ──
type Kind = 'core' | 'door' | 'corner' | 'end';
interface GNode {
  key: string;
  floor: FloorId;
  rooms: string[];
  x: number;
  z: number;
  kind: Kind;
}
const roomNodeCache = new Map<string, GNode[]>();
// 실 안의 고정 점: 코어 앞 · 출입문 · 장애물 모서리
function roomNodes(room: Room): GNode[] {
  const hit = roomNodeCache.get(room.id);
  if (hit) return hit;
  const ns: GNode[] = [];
  const cf = coreFront(room.floor);
  if (cf && cf.room.id === room.id) ns.push({ key: `core:${room.floor}`, floor: room.floor, rooms: [room.id], x: cf.x, z: cf.z, kind: 'core' });
  for (const d of DOORS)
    if (d.a === room.id || d.b === room.id) ns.push({ key: `door:${d.id}`, floor: room.floor, rooms: [d.a, d.b], x: d.x, z: d.z, kind: 'door' });
  obstacles(room.id).forEach((b, i) => {
    const g = grow(b, CORNER);
    [
      [g.x[0], g.z[0]],
      [g.x[1], g.z[0]],
      [g.x[0], g.z[1]],
      [g.x[1], g.z[1]],
    ].forEach(([x, z], j) => {
      if (inRect(x, z, room, 0.3) && freeAt(room.id, x, z))
        ns.push({ key: `c:${room.id}:${i}:${j}`, floor: room.floor, rooms: [room.id], x, z, kind: 'corner' });
    });
  });
  roomNodeCache.set(room.id, ns);
  return ns;
}

// ── 장소 ──
const FACE_DZ = (rack: Rack) => rack.facing * (RACK.d / 2 + AISLE_W / 2);
const rackFront = (r: Rack) => ({ x: r.x, z: r.z + FACE_DZ(r) });

// 장비 앞: 네 면 중 실 안 · 막히지 않은 곳에서 실 가운데에 가까운 면 (0.7m 앞)
function equipFront(id: string): { x: number; z: number } | null {
  const e = EQUIP_BY_ID[id];
  if (!e) return null;
  const room = ROOMS.find((r) => r.id === e.room);
  if (!room) return null;
  if (e.area) return { x: (e.area.x[0] + e.area.x[1]) / 2, z: (e.area.z[0] + e.area.z[1]) / 2 };
  const turned = e.rotY && Math.abs(Math.sin(e.rotY)) > 0.5;
  const [w, , d] = turned ? [e.size[2], e.size[1], e.size[0]] : e.size;
  const [ex, , ez] = e.pos;
  const off = INFLATE + 0.25;
  const cands = [
    { x: ex, z: ez - d / 2 - off },
    { x: ex, z: ez + d / 2 + off },
    { x: ex - w / 2 - off, z: ez },
    { x: ex + w / 2 + off, z: ez },
  ].filter((p) => inRect(p.x, p.z, room, 0.3) && freeAt(room.id, p.x, p.z));
  const cx = (room.x[0] + room.x[1]) / 2;
  const cz = (room.z[0] + room.z[1]) / 2;
  cands.sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz));
  return cands[0] ?? { x: ex, z: ez };
}

// 열 끝(냉복도 쪽): 그 열 앞 냉복도의 서쪽 · 동쪽 끝
function rowEnd(label: string, row: number, end: 'W' | 'E') {
  const sr = SERVER_ROOMS.find((s) => s.label === label);
  if (!sr || row < 1 || row > ROW_OFFSETS.length) return null;
  const sample = RACKS.find((r) => r.serverRoom === label && r.row === row - 1)!;
  const z = rackFront(sample).z;
  const x0 = Math.min(...sr.blocks) - CORNER;
  const x1 = Math.max(...sr.blocks) + BLOCK_LEN + CORNER;
  return { x: end === 'W' ? x0 : x1, z, roomId: sr.roomId, floor: sr.floor };
}

export function placeOf(id: string): Place | null {
  if (id.startsWith('core:')) {
    const floor = id.slice(5) as FloorId;
    const cf = coreFront(floor);
    if (!cf) return null;
    return { id, name: `${floor} 코어 앞 (계단 · 승강기)`, floor, room: cf.room.id, x: cf.x, z: cf.z };
  }
  if (id.startsWith('door:')) {
    const d = DOORS.find((k) => k.id === id.slice(5));
    const r = d && ROOMS.find((k) => k.id === d.b);
    if (!d || !r) return null;
    return { id, name: `${r.floor} ${roomShort(r)} 출입문`, floor: r.floor, room: d.a, x: d.x, z: d.z };
  }
  if (id.startsWith('row:')) {
    const [, rest, end] = id.split(':');
    const [label, row] = rest.split('-');
    const p = rowEnd(label, +row, end as 'W' | 'E');
    if (!p) return null;
    return { id, name: `서버실 ${label} ${row}열 ${end === 'W' ? '서쪽' : '동쪽'} 끝`, floor: p.floor, room: p.roomId, x: p.x, z: p.z };
  }
  if (id.startsWith('rack:')) {
    const r = RACK_BY_ID[id.slice(5)];
    if (!r) return null;
    const f = rackFront(r);
    return { id, name: `랙 ${r.id}`, floor: r.floor, room: r.room, x: f.x, z: f.z };
  }
  const e = EQUIP_BY_ID[id];
  const f = equipFront(id);
  if (!e || !f) return null;
  const p = snapFree(e.room, f.x, f.z);
  return { id, name: e.name, floor: e.floor, room: e.room, x: p.x, z: p.z };
}

// ── 최단 경로 (다익스트라, 점이 층마다 수십 ~ 수백 개라 단순 배열로 충분) ──
type Edge = { to: GNode; w: number };
// 실 안 고정 점끼리 보이는 쌍은 한 번만 계산해 둔다
const adjCache = new Map<string, Map<string, Edge[]>>();
function roomAdj(room: Room) {
  const hit = adjCache.get(room.id);
  if (hit) return hit;
  const ns = roomNodes(room);
  const adj = new Map<string, Edge[]>(ns.map((n) => [n.key, []]));
  for (let i = 0; i < ns.length; i++)
    for (let j = i + 1; j < ns.length; j++) {
      const a = ns[i];
      const b = ns[j];
      if (!clear(room.id, a.x, a.z, b.x, b.z)) continue;
      const w = Math.hypot(a.x - b.x, a.z - b.z);
      adj.get(a.key)!.push({ to: b, w });
      adj.get(b.key)!.push({ to: a, w });
    }
  adjCache.set(room.id, adj);
  return adj;
}

function neighbors(n: GNode, extra: GNode[]): Edge[] {
  const out: Edge[] = [];
  for (const roomId of n.rooms) {
    const room = ROOMS.find((r) => r.id === roomId)!;
    const fixed = roomAdj(room).get(n.key);
    // 고정 점은 저장해 둔 이웃, 출발 · 도착 점은 실 안 모든 점과 직접 따진다
    const cands = fixed ? extra.filter((e) => e.rooms.includes(roomId)) : [...roomNodes(room), ...extra.filter((e) => e.rooms.includes(roomId))];
    if (fixed) out.push(...fixed);
    for (const m of cands) {
      if (m.key === n.key) continue;
      if (clear(roomId, n.x, n.z, m.x, m.z)) out.push({ to: m, w: Math.hypot(n.x - m.x, n.z - m.z) });
    }
  }
  // 코어: 다른 층 코어 앞으로
  if (n.kind === 'core')
    for (const f of FLOORS) {
      if (f.id === n.floor) continue;
      const room = roomAt(f.id, CORE_X, CORE_Z);
      if (!room) continue;
      const m = roomNodes(room).find((k) => k.kind === 'core')!;
      out.push({ to: m, w: Math.abs(f.index - FLOORS.find((k) => k.id === n.floor)!.index) * FLOOR_STEP });
    }
  return out;
}

export function route(fromId: string, toId: string): Route | null {
  const from = placeOf(fromId);
  const to = placeOf(toId);
  if (!from || !to) return null;
  const s: GNode = { key: 'start', floor: from.floor, rooms: [from.room], x: from.x, z: from.z, kind: 'end' };
  const t: GNode = { key: 'goal', floor: to.floor, rooms: [to.room], x: to.x, z: to.z, kind: 'end' };
  const extra = [s, t];
  const dist = new Map<string, number>([[s.key, 0]]);
  const prev = new Map<string, GNode>();
  const open: GNode[] = [s];
  const done = new Set<string>();
  while (open.length) {
    open.sort((a, b) => dist.get(a.key)! - dist.get(b.key)!);
    const n = open.shift()!;
    if (done.has(n.key)) continue;
    done.add(n.key);
    if (n.key === 'goal') break;
    for (const { to: m, w } of neighbors(n, extra)) {
      const d = dist.get(n.key)! + w;
      if (d < (dist.get(m.key) ?? Infinity)) {
        dist.set(m.key, d);
        prev.set(m.key, n);
        open.push(m);
      }
    }
  }
  if (!dist.has('goal')) return null;
  const path: GNode[] = [t];
  while (path[0].key !== 'start') path.unshift(prev.get(path[0].key)!);
  // 같은 자리에 겹친 점(출발이 코어 앞 등)은 하나로
  const points = path
    .map((n) => ({ floor: n.floor, x: n.x, z: n.z }))
    .filter((p, i, a) => i === 0 || p.floor !== a[i - 1].floor || Math.hypot(p.x - a[i - 1].x, p.z - a[i - 1].z) > 0.05);
  return { from, to, points, steps: stepsOf(path, from, to), length: Math.round(dist.get('goal')!) };
}

// ── 단계 문구 ──
// 받침이 있으면 '으로', 없거나 ㄹ이면 '로' (영문 · 숫자는 읽는 소리로)
function ro(word: string) {
  const c = word.trim().slice(-1);
  const code = c.charCodeAt(0) - 0xac00;
  if (code >= 0 && code < 11172) {
    const jong = code % 28;
    return word + (jong === 0 || jong === 8 ? '로' : '으로');
  }
  return word + ('013678MNmn'.includes(c) ? '으로' : '로');
}

function stepsOf(path: GNode[], from: Place, to: Place): RouteStep[] {
  const steps: RouteStep[] = [];
  const push = (text: string, n: { floor: FloorId; x: number; z: number }) => steps.push({ text, floor: n.floor, x: n.x, z: n.z });
  push(`출발: ${from.name}`, from);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const n = path[i];
    if (n.kind === 'core' && a.kind === 'core' && a.floor !== n.floor) {
      const up = FLOORS.find((f) => f.id === n.floor)!.index > FLOORS.find((f) => f.id === a.floor)!.index;
      const room = roomAt(n.floor, n.x, n.z);
      push(`계단 · 승강기로 ${n.floor}까지 ${up ? '올라가기' : '내려가기'}${room ? ` · ${roomShort(room)}` : ''}`, n);
    } else if (n.kind === 'core' && i < path.length - 1 && path[i + 1].kind === 'core' && path[i + 1].floor !== n.floor && from.id !== n.key) {
      push(`${a.floor} 코어(계단 · 승강기)로`, n);
    } else if (n.kind === 'door') {
      // 문을 지나 들어가는 실: 다음 점이 있는 실
      const next = path[i + 1];
      const enter = next ? n.rooms.find((r) => next.rooms.includes(r)) : n.rooms[1];
      const room = ROOMS.find((r) => r.id === enter);
      if (room) push(`${ro(roomShort(room))} 들어가기`, n);
    }
  }
  // 마지막: 랙이면 '몇 열 앞 냉복도 → 랙 번호(가까운 끝에서 몇 번째)', 장비면 '이름 앞'.
  // 현장에서는 랙 문 번호표를 읽으며 찾으므로 왼쪽 · 오른쪽보다 열 번호 · 끝에서 센 순번이 확실하다
  if (to.id.startsWith('rack:')) {
    const r = RACK_BY_ID[to.id.slice(5)];
    const aisleZ = rackFront(r).z;
    // 냉복도에 들어선 점: 도착 바로 앞에서 같은 통로(z)를 따라 걸어온 첫 점 (없으면 바로 앞 점)
    let k = path.length - 1;
    while (k > 0 && Math.abs(path[k - 1].z - aisleZ) < 0.3) k--;
    push(`서버실 ${r.serverRoom} ${r.row + 1}열 앞 냉복도로`, path[k === path.length - 1 ? k - 1 : k]);
    const row = RACKS.filter((q) => q.serverRoom === r.serverRoom && q.row === r.row);
    const west = row.filter((q) => q.x <= r.x + 1e-6).length;
    const east = row.filter((q) => q.x >= r.x - 1e-6).length;
    push(`${r.row + 1}열 랙 ${r.id} (${west <= east ? `서쪽 끝에서 ${west}` : `동쪽 끝에서 ${east}`}번째)`, to);
  } else {
    push(`도착: ${to.name} 앞`, to);
  }
  return steps;
}

// 따라가기: 이 장비 · 랙에 전원 · 냉기를 보내는 곳 (연결 지점(hub)은 건너 그 앞 장비로). 현장 모드 '전원 따라가기'
export function upstreamOf(id: string): { id: string; kind: string; sys?: 'A' | 'B' }[] {
  const out = new Map<string, { id: string; kind: string; sys?: 'A' | 'B' }>();
  const seen = new Set<string>();
  const walk = (n: string, kind?: string, sys?: 'A' | 'B') => {
    for (const c of incoming(n)) {
      if (c.standby || seen.has(c.from)) continue;
      seen.add(c.from);
      const k = kind ?? c.kind;
      const s2 = sys ?? c.sys;
      if (placeOf(c.from)) out.set(c.from, { id: c.from, kind: k, sys: s2 });
      else walk(c.from, k, s2);
    }
  };
  walk(id);
  return [...out.values()];
}

// 개발용 점검: 모든 랙 · 장비가 층마다 코어 앞에서 닿는지 (콘솔 __route.check())
export function checkAll() {
  const targets = [...RACKS.map((r) => `rack:${r.id}`), ...EQUIPMENT.map((e) => e.id)];
  const fail: string[] = [];
  const noPlace: string[] = [];
  for (const id of targets) {
    if (!placeOf(id)) {
      noPlace.push(id);
      continue;
    }
    if (!route('core:1F', id)) fail.push(id);
  }
  return { targets: targets.length, noPlace, fail };
}
