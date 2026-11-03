// 기기 · 모드 판별 (docs/research/03-mobile-responsive.md §1 · §9)
//   기기: 휴대폰(phone) · 태블릿(tablet) · PC(desktop). 화면 크기와 입력 장치로 정하고, 크기가 바뀌면(회전 · 창 크기) 다시 정한다
//   모드: 현장(field) · 학습(learn). 태블릿은 현장 모드로 시작한다. 시작할 때 정하고, 기기 판별이 바뀌어도 그대로 둔다.
//         주소 ?mode=field|learn 이 가장 앞서고(시험용, 저장 안 함),
//         그다음 사용자가 고른 모드(브라우저 저장), 마지막이 기기 기본값
//   CSS는 <html data-device data-mode> 속성으로 고른다 (미디어쿼리를 여기저기 반복하지 않으려고)

import { useSyncExternalStore } from 'react';

export type Device = 'phone' | 'tablet' | 'desktop';
export type Mode = 'field' | 'learn';

// 휴대폰: 폭 600 미만(좁은 PC 창도 같은 화면) 또는 높이 500 미만인 터치 화면(가로 휴대폰)
const PHONE = '(max-width: 599px), (max-height: 499px) and (pointer: coarse)';
const MODE_KEY = 'dc3d.mode';

function readDevice(): Device {
  if (matchMedia(PHONE).matches) return 'phone';
  // iPad Safari는 Mac처럼 자신을 알리므로 터치 지점 수로 가린다 (iPad 5, Mac 0)
  const iPad = /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
  if (matchMedia('(pointer: coarse)').matches || iPad) return 'tablet';
  return 'desktop';
}

const isMode = (v: unknown): v is Mode => v === 'field' || v === 'learn';

function savedMode(): Mode | null {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return isMode(v) ? v : null;
  } catch {
    return null;
  }
}

const urlMode = new URLSearchParams(location.search).get('mode');
const modeOf = (d: Device): Mode => (isMode(urlMode) ? urlMode : (savedMode() ?? (d === 'tablet' ? 'field' : 'learn')));

let device = readDevice();
let mode = modeOf(device);
const subs = new Set<() => void>();

function apply() {
  const root = document.documentElement;
  root.dataset.device = device;
  root.dataset.mode = mode;
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
    // 모드(현장 · 학습)는 그대로 둔다: 화면 분할 · 회전으로 기기 판별이 바뀌어도 쓰던 화면이 통째로 바뀌지 않게
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
export const modeOfNow = () => mode;

export function setMode(m: Mode) {
  if (m === mode) return;
  mode = m;
  // 주소 ?mode= 로 시험 중이면 저장하지 않는다 (다음에 그냥 열 때 시험 모드로 시작하지 않게)
  if (!isMode(urlMode))
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      // 저장이 막혀도 이번 화면에서는 바뀐다
    }
  apply();
}

const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

export function useDevice(): { device: Device; mode: Mode } {
  const d = useSyncExternalStore(subscribe, deviceOf);
  const m = useSyncExternalStore(subscribe, modeOfNow);
  return { device: d, mode: m };
}
