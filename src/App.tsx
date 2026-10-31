import { useEffect, useState } from 'react';
import { DiagramPanel } from './diagram/DiagramPanel';
import { Building2, Compass, PanelLeft, PanelRight, Siren, Wind, Workflow } from 'lucide-react';
import { enterAir, exitAir } from './scene/focus';
import { htmlPortal } from './scene/htmlPortal';
import { LabelOverlay } from './scene/HoverLabel';
import { Scene } from './scene/Scene';
import { InfoPanel } from './ui/InfoPanel';
import { AirPanel } from './ui/AirPanel';
import { startTour } from './ui/Tour';
import { ScenarioClock } from './scenario/ScenarioPanel';
import { TraceBanner } from './ui/TraceBanner';
import { LeftPanel } from './ui/LeftPanel';
import { useView } from './store/useView';
import { IconButton } from './ui/kit';
import { CameraButtons, FloorBar } from './ui/ViewControls';

export function App() {
  const [left, setLeft] = useState(true);
  const [right, setRight] = useState(true);
  const diagram = useView((s) => s.diagramMode);
  const airOn = useView((s) => s.airOn);
  const touring = useView((s) => s.tourStep != null);
  const scenario = useView((s) => !!s.scenario);
  // 투어 안내는 오른쪽 패널에 붙으므로 투어를 시작하면 패널을 연다
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
        <div className="tb-group" role="group" aria-label="보조 화면">
          <button className={airOn ? 'on' : ''} onClick={() => (airOn ? exitAir() : enterAir(useView.getState().airRoom))} title="서버실 기류 · 온도">
            <Wind size={15} /> 기류
          </button>
          <button
            className={diagram !== 'off' ? 'on' : ''}
            onClick={() => useView.getState().setDiagramMode(diagram === 'off' ? 'half' : 'off')}
            title="전력 흐름도 · 공조 흐름도"
          >
            <Workflow size={15} /> 흐름도
          </button>
        </div>
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
        <IconButton icon={PanelRight} label={right ? '정보 패널 닫기' : '정보 패널 열기'} active={right} onClick={() => setRight((v) => !v)} />
      </header>
      {left && <LeftPanel />}
      <main className={`viewport diagram-${diagram}`}>
        <div
          className="view3d"
          ref={(el) => {
            if (el) htmlPortal.current = el;
          }}
        >
          <Scene />
          <LabelOverlay />
          <TraceBanner />
          <AirPanel />
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
