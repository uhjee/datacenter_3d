// 정보 카드 머리 영역에 쓰는 장비 운전 상태 · 지표 계산 공용 훅

import { useMemo } from 'react';
import { computeMetrics } from '../data/metrics';
import { SRC_META, type NodeState } from '../scenario/core';
import { snapshot } from '../scenario/outage';
import { adjustTherm } from '../scenario/cracFail';
import type { AirCfg, RoomLabel, RoomTherm } from '../data/thermal';
import { computeHeatField, type HeatField } from '../data/heatField';
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

const thermCache = new Map<RoomLabel, { base: RoomTherm; p: unknown; series: unknown; sec: number; th: RoomTherm }>();

// 서버실 온도. 항온항습기 고장 시나리오 중이면 그 시각(초 단위)의 상승분을 더한 값
export function useRoomTherm(label: RoomLabel): RoomTherm {
  const base = useView((s) => s.therm[label]);
  const crac = useView((s) => (s.scenario?.id === 'cracFail' ? s.scenario : null)?.params ?? null);
  const leak = useView((s) => (s.scenario?.id === 'leak' ? s.scenario : null)?.params ?? null);
  const series = useView((s) => (s.scenario?.id === 'cracFail' ? s.scenario.series : s.scenario?.id === 'leak' ? s.scenario.series.cool : null));
  const sec = useView((s) => {
    const sc = s.scenario;
    if (sc?.id !== 'cracFail' && sc?.id !== 'leak') return 0;
    // 재생 중에는 실제 시간 1초에 약 4번만 갱신 (20배속이면 시뮬레이션 5초 단위).
    // 히트맵 · 2D 상면도를 매 시뮬레이션 초마다 다시 계산하면 빠른 재생에서 프레임이 밀린다. 멈춤 · 시점 이동은 1초 단위 그대로
    const step = sc.playing ? Math.max(1, Math.floor(sc.speed / 4)) : 1;
    return Math.floor(sc.t / step) * step;
  });
  return useMemo(() => {
    // 누수는 서버실 B 항온항습기 한 대가 밸브 차단으로 멈추는 것과 같다
    const p = crac ?? (leak ? { room: 'B' as const, unit: leak.unit, second: false, loadKw: leak.loadKw, unitKw: leak.unitKw, supply: leak.supply } : null);
    if (!(p && series && p.room === label)) return base;
    // 같은 조건이면 모든 화면이 같은 결과(같은 객체)를 쓴다 → 히트맵 분포 캐시가 맞아 한 번만 계산
    const c = thermCache.get(label);
    if (c && c.base === base && c.p === (crac ?? leak) && c.series === series && c.sec === sec) return c.th;
    const th = adjustTherm(base, p, series, sec);
    thermCache.set(label, { base, p: crac ?? leak, series, sec, th });
    return th;
  }, [base, crac, leak, series, sec, label]);
}

// 서버실 온도 분포 (3D 히트맵 · 2D 상면도 · 히트맵 카드 공용). 꺼져 있으면 계산하지 않는다.
// 세 곳이 같은 조건으로 부르므로 서버실마다 마지막 결과를 재사용한다
const fieldCache = new Map<RoomLabel, { cfg: AirCfg; th: RoomTherm; h: number; f: HeatField }>();
export function useHeatField(label: RoomLabel, on: boolean): HeatField | null {
  const th = useRoomTherm(label);
  const cfg = useView((s) => s.airCfg[label]);
  const h = useView((s) => s.heatHeight);
  return useMemo(() => {
    if (!on) return null;
    const c = fieldCache.get(label);
    if (c && c.cfg === cfg && c.th === th && c.h === h) return c.f;
    const f = computeHeatField(label, cfg, th, h);
    fieldCache.set(label, { cfg, th, h, f });
    return f;
  }, [on, label, cfg, th, h]);
}
