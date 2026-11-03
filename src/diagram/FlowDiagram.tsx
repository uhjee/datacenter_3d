// SVG 흐름도. 선택 · 호버 · 추적 상태를 3D와 같은 저장소에서 읽어 같이 강조한다.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { CONN_BY_ID } from '../data/graph';
import { SYS_COLOR } from '../data/connections';
import { TRACE_COLOR } from '../scene/common';
import { focusItem } from '../scene/focus';
import { traceMarkOf, useView, type TraceMark } from '../store/useView';
import { usePinchZoom } from '../ui/touch';
import { DIAGRAMS, type DiagramId, type DNode } from './model';
import { pathD, routeEdges } from './route';
import { Symbol } from './Symbol';
import { edgeColor, frameColor, isLive, type NodeState } from '../scenario/core';

interface ViewT {
  k: number;
  tx: number;
  ty: number;
}

const PAD = 40;

// 글자 폭 어림 (한글 ≈ 글자 크기, 그 밖 ≈ 0.58배)
function textW(t: string, size: number) {
  let w = 0;
  for (const ch of t) w += ch.charCodeAt(0) > 0x1100 ? size : size * 0.58;
  return w;
}
// 칸에 맞게 글자 크기를 줄이고, 그래도 넘치면 말줄임
function fit(t: string, room: number, size: number, min: number): [string, number] {
  let s = size;
  while (s > min && textW(t, s) > room) s -= 0.5;
  if (textW(t, s) <= room) return [t, s];
  let out = t;
  while (out.length > 1 && textW(`${out}…`, s) > room) out = out.slice(0, -1);
  return [`${out}…`, s];
}

function bounds(id: DiagramId) {
  const d = DIAGRAMS[id];
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const n of d.nodes) {
    x0 = Math.min(x0, n.x - n.w / 2);
    x1 = Math.max(x1, n.x + n.w / 2);
    y0 = Math.min(y0, n.y - n.h / 2);
    y1 = Math.max(y1, n.y + n.h / 2);
  }
  for (const l of d.labels) {
    x0 = Math.min(x0, l.x - (l.anchor === 'middle' ? 80 : 0));
    y0 = Math.min(y0, l.y - 14);
  }
  for (const b of d.bands) {
    x0 = Math.min(x0, b.x);
    x1 = Math.max(x1, b.x + b.w);
    y0 = Math.min(y0, b.y - 20);
    y1 = Math.max(y1, b.y + b.h);
  }
  return { x0, y0, x1, y1 };
}

