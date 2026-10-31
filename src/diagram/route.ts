// 흐름도 연결선의 꺾은선 경로. 한 노드에 여러 선이 붙으면 변을 따라 나눠 붙이고,
// 같은 칸 사이를 지나는 가로(세로) 구간은 출발 노드마다 높이를 조금씩 달리한다.

import type { DEdge, Diagram, DNode } from './model';

type P = [number, number];

export function routeEdges(d: Diagram): Map<string, P[]> {
  const byId = new Map(d.nodes.map((n) => [n.id, n]));
  const down = d.flow === 'down';
  // 흐름 축(main)과 옆 축(cross)
  const main = (n: DNode) => (down ? n.y : n.x);
  const cross = (n: DNode) => (down ? n.x : n.y);
  const half = (n: DNode) => (down ? n.h : n.w) / 2;
  const side = (n: DNode) => (down ? n.w : n.h);
  const sameRank = (a: DNode, b: DNode) => Math.abs(main(a) - main(b)) < half(a);

  // 변 위 붙는 위치
  const spread = (n: DNode, list: DEdge[], other: (e: DEdge) => DNode) => {
    const sorted = [...list].sort((a, b) => cross(other(a)) - cross(other(b)));
    const step = Math.min(16, (side(n) - 16) / Math.max(1, sorted.length));
    const m = new Map<string, number>();
    sorted.forEach((e, k) => m.set(e.id, cross(n) + (k - (sorted.length - 1) / 2) * step));
    return m;
  };
  const outPos = new Map<string, number>();
  const inPos = new Map<string, number>();
  for (const n of d.nodes) {
    const outs = d.edges.filter((e) => e.from === n.id && !sameRank(n, byId.get(e.to)!));
    const ins = d.edges.filter((e) => e.to === n.id && !sameRank(n, byId.get(e.from)!));
    spread(n, outs, (e) => byId.get(e.to)!).forEach((v, k) => outPos.set(k, v));
    spread(n, ins, (e) => byId.get(e.from)!).forEach((v, k) => inPos.set(k, v));
  }

  // 칸 사이 구간: 같은 간격을 지나는 출발 노드별로 높이 분리
  const gapSources = new Map<string, string[]>();
  const gapKey = (a: DNode, b: DNode) => `${Math.round(main(a) + half(a))}|${Math.round(main(b) - half(b))}`;
  for (const e of d.edges) {
    const a = byId.get(e.from)!;
    const b = byId.get(e.to)!;
    if (sameRank(a, b)) continue;
    const k = gapKey(a, b);
    const list = gapSources.get(k) ?? [];
    if (!list.includes(a.id)) list.push(a.id);
    gapSources.set(k, list);
  }
  for (const list of gapSources.values()) list.sort((p, q) => cross(byId.get(p)!) - cross(byId.get(q)!));

  const out = new Map<string, P[]>();
  const pt = (m: number, c: number): P => (down ? [c, m] : [m, c]);
  for (const e of d.edges) {
    const a = byId.get(e.from)!;
    const b = byId.get(e.to)!;
    if (sameRank(a, b)) {
      // 같은 줄: 옆면끼리 직선
      const dir = cross(b) > cross(a) ? 1 : -1;
      const sa = cross(a) + (dir * side(a)) / 2;
      const sb = cross(b) - (dir * side(b)) / 2;
      out.set(e.id, [pt(main(a), sa), pt(main(b), sb)]);
      continue;
    }
    const m0 = main(a) + half(a);
    const m1 = main(b) - half(b);
    const list = gapSources.get(gapKey(a, b))!;
    const lane = (list.indexOf(a.id) - (list.length - 1) / 2) * 7;
    const mid = (m0 + m1) / 2 + lane;
    const c0 = outPos.get(e.id)!;
    const c1 = inPos.get(e.id)!;
    out.set(e.id, Math.abs(c0 - c1) < 0.5 ? [pt(m0, c0), pt(m1, c1)] : [pt(m0, c0), pt(mid, c0), pt(mid, c1), pt(m1, c1)]);
  }
  return out;
}

export function pathD(pts: P[], dx = 0, dy = 0) {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${(p[0] + dx).toFixed(1)},${(p[1] + dy).toFixed(1)}`).join(' ');
}
