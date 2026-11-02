// 카메라 이동 대상 계산

import { FLOOR_BY_ID, FLOORS, ROOM_BY_ID, SHAFTS, type FloorId } from '../data/building';
import { nodeInfo, traceNodes, type TraceDir } from '../data/graph';
import { GROUP_BY_ID } from '../data/groups';
import { AIR_LAYOUT, type RoomLabel } from '../data/thermal';
import { floorWorldY, useView, type PanelTab } from '../store/useView';
import { htmlPortal } from './htmlPortal';

type V3 = [number, number, number];

export const CAMERA_FOV = 42;

// 반지름 r인 구가 지금 3D 영역(가로·세로 중 좁은 쪽)에 꽉 차게 보이는 카메라 거리.
// 흐름도 패널을 열면 3D 영역이 낮아지므로 매번 실제 크기로 계산한다.
function fitDistance(r: number) {
  const el = htmlPortal.current;
  const w = el?.clientWidth || 1000;
  const h = el?.clientHeight || 700;
  const v = (CAMERA_FOV * Math.PI) / 360;
  const hz = Math.atan(Math.tan(v) * (w / h));
  return r / Math.sin(Math.min(v, hz));
}

const along = (target: V3, dir: V3, dist: number): V3 => {
  const len = Math.hypot(...dir);
  return [target[0] + (dir[0] / len) * dist, target[1] + (dir[1] / len) * dist, target[2] + (dir[2] / len) * dist];
};

export function overviewPose(mode = useView.getState().viewMode): { position: V3; target: V3 } {
  const top = floorWorldY('PH', mode) + 4;
  const bottom = floorWorldY('B1', mode);
  const mid = (top + bottom) / 2;
  const target: V3 = [0, mid, 0];
  // 건물 상자(40 × 높이 × 24)를 감싸는 구 기준. 층 이름표까지 들어가도록 0.95배
  const r = Math.hypot(40, top - bottom, 24) / 2;
  return { position: along(target, [-1.15, 0.55, 1.4], fitDistance(r) * 0.95), target };
}

export function focusOverview() {
  const s = useView.getState();
  s.setFloorFocus(null);
  const p = overviewPose(s.viewMode);
  s.flyTo(p.position, p.target);
}

export function focusFloor(id: FloorId) {
  const s = useView.getState();
  s.setFloorFocus(id);
  const y = floorWorldY(id, s.viewMode) + FLOOR_BY_ID[id].height * 0.3;
  const target: V3 = [0, y, 0];
  s.flyTo(along(target, [-30, 40, 50], Math.max(40, fitDistance(Math.hypot(40, 24) / 2) * 0.95)), target);
}

// 선택 대상(장비·랙·샤프트)의 화면상 위치
export function locate(id: string): { floor: FloorId; center: V3; radius: number } | null {
  const mode = useView.getState().viewMode;
  if (id.startsWith('shaft:')) {
    const s = SHAFTS.find((k) => `shaft:${k.id}` === id);
    if (!s) return null;
    const bottom = floorWorldY(s.floors[0], mode);
    const top = floorWorldY(s.floors[s.floors.length - 1], mode) + 3;
    return {
      floor: s.floors[0],
      center: [(s.x[0] + s.x[1]) / 2, (bottom + top) / 2, (s.z[0] + s.z[1]) / 2],
      radius: (top - bottom) / 2,
    };
  }
  const n = nodeInfo(id);
  if (!n) return null;
  const y = floorWorldY(n.floor, mode) + n.pos[1] + n.size[1] / 2;
  return { floor: n.floor, center: [n.pos[0], y, n.pos[2]], radius: n.isRack ? 1.5 : Math.min(Math.max(...n.size), 8) };
}

// 목록에서 고를 때: 해당 층을 보이게 하고 카메라를 가까이 이동
export function focusItem(id: string) {
  const s = useView.getState();
  const loc = locate(id);
  s.select(id);
  // 추적 중이면 새 장비 기준 추적 경로 전체가 보이게
  if (s.traceDir && useView.getState().traced) return startTrace(s.traceDir);
  if (!loc) return;
  if (!id.startsWith('shaft:') && s.floorFocus !== loc.floor) {
    // 위층에 가려지지 않도록 그 층까지만 보이게
    const topIdx = FLOORS[FLOORS.length - 1].index;
    if (FLOOR_BY_ID[loc.floor].index < topIdx) s.setFloorFocus(loc.floor);
    else s.setFloorFocus(null);
  }
  const dist = Math.max(9, loc.radius * 3.6);
  const [x, y, z] = loc.center;
  s.flyTo([x - dist * 0.55, y + dist * 0.75, z + dist * 0.95], [x, y, z]);
}

