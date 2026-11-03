// QR 라벨 인쇄 페이지 (주소 ?labels): 장소마다 QR · 이름 · 붙일 곳 · 보는 방향을 A4에 3칸씩.
// 찍으면 현장 모드로 열리며 내 위치가 그 장소로 정해진다. 사무실에서 종이 · 모니터로 흐름을 시험할 수도 있다

import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { FLOORS } from '../../data/building';
import { FACE_NAME, labelPlaces, type LabelPlace } from '../../data/route';
import { labelUrl, qrCanvas } from './labels';

export function LabelSheet() {
  const places = labelPlaces();
  return (
    <div className="label-page">
      <header className="label-tools">
        <b>현장 모드 QR 라벨</b>
        <span>{places.length}장 · 찍으면 현장 모드가 열리고 내 위치가 그 자리로 정해집니다</span>
        <button onClick={() => window.print()}>
          <Printer size={16} /> 인쇄
        </button>
      </header>
      {FLOORS.map((f) => {
        const list = places.filter((p) => p.floor === f.id);
        if (!list.length) return null;
        return (
          <section key={f.id} className="label-floor">
            <h2>
              {f.id} · {f.name}
            </h2>
            <div className="label-grid">
              {list.map((p) => (
                <Label key={p.id} p={p} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Label({ p }: { p: LabelPlace }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    qrCanvas(p, 320).then((c) => setSrc(c.toDataURL()));
  }, [p]);
  return (
    <div className="label">
      {src ? <img src={src} alt={`${p.name} QR`} /> : <div className="label-qr-blank" />}
      <b>{p.name}</b>
      <span>붙일 곳: {p.where}</span>
      <span>라벨을 보면 {FACE_NAME[p.face]}을 봅니다</span>
      <small>{labelUrl(p)}</small>
    </div>
  );
}
