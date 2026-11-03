// 내 위치 고르기: 층 → 그 층의 코어 앞 · 출입문 · 냉복도 끝(QR 라벨 자리와 같은 장소)에서 고른다.
// QR이 없거나 찍기 어려울 때 손으로 정하는 길 (setHere 한 곳으로)

import { useState } from 'react';
import { X } from 'lucide-react';
import { FLOORS, type FloorId } from '../../data/building';
import { FACE_NAME, labelPlaces } from '../../data/route';
import { useView } from '../../store/useView';
import { setHere } from './guide';

export function PickHere() {
  const here = useView((s) => s.fieldHere);
  const [floor, setFloor] = useState<FloorId>(() => useView.getState().floorFocus ?? '1F');
  const places = labelPlaces().filter((p) => p.floor === floor);
  const groups = [
    { name: '코어 앞 (계단 · 승강기)', list: places.filter((p) => p.id.startsWith('core:')) },
    { name: '출입문', list: places.filter((p) => p.id.startsWith('door:')) },
    { name: '냉복도 끝 (열 끝)', list: places.filter((p) => p.id.startsWith('row:')) },
  ].filter((g) => g.list.length);
  return (
    <aside className="panel field-panel">
      <div className="fp-head">
        <span>내 위치</span>
        <b>지금 서 있는 곳 고르기</b>
        <button className="fp-clear" onClick={() => useView.getState().setFieldPick(false)} aria-label="닫기">
          <X size={18} />
        </button>
      </div>
      <div className="fp-floors" role="tablist" aria-label="층">
        {FLOORS.map((f) => (
          <button key={f.id} role="tab" aria-selected={f.id === floor} className={f.id === floor ? 'on' : ''} onClick={() => setFloor(f.id)}>
            {f.id}
          </button>
        ))}
      </div>
      <div className="fp-body">
        <p className="fp-hint">가까운 QR 라벨 자리를 고릅니다. 라벨이 붙어 있으면 기기 카메라로 찍어도 됩니다.</p>
        {groups.map((g) => (
          <div key={g.name} className="fp-group">
            <h5>{g.name}</h5>
            {g.list.map((p) => (
              <button key={p.id} className={here?.place === p.id ? 'on' : ''} onClick={() => setHere(p.id, p.face, 'pick')}>
                <b>{p.name}</b>
                <small>{FACE_NAME[p.face]}을 보고 섬</small>
              </button>
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
