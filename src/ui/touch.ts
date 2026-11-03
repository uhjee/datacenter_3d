// 터치 입력 공통: 탭으로 볼 이동 거리, 길게 누르기 (docs/research/03-mobile-responsive.md §5)
//   마우스는 hover가 있으므로 길게 누르기는 손가락(pointerType 'touch')에만 건다

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
