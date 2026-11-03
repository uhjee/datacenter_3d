// 가이드 투어 (docs/PLAN.md §7): 전기가 한전에서 랙까지, 열이 랙에서 옥상까지 가는 길을 단계별로 따라간다.
// 각 단계는 기존 기능(장비 선택 · 추적 · 계통 묶음 · 온도 보기 · 고객사 · 지표)을 그대로 불러 쓴다.
// 카드는 3D 왼쪽 아래에 떠 있고, 단계마다 핵심 한 줄 + 흐름도 · 표 · 범례로 보여 준다 (긴 글 대신)

import { ChevronDown, ChevronUp, Compass, Hand, X } from 'lucide-react';
import { IconButton, Switch } from './kit';
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { FLOORS } from '../data/building';
import { ALLOWABLE_MAX, computeRoom, DEFAULT_AIR_BY_ROOM, RECOMMENDED, tempColor, type AirCfg, type RoomLabel } from '../data/thermal';
import { activateGroup, enterAir, enterHeat, exitThermal, focusFloor, focusItem, focusOverview, startTrace } from '../scene/focus';
import { useView, type PanelTab, type RackColorMode } from '../store/useView';

type Hue = 'power' | 'heat' | 'cool' | 'fire' | 'a' | 'b';

// 단계 본문을 이루는 시각 블록
type Block =
  | { k: 'flow'; label?: string; hue?: Hue; nodes: string[]; at?: number[]; note?: string } // 화살표로 잇는 흐름, at은 강조할 칸
  | { k: 'dual'; a: string[]; b: string[]; to: string; groups?: { a: string; b: string } } // A · B 두 줄이 하나로 모이는 그림 (2N). groups: 줄마다 켜고 끌 계통 묶음
  | { k: 'facts'; rows: [string, string][] } // 항목 : 값
  | { k: 'table'; head: string[]; rows: string[][]; col?: number } // col: 강조할 열
  | { k: 'legend'; items: ['solid' | 'dash' | 'chev', string][] } // 3D 선 모양 범례
  | { k: 'formula'; top: string; bottom: string; name: string }
  | { k: 'temps' } // 흡기 온도 구간 (색 · 기준)
  | { k: 'rooms' } // 세 서버실 비교 (기본 공조 조건으로 계산)
  | { k: 'floors' }; // 층별 구성

// 투어가 따라가는 두 길. 단계마다 지금 어디쯤인지 위에 띠로 보여 준다
const ROUTES = {
  power: { name: '전기의 길', hue: 'power', stops: ['한전', '변압', 'ATS', '발전기', 'UPS', '랙'] },
  heat: { name: '열의 길', hue: 'heat', stops: ['랙', '실내 기류', '항온항습기', '배관', '옥상', '대기'] },
} as const;

interface Step {
  title: string;
  place: string;
  route?: { line: keyof typeof ROUTES; at: number | 'all' };
  lead: string; // 이 단계의 핵심 한 문장
  blocks: Block[];
  points?: string[]; // 덧붙이는 짧은 설명
  try?: string; // 이 단계에서 직접 해 볼 것
  run: () => void;
}

// 단계마다 이전 단계의 강조를 지우고 시작
function clean() {
  const s = useView.getState();
  startTrace(null);
  s.setGroup(null);
  s.select(null);
  exitThermal(false);
  s.setRightTab('info');
  if (s.diagramMode === 'off') s.setDiagramMode('half');
}

const air = (room: RoomLabel, patch: Partial<AirCfg>) => useView.getState().setAirCfg(room, patch);
const restoreAir = () => saved && air('A', saved.airCfg.A);
const tab = (t: 'power' | 'cooling') => useView.getState().setDiagramTab(t);

