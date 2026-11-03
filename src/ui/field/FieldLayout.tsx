// 태블릿 현장 모드 화면 틀 (docs/research/03-mobile-responsive.md §12): 들고 다니며 3D로 장비를 찾아가는 화면.
//   상단: 현장 표시 · 장비 · 랙 찾기 · [학습 모드]
//   가로: 3D(약 70%) + 오른쪽 길 안내 패널, 세로: 위 3D + 아래 길 안내 패널
//   3D 아래 왼쪽 모서리에 엄지 버튼 줄(층 · 화면 맞춤). 두 손으로 잡았을 때 엄지가 닿는 자리
//   3D는 층 하나만 보이게 한다 (현장에서는 지금 있는 층 · 가려는 층만 보면 된다)

import { useCallback, useEffect, useState } from 'react';
import { Eye, GraduationCap, Map as MapIcon, MapPin, Scan, Search } from 'lucide-react';
import { FLOORS, type FloorId } from '../../data/building';
import { exitThermal, focusFloor, goFloor } from '../../scene/focus';
import { htmlPortal } from '../../scene/htmlPortal';
import { LabelOverlay } from '../../scene/HoverLabel';
import { Scene } from '../../scene/Scene';
import { setMode } from '../../store/device';
import { useView } from '../../store/useView';
import { SearchPalette, useSearchHotkey } from '../SearchPalette';
import { Toast } from '../Toast';
import { FieldPanel } from './FieldPanel';
import { setView, showStep } from './guide';

// 현장 모드 첫 층: 정해진 층이 없으면 1층(출입 · 코어에서 출발)
const START_FLOOR: FloorId = '1F';

// 화면 맞춤: 길 안내 중이면 지금 단계 시점으로, 아니면 지금 층
function fit() {
  const s = useView.getState();
  if (s.fieldGuide) showStep(s.fieldGuide.step);
  else focusFloor(s.floorFocus ?? START_FLOOR);
}

export function FieldLayout() {
  const [search, setSearch] = useState(false);
  useSearchHotkey(useCallback(() => setSearch(true), []));
  // 현장 모드에는 온도 카드 · 도면이 없으므로 끄고, 층 하나를 보여 준다
  useEffect(() => {
    const s = useView.getState();
    exitThermal(false);
    if (s.diagramMode !== 'off') s.setDiagramMode('off');
    focusFloor(s.floorFocus ?? START_FLOOR);
  }, []);
  return (
    <div className="field-app">
      <header className="topbar field-top">
        <span className="field-badge">
          <MapPin size={16} /> 현장
        </span>
        <button className="field-search" onClick={() => setSearch(true)}>
          <Search size={18} />
          <span>장비 · 랙 찾기</span>
        </button>
        <div className="spacer" />
        <button className="field-mode" onClick={() => setMode('learn')} title="학습 모드: 온도 보기 · 도면 · 시나리오 · 가이드 투어가 있는 전체 화면">
          <GraduationCap size={18} /> 학습 모드
        </button>
      </header>
      <main className="viewport field-view">
        <div
          className="view3d"
          ref={(el) => {
            if (el) htmlPortal.current = el;
          }}
        >
          <Scene />
          <LabelOverlay />
          <Toast />
          <ThumbBar />
        </div>
      </main>
      <FieldPanel onSearch={() => setSearch(true)} />
      {search && <SearchPalette onClose={() => setSearch(false)} />}
    </div>
  );
}

// 왼쪽 엄지 줄: 층 버튼(아래층이 왼쪽) · 화면 맞춤, 길 안내 중이면 시점(위에서 · 눈높이)
function ThumbBar() {
  const focus = useView((s) => s.floorFocus);
  const guiding = useView((s) => !!s.fieldGuide);
  const view = useView((s) => s.fieldView);
  return (
    <div className="thumb-bar" role="group" aria-label="층 이동 · 시점">
      {guiding && (
        <>
          <button className={view === 'plan' ? 'on' : ''} onClick={() => setView('plan')} aria-label="위에서 보기" title="위에서 보기 (내 위치 가운데)">
            <MapIcon size={22} />
          </button>
          <button className={view === 'eye' ? 'on' : ''} onClick={() => setView('eye')} aria-label="눈높이로 보기" title="눈높이로 보기 (그 자리에서 둘러보기)">
            <Eye size={22} />
          </button>
          <span className="thumb-sep" />
        </>
      )}
      {FLOORS.map((f) => (
        <button key={f.id} className={focus === f.id ? 'on' : ''} onClick={() => goFloor(f.id)} title={`${f.name} · ${f.summary}`}>
          {f.id}
        </button>
      ))}
      <span className="thumb-sep" />
      <button onClick={fit} aria-label="화면 맞춤" title="화면 맞춤 (길 안내 중이면 지금 단계)">
        <Scan size={20} />
      </button>
    </div>
  );
}