// 라벨을 띄울 위치(대상 위쪽)와 이름
export function labelAnchor(id: string): { pos: V3; name: string } | null {
  const mode = useView.getState().viewMode;
  if (id.startsWith('shaft:')) {
    const s = SHAFTS.find((k) => `shaft:${k.id}` === id);
    if (!s) return null;
    return { pos: [(s.x[0] + s.x[1]) / 2, floorWorldY(s.floors[s.floors.length - 1], mode) + 1.8, (s.z[0] + s.z[1]) / 2], name: s.name };
  }
  const n = nodeInfo(id);
  if (!n) return null;
  return { pos: [n.pos[0], floorWorldY(n.floor, mode) + n.pos[1] + n.size[1] + 0.35, n.pos[2]], name: n.name };
}

// 선택은 그대로 두고 카메라만 대상 가까이로
export function peek(id: string) {
  const loc = locate(id);
  if (!loc) return;
  const dist = Math.max(9, loc.radius * 3.6);
  const [x, y, z] = loc.center;
  useView.getState().flyTo([x - dist * 0.55, y + dist * 0.75, z + dist * 0.95], [x, y, z]);
}

// 추적 시작: 경로가 걸친 가장 높은 층까지만 보이게 하고, 경로 전체가 화면에 들어오도록 카메라 이동
export function startTrace(dir: TraceDir | null) {
  const s = useView.getState();
  s.setTrace(dir);
  const t = useView.getState().traced;
  if (t) frameNodes([...traceNodes(t)]);
}

// 계통 묶음 켜기 · 끄기. 층별 묶음은 그 층으로, 나머지는 묶음 전체가 보이게
export function activateGroup(id: string | null) {
  const s = useView.getState();
  if (!id || s.groupId === id) {
    s.setGroup(null);
    return;
  }
  const g = GROUP_BY_ID[id];
  s.select(null); // 오른쪽 패널에 묶음 카드가 보이도록
  s.setGroup(id);
  if (s.diagramMode !== 'off') s.setDiagramTab(g.tab);
  if (g.floor) focusFloor(g.floor);
  else frameNodes([...g.nodes]);
}

// 노드 묶음이 한 화면에 들어오도록: 노드가 있는 층만 보이게 하고 카메라 이동
//   한 층이면 그 층, 모든 층이면 전체, 그 사이면 걸친 층만 (여러 층 보기)
function frameNodes(ids: string[]) {
  const s = useView.getState();
  const mode = s.viewMode;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const floors = new Set<FloorId>();
  for (const id of ids) {
    const n = nodeInfo(id);
    if (!n) continue;
    floors.add(n.floor);
    const by = floorWorldY(n.floor, mode) + n.pos[1];
    const lo = [n.pos[0] - n.size[0] / 2, by, n.pos[2] - n.size[2] / 2];
    const hi = [n.pos[0] + n.size[0] / 2, by + n.size[1], n.pos[2] + n.size[2] / 2];
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], lo[k]);
      max[k] = Math.max(max[k], hi[k]);
    }
  }
  const shown = FLOORS.filter((f) => floors.has(f.id)).map((f) => f.id);
  if (shown.length === 1) s.setFloorFocus(shown[0]);
  else if (shown.length === FLOORS.length || shown.length === 0) s.setFloorFocus(null);
  else s.setFloorSet(shown);
  const c: [number, number, number] = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const r = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2;
  s.flyTo(along(c, [-0.5, 0.62, 0.85], Math.max(14, fitDistance(r) * 1.15)), c);
}

// 온도 보기(기류 · 히트맵): 둘 중 하나라도 켜면 서버실 시점으로 가고, 하단 패널은 2D 상면도 탭으로 연다.
// 둘 다 끄면 하단 패널 · 랙 색을 켜기 전으로 되돌린다.
export const thermalOn = (s = useView.getState()) => s.airOn || s.heatOn;
let panelBefore: { mode: 'off' | 'half' | 'full'; tab: PanelTab } = { mode: 'half', tab: 'power' };
let tempColorByAir = false; // 온도 보기를 켜며 랙 온도 색을 켰는지 (끌 때 되돌림)

function beginThermal() {
  const s = useView.getState();
  panelBefore = { mode: s.diagramMode, tab: s.diagramTab === 'plan' ? 'power' : s.diagramTab };
  s.select(null); // 다른 층 장비 이름표가 온도 화면에 떠 있지 않도록
  s.setGroup(null);
  tempColorByAir = s.rackColor === 'none';
  if (tempColorByAir) s.setRackColor('temp');
  s.setDiagramMode(s.diagramMode === 'full' ? 'full' : 'half');
  s.setDiagramTab('plan');
}

function endThermal(fly: boolean) {
  const s = useView.getState();
  s.setDiagramMode(panelBefore.mode);
  s.setDiagramTab(panelBefore.tab);
  if (tempColorByAir && s.rackColor === 'temp') s.setRackColor('none');
  // 서버실 안 근접 시점에서 그 층 전체 보기로. 패널 크기가 바뀐 뒤 계산
  const floor = AIR_LAYOUT[s.airRoom].floor;
  if (fly) requestAnimationFrame(() => focusFloor(floor));
}

