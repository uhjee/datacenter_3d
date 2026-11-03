// 터치 입력 공통: 탭으로 볼 이동 거리, 길게 누르기, 2D 도면 두 손가락 확대 (docs/research/03-mobile-responsive.md §5)
//   마우스는 hover가 있으므로 길게 누르기는 손가락(pointerType 'touch')에만 건다

import { useEffect, useRef, type RefObject } from 'react';

// 누른 곳과 뗀 곳이 이만큼(px) 안이면 탭(선택). 넘으면 회전 · 이동하려던 끌기로 보고 선택하지 않는다
export const TAP_SLOP = 6;
const LONG_MS = 500;
const LONG_SLOP = 8;

type Down = { pointerType: string; pointerId: number; clientX: number; clientY: number };

// 손가락을 대고 LONG_MS 동안 LONG_SLOP 넘게 움직이지 않으면 fire. 떼거나 · 끌거나 · 두 번째 손가락이 닿으면 취소.
// 첫 손가락에만 건다 (두 손가락 확대 중 가만히 둔 손가락이 hover처럼 뜨지 않게).
// 창(window) 리스너는 붙잡기 단계로 단다: React의 stopPropagation이 걸린 곳에서 두 번째 손가락이 닿아도 취소되게
export function onLongPress(e: Down & { isPrimary?: boolean }, fire: (x: number, y: number) => void) {
  if (e.pointerType !== 'touch' || e.isPrimary === false) return;
  const { clientX: x0, clientY: y0, pointerId } = e;
  const timer = window.setTimeout(() => {
    stop();
    fire(x0, y0);
    swallowClick();
  }, LONG_MS);
  const move = (m: PointerEvent) => {
    if (m.pointerId === pointerId && Math.hypot(m.clientX - x0, m.clientY - y0) > LONG_SLOP) stop();
  };
  const other = (d: PointerEvent) => d.pointerId !== pointerId && stop();
  const stop = () => {
    clearTimeout(timer);
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerdown', other, true);
    window.removeEventListener('pointerup', stop, true);
    window.removeEventListener('pointercancel', stop, true);
  };
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerdown', other, true);
  window.addEventListener('pointerup', stop, true);
  window.addEventListener('pointercancel', stop, true);
}

// 길게 누른 뒤 손을 떼면 브라우저(iOS)가 click을 보낼 수 있다: 정보만 보려던 것이 선택 · 층 이동이 되지 않게 한 번 삼킨다
function swallowClick() {
  const eat = (c: Event) => {
    c.stopPropagation();
    c.preventDefault();
    done();
  };
  const done = () => {
    window.removeEventListener('click', eat, true);
    clearTimeout(t);
  };
  const t = window.setTimeout(done, 800);
  window.addEventListener('click', eat, true);
}

// 2D 도면: 두 손가락 벌리기 · 오므리기로 확대 · 축소 (휠과 같이 손가락 가운데를 기준으로).
// zoom(배율, 상자 안 x, y)를 부른다. 한 손가락 끌기(이동)는 각 도면이 하고, 두 손가락이 닿아 있는 동안은
// pinching()이 참이므로 이동을 멈춘다
export function usePinchZoom(box: RefObject<HTMLElement | null>, zoom: (f: number, x: number, y: number) => void) {
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const fn = useRef(zoom);
  fn.current = zoom;
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const p = pts.current;
    let last = 0;
    const dist = () => {
      const [a, b] = [...p.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      if (e.isPrimary) p.clear(); // 놓친 pointerup으로 남은 손가락이 있으면 지운다
      p.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (p.size === 2) last = dist();
    };
    const move = (e: PointerEvent) => {
      if (!p.has(e.pointerId)) return;
      p.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (p.size !== 2 || !last) return;
      const d = dist();
      const [a, b] = [...p.values()];
      const r = el.getBoundingClientRect();
      fn.current(d / last, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      last = d;
    };
    const up = (e: PointerEvent) => {
      p.delete(e.pointerId);
      if (p.size < 2) last = 0;
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [box]);
  return () => pts.current.size >= 2;
}
