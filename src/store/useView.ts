import { create } from 'zustand';
import { EXPLODE_GAP, FLOOR_BY_ID, type FloorId } from '../data/building';
import type { LinkGroup } from '../data/connections';
import type { DiagramId } from '../diagram/model';
import type { Domain } from '../data/equipTypes';
import { traceFrom, traceNodes, type TraceDir, type TraceResult } from '../data/graph';
import { GROUP_BY_ID } from '../data/groups';
import { computeRoom, DEFAULT_AIR_BY_ROOM, type AirCfg, type RoomLabel, type RoomTherm } from '../data/thermal';
import { scenEnd, type Snapshot } from '../scenario/core';
import type { ScenarioParams } from '../scenario/outage';
import { defOf, type ScenarioRun, type ScenarioStart } from '../scenario/registry';
import type { UpsFailParams } from '../scenario/upsFail';
import type { CracFailParams } from '../scenario/cracFail';
import type { LeakParams } from '../scenario/leak';
import type { BatFireParams } from '../scenario/batFire';
import type { SrFireParams } from '../scenario/srFire';

export type LayerKey = Domain | 'labels' | 'walls' | 'shafts' | 'links' | 'cages';
export type ViewMode = 'stack' | 'explode';

export const LAYER_META: { key: LayerKey; name: string }[] = [
  { key: 'power', name: '전력' },
  { key: 'cooling', name: '공조' },
  { key: 'it', name: 'IT 랙' },
  { key: 'cages', name: '케이지' },
  { key: 'fire', name: '방재' },
  { key: 'security', name: '보안' },
  { key: 'links', name: '연결선' },
  { key: 'shafts', name: '샤프트' },
  { key: 'walls', name: '벽체' },
  { key: 'labels', name: '실 이름' },
];

export interface CameraGoal {
  position: [number, number, number];
  target: [number, number, number];
  key: number;
}

interface ViewState {
  layers: Record<LayerKey, boolean>;
  toggleLayer: (k: LayerKey) => void;

  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  floorFocus: FloorId | null; // null = 전체
  setFloorFocus: (f: FloorId | null) => void;

  // 선택 id: 장비 id 그대로, 랙은 'rack:<id>', 샤프트는 'shaft:<id>'
  selectedId: string | null;
  hoveredId: string | null;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;

  cameraGoal: CameraGoal | null;
  // 3D 위 확대 · 축소 버튼 (key가 바뀔 때마다 한 번 실행)
  zoomCmd: { dir: 1 | -1; key: number } | null;
  zoomStep: (dir: 1 | -1) => void;
  flyTo: (position: [number, number, number], target: [number, number, number]) => void;
  // 더블클릭으로 옮긴 회전 중심 (잠깐 표시)
  orbitPing: { pos: [number, number, number]; key: number } | null;
  pingOrbit: (pos: [number, number, number]) => void;

  // 연결선 표시 묶음
  linkFilter: Record<LinkGroup, boolean>;
  toggleLink: (k: LinkGroup) => void;

  // 상류 · 하류 추적 (선택한 대상 기준)
  traceDir: TraceDir | null;
  traceCross: boolean; // 공조 동력까지 넘어서 추적
  traced: TraceResult | null;
  setTrace: (dir: TraceDir | null) => void;
  setTraceCross: (v: boolean) => void;

  // 계통 묶음
  groupId: string | null;
  setGroup: (id: string | null) => void;

  // 지금 강조 중인 노드 · 연결 (추적 또는 묶음). traced · groupId가 바뀔 때 자동 계산
  highlight: Highlight | null;

  // 기류 · 온도 (공조 상세)
  airOn: boolean;
  airRoom: RoomLabel;
  airCfg: Record<RoomLabel, AirCfg>;
  therm: Record<RoomLabel, RoomTherm>; // airCfg가 바뀔 때 다시 계산
  setAirOn: (v: boolean) => void;
  setAirRoom: (r: RoomLabel) => void;
  setAirCfg: (r: RoomLabel, patch: Partial<AirCfg>) => void;

  // 지표 (운전 조건)
  itLoad: number; // IT 부하율 (1 = 기준)
  outdoorT: number; // 외기 온도 °C
  setItLoad: (v: number) => void;
  setOutdoorT: (v: number) => void;