// 온도 보기 시점: 위에서(top) · 통로 단면(aisle). 서버실을 바꾸거나 화면 맞춤을 해도 고른 시점을 유지한다
export type ThermalCam = 'top' | 'aisle';
let thermalCam: ThermalCam = 'top';
export const thermalCamOf = () => thermalCam;

// 서버실을 열 방향(동서) 끝에서 바라봐 냉복도 · 열복도 단면이 보이게
export function viewRoom(room: RoomLabel) {
  thermalCam = 'aisle';
  const s = useView.getState();
  s.setAirRoom(room);
  const L = AIR_LAYOUT[room];
  s.setFloorFocus(L.floor);
  const y = floorWorldY(L.floor, s.viewMode);
  const fromEast = L.units[0].dir === 1;
  const cx = fromEast ? L.x1 + 13 : L.x0 - 13;
  s.flyTo([cx, y + 9, L.cz + 11], [L.rcx + (fromEast ? -3 : 3), y + 1.2, L.cz]);
}

// 온도 카드 · 층 이동의 서버실 전환: 켜 둔 표시(히트맵 · 에어 플로우)와 시점을 그대로 두고 서버실만 바꾼다
export function switchRoom(room: RoomLabel, force = false) {
  const s = useView.getState();
  if (!force && s.airRoom === room) return;
  if (thermalCam === 'top') heatView(room);
  else viewRoom(room);
}

// 켜는 순서: 표시를 먼저 켠 뒤 beginThermal (랙 색을 '온도'로 바꾸는 것이 온도 보기 중에 일어나야
// 설정 저장이 그것을 사용자 선택으로 오해하지 않는다)
export function enterAir(room: RoomLabel) {
  const was = thermalOn();
  useView.getState().setAirOn(true);
  if (!was) beginThermal();
  viewRoom(room);
}

// 온도 보기 켜기 (상단 [온도]): 히트맵을 켜고 위에서 내려다본다
export function enterHeat(room: RoomLabel) {
  const s = useView.getState();
  const was = thermalOn();
  s.setHeatOn(true);
  if (!was) beginThermal();
  if (!was || s.airRoom !== room) heatView(room);
}

// 위에서 내려다보는 시점 (히트맵 분포가 잘 보인다)
export function heatView(room: RoomLabel) {
  thermalCam = 'top';
  const s = useView.getState();
  s.setAirRoom(room);
  const L = AIR_LAYOUT[room];
  s.setFloorFocus(L.floor);
  const y = floorWorldY(L.floor, s.viewMode);
  const rm = ROOM_BY_ID[L.roomId];
  const r = Math.hypot(rm.x[1] - rm.x[0], rm.z[1] - rm.z[0]) / 2;
  const c: V3 = [(rm.x[0] + rm.x[1]) / 2, y, (rm.z[0] + rm.z[1]) / 2];
  // 하단 패널이 열린 뒤의 3D 영역 크기로 거리를 잰다
  // (패널이 열리고 한 번 더 그려진 뒤라야 크기가 맞으므로 두 프레임 뒤)
  requestAnimationFrame(() => requestAnimationFrame(() => s.flyTo(along(c, [-0.12, 1, 0.62], fitDistance(r) * 0.92), c)));
}

// 층 이동 버튼: 온도 보기(기류 · 히트맵) 중이면 서버실 층은 그 서버실 시점으로, 다른 층은 온도 보기를 끄고 이동한다.
// (일반 층 시점은 멀어서 에어 플로우가 거의 안 보이고, 기류 패널만 떠 있게 된다)
export function goFloor(id: FloorId) {
  const s = useView.getState();
  if (thermalOn(s)) {
    const room = (Object.keys(AIR_LAYOUT) as RoomLabel[]).find((r) => AIR_LAYOUT[r].floor === id);
    if (room) return switchRoom(room, true);
    exitThermal(false);
    s.showToast(`온도는 서버실 층(3F · 4F · 5F)에서만 봅니다. 온도 보기를 끄고 ${id}로 이동합니다.`);
    // 흐름도 패널이 돌아와 3D 영역 크기가 바뀐 뒤 계산
    requestAnimationFrame(() => focusFloor(id));
    return;
  }
  focusFloor(id);
}

export function goOverview() {
  if (thermalOn()) {
    exitThermal(false);
    requestAnimationFrame(() => focusOverview());
    return;
  }
  focusOverview();
}

// fly = false: 다음 동작이 곧바로 카메라를 옮길 때 (가이드 투어 · 시나리오)
export function exitThermal(fly = true) {
  const s = useView.getState();
  if (!thermalOn(s)) return;
  s.setAirOn(false);
  s.setHeatOn(false);
  endThermal(fly);
}
