import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// npm run dev:https (--mode https): 같은 와이파이의 태블릿 · 휴대폰에서 보안 연결이 필요한 기능을 시험할 때
// (화면 꺼짐 방지 · 서비스 워커 · 카메라). 자체 서명 인증서라 기기 브라우저에서 한 번 '계속'을 눌러야 한다
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'https' ? [basicSsl()] : [])],
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
}));