  // 랙 색칠: 없음 / U 사용률 / 전력 사용률 / 흡기 온도
  rackColor: RackColorMode;
  setRackColor: (m: RackColorMode) => void;

  // 가이드 투어 (null = 끔)
  tourStep: number | null;
  setTourStep: (n: number | null) => void;

  // 시나리오 (한전 완전 정전 · UPS 고장). scenSnap은 장비 · 연결 상태가 바뀔 때만 새로 만든다
  scenario: (ScenarioRun & { t: number; playing: boolean; speed: number }) | null;
  scenSnap: Snapshot | null;
  startScenario: (start: ScenarioStart) => void;
  stopScenario: () => void;
  setScenT: (t: number) => void;
  setScenPlaying: (v: boolean) => void;
  setScenSpeed: (v: number) => void;
  setScenParams: (patch: Partial<ScenarioParams> | Partial<UpsFailParams> | Partial<CracFailParams> | Partial<LeakParams> | Partial<BatFireParams> | Partial<SrFireParams>) => void;

  // 오른쪽 패널 탭
  rightTab: RightTab;
  setRightTab: (t: RightTab) => void;

  // 하단 흐름도 패널
  diagramMode: 'off' | 'half' | 'full';
  diagramTab: DiagramId;
  setDiagramMode: (m: 'off' | 'half' | 'full') => void;
  setDiagramTab: (t: DiagramId) => void;
}

export type RackColorMode = 'none' | 'u' | 'power' | 'temp';
export type RightTab = 'info' | 'metrics' | 'scenario';

export interface Highlight {
  kind: 'trace' | 'group';
  nodes: Set<string>;
  edges: Set<string>;
}

const computeTrace = (id: string | null, dir: TraceDir | null, cross: boolean) =>
  id && dir && !id.startsWith('shaft:') && !id.startsWith('customer:') ? traceFrom(id, dir, cross) : null;

