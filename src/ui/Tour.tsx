// 가이드 투어 (docs/PLAN.md §7): 전기가 한전에서 랙까지, 열이 랙에서 옥상까지 가는 길을 단계별로 따라간다.
// 각 단계는 기존 기능(장비 선택 · 추적 · 계통 묶음 · 온도 보기 · 고객사 · 지표)을 그대로 불러 쓴다.

import { Compass, Hand, X } from 'lucide-react';
import { IconButton } from './kit';
import { useEffect } from 'react';
import type { AirCfg, RoomLabel } from '../data/thermal';
import { activateGroup, enterAir, enterHeat, exitThermal, focusFloor, focusItem, focusOverview, startTrace } from '../scene/focus';
import { useView, type PanelTab, type RackColorMode } from '../store/useView';

interface Step {
  title: string;
  place: string;
  body: string[];
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
    body: [
      '이 건물은 지하 1층(B1)부터 옥상(PH)까지 쌓인 빌딩형 데이터센터입니다.',
      '투어는 두 가지 길을 따라갑니다. ① 전기: 한전 → 변압 → 무정전 → 랙. ② 열: 랙 → 항온항습기 → 옥상 → 대기.',
      '각 단계에서 3D와 아래 도면(단선도 · 공조 흐름도)이 같은 장비를 함께 강조합니다.',
    ],
    run: () => {
      clean();
      tab('power');
      focusOverview();
    },
  },
  {
    title: '한전에서 전기를 받는 곳',
    place: 'B1 · 특고압 수전실',
    body: [
      '한전의 22.9kV 특고압을 지중 케이블 두 회선(본선 · 예비선)으로 받습니다.',
      '본선이 끊기면 특고압 수배전반의 ALTS가 예비선으로 자동 절체합니다. 아래 단선도에서 점선이 평상시 쓰지 않는 대기 경로입니다.',
    ],
    run: () => {
      clean();
      tab('power');
      focusItem('kepco-main');
    },
  },
  {
    title: '특고압 차단과 변압 (TR)',
    place: 'B1 · 특고압 수전실',
    body: [
      '특고압 수배전반의 VCB가 고장 전류를 끊고, TR이 22.9kV를 서버가 쓰는 380/220V로 낮춥니다.',
      'TR-A와 TR-B는 각각 전체 부하를 혼자 감당할 크기입니다(2N). 3D에서 TR-A까지 오는 길이 굵게 흐릅니다.',
    ],
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
    body: [
      '저압 배전반 A · B 사이에는 연계 ACB가 있어, TR 한 대를 정비할 때 다른 TR이 양쪽을 다 공급할 수 있습니다(평상시 개방).',
      'ATS는 상용 전원과 발전기 중 하나를 골라 UPS와 공조 동력반으로 보냅니다.',
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
    body: [
      '한전 전원이 끊기면 발전기 3대(N+1)가 10초 안에 기동해 발전기 모선에 전기를 모으고, ATS가 발전기 쪽으로 절체합니다.',
      '연료 저장탱크로 약 40시간(2대 정격 운전 기준)을 버팁니다. 이 단계는 "비상 전원" 계통 묶음을 켠 모습입니다.',
    ],
    run: () => {
      clean();
      tab('power');
      activateGroup('emergency');
    },
  },
  {
    title: '끊김 없는 전원: UPS와 리튬이온 배터리',
    place: '2F · UPS실 · 배터리실',
    body: [
      '정전 순간부터 발전기가 기동할 때까지 몇 초가 비는데, 그 사이를 리튬이온 배터리가 직류로 메우고 UPS가 교류로 바꿔 끊김 없이 보냅니다.',
      'UPS는 서버실마다 한 쌍(2N)입니다. UPS-A1은 서버실 A의 A계통 PDU와 STS-1에 전기를 보냅니다(하류 추적). 한 대가 멈춰도 그 서버실만 반대쪽 한 대로 버팁니다.',
    ],
    run: () => {
      clean();
      tab('power');
      focusItem('ups-a1');
      startTrace('down');
    },
  },
  {
    title: '같은 길이 하나 더: A계통 · B계통 (2N)',
    place: 'B1 → 2F → 3F ~ 5F',
    body: [
      '특고압 수배전반부터 랙까지 같은 길이 A · B 두 줄로 나뉘어 있고, 서로 다른 전기 샤프트(EPS-A · EPS-B)로 올라갑니다.',
      '랙은 rPDU-A · rPDU-B 두 줄로 받아서, 한쪽 계통이 통째로 멈춰도 서버가 계속 돕니다.',
    ],
    try: '왼쪽 "계통 묶음"에서 B계통을 눌러 반대쪽 길도 보세요.',
    run: () => {
      clean();
      tab('power');
      activateGroup('sys-A');
    },
  },
  {
    title: '랙 하나에서 거슬러 올라가기',
    place: '3F · 서버실 A',
    body: [
      '랙 하나를 고르고 상류 추적을 하면 rPDU-A는 PDU-A1-n → UPS-A1 → ATS-A … 한전까지, rPDU-B는 B계통으로 이어집니다.',
      '점선은 발전기 · 예비선 · 연계반처럼 평상시 쓰지 않는 대기 경로입니다.',
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
    body: [
      '항온항습기가 찬 공기를 이중마루 아래로 불어 넣으면 냉복도 타공판으로 올라와 랙 앞면으로 들어갑니다. 서버실 A는 포드 사이 · 바깥 통로가 냉복도입니다.',
      '서버를 지나며 10~15°C 데워진 공기는 랙 두 열이 등을 맞댄 열복도로 나와, 막힌 통로를 굴뚝 삼아 천장 리턴으로 올라가 항온항습기로 돌아갑니다. 점의 색이 온도입니다(파랑 → 노랑 → 빨강).',
      '열복도를 막은 상태(HAC)라 찬 공기와 더운 공기가 섞이지 않고, 방 전체가 찬 공기로 채워집니다.',
    ],
    run: () => {
      clean();
      air('A', { containment: 'HAC', blanking: true });
      enterAir('A');
    },
  },
  {
    title: '봉쇄를 없애면?',
    place: '3F · 서버실 A (수냉식)',
    body: [
      '열복도 봉쇄와 블랭킹 패널을 없앤 상태입니다. 랙 위로 넘어온 열기가 다시 흡기되고(재순환), 찬 공기 일부는 랙을 거치지 않고 돌아갑니다(바이패스).',
      '랙 색이 노랑 · 빨강으로 바뀐 곳이 권장 흡기 온도(27°C)를 넘은 랙입니다. 왼쪽 위 온도 카드의 요약도 함께 바뀝니다.',
    ],
    try: '왼쪽 위 온도 카드를 펼쳐 컨테인먼트 · 블랭킹을, 오른쪽 아래 급기 · 수치 카드에서 급기 온도를 바꿔 보세요. 서버실은 왼쪽 층 이동 막대(3F · 4F · 5F)로 바꿉니다.',
    run: () => {
      air('A', { containment: 'none', blanking: false });
      enterAir('A');
    },
  },
  {
    title: '온도를 한눈에: 히트맵과 2D 상면도',
    place: '4F · 서버실 B (수냉식 · 공냉식)',
    body: [
      '상단 [온도]를 켜면 서버실 바닥에 고른 높이(하 · 중 · 상)의 공기 온도 분포가 깔리고, 아래에는 위에서 본 2D 상면도가 열립니다.',
      '서버실 B는 봉쇄가 없어 열복도의 더운 공기가 랙 위와 열 끝으로 넘어옵니다. 2D 상면도에서 랙 칸의 색 · 숫자가 흡기 온도이고, 핫스팟 목록에 권장 상한을 넘은 랙이 모입니다.',
      '판정은 랙 흡기 기준입니다. 열복도가 빨간 것은 정상 배기입니다.',
    ],
    try: '2D 상면도의 [비교]를 눌러 봉쇄 방식을 바꿨을 때 온도가 어떻게 달라지는지 나란히 보세요.',
    run: () => {
      clean();
      restoreAir();
      enterHeat('B');
    },
  },
  {
    title: '이중마루도 봉쇄도 없으면: 서버실 C',
    place: '5F · 서버실 C (공냉식 전면 토출)',
    body: [
      '서버실 C는 이중마루 없이 슬래브 바닥에 랙을 세우고, 벽면 항온항습기가 일반 에어컨처럼 정면으로 찬 공기를 불어 넣습니다. 냉복도 · 열복도도 막지 않았습니다.',
      '찬 공기가 방을 건너는 동안 랙 배기와 섞여, 항온항습기에서 먼 서쪽 랙과 랙 위쪽 흡기가 높습니다. 세 서버실 모두 급기 20°C인데 이곳만 허용 상한(32°C)을 넘는 랙이 생기고, 바람도 더 많이 보내 냉각 전력이 가장 큽니다.',
      '3F(수냉식 · 열복도 봉쇄) → 4F(수냉 · 공냉 반반 · 봉쇄 없음) → 5F(공냉식 · 마루 · 봉쇄 없음) 순으로 효율이 낮아집니다.',
    ],
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
    body: [
      '항온항습기(공냉식)는 압축기를 품고 있고, 공기에서 빼앗은 열을 냉매 배관으로 옥상 실외기에 보내 대기로 버립니다. 4F에 3대, 5F에 6대가 있습니다.',
      '항온항습기와 실외기는 1:1 짝입니다. 실외기가 멈추면 짝인 항온항습기도 냉각을 못 합니다. 외기가 더울수록 효율이 떨어져 수냉식보다 냉각 전력이 큽니다.',
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
    body: [
      '서버실 A · B의 항온항습기(수냉식)는 압축기 없이 7°C 냉수 코일로 공기를 식힙니다.',
      '냉수는 지하 냉동기 4대에서 만들어 냉수 헤더에 모았다가 항온항습기 9대(3F 6대 · 4F 3대)로 나눕니다(다대다). 냉동기의 열은 냉각수로 옥상 냉각탑에 버립니다(냉동기 · 펌프 · 냉각탑 1:1:1).',
      '외기가 차가우면 냉동기 대신 판형 열교환기로 냉수를 만듭니다(프리쿨링).',
    ],
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
    body: ['가운데 실외기 9대는 서버실 B · C 공냉식 항온항습기의 열을, 동쪽 냉각탑 4대는 냉동기(서버실 A · B 수냉식)의 열을 대기로 버립니다.', '모든 공조 설비는 UPS를 거치지 않고 공조 동력반에서 전기를 받습니다.'],
    run: () => {
      clean();
      tab('cooling');
      focusFloor('PH');
    },
  },
  {
    title: '얼마나 효율적인가: PUE',
    place: '지표 · 용량',
    body: [
      'PUE는 총 시설 전력 ÷ IT 전력입니다. 1.0에 가까울수록 IT 말고 쓰는 전력(냉각 · 손실)이 적습니다.',
      '오른쪽 지표 탭에서 외기 온도를 낮추면 수냉식(3F · 4F)의 프리쿨링으로 PUE가 좋아지고, IT 부하율을 낮추면 고정 손실 때문에 PUE가 나빠집니다. 공냉식만 쓰는 5F는 프리쿨링이 없습니다.',
    ],
    try: '외기 온도 · IT 부하율 슬라이더를 움직여 보세요.',
    run: () => {
      clean();
      focusOverview();
      useView.getState().setRightTab('metrics');
    },
  },
  {
    title: '고객사와 계약 전력',
    place: '5F · 서버실 C',
    body: [
      '서버실 C는 전 구역을 고객사 A~E에 케이지로 임대합니다(코로케이션). 케이지는 랙과 앞 · 뒤 통로까지 철망으로 두른 전용 구역이라, 같은 통로를 바라보는 이웃 열은 비워 둡니다. 고객사 A는 블록 하나(72대)를 통째로 씁니다.',
      '고객사 카드는 계약 전력(사업자가 확보해 둔 전력) 대비 지금 쓰는 전력, 30일 최대(월 최대 수요로 초과 청구), 랙마다 A · B 회로 한쪽이 끊겼을 때의 여유를 보여 줍니다.',
      '고객사 B는 GPU 고밀도 랙이라 랙당 회로 여유를 먼저 봐야 합니다. 계약 초과 · 주의는 지표 탭과 [주의] 탭에도 모입니다.',
    ],
    try: '3D의 케이지나 고객사 이름표를 눌러 다른 고객사도 보세요.',
    run: () => {
      clean();
      focusItem('customer:B');
    },
  },
  {
    title: '방재 · 보안 (요약)',
    place: '2F 소화약제실 · 각 층',
    body: [
      '화재 감지기 회로 A · B가 모두 동작하면(교차회로) 소화 수신반이 20~30초 뒤 가스 소화설비를 방출합니다. 물 대신 가스를 써서 장비를 보호합니다.',
      '수냉식 설비가 있는 3F · 4F에는 누수 감지기, 출입구에는 출입통제 장치와 CCTV가 있습니다. 왼쪽 레이어에서 방재 · 보안을 켜고 끌 수 있습니다.',
    ],
    run: () => {
      clean();
      focusItem('gas-system');
    },
  },
  {
    title: '이제 직접 둘러보세요',
    place: '전체',
    body: [
      '장비를 누르면 정보 카드와 연결이 나오고, 상류 · 하류 추적으로 끝까지 따라갈 수 있습니다.',
      '상단 [검색](⌘K)으로 장비 · 랙 · 고객사 · 시나리오를 바로 찾고, [온도] · [도면], 오른쪽 "지표 · 용량" · "주의"를 오가며 같은 데이터센터를 여러 각도로 볼 수 있습니다.',
      '3D 아래 칩 줄에 지금 켜진 보기 · 강조가 모이고, 칩의 ✕로 바로 끌 수 있습니다. 제목 옆 ⓘ에 사용법이 있습니다.',
    ],
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

export function TourCard() {
  const step = useView((s) => s.tourStep);

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
    <div className="tour-card" role="dialog" aria-label="가이드 투어">
      <div className="tour-head">
        <span className="tour-ico">
          <Compass size={14} />
        </span>
        <span className="tour-n num">
          가이드 투어 · {step + 1} / {STEPS.length}
        </span>
        <span className="tour-place">{st.place}</span>
        <IconButton icon={X} label="투어 끝내기 (Esc)" onClick={endTour} />
      </div>
      <h3>{st.title}</h3>
      {st.body.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      {st.try && (
        <div className="tour-try">
          <Hand size={14} />
          <span>
            <b>해 보기</b> {st.try}
          </span>
        </div>
      )}
      <div className="tour-foot">
        <div className="tour-dots">
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
