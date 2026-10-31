// 연결선의 3D 경로. 점은 "층 + 그 층 바닥 기준 좌표"로 두고, 그릴 때 층의 현재 높이를 더한다
// (층 벌려 보기 애니메이션 중에도 선이 층을 따라 늘어나도록).

import { RACK, SHAFTS, type FloorId } from '../data/building';
import { CONNECTIONS, HUB_BY_ID, KIND_META, connColor, type Conn, type LinkGroup } from '../data/connections';
import { nodeInfo } from '../data/graph';
import { RACK_BY_ID } from '../data/racks';

export interface RP {
  f: FloorId;
  x: number;
  y: number;
  z: number;
}

export interface LinkLine {
  key: string;
  conns: string[]; // 이 선이 나타내는 연결 id (랙 급전선은 여러 개)
  color: string;
  group: LinkGroup;
  standby: boolean;
  ret: boolean; // 배관의 환수관
  points: RP[];
  floors: FloorId[];
}

// 층별 케이블 트레이 · 배관 높이 (옥상은 바닥 위 배관)
const TRAY: Record<FloorId, number> = { B1: 4.6, '1F': 3.7, '2F': 3.7, '3F': 4.2, '4F': 4.2, PH: 0.45 };
const RET_OFFSET = 0.22;

function anchor(id: string, toward: { x: number; z: number }): RP {
  const n = nodeInfo(id)!;
  if (id.startsWith('hub:')) {
    const h = HUB_BY_ID[id];
    const half = h.size[2] / 2;
    const z = Math.min(h.pos[2] + half - 0.3, Math.max(h.pos[2] - half + 0.3, toward.z));
    return { f: n.floor, x: h.pos[0], y: h.pos[1], z };
  }
  const top = n.pos[1] + n.size[1];
  const y = n.floor === 'PH' ? TRAY.PH : Math.min(top, TRAY[n.floor] - 0.2);
  return { f: n.floor, x: n.pos[0], y, z: n.pos[2] };
}

// 같은 점이 이어지면 하나로
function clean(pts: RP[]) {
  return pts.filter((p, i) => {
    const q = pts[i - 1];
    return !q || q.f !== p.f || Math.abs(q.x - p.x) + Math.abs(q.y - p.y) + Math.abs(q.z - p.z) > 1e-3;
  });
}

function routeConn(c: Conn, lane: number, shaftLane: number): RP[] {
  const fa = nodeInfo(c.from)!;
  const fb = nodeInfo(c.to)!;
  const A = anchor(c.from, { x: fb.pos[0], z: fb.pos[2] });
  const B = anchor(c.to, { x: fa.pos[0], z: fa.pos[2] });
  const shaft = A.f !== B.f && c.via ? SHAFTS.find((s) => s.id === c.via) : undefined;

  if (!shaft) {
    const h = A.f === 'PH' ? TRAY.PH + (lane % 3) * 0.12 : TRAY[A.f] + (lane % 5) * 0.12;
    return clean([A, { ...A, y: h }, { f: A.f, x: B.x, y: h, z: A.z }, { f: A.f, x: B.x, y: h, z: B.z }, B]);
  }
  const w = shaft.x[1] - shaft.x[0];
  const cols = Math.max(1, Math.floor((w - 0.5) / 0.22) + 1);
  const sx = shaft.x[0] + 0.25 + (shaftLane % cols) * 0.22;
  const sz = (shaft.z[0] + shaft.z[1]) / 2 + ((Math.floor(shaftLane / cols) % 3) - 1) * 0.4;
  const dy = (shaftLane % 4) * 0.14;
  const hA = TRAY[A.f] + dy;
  const hB = TRAY[B.f] + dy;
  return clean([
    A,
    { ...A, y: hA },
    { f: A.f, x: A.x, y: hA, z: sz },
    { f: A.f, x: sx, y: hA, z: sz },
    { f: B.f, x: sx, y: hB, z: sz },
    { f: B.f, x: B.x, y: hB, z: sz },
    { f: B.f, x: B.x, y: hB, z: B.z },
    B,
  ]);
}

// PDU · STS → 랙 열: 열 단위로 묶어 랙 위를 지나는 급전선 하나로 그린다
function feederLines(): LinkLine[] {
  const groups = new Map<string, Conn[]>();
  for (const c of CONNECTIONS) {
    if (!c.to.startsWith('rack:')) continue;
    const r = RACK_BY_ID[c.to.slice(5)];
    const k = `${c.from}|${r.room}|${r.row}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(c);
  }
  const out: LinkLine[] = [];
  for (const [k, conns] of groups) {
    const racks = conns.map((c) => RACK_BY_ID[c.to.slice(5)]).sort((a, b) => a.x - b.x);
    const r0 = racks[0];
    const src = nodeInfo(conns[0].from)!;
    const f = r0.floor;
    const kind = conns[0].kind;
    const tier = kind === 'upsA' ? 0 : kind === 'upsB' ? 1 : 2;
    const zRow = r0.z - r0.facing * (RACK.d / 2 - 0.12) + (tier - 1) * 0.12;
    const yRow = r0.y + RACK.h + 0.25 + tier * 0.15;
    const h = TRAY[f] - 0.6 + r0.row * 0.1 + tier * 0.04;
    const west = src.pos[0] < racks[0].x;
    const xNear = west ? racks[0].x - RACK.w / 2 : racks[racks.length - 1].x + RACK.w / 2;
    const xFar = west ? racks[racks.length - 1].x : racks[0].x;
    const top = src.pos[1] + src.size[1];
    const pts: RP[] = [
      { f, x: src.pos[0], y: top, z: src.pos[2] },
      { f, x: src.pos[0], y: h, z: src.pos[2] },
      { f, x: src.pos[0], y: h, z: zRow },
      { f, x: xNear, y: h, z: zRow },
      { f, x: xNear, y: yRow, z: zRow },
      { f, x: xFar, y: yRow, z: zRow },
    ];
    out.push({
      key: k,
      conns: conns.map((c) => c.id),
      color: KIND_META[kind].color,
      group: 'rack',
      standby: false,
      ret: false,
      points: pts,
      floors: [f],
    });
  }
  return out;
}

export function buildLines(): LinkLine[] {
  const lines: LinkLine[] = [];
  const shaftCount = new Map<string, number>();
  const floorCount = new Map<string, number>();
  for (const c of CONNECTIONS) {
    if (c.to.startsWith('rack:')) continue;
    const fa = nodeInfo(c.from)!.floor;
    const sk = c.via ?? '';
    const shaftLane = shaftCount.get(sk) ?? 0;
    shaftCount.set(sk, shaftLane + 1);
    const lane = floorCount.get(fa) ?? 0;
    floorCount.set(fa, lane + 1);
    const points = routeConn(c, lane, shaftLane);
    const meta = KIND_META[c.kind];
    const floors = [...new Set(points.map((p) => p.f))];
    const base = { conns: [c.id], group: meta.group, standby: !!c.standby, floors };
    lines.push({ ...base, key: c.id, color: connColor(c), ret: false, points });
    if (meta.pipe) {
      // 환수관: 공급관 옆으로 평행하게, 방향은 반대
      const back = points.map((p) => ({ ...p, x: p.x + RET_OFFSET, y: p.y + RET_OFFSET, z: p.z + RET_OFFSET })).reverse();
      lines.push({ ...base, key: `${c.id}r`, color: meta.color, ret: true, points: back });
    }
  }
  return [...lines, ...feederLines()];
}
