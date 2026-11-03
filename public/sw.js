// 오프라인용 서비스 워커 (빌드한 앱에서만 등록, main.tsx).
// 서버실 안은 통신이 약하거나 외부망이 막혀 있을 수 있어, 한 번 연 앱은 통신 없이도 다시 열리게 한다.
//   페이지(주소 이동): 네트워크 먼저, 안 되면 저장해 둔 index.html
//   assets/ (이름에 내용 해시가 붙은 JS · CSS): 저장해 둔 것 먼저 (바뀌면 이름이 바뀐다)
//   그 밖의 같은 출처 파일(아이콘 · 매니페스트 · 폰트): 저장해 둔 것을 주고 뒤에서 새로 받아 둔다
// 새 버전을 올리면 CACHE 이름을 바꾸지 않아도 새 assets 파일이 따로 저장되고, 쓰지 않는 것은 다음 버전 정리 때 지운다

const CACHE = 'dc3d-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const put = (req, res) => {
  if (res.ok) caches.open(CACHE).then((c) => c.put(req, res));
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          put('./index.html', res.clone());
          return res;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }
  if (url.pathname.includes('/assets/')) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            put(req, res.clone());
            return res;
          }),
      ),
    );
    return;
  }
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          put(req, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit || net;
    }),
  );
});
