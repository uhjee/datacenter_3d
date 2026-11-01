// 활성 상태 줄 (3D 아래 가운데): 지금 화면에 걸려 있는 보기 · 강조를 칩으로 모아 보여 주고, 칩마다 ✕로 바로 끈다.
// 시나리오 재생 · 온도 보기 · 추적 · 계통 묶음 · 랙 색칠이 동시에 켜져 있어도 한 줄에서 확인할 수 있다

import type { CSSProperties, ReactNode } from 'react';
import { Layers, Paintbrush, Pause, Play, Route, Siren, Thermometer, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { nodeName } from '../data/graph';
import { GROUP_BY_ID } from '../data/groups';
import { AIR_LAYOUT } from '../data/thermal';
import { TRACE_COLOR } from '../scene/common';
import { RACK_COLOR_META } from '../scene/rackColor';
import { fmtT } from '../scenario/core';
import { defOf } from '../scenario/registry';
import { stopScenario } from '../scenario/ScenarioPanel';
import { activateGroup, exitThermal, startTrace } from '../scene/focus';
import { useView } from '../store/useView';
import { IconButton } from './kit';

const DIR_NAME = { up: '상류 추적', down: '하류 추적', both: '전체 경로' } as const;

function Chip({ icon: Icon, color, children, off, offLabel, extra }: { icon: LucideIcon; color: string; children: ReactNode; off: () => void; offLabel: string; extra?: ReactNode }) {
  return (
    <div className="act-chip" style={{ '--c': color } as CSSProperties}>
      <Icon size={14} className="tb-ico" />
      {children}
      {extra}
      <IconButton icon={X} label={offLabel} onClick={off} />
    </div>
  );
}

export function TraceBanner() {
  const t = useView((s) => s.traced);
  const groupId = useView((s) => s.groupId);
  const sc = useView((s) => s.scenario);
  const phase = useView((s) => s.scenSnap?.phase ?? 0);
  const thermal = useView((s) => s.airOn || s.heatOn);
  const heatOn = useView((s) => s.heatOn);
  const airOn = useView((s) => s.airOn);
  const room = useView((s) => s.airRoom);
  const rackColor = useView((s) => s.rackColor);
  const chips: ReactNode[] = [];

  if (sc) {
    chips.push(
      <Chip
        key="scen"
        icon={Siren}
        color="var(--crit)"
        off={stopScenario}
        offLabel="시나리오 끝내기"
        extra={<IconButton icon={sc.playing ? Pause : Play} label={sc.playing ? '일시정지' : '재생'} onClick={() => useView.getState().setScenPlaying(!sc.playing)} />}
      >
        <b>{defOf(sc.id).name}</b>
        <span className="num muted">T+{fmtT(sc.t)}</span>
        <span className="act-sub">{defOf(sc.id).phases(sc.params)[phase]?.title}</span>
      </Chip>,
    );
  }
  if (thermal) {
    const what = [heatOn && '히트맵', airOn && '기류 입자'].filter(Boolean).join(' · ');
    chips.push(
      <Chip key="thermal" icon={Thermometer} color="#ff922b" off={() => exitThermal()} offLabel="온도 보기 끄기">
        <b>온도</b>
        <span className="muted">
          서버실 {room} · {AIR_LAYOUT[room].floor} · {what}
        </span>
      </Chip>,
    );
  }
  if (t) {
    chips.push(
      <Chip key="trace" icon={Route} color={TRACE_COLOR[t.dir === 'down' ? 'down' : 'up']} off={() => startTrace(null)} offLabel="추적 끄기">
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
      </Chip>,
    );
  }
  if (groupId) {
    const g = GROUP_BY_ID[groupId];
    chips.push(
      <Chip key="group" icon={Layers} color="var(--info)" off={() => activateGroup(null)} offLabel="묶음 해제">
        <b>{g.name}</b>
        <span className="num muted">
          장비 {[...g.nodes].filter((n) => !n.startsWith('rack:')).length} · 연결 {g.edges.size}
        </span>
      </Chip>,
    );
  }
  // 온도 보기가 켠 랙 온도 색은 온도 칩에 포함된 것으로 보고 따로 띄우지 않는다
  if (rackColor !== 'none' && !(thermal && rackColor === 'temp')) {
    chips.push(
      <Chip key="color" icon={Paintbrush} color="var(--ink-2)" off={() => useView.getState().setRackColor('none')} offLabel="랙 색칠 끄기">
        <span className="muted">랙 색칠</span>
        <b>{RACK_COLOR_META[rackColor].name}</b>
      </Chip>,
    );
  }

  if (chips.length === 0) return null;
  return (
    <div className="act-bar" role="status" aria-label="켜져 있는 보기 · 강조">
      {chips}
    </div>
  );
}
