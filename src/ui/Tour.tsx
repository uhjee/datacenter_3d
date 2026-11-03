// 가이드 투어 (docs/PLAN.md §7): 전기가 한전에서 랙까지, 열이 랙에서 옥상까지 가는 길을 단계별로 따라간다.
// 각 단계는 기존 기능(장비 선택 · 추적 · 계통 묶음 · 온도 보기 · 고객사 · 지표)을 그대로 불러 쓴다.
// 카드는 3D 왼쪽 아래에 떠 있고, 단계마다 핵심 한 줄 + 흐름도 · 표 · 범례로 보여 준다 (긴 글 대신)
// 그림의 칸은 3D에 실제 놓인 장비 ID('@id')로 적어, 이름 · 층 · 사양을 장비 데이터에서 그대로 가져온다

import { ChevronDown, ChevronUp, Compass, X } from 'lucide-react';
import { IconButton, Switch } from './kit';
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { FLOORS } from '../data/building';
import { CIRCUIT, CUSTOMERS } from '../data/customers';
import { EQUIP_BY_ID, EQUIPMENT } from '../data/equipment';
import { nodeInfo } from '../data/graph';
import { RACKS } from '../data/racks';
import { ALLOWABLE_MAX, computeRoom, DEFAULT_AIR_BY_ROOM, RECOMMENDED, tempColor, type AirCfg, type RoomLabel } from '../data/thermal';
import { activateGroup, enterAir, enterHeat, exitThermal, focusFloor, focusItem, focusOverview, startTrace } from '../scene/focus';
import { useView, type PanelTab, type RackColorMode } from '../store/useView';

type Hue = 'power' | 'heat' | 'cool' | 'fire' | 'a' | 'b';

// 칸: '@장비 ID'면 3D 장비(이름 · 층을 데이터에서), '@장비 ID|표시 이름'이면 이름만 바꿔 쓰고, 아니면 그대로 쓰는 글자 (공간 · 개념)
type Node = string;

// 단계 본문을 이루는 시각 블록
type Block =
  | { k: 'flow'; label?: string; hue?: Hue; nodes: Node[]; at?: number[]; note?: string; standby?: boolean } // 화살표로 잇는 흐름, at은 강조할 칸, standby는 평상시 안 쓰는 길
  | { k: 'hub'; hue?: Hue; ins: Node[]; node: Node; outs: Node[]; inLabel?: string; outLabel?: string } // 여러 곳에서 받아 여러 곳으로 보내는 장비
  | { k: 'dual'; a: Node[]; b: Node[]; to: Node; groups?: { a: string; b: string } } // A · B 두 줄이 하나로 모이는 그림 (2N). groups: 줄마다 켜고 끌 계통 묶음
  | { k: 'specs'; of: [string, string[]][] } // 장비 사양 (장비 데이터의 specs에서 고른 항목). 'ID|표시 이름'으로 이름만 바꿀 수 있다
  | { k: 'equips'; rows: [string, string[]][] } // 이름표 묶음: 같은 역할의 장비들
  | { k: 'table'; head: string[]; rows: string[][]; col?: number } // col: 강조할 열
  | { k: 'legend'; items: ['solid' | 'dash' | 'chev', string][] } // 3D 선 모양 범례
  | { k: 'formula'; top: string; bottom: string; name: string }
  | { k: 'temps' } // 흡기 온도 구간 (색 · 기준)
  | { k: 'contain' } // 서버실 A 봉쇄 있음 · 없음 비교 (계산)
  | { k: 'rooms' } // 세 서버실 비교 (기본 공조 조건으로 계산)
  | { k: 'customers' } // 서버실 C 고객사 (계약 데이터)
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
  run: () => void;
}

// 장비 이름에서 유형 뒤의 한글 설명 괄호를 뺀다: '항온항습기(수냉식)-A1' → '항온항습기-A1', '(VCB)' 같은 영문 약어는 남김
const plainName = (name: string) => name.replace(/\s*\([^)]*[가-힣][^)]*\)/g, '').trim();

