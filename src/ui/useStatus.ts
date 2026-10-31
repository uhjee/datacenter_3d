// 정보 카드 머리 영역에 쓰는 장비 운전 상태 · 지표 계산 공용 훅

import { useMemo } from 'react';
import { computeMetrics } from '../data/metrics';
import { SRC_META, type NodeState } from '../scenario/core';
import { snapshot } from '../scenario/outage';
import { adjustTherm } from '../scenario/cracFail';
import type { RoomLabel, RoomTherm } from '../data/thermal';
import { useView } from '../store/useView';
import type { Tone } from './kit';

// 평상시 상태: 정전 시나리오의 0초(정상 운전) 상태를 그대로 쓴다. 발전기 · 연계 차단기는 대기
const NORMAL = snapshot(0, { upsOut: { A: 0, B: 0 }, facilityKw: 0, baseInlet: { A: 0, B: 0 }, genFail: false });

const STATUS_NAME = { on: '운전', off: '정지', starting: '재기동 중', standby: '대기', fault: '고장', alarm: '경보' } as const;

export interface StatusView {
  label: string;
  tone: Tone;
  color?: string; // 시나리오 중 운전이면 전원 출처 색
  scen: boolean;
}

export function statusView(st: NodeState, scen: boolean): StatusView {
  const tone: Tone = st.status === 'on' ? 'ok' : st.status === 'starting' ? 'warn' : st.status === 'off' || st.status === 'fault' || st.status === 'alarm' ? 'crit' : 'muted';
  const label = scen && st.src !== 'none' ? `${STATUS_NAME[st.status]} · ${SRC_META[st.src].name}` : STATUS_NAME[st.status];
  return { label, tone, color: scen && st.status === 'on' ? SRC_META[st.src].color : undefined, scen };
}

// 시나리오 재생 중이면 그 시각의 상태, 아니면 평상시 상태. 전력 · 공조 연결이 없는 장비(방재 · 보안 · 센서)는 null
export function useNodeStatus(id: string): StatusView | null {
  const snap = useView((s) => s.scenSnap);
  const st = snap?.nodes[id] ?? NORMAL.nodes[id];
  if (!st) return null;
  return statusView(st, !!snap);
}

export function useMetrics() {
  const itLoad = useView((s) => s.itLoad);
  const outdoor = useView((s) => s.outdoorT);
  const cfg = useView((s) => s.airCfg);
  const therm = useView((s) => s.therm);
  return useMemo(() => computeMetrics(itLoad, outdoor, cfg, therm), [itLoad, outdoor, cfg, therm]);
}

// 서버실 온도. 항온항습기 고장 시나리오 중이면 그 시각(초 단위)의 상승분을 더한 값
export function useRoomTherm(label: RoomLabel): RoomTherm {
  const base = useView((s) => s.therm[label]);
  const crac = useView((s) => (s.scenario?.id === 'cracFail' ? s.scenario : null)?.params ?? null);
  const leak = useView((s) => (s.scenario?.id === 'leak' ? s.scenario : null)?.params ?? null);
  const series = useView((s) => (s.scenario?.id === 'cracFail' ? s.scenario.series : s.scenario?.id === 'leak' ? s.scenario.series.cool : null));
  const sec = useView((s) => (s.scenario?.id === 'cracFail' || s.scenario?.id === 'leak' ? Math.floor(s.scenario.t) : 0));
  return useMemo(() => {
    // 누수는 서버실 B 항온항습기 한 대가 밸브 차단으로 멈추는 것과 같다
    const p = crac ?? (leak ? { room: 'B' as const, unit: leak.unit, second: false, loadKw: leak.loadKw, unitKw: leak.unitKw, supply: leak.supply } : null);
    return p && series && p.room === label ? adjustTherm(base, p, series, sec) : base;
  }, [base, crac, leak, series, sec, label]);
}
