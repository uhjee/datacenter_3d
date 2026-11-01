// 3D 화면 위에 떠 있는 조작: 왼쪽 세로 막대 층 이동 · 보기 방식(위층이 위), 오른쪽 위 화면 맞춤 · 확대 · 축소 · 조작 안내

import { FoldVertical, Minus, Plus, Scan, UnfoldVertical } from 'lucide-react';
import { FLOORS, type FloorId } from '../data/building';
import { focusFloor, focusOverview, goFloor, goOverview, switchRoom, thermalOn } from '../scene/focus';
import { useView } from '../store/useView';
import { IconButton, InfoTip, TipTable } from './kit';

export function FloorBar() {
  const focus = useView((s) => s.floorFocus);
  const viewMode = useView((s) => s.viewMode);
  const changeMode = (m: 'stack' | 'explode') => {
    useView.getState().setViewMode(m);
    // 모드 전환 후 카메라 재배치 (기류 보기 중이면 기류 시점 유지)
    requestAnimationFrame(fitView);
  };
  return (
    <div className="vc-floors">
      <div className="vc-bar col">
        <IconButton icon={UnfoldVertical} label="층 벌려 보기" active={viewMode === 'explode'} onClick={() => changeMode('explode')} />
        <IconButton icon={FoldVertical} label="겹쳐 보기" active={viewMode === 'stack'} onClick={() => changeMode('stack')} />
        <span className="vc-sep h" />
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

// 화면 맞춤: 지금 보고 있는 범위로 카메라를 되돌린다.
// 기류 · 히트맵 중이면 그 서버실 시점, 층을 골랐으면 그 층, 전체면 건물 전체
export function fitView() {
  const s = useView.getState();
  if (thermalOn(s)) return switchRoom(s.airRoom, true);
  if (s.floorFocus) return focusFloor(s.floorFocus);
  focusOverview();
}

export function CameraButtons() {
  return (
    <div className="vc-cam vc-bar col">
      <IconButton icon={Scan} label="화면에 맞춤 (선택한 층 기준)" onClick={fitView} />
      <span className="vc-sep h" />
      <IconButton icon={Plus} label="확대" onClick={() => useView.getState().zoomStep(1)} />
      <IconButton icon={Minus} label="축소" onClick={() => useView.getState().zoomStep(-1)} />
      <span className="vc-sep h" />
      <span className="vc-help">
        <InfoTip
          label="3D 조작 방법"
          text={
            <TipTable
              head={['조작', '동작']}
              rows={[
                ['드래그', '회전'],
                ['우클릭 드래그', '이동'],
                ['휠', '마우스가 가리키는 쪽으로 확대 · 축소'],
                ['더블클릭', '그 지점을 회전 중심으로'],
                ['클릭', '장비 선택 · 정보 보기'],
                ['화면 맞춤 버튼', '선택한 층(전체면 건물 전체)으로 카메라 되돌리기'],
              ]}
            />
          }
        />
      </span>
    </div>
  );
}
