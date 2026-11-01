import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadSettings, watchHash, watchSettings } from './store/persist';
import './styles.css';

// 개발 중 브라우저 콘솔에서 상태를 다룰 수 있게
if (import.meta.env.DEV) import('./store/useView').then(({ useView }) => Object.assign(window, { __view: useView }));

// 지난번 보기 설정을 먼저 되살린 뒤 그리고, 바뀌면 저장 · 주소(장면)를 갱신
loadSettings();
watchSettings();
watchHash();

const root = createRoot(document.getElementById('root')!);

// 개발 중 ?kit 이면 공통 부품 미리보기
if (import.meta.env.DEV && new URLSearchParams(location.search).has('kit')) {
  import('./ui/KitPreview').then(({ KitPreview }) => root.render(<KitPreview />));
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
