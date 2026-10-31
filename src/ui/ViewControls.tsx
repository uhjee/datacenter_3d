// 3D 화면 위에 떠 있는 조작: 왼쪽 위 층 이동 · 보기 방식, 오른쪽 위 확대 · 축소 · 전체 보기

import { FoldVertical, House, Minus, Plus, UnfoldVertical } from 'lucide-react';
import { FLOORS, type FloorId } from '../data/building';
import { enterAir, focusFloor, focusOverview, goFloor, goOverview } from '../scene/focus';
import { useView } from '../store/useView';
import { Help, IconButton } from './kit';

export function FloorBar() {
  const focus = useView((s) => s.floorFocus);
  const viewMode = useView((s) => s.viewMode);
  const changeMode = (m: 'stack' | 'explode') => {
    useView.getState().setViewMode(m);
    // 모드 전환 후 카메라 재배치 (기류 보기 중이면 기류 시점 유지)
    const s = useView.getState();
    requestAnimationFrame(() => (s.airOn ? enterAir(s.airRoom) : focus ? focusFloor(focus) : focusOverview()));
  };
  return (
    <div className="vc-floors">
      <div className="vc-bar">
        <IconButton icon={UnfoldVertical} label="층 벌려 보기" active={viewMode === 'explode'} onClick={() => changeMode('explode')} />
        <IconButton icon={FoldVertical} label="겹쳐 보기" active={viewMode === 'stack'} onClick={() => changeMode('stack')} />
        <span className="vc-sep" />
        <button className={`vc-floor${!focus ? ' on' : ''}`} onClick={goOverview}>
          전체
        </button>
        {[...FLOORS].reverse().map((f) => (
          <button key={f.id} className={`vc-floor${focus === f.id ? ' on' : ''}`} onClick={() => goFloor(f.id as FloorId)} title={`${f.name} · ${f.summary}`}>
            {f.id}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CameraButtons() {
  return (
    <div className="vc-cam vc-bar col">
      <IconButton icon={House} label="전체 보기" onClick={goOverview} />
      <span className="vc-sep h" />
      <IconButton icon={Plus} label="확대" onClick={() => useView.getState().zoomStep(1)} />
      <IconButton icon={Minus} label="축소" onClick={() => useView.getState().zoomStep(-1)} />
      <span className="vc-sep h" />
      <span className="vc-help">
        <Help text="드래그: 회전 · 우클릭 드래그: 이동 · 휠: 확대/축소 · 클릭: 장비 정보" />
      </span>
    </div>
  );
}
