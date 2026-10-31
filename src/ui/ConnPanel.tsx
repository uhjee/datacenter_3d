// 정보 카드의 연결 부분: 상류 → 이 장비 → 하류 흐름, 상류 · 하류 추적

import { useState, type CSSProperties } from 'react';
import { ChevronRight } from 'lucide-react';
import { FLOOR_BY_ID } from '../data/building';
import { EQUIP_BY_ID } from '../data/equipment';
import { CONNECTIONS, KIND_META, connColor, type Conn } from '../data/connections';
import { incoming, nodeInfo, nodeName, outgoing, type TraceDir } from '../data/graph';
import { RACK_BY_ID } from '../data/racks';
import { TRACE_COLOR } from '../scene/common';
import { groupsOf } from '../data/groups';
import { activateGroup, focusItem, peek, startTrace } from '../scene/focus';
import { useView } from '../store/useView';
import { Section, Switch } from './kit';

const hoverOn = (id: string) => () => useView.getState().hover(id);
const hoverOff = () => useView.getState().hover(null);

function NodeButton({ id, onClick }: { id: string; onClick: () => void }) {
  const n = nodeInfo(id);
  return (
    <button className="link-node" onClick={onClick} onMouseEnter={hoverOn(id)} onMouseLeave={hoverOff}>
      <span className="fl">{n?.floor}</span>
      {nodeName(id)}
    </button>
  );
}

// 흐름 한 줄: 왼쪽 색 띠(연결 종류) · 층 · 이름 · 연결 이름
function FlowNode({ c, other, indent }: { c: Conn; other: string; indent?: boolean }) {
  return (
    <button
      className={`rp-fnode${c.standby ? ' dash' : ''}${indent ? ' indent' : ''}`}
      style={{ '--c': connColor(c) } as CSSProperties}
      onClick={() => focusItem(other)}
      onMouseEnter={hoverOn(other)}
      onMouseLeave={hoverOff}
      title={c.note}
    >
      <span className="fl">{nodeInfo(other)?.floor}</span>
      <span className="rp-fname">
        {nodeName(other)}
        {c.note && <small>{c.note}</small>}
      </span>
      {c.standby && <span className="sb">대기</span>}
      <span className="rp-fkind">{KIND_META[c.kind].name}</span>
    </button>
  );
}

const byName = (a: string, b: string) => nodeName(a).localeCompare(nodeName(b), 'ko', { numeric: true });

// 같은 종류 · 같은 층 · 같은 유형이 3개 이상이면 한 줄로 묶는다 (예: PDU-A1-1 ~ 6)
function rangeLabel(ids: string[]) {
  const first = nodeName(ids[0]);
  const last = nodeName(ids[ids.length - 1]);
  let k = 0;
  while (k < first.length && first[k] === last[k]) k++;
  return k > 0 ? `${first} ~ ${last.slice(k)}` : `${first} 외 ${ids.length - 1}`;
}

function FlowGroup({ conns, side }: { conns: Conn[]; side: 'in' | 'out' }) {
  const [open, setOpen] = useState(false);
  const other = (c: Conn) => (side === 'in' ? c.from : c.to);
  const sorted = [...conns].sort((a, b) => byName(other(a), other(b)));
  const c0 = sorted[0];
  return (
    <>
      <button className={`rp-fnode group${open ? ' open' : ''}`} style={{ '--c': connColor(c0) } as CSSProperties} onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="fl">{nodeInfo(other(c0))?.floor}</span>
        <span className="rp-fname">{rangeLabel(sorted.map(other))}</span>
        <span className="rp-fcount num">{sorted.length}</span>
        <ChevronRight className="k-chev" size={14} />
      </button>
      {open && sorted.map((c) => <FlowNode key={c.id} c={c} other={other(c)} indent />)}
    </>
  );
}