export const STEPS: Step[] = [
  {
    title: '데이터센터 한 바퀴',
    place: '전체',
    lead: '전기가 들어오는 길과 열이 나가는 길, 두 가지를 따라갑니다.',
    blocks: [
      { k: 'flow', label: '① 전기', hue: 'power', nodes: ['한전', '변압', '무정전(UPS)', '랙'] },
      { k: 'flow', label: '② 열', hue: 'heat', nodes: ['랙', '항온항습기', '옥상', '대기'] },
      { k: 'floors' },
    ],
    points: ['3D와 아래 도면(단선도 · 공조 흐름도)이 같은 장비를 함께 강조합니다.'],
    run: () => {
      clean();
      tab('power');
      focusOverview();
    },
  },
  {
    title: '한전에서 전기를 받는 곳',
    place: 'B1 · 특고압 수전실',
    route: { line: 'power', at: 0 },
    lead: '한전의 22.9kV 특고압을 두 회선으로 받아, 특고압 수배전반 수전부에서 하나를 고릅니다.',
    blocks: [
      // 선택한 장비(수전부)를 강조: ALTS는 따로 있는 장비가 아니라 수전부 안의 절체 개폐기
      { k: 'flow', label: '평상시', hue: 'power', nodes: ['한전 본선', '수전부 (ALTS)', 'VCB → TR'], at: [1] },
      { k: 'flow', label: '본선 정전 시', hue: 'power', nodes: ['한전 예비선', '수전부 (ALTS)', 'VCB → TR'], at: [1], note: 'ALTS가 예비선 쪽으로 자동 절체' },
      {
        k: 'facts',
        rows: [
          ['받는 전압', '22.9kV (특고압)'],
          ['인입', '지중 케이블 2회선 (서로 다른 변전소)'],
          ['ALTS 위치', '특고압 수배전반 수전부 안'],
        ],
      },
      {
        k: 'legend',
        items: [
          ['solid', '평상시 쓰는 경로'],
          ['dash', '대기 경로 (평상시 안 씀)'],
        ],
      },
    ],
    run: () => {
      clean();
      tab('power');
      focusItem('hv-in'); // 받는 곳: 본선 · 예비선(점선)이 함께 보인다
    },
  },
  {
    title: '특고압 차단과 변압 (TR)',
    place: 'B1 · 특고압 수전실',
    route: { line: 'power', at: 1 },
    lead: 'VCB가 고장 전류를 끊고, TR이 서버가 쓰는 전압으로 낮춥니다.',
    blocks: [
      { k: 'flow', hue: 'power', nodes: ['22.9kV', 'VCB (차단)', 'TR (변압)', '380/220V'], at: [2] },
      {
        k: 'facts',
        rows: [
          ['이중화', '2N: TR-A · TR-B'],
          ['크기', '한 대가 전체 부하를 혼자 감당'],
        ],
      },
      { k: 'legend', items: [['chev', '흐름 방향 (보내는 곳 → 받는 곳)']] },
    ],
    points: ['3D에서 TR-A까지 오는 길이 굵게 흐릅니다 (상류 추적).'],
    run: () => {
      clean();
      tab('power');
      focusItem('tr-a');
      startTrace('up');
    },
  },
  {
    title: '저압 배전과 ATS',
    place: 'B1 · 저압 전기실',
    route: { line: 'power', at: 2 },
    lead: 'ATS가 상용 전원과 발전기 중 하나를 골라 내려보냅니다.',
    blocks: [
      {
        k: 'table',
        head: ['장비', '하는 일', '평상시'],
        rows: [
          ['연계 ACB', 'TR 한 대 정비 때 다른 TR이 A · B 양쪽 공급', '개방'],
          ['ATS', '상용 ↔ 발전기 선택 → UPS · 공조 동력반', '상용'],
        ],
      },
    ],
    try: '정보 카드의 "받는 곳 · 보내는 곳"에서 장비 이름을 누르면 그 장비로 이동합니다.',
    run: () => {
      clean();
      tab('power');
      focusItem('ats-a');
    },
  },
  {
    title: '정전이 나면: 비상 발전기',
    place: 'B1 · 발전기실',
    route: { line: 'power', at: 3 },
    lead: '한전 전원이 끊기면 발전기가 기동하고 ATS가 발전기 쪽으로 절체합니다.',
    blocks: [
      { k: 'flow', hue: 'power', nodes: ['정전', '발전기 기동', '발전기 모선', 'ATS 절체'], at: [1] },
      {
        k: 'facts',
        rows: [
          ['대수', '3대 (N+1)'],
          ['기동', '10초 이내'],
          ['연료', '약 40시간 (2대 정격 운전 기준)'],
        ],
      },
    ],
    points: ['"비상 전원" 계통 묶음을 켠 모습입니다.'],
    run: () => {
      clean();
      tab('power');
      activateGroup('emergency');
    },
  },
  {
    title: '끊김 없는 전원: UPS와 리튬이온 배터리',
    place: '2F · UPS실 · 배터리실',
    route: { line: 'power', at: 4 },
    lead: '발전기가 뜨기 전 비는 몇 초를 배터리가 메웁니다.',
    blocks: [
      { k: 'flow', hue: 'power', nodes: ['정전 순간', '배터리 (직류)', 'UPS (교류로)', '랙'], at: [1, 2], note: '발전기가 기동할 때까지 끊김 없이' },
      {
        k: 'facts',
        rows: [
          ['이중화', '서버실마다 UPS 한 쌍 (2N)'],
          ['UPS-A1 →', '서버실 A의 A계통 PDU · STS-1'],
          ['한 대 정지', '그 서버실만 반대쪽 한 대로 버팀'],
        ],
      },
    ],
    points: ['리튬이온 배터리 A1에서 UPS-A1을 거쳐 랙까지 내려가는 길을 하류 추적으로 보여 줍니다.'],
    run: () => {
      clean();
      tab('power');
      focusItem('bat-a1'); // 배터리 → UPS 선도 보이도록 배터리에서 하류 추적 (UPS에서 하류 추적하면 배터리 선은 상류라 빠진다)
      startTrace('down');
    },
  },
  {
    title: '같은 길이 하나 더: A계통 · B계통 (2N)',
    place: 'B1 → 2F → 3F ~ 5F',
    route: { line: 'power', at: 'all' },
    lead: '같은 길이 A · B 두 줄이라, 한쪽이 통째로 멈춰도 서버는 계속 돕니다.',
    blocks: [
      { k: 'dual', a: ['특고압반', 'TR-A', 'UPS-A', 'EPS-A', 'rPDU-A'], b: ['특고압반', 'TR-B', 'UPS-B', 'EPS-B', 'rPDU-B'], to: '랙 (rPDU-A · rPDU-B 두 전원으로 받음)', groups: { a: 'sys-A', b: 'sys-B' } },
    ],
    points: ['두 줄은 서로 다른 전기 샤프트(EPS-A · EPS-B)로 올라갑니다.'],
    try: '그림의 B계통 스위치(또는 왼쪽 "계통 묶음"의 B계통)를 켜서 반대쪽 길도 보세요.',
    run: () => {
      clean();
      tab('power');
      activateGroup('sys-A');
    },
  },
  {
    title: '랙 하나에서 거슬러 올라가기',
    place: '3F · 서버실 A',
    route: { line: 'power', at: 5 },
    lead: '랙에서 상류 추적을 하면 두 줄이 각각 한전까지 이어집니다.',
    blocks: [
      { k: 'flow', label: 'rPDU-A', hue: 'a', nodes: ['PDU-A1-n', 'UPS-A1', 'ATS-A', '…', '한전'] },
      { k: 'flow', label: 'rPDU-B', hue: 'b', nodes: ['B계통 같은 순서', '…', '한전'] },
      { k: 'legend', items: [['dash', '발전기 · 예비선 · 연계반 = 대기 경로']] },
    ],
    try: '아무 장비나 고르고 정보 카드에서 "상류 추적 · 하류 추적"을 눌러 보세요.',
    run: () => {
      clean();
      tab('power');
      focusItem('rack:A-2-05');
      startTrace('up');
    },
  },
  {
    title: '이제 열의 길: 서버실 A 기류',
    place: '3F · 서버실 A (수냉식)',
    route: { line: 'heat', at: 1 },
    lead: '찬 공기는 바닥 아래로, 더운 공기는 천장으로. 열복도를 막아 둘이 섞이지 않습니다.',
    blocks: [
      {
        k: 'flow',
        hue: 'cool',
        nodes: ['항온항습기', '이중마루 아래', '냉복도 타공판', '랙 앞 (흡기)'],
        note: '냉복도: 포드 사이 · 바깥 통로',
      },
      { k: 'flow', hue: 'heat', nodes: ['랙 뒤 (+10~15°C)', '열복도 (봉쇄)', '천장 리턴', '항온항습기'], note: '열복도를 굴뚝 삼아 위로' },
      { k: 'facts', rows: [['봉쇄 방식', '열복도 봉쇄 (HAC)']] },
    ],
    points: ['3D 점의 색이 공기 온도입니다 (파랑 → 노랑 → 빨강).'],
    run: () => {
      clean();
      air('A', { containment: 'HAC', blanking: true });
      enterAir('A');
    },
  },
  {
    title: '봉쇄를 없애면?',
    place: '3F · 서버실 A (수냉식)',
    route: { line: 'heat', at: 1 },
    lead: '봉쇄 · 블랭킹을 없애면 더운 공기가 다시 흡기되고 찬 공기는 새어 나갑니다.',
    blocks: [
      {
        k: 'table',
        head: ['', '봉쇄 있음', '지금 (없음)'],
        col: 2,
        rows: [
          ['열복도 봉쇄', 'HAC', '없음'],
          ['블랭킹 패널', '있음', '없음'],
          ['재순환 (열기를 다시 흡기)', '거의 없음', '생김'],
          ['바이패스 (랙을 안 거친 냉기)', '적음', '늘어남'],
        ],
      },
      { k: 'temps' },
    ],
    points: ['노랑 · 빨강으로 바뀐 랙이 권장 흡기 온도를 넘은 랙입니다. 왼쪽 위 온도 카드 요약도 함께 바뀝니다.'],
    try: '온도 카드 [공조 조건]에서 컨테인먼트 · 블랭킹을, 오른쪽 아래 급기 · 수치 카드에서 급기 온도를 바꿔 보세요.',
    run: () => {
      air('A', { containment: 'none', blanking: false });
      enterAir('A');
    },
  },
  {
    title: '온도를 한눈에: 히트맵과 2D 상면도',
    place: '4F · 서버실 B (수냉식 · 공냉식)',
    route: { line: 'heat', at: 1 },
    lead: '상단 [온도]를 켜면 바닥에 온도 분포가 깔리고, 아래에 2D 상면도가 열립니다.',
    blocks: [
      {
        k: 'facts',
        rows: [
          ['히트맵', '고른 높이(하 · 중 · 상)의 공기 온도'],
          ['2D 랙 칸', '색 · 숫자 = 그 랙의 흡기 온도'],
          ['핫스팟 목록', '권장 상한을 넘은 랙'],
        ],
      },
      { k: 'temps' },
    ],
    points: ['판정은 랙 흡기 기준입니다. 열복도가 빨간 것은 정상 배기입니다.', '서버실 B는 봉쇄가 없어 열복도 공기가 랙 위와 열 끝으로 넘어옵니다.'],
    try: '2D 상면도의 [비교]로 봉쇄 방식을 바꿨을 때 온도를 나란히 보세요.',
    run: () => {
      clean();
      restoreAir();
      enterHeat('B');
    },
  },
  {
    title: '이중마루도 봉쇄도 없으면: 서버실 C',
    place: '5F · 서버실 C (공냉식 전면 토출)',
    route: { line: 'heat', at: 1 },
    lead: '찬 공기가 방을 건너는 동안 배기와 섞여, 같은 급기 20°C에도 흡기가 가장 높습니다.',
    blocks: [{ k: 'rooms' }],
    points: ['서버실 C는 벽면 항온항습기가 정면으로 바람을 불고, 멀리 있는 서쪽 랙 · 랙 위쪽이 가장 덥습니다.'],
    try: '오른쪽 지표 탭의 [비교]에서 세 서버실의 냉각 전력 ÷ IT를 비교해 보세요.',
    run: () => {
      clean();
      restoreAir();
      enterHeat('C');
    },
  },
  {
    title: '공냉식: 냉매 배관으로 옥상까지',
    place: '4F · 5F → 옥상',
    route: { line: 'heat', at: 3 },
    lead: '공냉식 항온항습기는 빼앗은 열을 냉매 배관으로 옥상 실외기에 보냅니다.',
    blocks: [
      { k: 'flow', hue: 'heat', nodes: ['항온항습기 (압축기 내장)', '냉매 배관', '옥상 실외기', '대기'], at: [1] },
      {
        k: 'facts',
        rows: [
          ['대수', '4F 3대 · 5F 6대'],
          ['짝', '항온항습기 : 실외기 = 1 : 1 (실외기가 멈추면 짝도 냉각 불가)'],
          ['약점', '외기가 더울수록 효율 ↓ → 수냉식보다 냉각 전력 큼'],
        ],
      },
    ],
    run: () => {
      clean();
      restoreAir(); // 앞 단계에서 없앤 봉쇄 · 블랭킹을 투어 전 설정으로
      tab('cooling');
      activateGroup('ref-C1');
    },
  },
  {
    title: '수냉식: 냉수 · 냉각수 두 개의 고리',
    place: '3F · 4F → B1 → 옥상',
    route: { line: 'heat', at: 3 },
    lead: '수냉식은 압축기 없이 냉수로 공기를 식히고, 열은 두 고리를 거쳐 옥상으로 갑니다.',
    blocks: [
      { k: 'flow', label: '냉수 고리 (7°C)', hue: 'cool', nodes: ['냉동기 4대', '냉수 헤더', '항온항습기 9대'], note: '다대다 연결 · 3F 6대 · 4F 3대' },
      { k: 'flow', label: '냉각수 고리', hue: 'heat', nodes: ['냉동기', '펌프', '냉각탑'], note: '1 : 1 : 1 짝' },
    ],
    points: ['외기가 차가우면 냉동기 대신 판형 열교환기로 냉수를 만듭니다 (프리쿨링).'],
    try: '아래 공조 흐름도에서 장비를 눌러 3D 위치를 확인해 보세요.',
    run: () => {
      clean();
      tab('cooling');
      activateGroup('cool-A');
    },
  },
  {
    title: '옥상: 열을 하늘로',
    place: '옥상 (PH)',
    route: { line: 'heat', at: 4 },
    lead: '서버실에서 나온 열은 모두 옥상에서 대기로 나갑니다.',
    blocks: [
      {
        k: 'table',
        head: ['설비', '위치', '버리는 열'],
        rows: [
          ['실외기 9대', '가운데', '서버실 B · C 공냉식 항온항습기'],
          ['냉각탑 4대', '동쪽', '냉동기 (서버실 A · B 수냉식)'],
        ],
      },
    ],
    points: ['모든 공조 설비는 UPS를 거치지 않고 공조 동력반에서 전기를 받습니다.'],
    run: () => {
      clean();
      tab('cooling');
      focusFloor('PH');
    },
  },
  {
    title: '얼마나 효율적인가: PUE',
    place: '지표 · 용량',
    lead: 'PUE가 1.0에 가까울수록 IT 말고 쓰는 전력(냉각 · 손실)이 적습니다.',
    blocks: [
      { k: 'formula', name: 'PUE', top: '총 시설 전력', bottom: 'IT 전력' },
      {
        k: 'table',
        head: ['이렇게 바꾸면', 'PUE', '이유'],
        rows: [
          ['외기 온도 ↓', '좋아짐', '수냉식(3F · 4F) 프리쿨링'],
          ['IT 부하율 ↓', '나빠짐', '고정 손실의 비중 ↑'],
        ],
      },
    ],
    points: ['공냉식만 쓰는 5F는 프리쿨링이 없습니다.'],
    try: '오른쪽 지표 탭에서 외기 온도 · IT 부하율 슬라이더를 움직여 보세요.',
    run: () => {
      clean();
      focusOverview();
      useView.getState().setRightTab('metrics');
    },
  },
  {
    title: '고객사와 계약 전력',
    place: '5F · 서버실 C',
    lead: '서버실 C는 고객사 A~E에 케이지로 임대합니다 (코로케이션).',
    blocks: [
      {
        k: 'table',
        head: ['고객사 카드', '뜻'],
        rows: [
          ['계약 전력', '사업자가 확보해 둔 전력'],
          ['지금 사용', '계약 대비 현재 전력'],
          ['30일 최대', '월 최대 수요 (초과 청구 기준)'],
          ['회로 여유', '랙마다 A · B 한쪽이 끊겼을 때의 여유'],
        ],
      },
      {
        k: 'facts',
        rows: [
          ['케이지', '랙 + 앞 · 뒤 통로를 두른 전용 철망 구역'],
          ['고객사 A', '블록 하나(72대)를 통째로'],
          ['고객사 B', 'GPU 고밀도 → 랙당 회로 여유를 먼저'],
        ],
      },
    ],
    points: ['계약 초과 · 주의는 지표 탭과 [주의] 탭에도 모입니다.'],
    try: '3D의 케이지나 고객사 이름표를 눌러 다른 고객사도 보세요.',
    run: () => {
      clean();
      focusItem('customer:B');
    },
  },
  {
    title: '방재 · 보안 (요약)',
    place: '2F 소화약제실 · 각 층',
    lead: '불이 나면 물 대신 가스로 꺼서 장비를 보호합니다.',
    blocks: [
      { k: 'flow', hue: 'fire', nodes: ['감지기 회로 A', '+ 회로 B', '소화 수신반', '20~30초 뒤 가스 소화설비 방출'], at: [3], note: '두 회로가 모두 동작해야 방출 (교차회로)' },
      {
        k: 'facts',
        rows: [
          ['누수 감지', '3F · 4F (수냉식 설비)'],
          ['출입', '출입통제 장치 · CCTV'],
        ],
      },
    ],
    points: ['왼쪽 레이어에서 방재 · 보안을 켜고 끌 수 있습니다.'],
    run: () => {
      clean();
      focusItem('gas-system');
    },
  },
  {
    title: '이제 직접 둘러보세요',
    place: '전체',
    lead: '같은 데이터센터를 여러 각도로 볼 수 있습니다.',
    blocks: [
      {
        k: 'table',
        head: ['하고 싶은 것', '방법'],
        rows: [
          ['장비 정보 · 연결', '3D에서 장비를 누름'],
          ['끝까지 따라가기', '정보 카드의 상류 · 하류 추적'],
          ['바로 찾기', '상단 [검색] (⌘K)'],
          ['온도 · 도면', '상단 [온도] · [도면]'],
          ['효율 · 이상', '오른쪽 "지표 · 용량" · "주의"'],
          ['켜진 보기 끄기', '3D 아래 칩의 ✕'],
        ],
      },
    ],
    points: ['제목 옆 ⓘ에 사용법이 있습니다.'],
    run: () => {
      clean();
      focusOverview();
    },
  },
];

