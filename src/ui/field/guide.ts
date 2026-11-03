// 현장 모드 길 안내 동작: 내 위치 · 시작 · 단계 이동 · 시점(위에서 · 눈높이) · 끝내기.
// 경로는 출발 · 목적지가 같으면 다시 계산하지 않는다 (단계를 넘겨도 경로는 그대로, '내 위치'만 그 단계 지점으로)
// 내 위치는 한 곳(setHere)으로만 바꾼다: QR 라벨(주소 #here=) · 3D 속 QR 표지 · 손으로 고르기가 모두 여기를 부른다

import { useMemo } from 'react';
import { FACE_VEC, floorTopAt, placeOf, route, type Face, type Route } from '../../data/route';
import { RACK_BY_ID } from '../../data/racks';
import { EQUIP_BY_ID } from '../../data/equipment';
import { floorWorldY, useView } from '../../store/useView';

const EYE = 1.6; // 눈높이 (바닥 위 m)

const cache = new Map<string, Route | null>();
export function routeOf(from: string, to: string) {
  const k = `${from}|${to}`;
  if (!cache.has(k)) cache.set(k, route(from, to));
  return cache.get(k)!;
}

export function useGuide() {
  const g = useView((s) => s.fieldGuide);
  const r = useMemo(() => (g ? routeOf(g.from, g.to) : null), [g]);
  return g && r ? { ...g, route: r } : null;
}

type Pose = { floor: string; x: number; z: number; dx: number; dz: number };

// 내 위치 정하기. 길 안내 중이면 여기서 목적지까지 다시 안내하고, 아니면 그 자리로 카메라를 옮긴다
export function setHere(place: string, face?: Face, how: 'qr' | 'pick' | 'link' = 'pick') {
  const s = useView.getState();
  const p = placeOf(place);
  if (!p) return;
  s.setFieldHere({ place, face });
  s.setFieldPick(false);
  const g = s.fieldGuide;
  if (g && routeOf(place, g.to)) {
    s.setFieldGuide({ from: place, to: g.to, step: 0 });
    showStep(0);
  } else aim(herePose()!, s.fieldView);
  const what = how === 'qr' ? 'QR을 찍었습니다' : how === 'link' ? '링크로 열었습니다' : '내 위치를 정했습니다';
  s.showToast(`${what}: ${p.name}${g ? ' · 여기서부터 다시 안내합니다' : ''}`);
}

// 내 위치 자세: 장소 + 라벨 방향 (방향이 없으면 남쪽)
export function herePose(): Pose | null {
  const h = useView.getState().fieldHere;
  const p = h && placeOf(h.place);
  if (!h || !p) return null;
  const [dx, dz] = FACE_VEC[h.face ?? 'S'];
  return { floor: p.floor, x: p.x, z: p.z, dx, dz };
}

// 출발: 내 위치, 없으면 지금 보고 있는 층의 코어 앞
export function startGuide(to: string) {
  const s = useView.getState();
  const from = s.fieldHere?.place ?? `core:${s.floorFocus ?? '1F'}`;
  if (!routeOf(from, to)) {
    s.showToast('그 장비 · 랙까지 길을 찾지 못했습니다.');
    return;
  }
  if (s.selectedId !== to) s.select(to);
  s.setFieldGuide({ from, to, step: 0 });
  showStep(0);
}

// 끝내기: 목적지에 도착했으면 그곳이 내 위치가 된다
export function stopGuide() {
  const s = useView.getState();
  const g = s.fieldGuide;
  const r = g && routeOf(g.from, g.to);
  if (g && r && g.step === r.steps.length - 1) {
    const p = poseOf(r, g.step);
    s.setFieldHere({ place: g.to, face: faceOfVec(p.dx, p.dz) });
  }
  s.setFieldGuide(null);
}
const faceOfVec = (dx: number, dz: number): Face => (Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'E' : 'W') : dz > 0 ? 'S' : 'N');

