// 3D 화면 위에 떠 있는 조작: 왼쪽 세로 막대 층 이동 · 보기 방식(위층이 위), 오른쪽 위 화면 맞춤 · 확대 · 축소 · 조작 안내
// 휴대폰: 층 막대는 층 버튼만 남기고, 보기 방식 · 링크 · 확대 · 축소는 카메라 막대 ⋯ 메뉴로 (3D 가운데를 넓게)

import { FoldVertical, House, Link2, Minus, Plus, Scan, UnfoldVertical } from 'lucide-react';
import { useDevice } from '../store/device';
import { MoreMenu } from './MoreMenu';
import { FLOORS, SR_BY_LABEL, type FloorId } from '../data/building';
import { AIR_LAYOUT, type RoomLabel } from '../data/thermal';
import { exitThermal, focusFloor, focusOverview, goFloor, goOverview, startTrace, switchRoom, thermalOn } from '../scene/focus';
import { INITIAL_VIEW, useView } from '../store/useView';
import { stopScenario } from '../scenario/ScenarioPanel';
import { endTour } from './Tour';
import { sceneHash } from '../store/persist';
import { IconButton, InfoTip, TipTable } from './kit';

function changeMode(m: 'stack' | 'explode') {
  useView.getState().setViewMode(m);
  // 모드 전환 후 카메라 재배치 (기류 보기 중이면 기류 시점 유지)
  requestAnimationFrame(fitView);
}

