// 길 안내 중 화면 꺼짐 방지 (Screen Wake Lock). 걸으면서 화면을 보므로 자동으로 꺼지지 않게 한다.
// 지원하지 않는 브라우저(또는 보안 연결이 아닌 주소)는 조용히 건너뛴다. 다른 탭으로 갔다 오면 다시 건다

import { useEffect } from 'react';

type Sentinel = { release: () => Promise<void>; addEventListener: (t: 'release', f: () => void) => void };

export function useWakeLock(on: boolean) {
  useEffect(() => {
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } }).wakeLock;
    if (!on || !wl || !window.isSecureContext) return;
    let lock: Sentinel | null = null;
    let alive = true;
    const take = () => {
      if (document.visibilityState !== 'visible') return;
      wl.request('screen').then(
        (l) => {
          // 이미 잡혀 있거나 정리된 뒤 도착한 것은 바로 놓는다
          if (alive && !lock) {
            lock = l;
            // 화면을 떠나면 브라우저가 스스로 놓는다: 돌아왔을 때 다시 잡을 수 있게 비운다
            l.addEventListener('release', () => {
              if (lock === l) lock = null;
            });
          } else l.release().catch(() => {});
        },
        () => {}, // 배터리 절약 모드 등으로 거절되면 그냥 둔다
      );
    };
    take();
    document.addEventListener('visibilitychange', take);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', take);
      lock?.release().catch(() => {});
    };
  }, [on]);
}