export function showStep(i: number) {
  const s = useView.getState();
  const g = s.fieldGuide;
  if (!g) return;
  const r = routeOf(g.from, g.to);
  if (!r) return;
  const k = Math.max(0, Math.min(r.steps.length - 1, i));
  if (k !== g.step) s.setFieldGuide({ ...g, step: k });
  aim(poseOf(r, k), s.fieldView);
}

export function setView(v: 'plan' | 'eye') {
  const s = useView.getState();
  s.setFieldView(v);
  const g = s.fieldGuide;
  const r = g && routeOf(g.from, g.to);
  const p = g && r ? poseOf(r, g.step) : herePose();
  if (p) aim(p, v);
}

// 지금 자세로 카메라 다시 (화면 맞춤)
export function reaim() {
  const s = useView.getState();
  const g = s.fieldGuide;
  const r = g && routeOf(g.from, g.to);
  const p = g && r ? poseOf(r, g.step) : herePose();
  if (p) aim(p, s.fieldView);
  return !!p;
}

// 그 단계의 내 위치와 보는 방향(다음 단계 지점 쪽, 도착이면 목적지 쪽)
export function poseOf(r: Route, k: number): Pose {
  const st = r.steps[k];
  const last = k === r.steps.length - 1;
  const next = last ? null : r.steps.slice(k + 1).find((n) => n.floor === st.floor && Math.hypot(n.x - st.x, n.z - st.z) > 0.3);
  let dx = 0;
  let dz = 1;
  if (next) {
    dx = next.x - st.x;
    dz = next.z - st.z;
  } else {
    // 도착: 걸어온 방향과 랙 · 장비 쪽의 사이를 본다 (정면으로 보면 한 걸음 앞 랙 문만 화면에 가득 찬다)
    const id = r.to.id;
    const rack = id.startsWith('rack:') ? RACK_BY_ID[id.slice(5)] : null;
    const e = EQUIP_BY_ID[id];
    const tx = rack ? rack.x : e ? e.pos[0] : st.x;
    const tz = rack ? rack.z : e ? e.pos[2] : st.z + 1;
    const to = Math.hypot(tx - st.x, tz - st.z) || 1;
    const prev = [...r.points].reverse().find((p) => p.floor === st.floor && Math.hypot(p.x - st.x, p.z - st.z) > 0.3);
    const walk = prev ? Math.hypot(st.x - prev.x, st.z - prev.z) : 1;
    dx = (tx - st.x) / to + (prev ? ((st.x - prev.x) / walk) * 2.5 : 0);
    dz = (tz - st.z) / to + (prev ? ((st.z - prev.z) / walk) * 2.5 : 0);
  }
  const n = Math.hypot(dx, dz) || 1;
  return { floor: st.floor, x: st.x, z: st.z, dx: dx / n, dz: dz / n };
}

function aim(p: Pose, view: 'plan' | 'eye') {
  const s = useView.getState();
  const floor = p.floor as Route['to']['floor'];
  if (s.floorFocus !== floor) s.setFloorFocus(floor);
  const y = floorWorldY(floor, s.viewMode) + floorTopAt(floor, p.x, p.z);
  if (view === 'eye') {
    const pos: [number, number, number] = [p.x, y + EYE, p.z];
    // 거의 붙은 목표를 둘러 돌게 해 '그 자리에서 둘러보기'가 되게 한다 (Scene CameraRig의 눈높이 설정)
    s.flyTo(pos, [p.x + p.dx * 0.1, y + EYE - 0.02, p.z + p.dz * 0.1]);
  } else {
    // 위에서: 내 위치를 가운데, 보는 방향이 화면 위쪽이 되게 조금 뒤에서 내려다본다
    s.flyTo([p.x - p.dx * 9, y + 24, p.z - p.dz * 9], [p.x, y, p.z]);
  }
}