// 유형별 대수를 층마다: '4F 3대 · 5F 6대'
function countByFloor(types: string[]) {
  const n = new Map<string, number>();
  for (const e of EQUIPMENT) if (types.includes(e.type)) n.set(e.floor, (n.get(e.floor) ?? 0) + 1);
  return [...n].map(([f, c]) => `${f} ${c}대`).join(' · ');
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
      { k: 'flow', label: '① 전기', hue: 'power', nodes: ['@kepco-main|한전 본선', '@hv-in|특고압 수배전반 수전부', '@tr-a', '@ats-a', '@ups-a1', '@pdu-a1-1', '@rack:A-1-01'] },
      { k: 'flow', label: '② 열 (서버실 A)', hue: 'heat', nodes: ['@rack:A-1-01', '@crah-a1', '@chiller-1', '@ct-1', '대기'] },
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
    lead: '한전 22.9kV를 두 회선으로 받아, 수전부의 ALTS가 그중 하나를 골라 씁니다.',
    blocks: [
      { k: 'flow', label: '평상시', hue: 'power', nodes: ['@kepco-main|한전 본선', '@hv-in|특고압 수배전반 수전부', '@hv-a'], at: [1] },
      { k: 'flow', label: '본선 정전 시', hue: 'power', nodes: ['@kepco-standby|한전 예비선', '@hv-in|특고압 수배전반 수전부', '@hv-a'], at: [1], standby: true, note: 'ALTS가 예비선 쪽으로 자동 절체' },
      {
        k: 'specs',
        of: [
          ['kepco-main|한전 본선', ['전압', '계약 전력']],
          ['hv-in|특고압 수배전반 수전부', ['구성', 'ALTS']],
        ],
      },
      {
        k: 'legend',
        items: [
          ['solid', '평상시 쓰는 경로'],
          ['dash', '대기 경로'],
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
    lead: 'VCB가 고장 전류를 끊고, TR이 서버가 쓰는 380/220V로 낮춥니다.',
    blocks: [
      { k: 'flow', hue: 'power', nodes: ['@hv-in|특고압 수배전반 수전부', '@hv-a', '@tr-a', '@lv-a'], at: [2] },
      {
        k: 'specs',
        of: [
          ['hv-a', ['차단기', '차단 용량']],
          ['tr-a', ['변압', '용량']],
        ],
      },
      { k: 'legend', items: [['chev', '흐름 방향 (보내는 곳 → 받는 곳)']] },
    ],
    points: ['TR-B도 같은 크기라 한 대가 멈춰도 다른 한 대가 전체를 감당합니다 (2N).'],
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
    lead: 'ATS-A는 상용과 발전기 중 하나를 골라 UPS 세 대와 공조 동력반으로 보냅니다.',
    blocks: [
      { k: 'hub', hue: 'power', inLabel: '받는 곳', ins: ['@lv-a', '@hub:gen-bus'], node: '@ats-a', outLabel: '보내는 곳', outs: ['@ups-a1', '@ups-a2', '@ups-a3', '@mcc-a'] },
      {
        k: 'specs',
        of: [
          ['ats-a', ['절체', '절체 시간']],
          ['lv-tie', ['평상시', '용도']],
        ],
      },
    ],
    points: ['공조 동력반은 UPS를 거치지 않아, 정전 순간에는 공조 설비가 잠시 멈춥니다.'],
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
    lead: '한전 전원이 끊기면 발전기 3대가 기동해 발전기 모선에 모이고, ATS가 발전기 쪽으로 절체합니다.',
    blocks: [
      { k: 'flow', label: '연료', hue: 'power', nodes: ['@fuel-main', '@fuel-1', '@gen-1'] },
      { k: 'hub', hue: 'power', ins: ['@gen-1', '@gen-2', '@gen-3'], node: '@hub:gen-bus', outs: ['@ats-a', '@ats-b'] },
      {
        k: 'specs',
        of: [
          ['gen-1', ['출력', '기동 시간']],
          ['fuel-main', ['용량', '운전 가능']],
        ],
      },
    ],
    points: ['"비상 전원" 계통 묶음을 켠 모습입니다. 발전기 모선 → ATS는 평상시 안 쓰는 대기 경로입니다.'],
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
    lead: '발전기가 뜨기 전 비는 몇 초를 배터리가 메우고, UPS가 끊김 없이 서버실 A로 보냅니다.',
    blocks: [
      { k: 'hub', hue: 'power', ins: ['@ats-a', '@bat-a1'], node: '@ups-a1', outs: ['PDU-A1-1 ~ A1-9', '@sts-1'] },
      {
        k: 'specs',
        of: [
          ['ups-a1', ['방식', '용량']],
          ['bat-a1', ['용량', '백업 시간']],
        ],
      },
    ],
    points: ['UPS는 서버실마다 한 쌍(A1 · B1 = 서버실 A)이라, 한 대가 멈춰도 그 서버실만 반대쪽 한 대로 버팁니다.'],
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
      {
        k: 'dual',
        a: ['@hv-a', '@tr-a', '@lv-a', '@ats-a', '@ups-a1', '@pdu-a1-1'],
        b: ['@hv-b', '@tr-b', '@lv-b', '@ats-b', '@ups-b1', '@pdu-b1-1'],
        to: '@rack:A-1-01',
        groups: { a: 'sys-A', b: 'sys-B' },
      },
    ],
    points: ['랙은 rPDU-A · rPDU-B 두 전원으로 받습니다. 두 줄은 서로 다른 전기 샤프트(EPS-A · EPS-B)로 올라갑니다.'],
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
      { k: 'flow', label: 'rPDU-A', hue: 'a', nodes: ['@kepco-main|한전 본선', '@tr-a', '@ats-a', '@ups-a1', '@pdu-a1-1', '@rack:A-2-05'], at: [5] },
      { k: 'flow', label: 'rPDU-B', hue: 'b', nodes: ['@kepco-main|한전 본선', '@tr-b', '@ats-b', '@ups-b1', '@pdu-b1-1', '@rack:A-2-05'], at: [5] },
      { k: 'legend', items: [['dash', '발전기 · 예비선 · 연계반 = 대기 경로']] },
    ],
    run: () => {
      clean();
      tab('power');
      focusItem('rack:A-2-05');
      startTrace('up');
    },
  },
  {
    title: '이제 열의 길: 서버실 A 기류',
    place: '3F · 서버실 A',
    route: { line: 'heat', at: 1 },
    lead: '찬 공기는 바닥 아래로, 더운 공기는 천장으로. 열복도를 막아 둘이 섞이지 않습니다.',
    blocks: [
      { k: 'flow', label: '찬 공기', hue: 'cool', nodes: ['@crah-a1', '이중마루 하부', '냉복도 타공판', '랙 앞면'] },
      { k: 'flow', label: '더운 공기', hue: 'heat', nodes: ['랙 뒷면', '열복도 봉쇄', '천장 리턴', '@crah-a1'], note: '서버를 지나며 10~15°C 데워짐' },
      { k: 'specs', of: [['crah-a1', ['급기 설정', '취출', '풍량']]] },
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
    place: '3F · 서버실 A',
    route: { line: 'heat', at: 1 },
    lead: '봉쇄 · 블랭킹을 없애면 더운 공기가 다시 흡기되고 찬 공기는 랙을 건너뜁니다.',
    blocks: [{ k: 'contain' }, { k: 'temps' }],
    points: ['재순환: 랙 배기가 다시 랙 앞으로 넘어와 흡기되는 것', '바이패스: 찬 공기가 랙을 거치지 않고 항온항습기로 돌아가는 것'],
    run: () => {
      air('A', { containment: 'none', blanking: false });
      enterAir('A');
    },
  },
  {
    title: '온도를 한눈에: 히트맵과 2D 상면도',
    place: '4F · 서버실 B',
    route: { line: 'heat', at: 1 },
    lead: '상단 [온도]를 켜면 바닥에 온도 분포가 깔리고, 아래에 2D 상면도가 열립니다.',
    blocks: [
      {
        k: 'table',
        head: ['보는 곳', '보이는 것'],
        rows: [
          ['3D 히트맵', '하 · 중 · 상 높이의 공기 온도'],
          ['2D 랙 칸', '색 · 숫자 = 그 랙의 흡기 온도'],
          ['핫스팟', '권장 상한을 넘은 랙 목록'],
        ],
      },
      { k: 'temps' },
      { k: 'equips', rows: [['온습도 센서', ['sensor-b-1', 'sensor-b-2', 'sensor-b-3', 'sensor-b-4', 'sensor-b-5', 'sensor-b-6']]] },
    ],
    points: ['판정은 랙 흡기 기준입니다. 열복도가 빨간 것은 정상 배기입니다.', '서버실 B는 봉쇄가 없어 열복도 공기가 랙 위와 열 끝으로 넘어옵니다.'],
    run: () => {
      clean();
      restoreAir();
      enterHeat('B');
    },
  },
  {
    title: '이중마루도 봉쇄도 없으면: 서버실 C',
    place: '5F · 서버실 C',
    route: { line: 'heat', at: 1 },
    lead: '찬 공기가 방을 건너는 동안 배기와 섞여, 같은 급기 20°C에도 흡기가 가장 높습니다.',
    blocks: [{ k: 'rooms' }],
    points: ['서버실 C는 벽면 항온항습기가 정면으로 바람을 불어, 멀리 있는 서쪽 랙 · 랙 위쪽이 가장 덥습니다.'],
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
    lead: '공냉식 항온항습기는 빼앗은 열을 냉매 배관으로 짝인 옥상 실외기에 보냅니다.',
    blocks: [
      { k: 'flow', label: '냉매 배관 1 : 1', hue: 'heat', nodes: ['@crac-c1', '@cond-c1', '대기'], at: [0, 1] },
      {
        k: 'specs',
        of: [
          ['crac-c1', ['냉각 용량', '취출']],
          ['cond-c1', ['방열 용량', '외기 대응']],
        ],
      },
      { k: 'table', head: ['공냉식 항온항습기', '대수'], rows: [['서버실 B · C', countByFloor(['crac', 'cracFront'])]] },
    ],
    points: ['실외기가 멈추면 짝인 항온항습기도 냉각을 못 합니다. 외기가 더울수록 효율이 떨어집니다.'],
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
    lead: '수냉식은 압축기 없이 냉수로 공기를 식히고, 열은 냉동기 · 냉각탑을 거쳐 옥상으로 갑니다.',
    blocks: [
      { k: 'flow', label: '냉수 고리', hue: 'cool', nodes: ['@chiller-1', '@pump-chw-1', '@hub:chw', '@crah-a1'] },
      { k: 'flow', label: '냉각수 고리', hue: 'heat', nodes: ['@ct-1', '@pump-cw-1', '@chiller-1'] },
      { k: 'flow', label: '프리쿨링', hue: 'cool', nodes: ['@pump-cw-1', '@hx-1', '@hub:chw'], standby: true, note: '외기가 차가우면 냉동기를 거치지 않고 냉수를 만듦' },
      {
        k: 'specs',
        of: [
          ['chiller-1', ['냉동 용량', '냉수']],
          ['ct-1', ['방열 용량', '냉각수']],
        ],
      },
    ],
    points: ['냉동기 4대가 냉수 헤더에 모아 항온항습기 9대(3F 6대 · 4F 3대)로 나눕니다. 냉동기 · 냉각수 펌프 · 냉각탑은 1 : 1 : 1 짝입니다.'],
    run: () => {
      clean();
      tab('cooling');
      activateGroup('cool-A');
    },
  },
  {
    title: '옥상: 열을 하늘로',
    place: 'PH · 옥상',
    route: { line: 'heat', at: 4 },
    lead: '서버실에서 나온 열은 모두 옥상의 실외기 · 냉각탑에서 대기로 나갑니다.',
    blocks: [
      {
        k: 'equips',
        rows: [
          ['실외기 → 공냉식 항온항습기', EQUIPMENT.filter((e) => e.type === 'condenser').map((e) => e.id)],
          ['냉각탑 → 냉동기', EQUIPMENT.filter((e) => e.type === 'coolingTower').map((e) => e.id)],
        ],
      },
      {
        k: 'specs',
        of: [
          ['cond-c1', ['방열 용량']],
          ['ct-1', ['방열 용량']],
        ],
      },
    ],
    points: ['모든 공조 설비는 UPS를 거치지 않고 공조 동력반 A · B에서 전기를 받습니다.'],
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
          ['외기 온도 ↓', '좋아짐', '판형 열교환기 프리쿨링 (3F · 4F 수냉식)'],
          ['IT 부하율 ↓', '나빠짐', 'TR 무부하손 등 고정 손실의 비중 ↑'],
        ],
      },
    ],
    points: ['공냉식만 쓰는 5F는 프리쿨링이 없습니다. 오른쪽 지표 탭의 슬라이더로 바꿔 볼 수 있습니다.'],
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
      { k: 'customers' },
      {
        k: 'table',
        head: ['고객사 카드', '뜻'],
        rows: [
          ['계약 전력', '사업자가 확보해 둔 전력'],
          ['30일 최대', '월 최대 수요, 초과 청구 기준'],
          ['회로 여유', 'A · B 한쪽이 끊겼을 때 랙당 여유'],
        ],
      },
    ],
    points: ['케이지는 랙과 앞 · 뒤 통로까지 두른 전용 철망 구역입니다. 고객사 B는 GPU 고밀도라 랙당 회로 여유를 먼저 봅니다.'],
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
      { k: 'flow', hue: 'fire', nodes: ['@fd-sr-a', '@fire-panel', '@gas-system'], at: [2], note: '감지기 A · B 회로가 모두 동작해야 방출 (교차회로)' },
      {
        k: 'specs',
        of: [
          ['fire-panel', ['방출 지연']],
          ['gas-system', ['약제', '방호구역']],
        ],
      },
      {
        k: 'equips',
        rows: [
          ['누수 감지기', EQUIPMENT.filter((e) => e.type === 'leakDetector').map((e) => e.id)],
          ['출입통제 장치', EQUIPMENT.filter((e) => e.type === 'accessControl').map((e) => e.id)],
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

// 칸 하나: 장비면 3D와 같은 이름(설명 괄호 뺀) + 층, 마우스를 올리면 원래 이름
function NodeChip({ n, on }: { n: Node; on?: boolean }) {
  const [id, label] = n.slice(1).split('|');
  const info = n.startsWith('@') ? nodeInfo(id) : null;
  if (!info) return <span className={`tb-node text${on ? ' on' : ''}`}>{n}</span>;
  return (
    <span className={`tb-node${on ? ' on' : ''}`} title={`${info.name} · ${info.floor}`}>
      {label ?? plainName(info.name)}
      <em>{info.floor}</em>
    </span>
  );
}

function Chain({ nodes, at }: { nodes: Node[]; at?: number[] }) {
  return (
    <div className="tb-nodes">
      {nodes.map((n, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="tb-arrow">→</span>}
          <NodeChip n={n} on={at?.includes(i)} />
        </Fragment>
      ))}
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
  // 서버실마다 실제 놓인 항온항습기 대수 (유형별)
  const units = (floor: string) =>
    (['crah', 'crac', 'cracFront'] as const)
      .map((t) => [t, EQUIPMENT.filter((e) => e.floor === floor && e.type === t).length] as const)
      .filter(([, c]) => c > 0)
      .map(([t, c]) => `${t === 'crah' ? '수냉식' : t === 'crac' ? '공냉식' : '전면 토출'} ${c}`)
      .join(' · ');
  const desc: Record<RoomLabel, [string, string]> = {
    A: ['3F', '이중마루 · 열복도 봉쇄'],
    B: ['4F', '이중마루 · 봉쇄 없음'],
    C: ['5F', '마루 없음 · 봉쇄 없음'],
  };
  return (
    <table className="tb-table">
      <thead>
        <tr>
          <th>서버실</th>
          <th>항온항습기 · 기류</th>
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
              {units(desc[r][0])}
              <small>{desc[r][1]}</small>
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

// 서버실 A를 봉쇄 · 블랭킹 있음 / 없음으로 계산해 나란히
function ContainCompare() {
  const [withC, without] = useMemo(() => {
    const base = DEFAULT_AIR_BY_ROOM.A;
    return [computeRoom('A', { ...base, containment: 'HAC', blanking: true }), computeRoom('A', { ...base, containment: 'none', blanking: false })];
  }, []);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const rows: [string, string, string][] = [
    ['열복도 봉쇄 · 블랭킹', '있음', '없음'],
    ['최고 흡기', `${withC.maxInlet}°C`, `${without.maxInlet}°C`],
    ['27°C 초과 랙', `${withC.over}대`, `${without.over}대`],
    ['재순환', pct(withC.recirc), pct(without.recirc)],
    ['바이패스', pct(withC.bypass), pct(without.bypass)],
  ];
  return (
    <table className="tb-table">
      <thead>
        <tr>
          <th>서버실 A</th>
          <th className="r">봉쇄 있음</th>
          <th className="r hl">지금</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([k, a, b]) => (
          <tr key={k}>
            <td>{k}</td>
            <td className="r num">{a}</td>
            <td className="r num hl">{b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// 서버실 C 고객사: 실제 배치된 랙 수와 계약 전력 · 회로
function CustomerTable() {
  return (
    <table className="tb-table">
      <thead>
        <tr>
          <th>고객사</th>
          <th className="r">랙</th>
          <th className="r">계약 전력</th>
          <th>랙당 회로</th>
        </tr>
      </thead>
      <tbody>
        {CUSTOMERS.map((c) => (
          <tr key={c.id} className={c.id === 'B' ? 'hl' : ''}>
            <td>
              <i className="tb-dot" style={{ background: c.color }} />
              {c.name}
            </td>
            <td className="r num">{RACKS.filter((r) => r.customer === c.id).length}대</td>
            <td className="r num">{c.contract.kw.toLocaleString()}kW</td>
            <td>{CIRCUIT[c.contract.circuit].name} × 2</td>
          </tr>
        ))}
      </tbody>
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
      return (
        <div className={`tb-flow h-${b.hue ?? 'power'}${b.standby ? ' standby' : ''}`}>
          {b.label && <span className="tb-label">{b.label}</span>}
          <Chain nodes={b.nodes} at={b.at} />
          {b.note && <small>{b.note}</small>}
        </div>
      );
    case 'hub':
      return (
        <div className={`tb-hub h-${b.hue ?? 'power'}`}>
          <div className="tb-col">
            {b.inLabel && <span className="tb-cap">{b.inLabel}</span>}
            {b.ins.map((n) => (
              <NodeChip key={n} n={n} />
            ))}
          </div>
          <span className="tb-arrow">→</span>
          <div className="tb-col mid">
            <NodeChip n={b.node} on />
          </div>
          <span className="tb-arrow">→</span>
          <div className="tb-col">
            {b.outLabel && <span className="tb-cap">{b.outLabel}</span>}
            {b.outs.map((n) => (
              <NodeChip key={n} n={n} />
            ))}
          </div>
        </div>
      );
    case 'dual':
      return (
        <div className="tb-dual">
          {(['a', 'b'] as const).map((s) => (
            <div key={s} className={`tb-flow h-${s}`}>
              <div className="tb-flow-head">
                <span className="tb-label">{s.toUpperCase()}계통</span>
                {b.groups && <GroupSwitch id={b.groups[s]} name={`${s.toUpperCase()}계통`} />}
              </div>
              <Chain nodes={b[s]} />
            </div>
          ))}
          <div className="tb-merge">
            <span className="tb-label">A + B</span>
            <span className="tb-arrow">→</span>
            <NodeChip n={b.to} on />
          </div>
        </div>
      );
    case 'specs':
      // 장비 이름 한 줄 + 고른 사양 항목들
      return (
        <dl className="tb-facts">
          {b.of.map(([id, keys]) => {
            const [eid, label] = id.split('|');
            const e = EQUIP_BY_ID[eid];
            if (!e) return null;
            return (
              <Fragment key={id}>
                <dt className="tb-eq">
                  {label ?? plainName(e.name)}
                  <em>{e.floor}</em>
                </dt>
                {keys.map((k) => {
                  const v = e.specs.find(([sk]) => sk === k)?.[1];
                  return v ? (
                    <Fragment key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </Fragment>
                  ) : null;
                })}
              </Fragment>
            );
          })}
        </dl>
      );
    case 'equips':
      return (
        <div className="tb-equips">
          {b.rows.map(([label, ids]) => (
            <div key={label}>
              <span className="tb-cap">{label}</span>
              <div className="tb-nodes">
                {ids.map((id) => (
                  <NodeChip key={id} n={`@${id}`} />
                ))}
              </div>
            </div>
          ))}
        </div>
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
    case 'contain':
      return <ContainCompare />;
    case 'rooms':
      return <RoomCompare />;
    case 'customers':
      return <CustomerTable />;
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
