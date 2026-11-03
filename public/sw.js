// 오프라인용 서비스 워커 (빌드한 앱에서만 등록, main.tsx: ./sw.js?v=빌드값).
// 서버실 안은 통신이 약하거나 외부망이 막혀 있을 수 있어, 한 번 연 앱은 통신 없이도 다시 열리게 한다.
//   설치: 앱 껍데기 + 빌드한 JS · CSS 전부(precache.json)를 저장 → 처음 한 번만 열어도 오프라인에서 열린다
//   페이지(주소 이동): 네트워크 먼저(3초 넘으면 저장본), 안 되면 저장한 index.html
//   assets/ (이름에 내용 해시가 붙은 JS · CSS): 저장해 둔 것 먼저
//   그 밖의 같은 출처 파일(아이콘 · 매니페스트): 저장해 둔 것을 주고 뒤에서 새로 받아 둔다
//   새 빌드가 설치되면 목록에 없는 옛 assets는 지운다

const CACHE = 'dc3d';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
const NAV_TIMEOUT = 3000;
// 정적 파일 서버가 Vary: Origin을 붙이면, 미리 저장할 때(Origin 없음)와 모듈을 불러올 때(Origin 있음) 요청이 달라 저장본을 못 찾는다
const MATCH = { ignoreVary: true };

const assetList = () =>
  fetch('./precache.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const c = await caches.open(CACHE);
      const list = await assetList();
      await c.addAll([...SHELL, ...list.map((f) => `./${f}`)]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      // 예전 이름의 저장소와, 지금 빌드 목록에 없는 assets를 지운다
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
      const list = await assetList();
      if (list.length) {
        const keep = new Set(list.map((f) => new URL(`./${f}`, self.registration.scope).pathname));
        const c = await caches.open(CACHE);
        for (const req of await c.keys()) {
          const path = new URL(req.url).pathname;
          if (path.includes('/assets/') && !keep.has(path)) await c.delete(req);
        }
      }
      await self.clients.claim();
    })(),
  );
});

// 온전한 응답(200)만 저장한다
const put = (req, res) => (res.status === 200 ? caches.open(CACHE).then((c) => c.put(req, res)) : Promise.resolve());

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(
      (async () => {
        const net = fetch(req).then((res) => {
          e.waitUntil(put('./index.html', res.clone()));
          return res;
        });
        const timeout = new Promise((r) => setTimeout(r, NAV_TIMEOUT));
        const first = await Promise.race([net.catch(() => null), timeout]);
        if (first) return first;
        return (await caches.match('./index.html', MATCH)) || net;
      })(),
    );
    return;
  }
  if (url.pathname.includes('/assets/')) {
    e.respondWith(
      caches.match(req, MATCH).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            e.waitUntil(put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }
  e.respondWith(
    caches.match(req, MATCH).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          e.waitUntil(put(req, res.clone()));
          return res;
        })
        .catch(() => hit);
      return hit || net;
    }),
  );
});
