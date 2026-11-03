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
import { deviceOf, useDevice } from './store/device';
import { MoreMenu } from './ui/MoreMenu';
import { Sheet, type SheetSnap } from './ui/Sheet';
import { startTour, TourCard } from './ui/Tour';
import { ScenarioClock } from './scenario/ScenarioPanel';
import { TraceBanner } from './ui/TraceBanner';
import { Toast } from './ui/Toast';
import { LeftPanel } from './ui/LeftPanel';
import { useView } from './store/useView';
import { IconButton } from './ui/kit';
import { CameraButtons, FloorBar } from './ui/ViewControls';
import { PueFloat } from './ui/MetricsPanel';

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
  // 휴대폰 · 태블릿은 3D를 가리지 않게 좌우 패널을 닫고 시작한다
  const [left, setLeft] = useState(() => deviceOf() === 'desktop');
  const [right, setRight] = useState(() => deviceOf() === 'desktop');
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
  const { device } = useDevice();
  const phone = device === 'phone';
  // 휴대폰은 오른쪽 패널 대신 바텀 시트. '오른쪽 패널을 연다'는 시트를 절반 높이로 올리는 것
  const [sheet, setSheet] = useState<SheetSnap>('peek');
  const openRight = useCallback(() => (phone ? setSheet((s) => (s === 'peek' ? 'half' : s)) : setRight(true)), [phone]);
  // 투어 카드는 왼쪽 패널에 있고, 단계가 오른쪽 정보 · 지표 탭을 함께 쓰므로 투어를 시작하면 양쪽 패널을 연다.
  // 휴대폰은 투어 카드가 바텀 시트에 들어가므로 시트만 올린다
  useEffect(() => {
    if (!touring) return;
    if (phone) setLeft(false);
    else setLeft(true);
    openRight();
  }, [touring, openRight, phone]);
  // 휴대폰: 왼쪽 서랍(탐색 · 표시)에서 장비 · 묶음을 고르면 서랍을 닫아 3D와 시트 요약이 보이게 (투어 중엔 투어 카드라 그대로)
  const selectedId = useView((s) => s.selectedId);
  const groupId = useView((s) => s.groupId);
  useEffect(() => {
    if (phone && !useView.getState().tourStep && (selectedId || groupId)) setLeft(false);
  }, [phone, selectedId, groupId]);
  const toggleThermal = () => (thermal ? exitThermal() : enterHeat(heatRoom(), true));
  const toggleDiagram = () => useView.getState().setDiagramMode(diagram === 'off' ? 'half' : 'off');
  const openScenario = () => {
    openRight();
    useView.getState().setRightTab('scenario');
  };
  const leftBtn = <IconButton icon={PanelLeft} label={left ? '왼쪽 패널 닫기' : '왼쪽 패널 열기'} active={left} onClick={() => setLeft((v) => !v)} />;
  const thermalBtn = (
    <button className={thermal ? 'on' : ''} aria-pressed={thermal} onClick={toggleThermal} title="서버실 온도 보기: 히트맵 · 에어 플로우 (하단에 2D 상면도)">
      <Thermometer size={15} /> 온도
    </button>
  );
  return (
    <div className={`app ${left ? '' : 'no-left'} ${right ? '' : 'no-right'}${touring ? ' touring' : ''}`}>
      {device === 'phone' ? (
        // 휴대폰: ☰ · 짧은 제목 · 검색 · 온도 · ⋯(도면 · 시나리오 · 가이드 투어). 오른쪽 패널은 바텀 시트
        <header className="topbar">
          {leftBtn}
          <h1>데이터센터 3D</h1>
          <div className="spacer" />
          <IconButton icon={Search} label="검색" onClick={() => setSearch(true)} />
          <div className="tb-group">{thermalBtn}</div>
          <MoreMenu
            items={[
              {
                icon: Workflow,
                label: diagram !== 'off' ? '도면 닫기' : '도면',
                on: diagram !== 'off',
                onSelect: toggleDiagram,
              },
              {
                icon: Siren,
                label: scenario ? '시나리오 재생 중' : '시나리오',
                on: scenario,
                onSelect: openScenario,
              },
              {
                icon: Compass,
                label: '가이드 투어',
                on: touring,
                onSelect: startTour,
              },
            ]}
          />
        </header>
      ) : (
        <header className="topbar">
          {leftBtn}
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
            {thermalBtn}
            <button
              className={diagram !== 'off' ? 'on' : ''}
              aria-pressed={diagram !== 'off'}
              onClick={toggleDiagram}
              title="하단 도면: 전력 단선도 · 공조 흐름도 (온도 보기 중에는 2D 상면도)"
            >
              <Workflow size={15} /> 도면
            </button>
          </div>
          <span className="tb-sep" />
          <span className="tb-cap">학습</span>
          <div className="tb-group learn" role="group" aria-label="학습">
            <button className={`tb-btn${scenario ? ' on' : ''}`} onClick={openScenario} title="사고 시나리오 목록 · 재생 화면">
              <Siren size={15} /> {scenario ? '시나리오 재생 중' : '시나리오'}
            </button>
            <button className={`tb-btn primary tour-btn${touring ? ' on' : ''}`} onClick={startTour} title="전력 · 공조 흐름을 단계별로 따라가는 안내">
              <Compass size={15} /> 가이드 투어
            </button>
          </div>
          <IconButton icon={PanelRight} label={right ? '정보 패널 닫기' : '정보 패널 열기'} active={right} onClick={() => setRight((v) => !v)} />
        </header>
      )}
      {search && <SearchPalette onClose={() => setSearch(false)} />}
      {left && <LeftPanel />}
      {/* 휴대폰: 도면은 3D와 나눠 보지 않고 전체 화면으로. 온도 보기의 2D 상면도는 바텀 시트 탭에 있으므로 아래 도면을 띄우지 않는다 */}
      <main className={`viewport diagram-${phone ? (thermal || diagram === 'off' ? 'off' : 'full') : diagram}`}>
        <div
          className="view3d"
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
          {/* 휴대폰은 시트 요약 줄에 PUE가 보인다 */}
          {!phone && <PueFloat />}
          <FloorBar />
          <CameraButtons />
        </div>
        {!(phone && thermal) && <DiagramPanel />}
      </main>
      {phone ? (
        <Sheet snap={sheet} onSnap={setSheet}>
          {touring ? <TourCard /> : <InfoPanel inSheet />}
        </Sheet>
      ) : (
        right && <InfoPanel />
      )}
      <ScenarioClock />
    </div>
  );
}
