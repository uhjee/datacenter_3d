// 시나리오 공통: 장비 · 연결 상태 모양, 전원 출처 색, 단계 · 사건 기록 형식

export type Src = 'utility' | 'gen' | 'battery' | 'bypass' | 'none';
export type NodeStatus = 'on' | 'off' | 'starting' | 'standby' | 'fault' | 'alarm';
export type EdgeState = Src | 'flow' | 'idle';

export interface NodeState {
  src: Src;
  status: NodeStatus;
}

export interface Snapshot {
  phase: number;
  nodes: Record<string, NodeState>;
  edges: Record<string, EdgeState>;
  sig: string; // 상태가 바뀌었는지 비교용
}

export interface Phase {
  t: number;
  title: string;
  body: string;
}

export interface LogItem {
  t: number;
  text: string;
}

// 타임라인 바탕에 칠하는 구간과 그 범례
export interface Segment {
  from: number;
  to: number;
  color: string;
}

export type ScenarioId = 'outage' | 'upsFail' | 'cracFail' | 'lineOut' | 'leak' | 'batFire' | 'srFire';

// 시나리오 하나의 정의. P = 조건(사용자가 바꾸는 값 포함), S = 미리 계산한 연속값
export interface ScenarioDef<P, S> {
  id: ScenarioId;
  name: string;
  end: number;
  endOf?: (p: P) => number; // 조건에 따라 길이가 달라지면
  phases: (p: P) => Phase[];
  snapshot: (t: number, p: P) => Snapshot;
  prepare: (p: P) => S;
  eventLog: (p: P) => LogItem[];
  segments: (p: P) => Segment[];
  legend: { color: string; name: string }[];
  note: string;
}

export const SRC_META: Record<Src, { name: string; color: string }> = {
  utility: { name: '상용(한전)', color: '#74c0fc' },
  gen: { name: '발전기', color: '#a9e34b' },
  battery: { name: '배터리', color: '#ffe066' },
  bypass: { name: '상용 직결(UPS 보호 없음)', color: '#f783ac' },
  none: { name: '정전', color: '#868e96' },
};

// 재기동 중 · 고장 표시 색 (3D 테두리 · 흐름도 · 패널 공용)
export const STARTING_COLOR = '#ff922b';
export const FAULT_COLOR = '#ff6b6b';

// 시나리오 중 장비에 둘러 줄 테두리 색. 평소(상용 운전)는 없음
export function frameColor(st: NodeState | undefined) {
  if (!st) return null;
  if (st.status === 'fault' || st.status === 'alarm') return FAULT_COLOR;
  if (st.status === 'starting') return STARTING_COLOR;
  if (st.src === 'battery' || st.src === 'gen' || st.src === 'bypass') return SRC_META[st.src].color;
  return null;
}

// 연결 상태 → 선 색 (없으면 원래 색)
export function edgeColor(st: EdgeState) {
  if (st === 'gen' || st === 'battery' || st === 'bypass') return SRC_META[st].color;
  if (st === 'none') return '#495057';
  return null;
}

export const isLive = (st: EdgeState) => st === 'utility' || st === 'gen' || st === 'battery' || st === 'bypass' || st === 'flow';

export function phaseAt(phases: Phase[], t: number) {
  let k = 0;
  phases.forEach((p, i) => {
    if (t >= p.t) k = i;
  });
  return k;
}

export const fmtT = (t: number) => {
  const s = Math.max(0, Math.floor(t));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export const sigOf = (phase: number, nodes: Record<string, NodeState>) =>
  `${phase}|${Object.values(nodes)
    .map((n) => `${n.src}.${n.status}`)
    .join(',')}`;

// 시나리오 길이 (조건에 따라 달라지는 시나리오도 있다)
export const scenEnd = <P, S>(def: ScenarioDef<P, S>, p: P) => (def.endOf ? def.endOf(p) : def.end);
