import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// 빌드 결과의 JS · CSS 목록(precache.json)을 함께 내보낸다: 서비스 워커가 처음 설치될 때 모두 저장해
// 한 번만 연 앱도 통신 없이 다시 열리게 한다 (public/sw.js)
const precacheList = (): Plugin => ({
  name: 'precache-list',
  apply: 'build',
  generateBundle(_, bundle) {
    const files = Object.keys(bundle).filter((f) => f.startsWith('assets/'));
    this.emitFile({ type: 'asset', fileName: 'precache.json', source: JSON.stringify(files) });
  },
});

// npm run dev:https (--mode https): 같은 와이파이의 태블릿 · 휴대폰에서 보안 연결이 필요한 기능을 시험할 때
// (화면 꺼짐 방지 · 서비스 워커 · 카메라). 자체 서명 인증서라 기기 브라우저에서 한 번 '계속'을 눌러야 한다
export default defineConfig(({ mode }) => ({
  plugins: [react(), precacheList(), ...(mode === 'https' ? [basicSsl()] : [])],
  // 빌드마다 바뀌는 값: 서비스 워커 주소에 붙여 새 버전을 받으면 새로 설치되게 한다
  define: { __BUILD__: JSON.stringify(Date.now().toString(36)) },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
}));
