// 현장 모드 길 안내 동작: 시작 · 단계 이동 · 시점(위에서 · 눈높이) · 끝내기.
// 경로는 출발 · 목적지가 같으면 다시 계산하지 않는다 (단계를 넘겨도 경로는 그대로, '내 위치'만 그 단계 지점으로)

import { useMemo } from 'react';
import { floorTopAt, route, type Route } from '../../data/route';
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

// 출발: 지금 보고 있는 층의 코어 앞 (내 위치 · QR은 S12에서)
export function startGuide(to: string) {
  const s = useView.getState();
  const from = `core:${s.floorFocus ?? '1F'}`;
  if (!routeOf(from, to)) {
    s.showToast('그 장비 · 랙까지 길을 찾지 못했습니다.');
    return;
  }
  if (s.selectedId !== to) s.select(to);
  s.setFieldGuide({ from, to, step: 0 });
  showStep(0);
}

export function stopGuide() {
  useView.getState().setFieldGuide(null);
}

export function showStep(i: number) {
  const s = useView.getState();
  const g = s.fieldGuide;
  if (!g) return;
  const r = routeOf(g.from, g.to);
  if (!r) return;
  const k = Math.max(0, Math.min(r.steps.length - 1, i));
  if (k !== g.step) s.setFieldGuide({ ...g, step: k });
  aim(r, k, s.fieldView);
}

export function setView(v: 'plan' | 'eye') {
  const s = useView.getState();
  s.setFieldView(v);
  const g = s.fieldGuide;
  const r = g && routeOf(g.from, g.to);
  if (g && r) aim(r, g.step, v);
}

// 내 위치(그 단계 지점)와 보는 방향(다음 단계 지점 쪽, 도착이면 목적지 쪽)
export function poseOf(r: Route, k: number) {
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

function aim(r: Route, k: number, view: 'plan' | 'eye') {
  const s = useView.getState();
  const p = poseOf(r, k);
  if (s.floorFocus !== p.floor) s.setFloorFocus(p.floor);
  const y = floorWorldY(p.floor, s.viewMode) + floorTopAt(p.floor, p.x, p.z);
  if (view === 'eye') {
    const pos: [number, number, number] = [p.x, y + EYE, p.z];
    // 거의 붙은 목표를 둘러 돌게 해 '그 자리에서 둘러보기'가 되게 한다 (Scene CameraRig의 눈높이 설정)
    s.flyTo(pos, [p.x + p.dx * 0.1, y + EYE - 0.02, p.z + p.dz * 0.1]);
  } else {
    // 위에서: 내 위치를 가운데, 걷는 방향이 화면 위쪽이 되게 조금 뒤에서 내려다본다
    s.flyTo([p.x - p.dx * 9, y + 24, p.z - p.dz * 9], [p.x, y, p.z]);
  }
}
