import { useCallback, useEffect, useState } from 'react';
import { DiagramPanel } from './diagram/DiagramPanel';
import { Building2, Compass, PanelLeft, PanelRight, Search, Siren, Thermometer, Workflow } from 'lucide-react';
import { enterHeat, exitThermal } from './scene/focus';
import { AIR_LAYOUT, type RoomLabel } from './data/thermal';
import { htmlPortal } from './scene/htmlPortal';
import { LabelOverlay } from './scene/HoverLabel';
import { Scene } from './scene/Scene';
import { InfoPanel } from './ui/InfoPanel';
import { SupplyCard, ThermalPanel } from './ui/ThermalPanel';
import { SearchPalette, useSearchHotkey } from './ui/SearchPalette';
import { applyHash } from './store/persist';
import { startTour, TourCard } from './ui/Tour';
import { ScenarioClock } from './scenario/ScenarioPanel';
import { TraceBanner } from './ui/TraceBanner';
import { Toast } from './ui/Toast';
import { LeftPanel } from './ui/LeftPanel';
import { useView } from './store/useView';
import { IconButton } from './ui/kit';
import { CameraButtons, FloorBar } from './ui/ViewControls';

// 히트맵을 켤 서버실: 공조 시나리오가 재생 중이면 그 서버실, 아니면 지금 보고 있는 층의 서버실, 아니면 마지막으로 본 서버실
function heatRoom(): RoomLabel {
  const s = useView.getState();
  const sc = s.scenario;
  if (sc?.id === 'cracFail') return sc.params.room;
  if (sc?.id === 'leak') return 'B';
  const here = (Object.keys(AIR_LAYOUT) as RoomLabel[]).find((r) => AIR_LAYOUT[r].floor === s.floorFocus);
  if (!here && s.floorFocus) s.showToast(`${s.floorFocus}에는 서버실이 없어 서버실 ${s.airRoom}(${AIR_LAYOUT[s.airRoom].floor})의 온도를 보여 줍니다.`);
  return here ?? s.airRoom;
}

export function App() {
  const [left, setLeft] = useState(true);
  const [right, setRight] = useState(true);
  const [search, setSearch] = useState(false);
  const openSearch = useCallback(() => setSearch(true), []);
  useSearchHotkey(openSearch);
  // 주소(#)에 담긴 장면 열기: 3D 영역 크기가 잡힌 뒤에. 백그라운드 탭에서 열려도 실행되도록 프레임 대신 타이머
  useEffect(() => {
    const id = setTimeout(applyHash, 0);
    return () => clearTimeout(id);
  }, []);
  const diagram = useView((s) => s.diagramMode);
  const thermal = useView((s) => s.airOn || s.heatOn);
  const touring = useView((s) => s.tourStep != null);
  const scenario = useView((s) => !!s.scenario);
  // 투어 단계가 오른쪽 정보 · 지표 탭을 함께 쓰므로 투어를 시작하면 패널을 연다
  useEffect(() => {
    if (touring) setRight(true);
  }, [touring]);
  return (
    <div className={`app ${left ? '' : 'no-left'} ${right ? '' : 'no-right'}`}>
      <header className="topbar">
        <IconButton icon={PanelLeft} label={left ? '왼쪽 패널 닫기' : '왼쪽 패널 열기'} active={left} onClick={() => setLeft((v) => !v)} />
        <span className="tb-logo">
          <Building2 size={16} />
        </span>
        <h1>데이터센터 3D 시뮬레이터</h1>
        <span className="stage">v0.9</span>
        <div className="spacer" />
        <button className="tb-search" onClick={() => setSearch(true)} title="장비 · 랙 · 고객사 · 계통 · 층 · 시나리오 검색">
          <Search size={14} />
          <span>검색</span>
          <kbd>⌘K</kbd>
        </button>
        {/* 상단 바 영역: 검색 │ 보기(화면 전환 켜기 · 끄기) │ 학습(시나리오 · 가이드 투어) */}
        <span className="tb-cap">보기</span>
        <div className="tb-group" role="group" aria-label="보기">
          <button
            className={thermal ? 'on' : ''}
            aria-pressed={thermal}
            onClick={() => (thermal ? exitThermal() : enterHeat(heatRoom(), true))}
            title="서버실 온도 보기: 히트맵 · 에어 플로우 (하단에 2D 상면도)"
          >
            <Thermometer size={15} /> 온도
          </button>
          <button
            className={diagram !== 'off' ? 'on' : ''}
            aria-pressed={diagram !== 'off'}
            onClick={() => useView.getState().setDiagramMode(diagram === 'off' ? 'half' : 'off')}
            title="하단 도면: 전력 단선도 · 공조 흐름도 (온도 보기 중에는 2D 상면도)"
          >
            <Workflow size={15} /> 도면
          </button>
        </div>
        <span className="tb-sep" />
        <span className="tb-cap">학습</span>
        <div className="tb-group learn" role="group" aria-label="학습">
          <button
            className={`tb-btn${scenario ? ' on' : ''}`}
            onClick={() => {
              setRight(true);
              useView.getState().setRightTab('scenario');
            }}
            title="사고 시나리오 목록 · 재생 화면"
          >
            <Siren size={15} /> {scenario ? '시나리오 재생 중' : '시나리오'}
          </button>
          <button className={`tb-btn primary tour-btn${touring ? ' on' : ''}`} onClick={startTour} title="전력 · 공조 흐름을 단계별로 따라가는 안내">
            <Compass size={15} /> 가이드 투어
          </button>
        </div>
        <IconButton icon={PanelRight} label={right ? '정보 패널 닫기' : '정보 패널 열기'} active={right} onClick={() => setRight((v) => !v)} />
      </header>
      {search && <SearchPalette onClose={() => setSearch(false)} />}
      {left && <LeftPanel />}
      <main className={`viewport diagram-${diagram}`}>
        <div
          className={`view3d${touring ? ' touring' : ''}`}
          ref={(el) => {
            if (el) htmlPortal.current = el;
          }}
        >
          <Scene />
          <LabelOverlay />
          <TraceBanner />
          <Toast />
          <ThermalPanel />
          <SupplyCard />
          <TourCard />
          <FloorBar />
          <CameraButtons />
        </div>
        <DiagramPanel />
      </main>
      {right && <InfoPanel />}
      <ScenarioClock />
    </div>
  );
}
