// 보기 설정 기억 · 장면 링크.
//   설정(브라우저 저장): 레이어 · 연결선 · 랙 색칠 · 보기 방식 · 공조 조건 · 운전 조건 · 히트맵 설정. 새로고침해도 그대로
//   장면(주소 #): 층 · 선택 · 온도 보기 서버실 · 도면 탭. 주소를 그대로 보내면 같은 장면이 열린다 (교육 자료 링크용)
// 저장이 막힌 환경(사생활 보호 창 등)에서는 조용히 넘어간다

import { FLOOR_BY_ID, byRoom, type FloorId } from '../data/building';
import { computeRoom, type RoomLabel } from '../data/thermal';
import { nodeInfo } from '../data/graph';
import { enterHeat, focusItem, goFloor } from '../scene/focus';
import { useView, type PanelTab } from './useView';

const KEY = 'dc3d.view.v3'; // v3: 세 서버실 급기 20°C 통일 (이전 공조 조건은 버린다)
const SAVED = ['layers', 'linkFilter', 'rackColor', 'viewMode', 'airCfg', 'itLoad', 'outdoorT', 'heatHeight', 'heatValue', 'heatOpacity', 'heatHotOnly'] as const;
type SavedKey = (typeof SAVED)[number];

// 저장해 둔 값 중 지금 저장소에 있는 키 · 같은 모양의 값만 받아들인다 (버전이 바뀌어 키가 늘거나 줄어도 안전하게)
function merge<T>(cur: T, saved: unknown): T {
  if (saved == null || typeof saved !== typeof cur) return cur;
  if (typeof cur !== 'object' || cur === null) return saved as T;
  const out: Record<string, unknown> = { ...(cur as Record<string, unknown>) };
  for (const k of Object.keys(out)) out[k] = merge(out[k], (saved as Record<string, unknown>)[k]);
  return out as T;
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Partial<Record<SavedKey, unknown>>;
    const s = useView.getState();
    const patch: Record<string, unknown> = {};
    for (const k of SAVED) if (k in saved) patch[k] = merge(s[k], saved[k]);
    useView.setState(patch);
    // 공조 조건 · 부하가 바뀌었으면 온도를 다시 계산
    const v = useView.getState();
    useView.setState({ therm: byRoom((l) => computeRoom(l, v.airCfg[l], v.itLoad)) });
  } catch {
    // 저장소를 못 쓰면 기본값으로
  }
}

let timer = 0;
// 랙 색칠은 온도 보기 · 시나리오가 잠시 '온도'로 바꾸므로, 둘 다 꺼져 있을 때 사용자가 고른 값만 저장한다
let userRackColor = useView.getState().rackColor;
export function watchSettings() {
  userRackColor = useView.getState().rackColor;
  return useView.subscribe((s, prev) => {
    if (SAVED.every((k) => s[k] === prev[k])) return;
    if (!s.airOn && !s.heatOn && !s.scenario) userRackColor = s.rackColor;
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      try {
        const v = { ...useView.getState(), rackColor: userRackColor };
        localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(SAVED.map((k) => [k, v[k]]))));
      } catch {
        // 저장이 막혀도 이번 화면에서는 그대로 쓴다
      }
    }, 300);
  });
}

// ── 장면 주소 (#floor=3F&sel=rack:B-6-36&temp=B&doc=power) ──
const TABS: PanelTab[] = ['power', 'cooling', 'plan'];

export function sceneHash() {
  const s = useView.getState();
  const p = new URLSearchParams();
  const thermal = s.airOn || s.heatOn;
  if (thermal) p.set('temp', s.airRoom);
  else if (s.floorFocus) p.set('floor', s.floorFocus);
  if (s.selectedId) p.set('sel', s.selectedId);
  if (s.diagramMode !== 'off' && s.diagramTab !== 'plan') p.set('doc', s.diagramTab);
  const q = p.toString();
  return q ? `#${q}` : '';
}

export function watchHash() {
  return useView.subscribe((s, prev) => {
    if (
      s.floorFocus === prev.floorFocus &&
      s.selectedId === prev.selectedId &&
      s.airOn === prev.airOn &&
      s.heatOn === prev.heatOn &&
      s.airRoom === prev.airRoom &&
      s.diagramMode === prev.diagramMode &&
      s.diagramTab === prev.diagramTab
    )
      return;
    const h = sceneHash();
    if (h !== location.hash) history.replaceState(null, '', `${location.pathname}${location.search}${h}`);
  });
}

// 첫 화면에서 주소의 장면을 연다 (3D 영역 크기가 잡힌 뒤 부른다)
export function applyHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const s = useView.getState();
  const doc = p.get('doc') as PanelTab | null;
  if (doc && TABS.includes(doc) && doc !== 'plan') {
    s.setDiagramMode('half');
    s.setDiagramTab(doc);
  }
  const temp = p.get('temp');
  const sel = p.get('sel');
  const floor = p.get('floor') as FloorId | null;
  if (temp === 'A' || temp === 'B' || temp === 'C') {
    enterHeat(temp as RoomLabel);
    if (sel && (nodeInfo(sel) || sel.startsWith('customer:'))) s.select(sel);
    return;
  }
  if (sel && (nodeInfo(sel) || sel.startsWith('shaft:'))) return focusItem(sel);
  if (floor && FLOOR_BY_ID[floor]) goFloor(floor);
}
