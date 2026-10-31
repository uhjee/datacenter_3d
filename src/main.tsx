import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// 개발 중 브라우저 콘솔에서 상태를 다룰 수 있게
if (import.meta.env.DEV) import('./store/useView').then(({ useView }) => Object.assign(window, { __view: useView }));

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