export function FloorBar() {
  const focus = useView((s) => s.floorFocus);
  const viewMode = useView((s) => s.viewMode);
  const thermal = useView((s) => s.airOn || s.heatOn);
  const floorSet = useView((s) => s.floorSet);
  const phone = useDevice().device === 'phone';
  return (
    <div className="vc-floors">
      <div className="vc-bar col">
        {!phone && (
          <>
            <IconButton icon={UnfoldVertical} label="층 벌려 보기" active={viewMode === 'explode'} onClick={() => changeMode('explode')} />
            <IconButton icon={FoldVertical} label="겹쳐 보기" active={viewMode === 'stack'} onClick={() => changeMode('stack')} />
            <span className="vc-sep h" />
          </>
        )}
        <button className={`vc-floor${!focus && !floorSet ? ' on' : ''}${thermal ? ' dim' : ''}`} onClick={goOverview} title={thermal ? '온도 보기를 끄고 건물 전체 보기' : '건물 전체 보기'}>
          전체
        </button>
        {[...FLOORS].reverse().map((f) => {
          // 온도 보기 중: 서버실 층은 그 서버실 온도로 전환, 다른 층은 흐리게(누르면 온도 보기를 끄고 이동)
          const room = thermal ? (Object.keys(AIR_LAYOUT) as RoomLabel[]).find((r) => AIR_LAYOUT[r].floor === f.id) : undefined;
          const title = !thermal ? `${f.name} · ${f.summary}` : room ? `서버실 ${room} 온도 보기 · ${SR_BY_LABEL[room].coolName}` : `${f.name} · 온도 보기를 끄고 이동`;
          return (
            <button key={f.id} className={`vc-floor${focus === f.id || floorSet?.includes(f.id as FloorId) ? ' on' : ''}${thermal && !room ? ' dim' : ''}`} onClick={() => goFloor(f.id as FloorId)} title={title}>
              {f.id}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 처음 화면으로: 보기 설정 · 층 · 레이어 · 선택 · 온도 보기 · 도면 · 시나리오 · 투어를 모두 처음 상태로 되돌린다
const RESET_KEYS = [
  'layers',
  'linkFilter',
  'rackColor',
  'viewMode',
  'airCfg',
  'therm',
  'itLoad',
  'outdoorT',
  'heatHeight',
  'heatValue',
  'heatOpacity',
  'heatHotOnly',
  'airRoom',
  'floorFocus',
  'diagramMode',
  'diagramTab',
  'rightTab',
  'traceCross',
  'fieldGuide',
  'fieldHere',
  'fieldView',
  'fieldPick',
] as const;
function resetAll() {
  const s = useView.getState();
  if (s.tourStep != null) endTour();
  if (s.scenario) stopScenario();
  exitThermal(false);
  startTrace(null);
  s.setGroup(null);
  s.select(null);
  s.hover(null);
  useView.setState(Object.fromEntries(RESET_KEYS.map((k) => [k, INITIAL_VIEW[k]])));
  focusOverview();
  s.showToast('처음 화면으로 되돌렸습니다. 보기 설정 · 층 · 레이어 · 선택이 모두 처음 상태입니다.');
}

// 화면 맞춤: 지금 보고 있는 범위로 카메라를 되돌린다.
// 기류 · 히트맵 중이면 그 서버실 시점, 층을 골랐으면 그 층, 전체면 건물 전체
export function fitView() {
  const s = useView.getState();
  if (thermalOn(s)) return switchRoom(s.airRoom, true);
  if (s.floorFocus) return focusFloor(s.floorFocus);
  focusOverview();
}

// 지금 장면(층 · 선택 · 온도 보기 · 도면)을 담은 주소를 복사
function copySceneLink() {
  const url = `${location.origin}${location.pathname}${location.search}${sceneHash()}`;
  const done = () => useView.getState().showToast('지금 장면 링크를 복사했습니다. 이 주소를 열면 같은 층 · 선택 · 보기로 시작합니다.');
  navigator.clipboard?.writeText(url).then(done, () => useView.getState().showToast(`복사하지 못했습니다. 주소창의 주소를 직접 복사해 주세요.`));
}

// 휴대폰 조작 안내 (손가락)
const TOUCH_HELP = [
  ['한 손가락 끌기', '회전'],
  ['두 손가락 벌리기 · 오므리기', '확대 · 축소'],
  ['두 손가락 끌기', '이동'],
  ['더블탭', '그 지점을 회전 중심으로'],
  ['탭', '선택만 · 아래 요약 줄이 바뀜 (카메라는 그대로)'],
  ['길게 누르기', '마우스를 올린 것처럼 이름 · 온도 보기'],
  ['아래 요약 줄 탭 · 끌기', '정보 · 지표 · 주의 · 시나리오 펼치기'],
  ['홈 버튼', '처음 화면으로: 보기 설정 · 층 · 레이어 · 선택 · 온도 보기 · 도면 · 시나리오를 모두 초기화'],
  ['화면 맞춤 버튼', '선택한 층(전체면 건물 전체)으로 카메라 되돌리기'],
  ['⋯ 버튼', '층 벌려 보기 · 겹쳐 보기, 링크 복사, 확대 · 축소'],
];

export function CameraButtons() {
  const phone = useDevice().device === 'phone';
  const viewMode = useView((s) => s.viewMode);
  if (phone)
    return (
      <div className="vc-cam vc-bar col">
        <IconButton icon={House} label="처음 화면으로 (보기 설정 · 층 · 레이어 모두 초기화)" onClick={resetAll} />
        <IconButton icon={Scan} label="화면에 맞춤 (선택한 층 기준)" onClick={fitView} />
        <MoreMenu
          label="3D 보기 메뉴"
          items={[
            viewMode === 'explode'
              ? { icon: FoldVertical, label: '겹쳐 보기', onSelect: () => changeMode('stack') }
              : { icon: UnfoldVertical, label: '층 벌려 보기', onSelect: () => changeMode('explode') },
            { icon: Link2, label: '지금 장면 링크 복사', onSelect: copySceneLink },
            { icon: Plus, label: '확대', onSelect: () => useView.getState().zoomStep(1) },
            { icon: Minus, label: '축소', onSelect: () => useView.getState().zoomStep(-1) },
          ]}
        />
        <span className="vc-help">
          <InfoTip label="3D 조작 방법" text={<TipTable head={['조작', '동작']} rows={TOUCH_HELP} />} />
        </span>
      </div>
    );
  return (
    <div className="vc-cam vc-bar col">
      <IconButton icon={House} label="처음 화면으로 (보기 설정 · 층 · 레이어 모두 초기화)" onClick={resetAll} />
      <span className="vc-sep h" />
      <IconButton icon={Scan} label="화면에 맞춤 (선택한 층 기준)" onClick={fitView} />
      <span className="vc-sep h" />
      <IconButton icon={Link2} label="지금 장면 링크 복사" onClick={copySceneLink} />
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
                ['클릭 (3D · 2D 화면)', '선택만 · 정보 카드 열기 (카메라는 그대로)'],
                ['목록 · 표 · 도면에서 고르기', '선택하고 3D 카메라를 그 자리로 이동'],
                ['정보 카드의 ⌖ · 2D 랙 더블클릭', '선택한 장비 · 랙으로 카메라 이동'],
                ['홈 버튼', '처음 화면으로: 보기 설정 · 층 · 레이어 · 선택 · 온도 보기 · 도면 · 시나리오를 모두 초기화'],
                ['화면 맞춤 버튼', '선택한 층(전체면 건물 전체)으로 카메라 되돌리기'],
                ['⌘K / Ctrl+K', '전체 검색'],
                ['링크 버튼', '지금 장면(층 · 선택 · 온도 보기 · 도면) 주소 복사'],
              ]}
            />
          }
        />
      </span>
    </div>
  );
}
