// QR 라벨 내용: 현장 모드로 열면서 내 위치를 정하는 주소 (기기 카메라로 찍으면 그대로 앱이 열린다)

import QRCode from 'qrcode';
import type { LabelPlace } from '../../data/route';

export const labelUrl = (p: LabelPlace) => `${location.origin}${location.pathname}?mode=field#here=${encodeURIComponent(p.id)}&face=${p.face}`;

// QR 그림 (캔버스). 같은 장소는 한 번만 만든다
const canvases = new Map<string, Promise<HTMLCanvasElement>>();
export function qrCanvas(p: LabelPlace, size = 256) {
  const k = `${p.id}|${size}`;
  if (!canvases.has(k)) {
    const c = document.createElement('canvas');
    canvases.set(
      k,
      QRCode.toCanvas(c, labelUrl(p), { width: size, margin: 1, errorCorrectionLevel: 'M' }).then(() => c),
    );
  }
  return canvases.get(k)!;
}
