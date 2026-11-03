// 태블릿 현장 모드 화면 틀 (docs/research/03-mobile-responsive.md §12): 들고 다니며 3D로 장비를 찾아가는 화면.
//   상단: 현장 표시 · 장비 · 랙 찾기 · [학습 모드]
//   가로: 3D(약 70%) + 오른쪽 길 안내 패널, 세로: 위 3D + 아래 길 안내 패널
//   3D 아래 왼쪽 모서리에 엄지 버튼 줄(층 · 화면 맞춤). 두 손으로 잡았을 때 엄지가 닿는 자리
//   3D는 층 하나만 보이게 한다 (현장에서는 지금 있는 층 · 가려는 층만 보면 된다)

import { useCallback, useEffect, useState } from 'react';
import { Eye, GraduationCap, LocateFixed, Map as MapIcon, MapPin, Printer, Scan, Search } from 'lucide-react';
import { FLOORS, type FloorId } from '../../data/building';
import { exitThermal, focusFloor, goFloor } from '../../scene/focus';
import { htmlPortal } from '../../scene/htmlPortal';
import { LabelOverlay } from '../../scene/HoverLabel';
import { Scene } from '../../scene/Scene';
import { setMode } from '../../store/device';
import { applyHash, sceneHash } from '../../store/persist';
import { useView } from '../../store/useView';
import { SearchPalette, useSearchHotkey } from '../SearchPalette';
import { Toast } from '../Toast';
import { FieldPanel } from './FieldPanel';
import { useWakeLock } from './useWakeLock';
import { isAimGoal, reaim, setHere, setView } from './guide';
import { nodeInfo } from '../../data/graph';

// 현장 모드 첫 층: 정해진 층이 없으면 1층(출입 · 코어에서 출발)
const START_FLOOR: FloorId = '1F';

// 화면 맞춤: 길 안내 중이면 지금 단계 시점으로, 아니면 지금 층
function fit() {
  if (!reaim()) focusFloor(useView.getState().floorFocus ?? START_FLOOR);
}

export function FieldLayout() {
  const [search, setSearch] = useState(false);
  useSearchHotkey(useCallback(() => setSearch(true), []));
  // 길 안내 중에는 화면이 꺼지지 않게
  useWakeLock(useView((s) => !!s.fieldGuide));
  // 현장 모드에는 온도 카드 · 도면이 없으므로 끄고, 주소(#here= · sel= · floor=)의 장면을 열거나 층 하나를 보여 준다.
  // 주소를 먼저 읽어 둔다: 아래에서 층을 바꾸면 주소가 그 층으로 다시 쓰이기 때문 (QR 라벨 주소를 잃지 않게)
  useEffect(() => {
    const s = useView.getState();
    const hash = location.hash.slice(1);
    exitThermal(false);
    if (s.diagramMode !== 'off') s.setDiagramMode('off');
    if (hash) {
      history.replaceState(null, '', `${location.pathname}${location.search}#${hash}`);
      const id = setTimeout(() => {
        applyHash();
        // 주소의 장비가 층을 정하지 않는 곳(옥상 등)이면 그 장비 층만 고른다 (카메라는 그 장비에 둔 채)
        const v = useView.getState();
        if (!v.floorFocus) {
          const f = v.selectedId ? nodeInfo(v.selectedId)?.floor : null;
          if (f) v.setFloorFocus(f);
          else focusFloor(START_FLOOR);
        }
      }, 0);
      return () => clearTimeout(id);
    }
    focusFloor(s.floorFocus ?? START_FLOOR);
  }, []);
  // 눈높이는 길 안내가 보낸 시점에서만: 층 버튼 · 검색이 카메라를 옮기면 위에서 보기로 돌아간다.
  // 학습 모드로 나갈 때도 위에서 보기로 (학습 화면 카메라에 눈높이 설정이 남지 않게)
  useEffect(() => {
    const off = useView.subscribe((s, p) => {
      if (s.cameraGoal !== p.cameraGoal && s.fieldView === 'eye' && !isAimGoal(s.cameraGoal?.key)) s.setFieldView('plan');
    });
    return () => {
      off();
      useView.getState().setFieldView('plan');
      // 학습 모드로 나가면 주소에서 현장 모드 내 위치를 뺀다 (학습 모드 링크에 섞이지 않게)
      history.replaceState(null, '', `${location.pathname}${location.search}${sceneHash()}`);
    };
  }, []);
  // 같은 탭에서 다른 QR 주소(# 뒤만 다름)로 옮기면 페이지를 다시 열지 않으므로 내 위치만 다시 읽는다
  useEffect(() => {
    const onHash = () => {
      const p = new URLSearchParams(location.hash.slice(1));
      const here = p.get('here');
      const face = p.get('face');
      if (here && here !== useView.getState().fieldHere?.place) setHere(here, face === 'N' || face === 'S' || face === 'E' || face === 'W' ? face : undefined, 'link');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
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
        <button className="field-mode" onClick={() => window.open(`${location.pathname}?labels`, '_blank')} title="QR 라벨 인쇄 페이지 (장소마다 QR · 붙일 곳)">
          <Printer size={18} /> 라벨 인쇄
        </button>
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

// 왼쪽 엄지 줄: 층 버튼(아래층이 왼쪽) · 내 위치 정하기 · 화면 맞춤, 길 안내 중(또는 내 위치가 있으면) 시점(위에서 · 눈높이)
function ThumbBar() {
  const focus = useView((s) => s.floorFocus);
  const guiding = useView((s) => !!s.fieldGuide || !!s.fieldHere);
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
      <button onClick={() => useView.getState().setFieldPick(true)} aria-label="내 위치 정하기" title="내 위치 정하기 (층 · 실 · 열 고르기)">
        <LocateFixed size={22} />
      </button>
      <button onClick={fit} aria-label="화면 맞춤" title="화면 맞춤 (길 안내 중이면 지금 단계)">
        <Scan size={20} />
      </button>
    </div>
  );
}