// 랙으로 가는 연결은 서버실 단위로 묶어 한 줄로
function RackRows({ conns }: { conns: Conn[] }) {
  const m = new Map<string, { c: Conn; rows: Set<number>; n: number; room: string }>();
  for (const c of conns) {
    const r = RACK_BY_ID[c.to.slice(5)];
    const k = `${c.kind}|${r.serverRoom}`;
    const g = m.get(k) ?? { c, rows: new Set<number>(), n: 0, room: r.serverRoom };
    g.rows.add(r.row + 1);
    g.n++;
    m.set(k, g);
  }
  return (
    <>
      {[...m.values()].map((g) => (
        <div key={`${g.c.kind}${g.room}`} className="rp-fnode static" style={{ '--c': connColor(g.c) } as CSSProperties}>
          <span className="fl">{RACK_BY_ID[g.c.to.slice(5)].floor}</span>
          <span className="rp-fname">
            서버실 {g.room} 랙 {g.n}대 <small>{[...g.rows].sort((a, b) => a - b).join('·')}열</small>
          </span>
          <span className="rp-fkind">{KIND_META[g.c.kind].name}</span>
        </div>
      ))}
    </>
  );
}

function FlowSide({ conns, side }: { conns: Conn[]; side: 'in' | 'out' }) {
  const other = (c: Conn) => (side === 'in' ? c.from : c.to);
  const racks = conns.filter((c) => side === 'out' && c.to.startsWith('rack:'));
  const groups = new Map<string, Conn[]>();
  for (const c of conns) {
    if (racks.includes(c)) continue;
    const o = other(c);
    const k = `${c.kind}|${nodeInfo(o)?.floor}|${EQUIP_BY_ID[o]?.type ?? o.split(':')[0]}`;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  return (
    <div className="rp-flow-side">
      {[...groups.values()].map((g) =>
        g.length >= 3 ? <FlowGroup key={g[0].id} conns={g} side={side} /> : g.map((c) => <FlowNode key={c.id} c={c} other={other(c)} />),
      )}
      <RackRows conns={racks} />
    </div>
  );
}

const DIRS: { key: TraceDir; name: string }[] = [
  { key: 'up', name: '상류 추적' },
  { key: 'down', name: '하류 추적' },
  { key: 'both', name: '전체 경로' },
];

// 연결 섹션: 상류 → 이 장비 → 하류, 추적 버튼. 방재 · 보안 · 센서처럼 연결이 없으면 그리지 않는다
export function ConnSection({ id, defaultOpen = true }: { id: string; defaultOpen?: boolean }) {
  const ins = incoming(id);
  const outs = outgoing(id);
  const dir = useView((s) => s.traceDir);
  const cross = useView((s) => s.traceCross);
  const traced = useView((s) => s.traced);
  if (ins.length === 0 && outs.length === 0) return null;
  const isCooling = nodeInfo(id)?.domain === 'cooling';
  const touchesMech = [...ins, ...outs].some((c) => c.kind === 'mech');
  const inColor = ins[0] ? connColor(ins[0]) : 'var(--line-2)';
  const outColor = outs[0] ? connColor(outs[0]) : 'var(--line-2)';

  return (
    <Section id="conn" title="연결" count={`받는 곳 ${ins.length} · 보내는 곳 ${outs.length}`} defaultOpen={defaultOpen}>
      <div className="rp-flow">
        {ins.length > 0 ? <FlowSide conns={ins} side="in" /> : <p className="rp-flow-end">이 장비가 시작점입니다</p>}
        <span className="rp-flow-link" style={{ '--c': inColor } as CSSProperties} />
        <div className="rp-fnode self">
          <span className="rp-fname">{nodeName(id)}</span>
          <span className="rp-fkind">이 장비</span>
        </div>
        <span className="rp-flow-link" style={{ '--c': outColor } as CSSProperties} />
        {outs.length > 0 ? <FlowSide conns={outs} side="out" /> : <p className="rp-flow-end">이 장비가 끝점입니다</p>}
      </div>

      <div className="seg small rp-trace">
        {DIRS.map((d) => (
          <button key={d.key} className={dir === d.key ? 'on' : ''} onClick={() => startTrace(dir === d.key ? null : d.key)}>
            {d.name}
          </button>
        ))}
      </div>
      {(touchesMech || isCooling) && (
        <div className="rp-switch-row">
          <Switch checked={cross} onChange={() => useView.getState().setTraceCross(!cross)} label="공조 동력(전력)까지 넘어서 추적" />
        </div>
      )}
      {traced && traced.origin === id && <TraceSummary />}
    </Section>
  );
}

export function GroupsSection({ id }: { id: string }) {
  const groupId = useView((s) => s.groupId);
  const gs = groupsOf(id);
  if (gs.length === 0) return null;
  return (
    <Section id="groups" title="소속 묶음" count={gs.length} defaultOpen={false}>
      <div className="siblings">
        {gs.map((g) => (
          <button key={g.id} className={groupId === g.id ? 'on' : ''} title={g.desc} onClick={() => activateGroup(g.id)}>
            {g.name}
          </button>
        ))}
      </div>
    </Section>
  );
}

function TraceSummary() {
  const t = useView((s) => s.traced)!;
  return (
    <div className="trace-sum">
      {t.dir !== 'down' && <TraceList title="상류" ids={t.up} color={TRACE_COLOR.up} />}
      {t.dir !== 'up' && <TraceList title="하류" ids={t.down} color={TRACE_COLOR.down} />}
      <p className="hint">점선 테두리는 평상시 쓰지 않는 대기 경로(발전기, 예비선, 연계, 프리쿨링)입니다.</p>
    </div>
  );
}

function TraceList({ title, ids, color }: { title: string; ids: Map<string, boolean>; color: string }) {
  const all = [...ids.entries()];
  const racks = all.filter(([id]) => id.startsWith('rack:'));
  const items = all
    .filter(([id]) => !id.startsWith('rack:'))
    .sort((a, b) => FLOOR_BY_ID[nodeInfo(a[0])!.floor].index - FLOOR_BY_ID[nodeInfo(b[0])!.floor].index);
  const rooms = racks.reduce<Record<string, number>>((m, [id]) => {
    const r = RACK_BY_ID[id.slice(5)];
    m[r.serverRoom] = (m[r.serverRoom] ?? 0) + 1;
    return m;
  }, {});
  return (
    <>
      <h5 className="rp-trace-h">
        <span className="swatch" style={{ background: color }} />
        {title} <span className="num">{all.length}</span>
      </h5>
      {all.length === 0 && <p className="detail muted">없음</p>}
      <div className="trace-items">
        {items.map(([id, sb]) => (
          <span key={id} className={sb ? 'standby' : ''}>
            <NodeButton id={id} onClick={() => peek(id)} />
          </span>
        ))}
        {Object.entries(rooms).map(([room, n]) => (
          <span key={room} className="link-rack">
            서버실 {room} 랙 {n}대
          </span>
        ))}
      </div>
    </>
  );
}

// 샤프트를 지나는 연결 요약
export function ShaftLinks({ shaftId }: { shaftId: string }) {
  const conns = CONNECTIONS.filter((c) => c.via === shaftId && nodeInfo(c.from)?.floor !== nodeInfo(c.to)?.floor);
  if (conns.length === 0) return <p className="detail muted">이 샤프트를 지나는 연결이 없습니다.</p>;
  return (
    <div className="rp-flow-side">
      {conns.map((c) => (
        <div key={c.id} className={`rp-fnode static${c.standby ? ' dash' : ''}`} style={{ '--c': connColor(c) } as CSSProperties}>
          <span className="rp-fname">
            {nodeName(c.from)} <span className="fl">{nodeInfo(c.from)?.floor}</span> → {nodeName(c.to)} <span className="fl">{nodeInfo(c.to)?.floor}</span>
          </span>
          <span className="rp-fkind">{KIND_META[c.kind].name}</span>
        </div>
      ))}
    </div>
  );
}
