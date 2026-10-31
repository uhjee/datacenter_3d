// 추적 중일 때 3D 화면 위에 띄우는 요약 띠

import type { CSSProperties } from 'react';
import { Layers, Pause, Play, Route, Siren, X } from 'lucide-react';
import { nodeName } from '../data/graph';
import { TRACE_COLOR } from '../scene/common';
import { GROUP_BY_ID } from '../data/groups';
import { fmtT } from '../scenario/core';
import { defOf } from '../scenario/registry';
import { activateGroup, startTrace } from '../scene/focus';
import { useView } from '../store/useView';
import { IconButton } from './kit';

const DIR_NAME = { up: '상류 추적', down: '하류 추적', both: '전체 경로' } as const;

export function TraceBanner() {
  const t = useView((s) => s.traced);
  const groupId = useView((s) => s.groupId);
  const sc = useView((s) => s.scenario);
  const phase = useView((s) => s.scenSnap?.phase ?? 0);
  if (sc) {
    return (
      <div className="trace-banner" style={{ '--c': 'var(--crit)' } as CSSProperties}>
        <Siren size={15} className="tb-ico" />
        <b>{defOf(sc.id).name}</b>
        <span className="num muted">T+{fmtT(sc.t)}</span>
        <span>{defOf(sc.id).phases(sc.params)[phase]?.title}</span>
        <IconButton icon={sc.playing ? Pause : Play} label={sc.playing ? '일시정지' : '재생'} onClick={() => useView.getState().setScenPlaying(!sc.playing)} />
      </div>
    );
  }
  if (!t && groupId) {
    const g = GROUP_BY_ID[groupId];
    return (
      <div className="trace-banner" style={{ '--c': 'var(--info)' } as CSSProperties}>
        <Layers size={15} className="tb-ico" />
        <b>{g.name}</b>
        <span className="num muted">
          장비 {[...g.nodes].filter((n) => !n.startsWith('rack:')).length} · 연결 {g.edges.size}
        </span>
        <IconButton icon={X} label="묶음 해제" onClick={() => activateGroup(null)} />
      </div>
    );
  }
  if (!t) return null;
  return (
    <div className="trace-banner" style={{ '--c': TRACE_COLOR[t.dir === 'down' ? 'down' : 'up'] } as CSSProperties}>
      <Route size={15} className="tb-ico" />
      <b>{nodeName(t.origin)}</b>
      <span className="muted">{DIR_NAME[t.dir]}</span>
      {t.dir !== 'down' && (
        <span className="num" style={{ color: TRACE_COLOR.up }}>
          상류 {t.up.size}
        </span>
      )}
      {t.dir !== 'up' && (
        <span className="num" style={{ color: TRACE_COLOR.down }}>
          하류 {t.down.size}
        </span>
      )}
      <IconButton icon={X} label="추적 끄기" onClick={() => startTrace(null)} />
    </div>
  );
}
