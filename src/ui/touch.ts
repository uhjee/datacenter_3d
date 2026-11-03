// 터치 입력 공통: 탭으로 볼 이동 거리, 길게 누르기, 2D 도면 두 손가락 확대 (docs/research/03-mobile-responsive.md §5)
//   마우스는 hover가 있으므로 길게 누르기는 손가락(pointerType 'touch')에만 건다

import { useEffect, useRef, type RefObject } from 'react';

// 누른 곳과 뗀 곳이 이만큼(px) 안이면 탭(선택). 넘으면 회전 · 이동하려던 끌기로 보고 선택하지 않는다
export const TAP_SLOP = 6;
const LONG_MS = 500;
const LONG_SLOP = 8;

type Down = { pointerType: string; pointerId: number; clientX: number; clientY: number };

// 손가락을 대고 LONG_MS 동안 LONG_SLOP 넘게 움직이지 않으면 fire. 떼거나 · 끌거나 · 두 번째 손가락이 닿으면 취소
export function onLongPress(e: Down, fire: (x: number, y: number) => void) {
  if (e.pointerType !== 'touch') return;
  const { clientX: x0, clientY: y0, pointerId } = e;
  const timer = window.setTimeout(() => {
    stop();
    fire(x0, y0);
  }, LONG_MS);
  const move = (m: PointerEvent) => {
    if (m.pointerId === pointerId && Math.hypot(m.clientX - x0, m.clientY - y0) > LONG_SLOP) stop();
  };
  const other = (d: PointerEvent) => d.pointerId !== pointerId && stop();
  const stop = () => {
    clearTimeout(timer);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerdown', other);
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerdown', other);
  window.addEventListener('pointerup', stop);
  window.addEventListener('pointercancel', stop);
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
