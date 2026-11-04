// 기기 판별 (docs/research/03-mobile-responsive.md §1)
//   휴대폰(phone) · 태블릿(tablet) · PC(desktop). 화면 크기와 입력 장치로 정하고, 크기가 바뀌면(회전 · 창 크기) 다시 정한다.
//   기능은 모두 같고 배치만 다르다: 휴대폰은 바텀 시트 · 줄인 상단 바, 태블릿은 PC 배치에 터치 크기
//   CSS는 <html data-device> 속성으로 고른다 (미디어쿼리를 여기저기 반복하지 않으려고)

import { useSyncExternalStore } from 'react';

export type Device = 'phone' | 'tablet' | 'desktop';

// 휴대폰: 폭 600 미만(좁은 PC 창도 같은 화면) 또는 높이 500 미만인 터치 화면(가로 휴대폰)
const PHONE = '(max-width: 599px), (max-height: 499px) and (pointer: coarse)';

function readDevice(): Device {
  if (matchMedia(PHONE).matches) return 'phone';
  // iPad Safari는 Mac처럼 자신을 알리므로 터치 지점 수로 가린다 (iPad 5, Mac 0)
  const iPad = /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
  if (matchMedia('(pointer: coarse)').matches || iPad) return 'tablet';
  return 'desktop';
}

let device = readDevice();
const subs = new Set<() => void>();

function apply() {
  document.documentElement.dataset.device = device;
  subs.forEach((f) => f());
}

// 앱을 그리기 전에 한 번 부른다: 속성을 달고, 크기 · 입력 장치가 바뀌면 다시 판별
export function watchDevice() {
  apply();
  const recheck = () => {
    // 입력 중에는 판별하지 않는다: 화면 키보드가 화면 높이를 줄여 태블릿이 휴대폰으로 바뀌었다 돌아오는 것을 막는다
    const a = document.activeElement;
    if (a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement) return;
    const d = readDevice();
    if (d === device) return;
    device = d;
    apply();
  };
  window.addEventListener('resize', recheck);
  const mq = matchMedia('(pointer: coarse)');
  // Safari 14 이전은 addEventListener가 없다
  if (mq.addEventListener) mq.addEventListener('change', recheck);
  else mq.addListener(recheck);
}

export const deviceOf = () => device;

const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

export function useDevice(): { device: Device } {
  return { device: useSyncExternalStore(subscribe, deviceOf) };
}