// 투어 전 상태를 기억했다가 끝낼 때 되돌린다
let saved: { airCfg: Record<RoomLabel, AirCfg>; rackColor: RackColorMode; diagramMode: 'off' | 'half' | 'full'; diagramTab: PanelTab } | null = null;

export function startTour() {
  const s = useView.getState();
  saved = { airCfg: s.airCfg, rackColor: s.rackColor, diagramMode: s.diagramMode, diagramTab: s.diagramTab };
  goStep(0);
}

export function goStep(n: number) {
  const k = Math.max(0, Math.min(STEPS.length - 1, n));
  useView.getState().setTourStep(k);
  STEPS[k].run();
}

export function endTour() {
  const s = useView.getState();
  s.setTourStep(null);
  clean();
  if (saved) {
    s.setAirCfg('A', saved.airCfg.A);
    s.setAirCfg('B', saved.airCfg.B);
    s.setRackColor(saved.rackColor);
    s.setDiagramMode(saved.diagramMode);
    s.setDiagramTab(saved.diagramTab);
    saved = null;
  }
  focusOverview();
}

// 지금 단계가 길의 어디쯤인지: 지난 곳 · 지금 · 남은 곳
function RouteStrip({ route }: { route: NonNullable<Step['route']> }) {
  const r = ROUTES[route.line];
  return (
    <div className={`tour-route h-${r.hue}`}>
      <span className="tr-name">{r.name}</span>
      <ol>
        {r.stops.map((s, i) => (
          <li key={s} className={route.at === 'all' || route.at === i ? 'on' : route.at > i ? 'done' : ''}>
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Flow({ b }: { b: Extract<Block, { k: 'flow' }> }) {
  return (
    <div className={`tb-flow h-${b.hue ?? 'power'}`}>
      {b.label && <span className="tb-label">{b.label}</span>}
      <div className="tb-nodes">
        {b.nodes.map((n, i) => (
          <Fragment key={i}>
            {i > 0 && <span className="tb-arrow">→</span>}
            <span className={`tb-node${b.at?.includes(i) ? ' on' : ''}`}>{n}</span>
          </Fragment>
        ))}
      </div>
      {b.note && <small>{b.note}</small>}
    </div>
  );
}

// 세 서버실을 기본 공조 조건(급기 20°C)으로 계산해 나란히 (사용자가 바꾼 설정과 무관)
function RoomCompare() {
  const rows = useMemo(
    () =>
      (['A', 'B', 'C'] as RoomLabel[]).map((r) => {
        const th = computeRoom(r, DEFAULT_AIR_BY_ROOM[r]);
        return { r, th };
      }),
    [],
  );
  const desc: Record<RoomLabel, [string, string, string]> = {
    A: ['3F', '수냉식', '이중마루 · 열복도 봉쇄'],
    B: ['4F', '수냉 · 공냉 반반', '이중마루 · 봉쇄 없음'],
    C: ['5F', '공냉식 전면 토출', '마루 없음 · 봉쇄 없음'],
  };
  return (
    <table className="tb-table">
      <thead>
        <tr>
          <th>서버실</th>
          <th>냉각 · 기류 구조</th>
          <th className="r">최고 흡기</th>
          <th className="r">27°C 초과</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ r, th }) => (
          <tr key={r} className={r === 'C' ? 'hl' : ''}>
            <td>
              <b>{r}</b> <small>{desc[r][0]}</small>
            </td>
            <td>
              {desc[r][1]}
              <small>{desc[r][2]}</small>
            </td>
            <td className="r num" style={{ color: tempColor(th.maxInlet) }}>
              {th.maxInlet}°C
            </td>
            <td className="r num">{th.over}대</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={4}>급기 20°C · 투어 기본 설정 기준. 위에서 아래로 갈수록 효율이 낮아집니다.</td>
        </tr>
      </tfoot>
    </table>
  );
}

// 계통 묶음 켜기 · 끄기 (왼쪽 패널 '계통 묶음' 버튼과 같은 동작: 다른 묶음을 켜면 그쪽으로 바뀐다)
// 라벨은 화면에 보이지 않고 화면 낭독기에만 읽힌다 (제목 바로 옆 스위치라 제목이 곧 라벨)
function GroupSwitch({ id, name }: { id: string; name: string }) {
  const on = useView((s) => s.groupId === id);
  return <Switch checked={on} onChange={() => activateGroup(on ? null : id)} label={`${name} 계통 묶음 강조`} />;
}

function TourBlock({ b }: { b: Block }) {
  switch (b.k) {
    case 'flow':
      return <Flow b={b} />;
    case 'dual':
      return (
        <div className="tb-dual">
          {(['a', 'b'] as const).map((s) => (
            <div key={s} className={`tb-flow h-${s}`}>
              <div className="tb-flow-head">
                <span className="tb-label">{s.toUpperCase()}계통</span>
                {b.groups && <GroupSwitch id={b.groups[s]} name={`${s.toUpperCase()}계통`} />}
              </div>
              <div className="tb-nodes">
                {b[s].map((n, i) => (
                  <Fragment key={i}>
                    {i > 0 && <span className="tb-arrow">→</span>}
                    <span className="tb-node">{n}</span>
                  </Fragment>
                ))}
              </div>
            </div>
          ))}
          <div className="tb-merge">
            <span className="tb-label">A + B</span>
            <span className="tb-arrow">→</span>
            <span className="tb-node on">{b.to}</span>
          </div>
        </div>
      );
    case 'facts':
      return (
        <dl className="tb-facts">
          {b.rows.map(([k, v]) => (
            <Fragment key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </Fragment>
          ))}
        </dl>
      );
    case 'table':
      return (
        <table className="tb-table">
          <thead>
            <tr>
              {b.head.map((h, i) => (
                <th key={i} className={i === b.col ? 'hl' : ''}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((c, i) => (
                  <td key={i} className={i === b.col ? 'hl' : ''}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'legend':
      return (
        <div className="tb-legend">
          {b.items.map(([sw, label]) => (
            <span key={label}>
              <i className={`sw-${sw}`} />
              {label}
            </span>
          ))}
        </div>
      );
    case 'formula':
      return (
        <div className="tb-formula">
          <b>{b.name}</b>
          <span>=</span>
          <span className="frac">
            <span>{b.top}</span>
            <span>{b.bottom}</span>
          </span>
        </div>
      );
    case 'temps': {
      // 랙 흡기 판정 구간 (2D 상면도 · 랙 색과 같은 색)
      const [lo, hi] = RECOMMENDED;
      const bands: [number, string][] = [
        [22, `${lo}~${hi}°C 권장`],
        [30, `${hi}~${ALLOWABLE_MAX}°C 주의`],
        [36, `${ALLOWABLE_MAX}°C 초과 위험`],
      ];
      return (
        <div className="tb-legend">
          <span className="tb-cap">랙 흡기 온도</span>
          {bands.map(([t, label]) => (
            <span key={label}>
              <i className="sw-box" style={{ background: tempColor(t) }} />
              {label}
            </span>
          ))}
        </div>
      );
    }
    case 'rooms':
      return <RoomCompare />;
    case 'floors':
      return (
        <table className="tb-table floors">
          <tbody>
            {[...FLOORS].reverse().map((f) => (
              <tr key={f.id}>
                <th>{f.id}</th>
                <td>{f.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
  }
}

// 왼쪽 위 온도 카드가 떠 있으면 그 아래 남은 높이만큼만 차지한다 (두 카드가 겹치지 않게)
function useFitBelowThermal(card: RefObject<HTMLDivElement | null>, on: boolean) {
  useLayoutEffect(() => {
    const el = card.current;
    const view = el?.parentElement;
    if (!on || !el || !view) return;
    let air: Element | null = null;
    const fit = () => {
      const top = air ? air.getBoundingClientRect().bottom - view.getBoundingClientRect().top + 10 : 10;
      // 3D 영역이 낮아 남는 높이가 300px보다 작으면 온도 카드 아래쪽을 덮더라도 300px은 확보한다 (본문이 읽히도록)
      el.style.maxHeight = `${Math.max(Math.min(300, view.clientHeight - 20), view.clientHeight - top - 10)}px`;
    };
    const ro = new ResizeObserver(fit);
    // 온도 카드는 투어 단계에 따라 생기고 없어지므로 3D 영역의 자식이 바뀔 때마다 다시 찾는다
    const watch = () => {
      if (air) ro.unobserve(air);
      air = view.querySelector('.air-panel:not(.supply-card)');
      if (air) ro.observe(air);
      fit();
    };
    ro.observe(view);
    const mo = new MutationObserver(watch);
    mo.observe(view, { childList: true });
    watch();
    return () => {
      ro.disconnect();
      mo.disconnect();
      el.style.maxHeight = '';
    };
  }, [card, on]);
}

export function TourCard() {
  const step = useView((s) => s.tourStep);
  const [folded, setFolded] = useState(false); // 3D를 넓게 보려고 본문을 접는다
  const ref = useRef<HTMLDivElement>(null);
  useFitBelowThermal(ref, step != null);

  // ← → 로 이동, Esc로 끝내기 (입력 칸에 글을 쓰는 중이면 무시)
  useEffect(() => {
    if (step == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea')) return;
      if (e.key === 'ArrowRight') goStep(step + 1);
      else if (e.key === 'ArrowLeft') goStep(step - 1);
      else if (e.key === 'Escape') endTour();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  if (step == null) return null;
  const st = STEPS[step];
  const last = step === STEPS.length - 1;
  return (
    <div ref={ref} className={`tour-card${folded ? ' folded' : ''}`} role="dialog" aria-label="가이드 투어">
      <div className="tour-head">
        <span className="tour-ico">
          <Compass size={14} />
        </span>
        <span className="tour-n num">
          가이드 투어 · {step + 1} / {STEPS.length}
        </span>
        <span className="tour-place">{st.place}</span>
        <span className="tour-acts">
          <IconButton icon={folded ? ChevronUp : ChevronDown} label={folded ? '펼치기' : '접기 (3D 넓게 보기)'} onClick={() => setFolded((v) => !v)} />
          <IconButton icon={X} label="투어 끝내기 (Esc)" onClick={endTour} />
        </span>
      </div>
      <h3>{st.title}</h3>
      {!folded && (
        <div className="tour-body">
          {st.route && <RouteStrip route={st.route} />}
          <p className="tour-lead">{st.lead}</p>
          {st.blocks.map((b, i) => (
            <TourBlock key={i} b={b} />
          ))}
          {st.points && (
            <ul className="tour-points">
              {st.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {st.try && (
            <div className="tour-try">
              <Hand size={14} />
              <span>
                <b>해 보기</b> {st.try}
              </span>
            </div>
          )}
        </div>
      )}
      <div className="tour-foot">
        {/* 단계 막대: 칸 폭이 남은 폭을 나눠 가져 단계가 늘거나 카드가 좁아도 넘치지 않는다 */}
        <div className="tour-steps">
          {STEPS.map((s, i) => (
            <button key={s.title} className={i === step ? 'on' : i < step ? 'done' : ''} onClick={() => goStep(i)} title={s.title} aria-label={`${i + 1}단계 ${s.title}`} />
          ))}
        </div>
        <button className="small" onClick={() => goStep(step - 1)} disabled={step === 0}>
          ← 이전
        </button>
        {last ? (
          <button className="small primary" onClick={endTour}>
            투어 끝내기
          </button>
        ) : (
          <button className="small primary" onClick={() => goStep(step + 1)}>
            다음 →
          </button>
        )}
      </div>
    </div>
  );
}