export const useView = create<ViewState>((set, get) => ({
  layers: {
    power: true,
    cooling: true,
    it: true,
    fire: true,
    security: true,
    links: true,
    cages: true,
    shafts: false, // 처음에는 장비 위주로 보이게 샤프트 · 벽체 · 실 이름은 꺼 둔다
    walls: false,
    labels: false,
  },
  toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),

  viewMode: 'explode',
  setViewMode: (m) => set({ viewMode: m }),
  floorFocus: null,
  setFloorFocus: (f) => set({ floorFocus: f }),

  selectedId: null,
  hoveredId: null,
  select: (id) => set((s) => ({ selectedId: id, traceDir: id ? s.traceDir : null, traced: computeTrace(id, id ? s.traceDir : null, s.traceCross) })),
  hover: (id) => set({ hoveredId: id }),

  cameraGoal: null,
  zoomCmd: null,
  zoomStep: (dir) => set((s) => ({ zoomCmd: { dir, key: (s.zoomCmd?.key ?? 0) + 1 } })),
  flyTo: (position, target) => set((s) => ({ cameraGoal: { position, target, key: (s.cameraGoal?.key ?? 0) + 1 } })),
  orbitPing: null,
  pingOrbit: (pos) => set((s) => ({ orbitPing: { pos, key: (s.orbitPing?.key ?? 0) + 1 } })),

  linkFilter: { power: true, rack: true, mech: false, refrig: true, chw: true, cw: true },
  toggleLink: (k) => set((s) => ({ linkFilter: { ...s.linkFilter, [k]: !s.linkFilter[k] } })),

  traceDir: null,
  traceCross: false,
  traced: null,
  setTrace: (dir) =>
    set({ traceDir: dir, traced: computeTrace(get().selectedId, dir, get().traceCross), ...(dir ? { groupId: null } : {}) }),
  setTraceCross: (v) => set({ traceCross: v, traced: computeTrace(get().selectedId, get().traceDir, v) }),

  groupId: null,
  setGroup: (id) => set(id ? { groupId: id, traceDir: null, traced: null } : { groupId: null }),
  highlight: null,

  airOn: false,
  airRoom: 'A',
  airCfg: DEFAULT_AIR_BY_ROOM,
  therm: { A: computeRoom('A', DEFAULT_AIR_BY_ROOM.A), B: computeRoom('B', DEFAULT_AIR_BY_ROOM.B) },
  setAirOn: (v) => set({ airOn: v }),
  setAirRoom: (r) => set({ airRoom: r }),
  setAirCfg: (r, patch) =>
    set((s) => {
      const cfg = { ...s.airCfg[r], ...patch };
      return { airCfg: { ...s.airCfg, [r]: cfg }, therm: { ...s.therm, [r]: computeRoom(r, cfg, s.itLoad) } };
    }),

  itLoad: 1,
  outdoorT: 15,
  setItLoad: (v) => set((s) => ({ itLoad: v, therm: { A: computeRoom('A', s.airCfg.A, v), B: computeRoom('B', s.airCfg.B, v) } })),
  setOutdoorT: (v) => set({ outdoorT: v }),

  rackColor: 'none',
  setRackColor: (m) => set({ rackColor: m }),

  tourStep: null,
  setTourStep: (n) => set({ tourStep: n }),

  scenario: null,
  scenSnap: null,
  startScenario: ({ id, params }) => {
    const def = defOf(id);
    const run = { id, params, series: def.prepare(params) } as ScenarioRun;
    set({ scenario: { ...run, t: 0, playing: true, speed: 2 }, scenSnap: def.snapshot(0, params) });
  },
  stopScenario: () => set({ scenario: null, scenSnap: null }),
  setScenT: (t) =>
    set((s) => {
      if (!s.scenario) return {};
      const def = defOf(s.scenario.id);
      const end = scenEnd(def, s.scenario.params);
      const tt = Math.max(0, Math.min(end, t));
      const snap = def.snapshot(tt, s.scenario.params);
      const playing = tt >= end ? false : s.scenario.playing;
      return { scenario: { ...s.scenario, t: tt, playing }, ...(snap.sig !== s.scenSnap?.sig ? { scenSnap: snap } : {}) };
    }),
  setScenPlaying: (v) =>
    set((s) => (s.scenario ? { scenario: { ...s.scenario, playing: v, t: v && s.scenario.t >= scenEnd(defOf(s.scenario.id), s.scenario.params) ? 0 : s.scenario.t } } : {})),
  setScenSpeed: (v) => set((s) => (s.scenario ? { scenario: { ...s.scenario, speed: v } } : {})),
  setScenParams: (patch) =>
    set((s) => {
      if (!s.scenario) return {};
      const def = defOf(s.scenario.id);
      const params = { ...s.scenario.params, ...patch };
      const t = Math.min(s.scenario.t, scenEnd(def, params));
      return { scenario: { ...s.scenario, params, t, series: def.prepare(params) } as typeof s.scenario, scenSnap: def.snapshot(t, params) };
    }),

  rightTab: 'info',
  setRightTab: (t) => set({ rightTab: t }),

  diagramMode: 'half',
  diagramTab: 'power',
  setDiagramMode: (m) => set({ diagramMode: m }),
  setDiagramTab: (t) => set({ diagramTab: t }),
}));

useView.subscribe((s, prev) => {
  if (s.traced === prev.traced && s.groupId === prev.groupId) return;
  const g = s.groupId ? GROUP_BY_ID[s.groupId] : null;
  const highlight: Highlight | null = s.traced
    ? { kind: 'trace', nodes: traceNodes(s.traced), edges: s.traced.edges }
    : g
      ? { kind: 'group', nodes: g.nodes, edges: g.edges }
      : null;
  useView.setState({ highlight });
});

// 층의 화면상 바닥 높이 (층 벌려 보기 반영)
export function floorWorldY(floor: FloorId, mode: ViewMode) {
  const f = FLOOR_BY_ID[floor];
  return f.y + (mode === 'explode' ? f.index * EXPLODE_GAP : 0);
}

// 층을 고르면 그 층만 보인다 (위 · 아래층 모두 숨김)
export function isFloorVisible(floor: FloorId, focus: FloorId | null) {
  return !focus || floor === focus;
}

export type TraceMark = 'up' | 'down';

// 추적 결과에서 이 노드의 위치: 상류(받는 쪽 근원) / 하류
export function traceMarkOf(t: TraceResult | null, id: string): TraceMark | null {
  if (!t) return null;
  if (t.up.has(id)) return 'up';
  if (t.down.has(id)) return 'down';
  return null;
}