export function FlowDiagram({ id, fitKey, compact }: { id: DiagramId; fitKey: number; compact: boolean }) {
  const d = DIAGRAMS[id];
  const routes = useMemo(() => routeEdges(d), [d]);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 300 });
  const [view, setView] = useState<ViewT>({ k: 1, tx: 0, ty: 0 });

  const selectedId = useView((s) => s.selectedId);
  const hoveredId = useView((s) => s.hoveredId);
  const traced = useView((s) => s.traced);
  const snap = useView((s) => s.scenSnap);

  useLayoutEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // 화면에 맞춤: 탭 전환 · 패널 크기 변경 · 맞춤 버튼
  useLayoutEffect(() => {
    const b = bounds(id);
    const all = Math.min((size.w - PAD * 2) / (b.x1 - b.x0), (size.h - PAD * 2) / (b.y1 - b.y0), 1.4);
    // 낮은 패널에서는 전체를 다 넣으면 글자가 안 보이므로 읽을 수 있는 크기로 위쪽부터 보여준다
    const k = compact ? Math.max(all, 0.62) : all;
    const tx = (size.w - (b.x1 - b.x0) * k) / 2 - b.x0 * k;
    const ty = k > all + 1e-6 ? PAD / 2 - b.y0 * k : (size.h - (b.y1 - b.y0) * k) / 2 - b.y0 * k;
    setView({ k, tx, ty });
  }, [id, size.w, size.h, fitKey, compact]);

  // 선택한 장비가 화면 밖이면 가운데로
  useEffect(() => {
    if (!selectedId) return;
    const n = d.nodes.find((k) => k.ref === selectedId || (!k.ref && k.members.includes(selectedId)));
    if (!n) return;
    setView((v) => {
      const sx = n.x * v.k + v.tx;
      const sy = n.y * v.k + v.ty;
      if (sx > 40 && sx < size.w - 40 && sy > 30 && sy < size.h - 30) return v;
      return { ...v, tx: size.w / 2 - n.x * v.k, ty: size.h / 2 - n.y * v.k };
    });
  }, [selectedId, d, size.w, size.h]);

  // 추적 · 묶음이 바뀌면 그 부분이 한 화면에 들어오게
  const highlight = useView((s) => s.highlight);
  const partial = highlight?.kind === 'group' ? highlight : null;
  const shownEdge = (conns: string[]) => !partial || conns.some((c) => partial.edges.has(c));
  // 묶음 노드 + 묶음 연결의 반대쪽 끝(묶음 밖이면 흐리게)
  const outer = useMemo(() => {
    const m = new Set<string>();
    if (partial) for (const e of d.edges) if (e.conns.some((c) => partial.edges.has(c))) m.add(e.from).add(e.to);
    return m;
  }, [partial, d]);
  const inGroup = (n: DNode) => !!partial && n.members.some((m) => partial.nodes.has(m));
  const shownNode = (n: DNode) => !partial || inGroup(n) || outer.has(n.id);
  useEffect(() => {
    if (!highlight) return;
    const hit = d.nodes.filter((n) => n.members.some((m) => highlight.nodes.has(m)));
    if (hit.length === 0) return;
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const n of hit) {
      x0 = Math.min(x0, n.x - n.w / 2);
      x1 = Math.max(x1, n.x + n.w / 2);
      y0 = Math.min(y0, n.y - n.h / 2);
      y1 = Math.max(y1, n.y + n.h / 2);
    }
    const k = Math.min((size.w - PAD * 2) / (x1 - x0), (size.h - PAD * 2) / (y1 - y0), 1.1);
    setView({ k, tx: size.w / 2 - ((x0 + x1) / 2) * k, ty: size.h / 2 - ((y0 + y1) / 2) * k });
  }, [highlight, d, size.w, size.h]);

  // 확대 · 이동
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean; re?: boolean } | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  // (px, py)를 기준으로 f배 확대: 휠 · 두 손가락 공통
  const zoomAt = (f: number, px: number, py: number) =>
    setView((v) => {
      const k = Math.min(3, Math.max(0.25, v.k * f));
      return { k, tx: px - ((px - v.tx) * k) / v.k, ty: py - ((py - v.ty) * k) / v.k };
    });
  const pinching = usePinchZoom(box, zoomAt);
  const onWheel = (e: React.WheelEvent) => {
    const r = box.current!.getBoundingClientRect();
    zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
  };
  const onDown = (e: RPointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false };
  };
  const onMove = (e: RPointerEvent) => {
    const g = drag.current;
    if (!g) return;
    // 두 손가락 확대 중에는 이동하지 않고, 한 손가락만 남으면 그 자리에서 이동을 다시 잡는다
    if (pinching()) {
      g.moved = true;
      g.re = true;
      return;
    }
    if (g.re) {
      Object.assign(g, { re: false, x: e.clientX, y: e.clientY, tx: viewRef.current.tx, ty: viewRef.current.ty });
      return;
    }
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.moved && Math.hypot(dx, dy) < 4) return;
    if (!g.moved) (e.currentTarget as Element).setPointerCapture(e.pointerId);
    g.moved = true;
    setView((v) => ({ ...v, tx: g.tx + dx, ty: g.ty + dy }));
  };
  const onUp = () => {
    // 클릭 판정이 끝난 뒤 지운다
    setTimeout(() => (drag.current = null), 0);
  };
  const dragged = () => !!drag.current?.moved;

  // 강조 상태
  const nodeMark = (n: DNode): TraceMark | 'origin' | null => {
    if (!traced) return null;
    if (n.ref === traced.origin || n.members.includes(traced.origin)) return 'origin';
    for (const m of n.members) {
      const t = traceMarkOf(traced, m);
      if (t) return t;
    }
    return null;
  };
  const edgeOn = (conns: string[]) => {
    if (highlight) return conns.some((c) => highlight.edges.has(c));
    if (selectedId)
      return conns.some((c) => {
        const k = CONN_BY_ID[c];
        return k.from === selectedId || k.to === selectedId;
      });
    return false;
  };
  const focusing = !!(highlight || selectedId);

  const markers = useMemo(() => [...new Set(d.edges.map((e) => e.color))], [d]);
  const mk = (c: string) => `arw-${id}-${c.slice(1)}`;

  return (
    <div
      ref={box}
      className="flow-box"
      onWheel={onWheel}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onClick={() => !dragged() && useView.getState().select(null)}
    >
      <svg width={size.w} height={size.h}>
        <defs>
          {markers.map((c) => (
            <marker key={c} id={mk(c)} viewBox="0 0 8 8" refX={7} refY={4} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 Z" fill={c} />
            </marker>
          ))}
        </defs>
        <g transform={`translate(${view.tx},${view.ty}) scale(${view.k})`}>
          {d.bands.map((b) => (
            <g key={b.text} className={`band ${partial ? 'faint' : ''}`}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={10} />
              <text x={b.x + 10} y={b.y - 6}>
                {b.text}
              </text>
            </g>
          ))}
          {d.labels.map((l) => (
            <text key={l.text} className={`row-label ${partial ? 'faint' : ''}`} x={l.x} y={l.y + 4} textAnchor={l.anchor ?? 'start'}>
              {l.text}
            </text>
          ))}

          {d.edges.map((e) => {
            if (!shownEdge(e.conns)) return null;
            const pts = routes.get(e.id)!;
            // 시나리오 재생 중: 흐르는 연결은 움직이고 전원 색, 끊긴 연결은 회색, 대기 경로는 흐린 점선
            const st = snap ? (snap.edges[e.conns[0]] ?? 'none') : null;
            const live = st ? isLive(st) : false;
            const on = st ? live : edgeOn(e.conns);
            const dim = st ? st === 'none' || st === 'idle' : focusing && !on;
            const color = (st && edgeColor(st)) ?? e.color;
            const cls = `edge ${on ? 'on' : ''} ${dim ? 'dim' : ''} ${e.standby || st === 'idle' ? 'standby' : on ? 'flow' : ''}`;
            return (
              <g key={e.id} className={cls}>
                <path d={pathD(pts)} stroke={color} markerEnd={e.pipe ? undefined : `url(#${mk(e.color)})`} />
                {e.pipe && <path className="ret" d={pathD([...pts].reverse(), 3.5, 3.5)} stroke={color} />}
              </g>
            );
          })}

          {d.nodes.filter(shownNode).map((n) => (
            <NodeBox
              key={n.id}
              n={n}
              selected={!!selectedId && (n.ref === selectedId || (!n.ref && n.members.includes(selectedId)))}
              hovered={!!hoveredId && (n.ref === hoveredId || (!n.ref && n.members.includes(hoveredId)))}
              mark={nodeMark(n)}
              dim={(!!traced && !nodeMark(n)) || (!!partial && !inGroup(n)) || (!!snap && snap.nodes[n.ref ?? n.members[0]]?.status === 'off')}
              scen={snap ? snap.nodes[n.ref ?? n.members[0]] : undefined}
              onPick={() => {
                if (dragged()) return;
                if (n.goto) useView.getState().setDiagramTab(n.goto);
                else if (n.ref) focusItem(n.ref);
                else if (n.type === 'group' || n.type === 'pdu') focusItem(n.members[0]);
              }}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

// 테두리: 계통 색, 선택은 노란색(--sel) 하나만 (styles.css 토큰과 같은 값)
const NEUTRAL = '#465466';
const SEL = '#ffd43b';

function NodeBox({
  n,
  selected,
  hovered,
  mark,
  dim,
  scen,
  onPick,
}: {
  n: DNode;
  selected: boolean;
  hovered: boolean;
  mark: TraceMark | 'origin' | null;
  dim: boolean;
  scen?: NodeState;
  onPick: () => void;
}) {
  const base = n.sys ? SYS_COLOR[n.sys] : NEUTRAL;
  const scenColor = frameColor(scen ?? undefined);
  const stroke = selected ? SEL : mark === 'up' || mark === 'down' ? TRACE_COLOR[mark] : hovered ? '#e9ecef' : (scenColor ?? base);
  const tall = n.h > n.w * 2;
  const hoverId = n.ref ?? (n.type === 'group' || n.type === 'pdu' ? n.members[0] : null);
  const name = fit(n.name, n.w - 38, 11.5, 9.5);
  const sub = fit(n.sub, n.w - 66, 10, 8.5);
  return (
    <g
      className={`node ${dim ? 'dim' : ''}`}
      transform={`translate(${n.x - n.w / 2},${n.y - n.h / 2})`}
      onClick={(e) => {
        e.stopPropagation();
        onPick();
      }}
      onPointerEnter={() => hoverId && useView.getState().hover(hoverId)}
      onPointerLeave={() => hoverId && useView.getState().hoveredId === hoverId && useView.getState().hover(null)}
    >
      <title>{`${n.name} · ${n.floor}${n.sub ? ` · ${n.sub}` : ''}`}</title>
      <rect width={n.w} height={n.h} rx={tall ? 8 : 6} stroke={stroke} strokeWidth={selected || mark ? 2.6 : 1.4} className="node-bg" />
      {tall ? (
        <>
          <g transform={`translate(${n.w / 2},18)`} style={{ color: '#22b8cf' }}>
            <Symbol type={n.type} />
          </g>
          <text className="node-name" transform={`translate(${n.w / 2 + 4},36) rotate(90)`}>
            {n.name} · {n.floor}
          </text>
        </>
      ) : (
        <>
          <g transform={`translate(17,${n.h / 2})`} style={{ color: base === NEUTRAL ? '#adb5bd' : base }}>
            <Symbol type={n.type} />
          </g>
          <text className="node-name" x={33} y={19} style={{ fontSize: name[1] }}>
            {name[0]}
          </text>
          <text className="node-sub" x={33} y={35} style={{ fontSize: sub[1] }}>
            {sub[0]}
          </text>
          <g transform={`translate(${n.w - 4},${n.h - 17})`}>
            <rect x={-24} width={24} height={13} rx={3} className="floor-badge" />
            <text x={-12} y={10} textAnchor="middle" className="floor-text">
              {String(n.floor).length > 3 ? '다층' : n.floor}
            </text>
          </g>
        </>
      )}
    </g>
  );
}
