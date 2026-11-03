import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadSettings, watchHash, watchSettings } from './store/persist';
import { watchDevice } from './store/device';
import './styles.css';

// 개발 중 브라우저 콘솔에서 상태를 다룰 수 있게
if (import.meta.env.DEV) import('./store/useView').then(({ useView }) => Object.assign(window, { __view: useView }));
// 현장 모드 길 안내 점검: __route.route('core:1F', 'rack:A-3-07') · __route.checkAll()
if (import.meta.env.DEV) import('./data/route').then((m) => Object.assign(window, { __route: m }));

// 기기(휴대폰 · 태블릿 · PC) · 모드를 먼저 정해 <html>에 단다 (첫 그림부터 맞는 배치로)
watchDevice();

// 지난번 보기 설정을 먼저 되살린 뒤 그리고, 바뀌면 저장 · 주소(장면)를 갱신
loadSettings();
watchSettings();
watchHash();

// 오프라인: 빌드한 앱에서만 서비스 워커를 건다 (개발 서버의 즉시 반영과 섞이지 않게). 보안 연결(HTTPS · localhost)에서만 동작
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

const root = createRoot(document.getElementById('root')!);

// 개발 중 ?kit 이면 공통 부품 미리보기, ?labels 이면 현장 모드 QR 라벨 인쇄 페이지
if (import.meta.env.DEV && new URLSearchParams(location.search).has('kit')) {
  import('./ui/KitPreview').then(({ KitPreview }) => root.render(<KitPreview />));
} else if (new URLSearchParams(location.search).has('labels')) {
  import('./ui/field/LabelSheet').then(({ LabelSheet }) => root.render(<LabelSheet />));
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
