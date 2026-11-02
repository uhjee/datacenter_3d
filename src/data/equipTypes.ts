// 장비유형 카탈로그 (docs/PLAN.md §2.2, §3.2, §4)
// 유형 단위 설명. 개별 장비의 수치는 equipment.ts에 있다.

export type Domain = 'power' | 'cooling' | 'fire' | 'security' | 'it';

export type TypeId =
  // 전력
  | 'kepco'
  | 'hvPanel'
  | 'tr'
  | 'lvPanel'
  | 'generator'
  | 'fuelTank'
  | 'ats'
  | 'ups'
  | 'battery'
  | 'sts'
  | 'pdu'
  | 'rpdu'
  | 'mcc'
  // 공조
  | 'crac'
  | 'cracFront'
  | 'crah'
  | 'condenser'
  | 'chiller'
  | 'coolingTower'
  | 'pump'
  | 'hx'
  | 'sensor'
  // 방재
  | 'fireDetector'
  | 'gasSystem'
  | 'firePanel'
  | 'leakDetector'
  // 보안
  | 'accessControl'
  | 'cctv'
  // IT
  | 'rack';

export interface EquipType {
  id: TypeId;
  code: string; // 기획안 번호 (P1, C1 ...)
  name: string;
  domain: Domain;
  role: string;
  detail: string[];
  perfPoints: string[]; // 성능 포인트 항목
}

export const DOMAIN_META: Record<Domain, { name: string; color: string }> = {
  power: { name: '전력', color: '#ffb84d' },
  cooling: { name: '공조', color: '#4dabf7' },
  fire: { name: '방재', color: '#ff6b6b' },
  security: { name: '보안', color: '#b197fc' },
  it: { name: 'IT', color: '#69db7c' },
};

const T = (t: EquipType) => t;

export const EQUIP_TYPES: EquipType[] = [
  // ───────── 전력 ─────────
  T({
    id: 'kepco',
    code: 'P1',
    name: '한전 인입',
    domain: 'power',
    role: '한국전력 22.9kV 특고압 배전선로를 받는 책임분계점입니다.',
    detail: [
      '국내 데이터센터는 대부분 한전 22.9kV-Y(3상 4선)로 수전합니다. 중요 시설은 본선·예비선 2회선으로 받고, 본선이 끊기면 ALTS가 예비선으로 자동 절체합니다.',
      '도심 빌딩형은 지중(땅속) 케이블로 지하 수전실에 인입하는 경우가 많습니다.',
    ],
    perfPoints: ['수전 전압', '계약 전력'],
  }),
  T({
    id: 'hvPanel',
    code: 'P2',
    name: '특고압 수배전반',
    domain: 'power',
    role: '22.9kV를 개폐·계량·보호한 뒤 TR로 보내는 특고압 배전반입니다.',
    detail: [
      '수전부: ALTS(본선/예비선 자동 절체) → LBS(부하개폐기) → MOF(한전 계량용 변성기) → LA(피뢰기)/PF(전력퓨즈).',
      '배전부: VCB(진공차단기)가 단락 같은 사고 전류를 끊어 TR과 하위 설비를 보호합니다. A/B 두 계통으로 나뉘어 TR-A, TR-B에 각각 공급합니다.',
    ],
    perfPoints: ['정격 전압 (24kV급)', 'VCB 차단 용량'],
  }),
  T({
    id: 'tr',
    code: 'P3',
    name: 'TR',
    domain: 'power',
    role: '22.9kV 특고압을 건물에서 쓰는 380/220V 저압으로 낮추는 변압기입니다.',
    detail: [
      '단선도와 현장에서는 변압기를 TR(Transformer)로 표기합니다. 실내 전기실에는 기름이 없어 화재 위험이 적은 몰드형을 주로 씁니다.',
      '효율은 98~99%지만 부하와 무관하게 늘 생기는 무부하손(철손)이 있어 PUE에 반영됩니다.',
      'TR-A, TR-B 각각 전체 부하를 감당하는 용량(2N)으로, 한 대를 정비할 때 저압반 연계 ACB를 닫아 다른 한 대가 양쪽을 맡습니다.',
    ],
    perfPoints: ['용량 kVA', '효율', '무부하손 · 부하손'],
  }),
  T({
    id: 'lvPanel',
    code: 'P4',
    name: '저압 배전반',
    domain: 'power',
    role: 'TR 2차측 380V를 ACB(기중차단기)로 받아 각 계통으로 나눕니다.',
    detail: [
      'A/B 두 면으로 나뉘며, 사이의 연계 ACB는 평소 개방되어 있습니다. TR 한 대를 정비할 때만 닫아 다른 TR이 양쪽 부하를 맡게 합니다(동시 유지보수).',
    ],
    perfPoints: ['ACB 정격 전류'],
  }),
  T({
    id: 'generator',
    code: 'P5',
    name: '비상 발전기',
    domain: 'power',
    role: '한전 정전 시 디젤 엔진으로 전기를 만들어 공급합니다.',
    detail: [
      '정전을 감지하면 자동 기동해 약 10초 이내에 정격 전압·주파수를 확립합니다. 그 사이는 UPS의 리튬이온 배터리가 버팁니다.',
      '2대를 병렬 운전(N+1)하여 한 대가 기동에 실패해도 필요한 부하를 감당합니다. 발전기 모선에서 ATS-A, ATS-B의 발전기측으로 공급합니다.',
    ],
    perfPoints: ['출력 kW', '기동 시간'],
  }),
  T({
    id: 'fuelTank',
    code: 'P6',
    name: '연료 탱크',
    domain: 'power',
    role: '비상 발전기의 경유를 저장하고 공급합니다.',
    detail: ['대용량 공용 저장탱크에서 발전기별 서비스 탱크로 이송해 사용합니다. 현장에 최소 12시간, 실무상 24~72시간분을 보유합니다.'],
    perfPoints: ['용량 L', '운전 가능 시간'],
  }),
  T({
    id: 'ats',
    code: 'P7',
    name: 'ATS',
    domain: 'power',
    role: '한전 전원이 끊기면 비상 발전기 쪽으로 기계식 절체하는 스위치입니다.',
    detail: [
      'ATS는 수 초가 걸리는 기계식 스위치입니다. 발전기가 붙는 약 10초는 어차피 전원이 없으므로 빠를 필요가 없고, 그 공백은 UPS가 메웁니다.',
      '그래서 UPS 앞에는 ATS, UPS 뒤에는 고속 반도체 스위치인 STS를 둡니다.',
    ],
    perfPoints: ['정격 전류', '절체 시간'],
  }),
  T({
    id: 'ups',
    code: 'P8',
    name: 'UPS',
    domain: 'power',
    role: '전원이 끊겨도 순간의 끊김 없이(무순단) IT 장비에 전기를 공급합니다.',
    detail: [
      '온라인 이중변환 방식은 평소에도 AC→DC(정류기)→AC(인버터)로 변환해 공급하므로 정전 시 절체 시간이 0입니다.',
      '서버실마다 UPS 한 쌍(2N)을 둡니다: UPS-A1 · B1은 서버실 A, A2 · B2는 B, A3 · B3는 C. 평소 각자 그 서버실 IT 부하의 절반을 맡고, 한쪽이 고장 나면 다른 쪽이 100%를 감당하므로 한 대의 부하율은 50% 이하로 운영합니다.',
      'UPS 한 대가 멈춰도 영향은 그 서버실에만 머뭅니다(장애 범위를 서버실로 한정). 다층 코로케이션에서 층마다 전용 전원을 두는 방식입니다.',
    ],
    perfPoints: ['용량 kVA / kW', '효율', '부하율'],
  }),
  T({
    id: 'battery',
    code: 'P9',
    name: '리튬이온 배터리',
    domain: 'power',
    role: 'UPS의 직류 에너지원으로, 발전기가 기동할 때까지 IT 부하를 버팁니다.',
    detail: [
      '정격 부하 기준 5~15분을 버티도록 설계합니다. BMS(배터리 관리 시스템)가 셀 전압·온도·SOC(충전 상태)를 감시합니다.',
      '납축전지보다 작고 수명이 길지만 열폭주 위험이 있습니다. 2022년 판교, 2025년 국가정보자원관리원 화재가 모두 UPS용 리튬이온 배터리에서 시작해, 배터리실을 서버실·UPS실과 다른 방화구획으로 분리합니다.',
    ],
    perfPoints: ['용량 kWh', '백업 시간', '셀 온도 · SOC'],
  }),
  T({
    id: 'sts',
    code: 'P10',
    name: 'STS',
    domain: 'power',
    role: '그 서버실 UPS 한 쌍(A · B)의 두 출력 중 하나를 골라 전원 코드가 하나뿐인 장비에 공급합니다.',
    detail: [
      'STS는 UPS 하류에 있습니다. 반도체(SCR) 스위치로 4~8ms 안에 절체하므로 장비가 꺼지지 않습니다. 두 UPS 출력의 위상이 맞아야(LBS) 바로 절체됩니다.',
      '흔한 오해와 달리 순서는 "수배전반 → ATS → UPS → STS → PDU"입니다. STS에는 분기 차단기가 없어 뒤에 전용 분전반(PDU-S)을 둡니다.',
      '단일전원 장비 전용입니다. 이중전원 랙은 STS 없이 rPDU-A · B로 받아, 한 계통이 끊겨도 절체 없이 반대쪽으로 계속 돕니다.',
      'STS 출력부터는 단일 경로라 STS 자체가 단일 고장점이 됩니다. 보호 효과를 키우려고 부하 가까이(서버실 안)에 둡니다.',
    ],
    perfPoints: ['정격 전류', '절체 시간 4~8ms'],
  }),
  T({
    id: 'pdu',
    code: 'P11',
    name: 'PDU',
    domain: 'power',
    role: 'UPS 출력을 서버실의 각 랙열로 나눠 보내는 분전반입니다.',
    detail: [
      '서버실 가장자리에 둡니다. 서버실마다 A계통 PDU와 B계통 PDU를 따로 둡니다. 공용 UPS의 출력이 여기서 서버실별로 갈라집니다.',
      '국내는 380/220V를 그대로 쓰므로 변압기 없는 분전반형이 흔합니다.',
      'PDU-S는 STS 출력을 받아 단일전원 랙에 나눠 주는 전용 분전반입니다. 국내는 STS반과 분전반을 따로 두는 구성이 흔합니다.',
    ],
    perfPoints: ['용량 kVA', '분기 회로 수'],
  }),
  T({
    id: 'rpdu',
    code: 'P12',
    name: 'rPDU',
    domain: 'power',
    role: '랙 안에서 서버에 콘센트를 나눠 주고 전력을 계측합니다. IT 전력 측정점입니다.',
    detail: ['랙 후면에 A·B 두 개를 세로로 설치합니다. 이중전원 서버는 PSU 두 개를 각각 rPDU-A, rPDU-B에 꽂습니다.'],
    perfPoints: ['용량 (단상 ≈7kVA / 3상 ≈22kVA)'],
  }),
  T({
    id: 'mcc',
    code: 'P13',
    name: '공조 동력반',
    domain: 'power',
    role: '항온항습기, 냉동기, 펌프, 냉각탑, 실외기에 동력을 공급합니다.',
    detail: [
      '공조 설비는 UPS를 거치지 않고 ATS 하류(발전기 백업)에서 받습니다. 그래서 정전 직후 발전기가 붙기 전까지 공조가 잠시 멈춥니다.',
      'A/B 두 면에 공조 설비를 교차 배분해, 동력반 하나가 꺼져도 냉각 N+1을 유지합니다.',
    ],
    perfPoints: ['정격 용량'],
  }),

  // ───────── 공조 ─────────
  T({
    id: 'crac',
    code: 'C1',
    name: '항온항습기(공냉식)',
    domain: 'cooling',
    role: '내부 압축기로 냉매를 직접 증발시켜 공기를 식히고, 이중마루 아래로 찬 공기를 내보냅니다.',
    detail: [
      '상부로 더운 공기를 빨아들여 증발기 코일로 식힌 뒤 하부(이중마루 하부)로 내보내는 하향 취출 방식입니다.',
      '빼앗은 열은 냉매 배관을 통해 옥상의 짝이 되는 실외기로 보내 대기에 버립니다(1:1 연결). 외기 온도가 오르면 효율이 떨어져 수냉식보다 냉각 전력이 큽니다.',
      '온도와 습도를 함께 제어해서 "항온항습기"라 부릅니다. 4F 서버실 B에 수냉식과 번갈아 3대가 있습니다.',
    ],
    perfPoints: ['냉각 용량 kW', '풍량', '급기 설정온도'],
  }),
  T({
    id: 'cracFront',
    code: 'C1F',
    name: '항온항습기(공냉식 전면 토출)',
    domain: 'cooling',
    role: '이중마루 없이 기기 정면으로 찬 공기를 서버실에 바로 불어 넣는 공냉식 항온항습기입니다. 일반 에어컨처럼 급기합니다.',
    detail: [
      '상부로 실내 공기를 빨아들여 식힌 뒤 정면으로 수평 토출합니다. 마루 아래 급기 통로가 없어 냉기가 서버실 전체에 퍼진 뒤에야 랙 앞에 닿습니다.',
      '봉쇄가 없으면 랙 배기와 섞이는 양이 많아, 랙 흡기를 권장 범위에 두려고 급기를 더 낮게(약 16°C) 운전하고 바람도 더 많이 보냅니다. 그만큼 냉각 전력이 큽니다.',
      '열은 공냉식과 같이 옥상 실외기로 버립니다(1:1). 5F 서버실 C에 6대(N+1)가 있습니다.',
    ],
    perfPoints: ['냉각 용량 kW', '풍량', '급기 설정온도'],
  }),
  T({
    id: 'crah',
    code: 'C2',
    name: '항온항습기(수냉식)',
    domain: 'cooling',
    role: '냉동기에서 온 냉수(약 7°C)로 공기를 식히는 냉수형 항온항습기입니다.',
    detail: [
      '안에 압축기가 없습니다. 냉수 코일과 팬, 밸브만 있고 실제 냉동은 지하 냉동기가 합니다.',
      '냉수 헤더를 통해 냉동기 4대와 여러 대 대 여러 대로 연결됩니다. 3F 서버실 A에 6대, 4F 서버실 B에 3대가 있습니다. 서버실 안으로 물 배관이 들어오므로 누수 감지기를 함께 둡니다.',
      '냉동기는 실외기보다 효율(COP)이 높고 외기가 낮으면 프리쿨링도 쓸 수 있어, 세 방식 중 냉각 전력이 가장 적습니다.',
    ],
    perfPoints: ['냉각 용량 kW', '풍량', '급기 설정온도', '밸브 개도'],
  }),
  T({
    id: 'condenser',
    code: 'C3',
    name: '실외기',
    domain: 'cooling',
    role: '공냉식 항온항습기가 빼앗은 열을 냉매로 받아 대기로 버립니다.',
    detail: ['팬으로 외기를 불어 냉매를 응축시킵니다. 외기 온도가 높을수록 효율(COP)이 떨어집니다. 항온항습기(공냉식)와 1:1로 짝지어집니다.'],
    perfPoints: ['방열 용량', '외기 대응 범위'],
  }),
  T({
    id: 'chiller',
    code: 'C4',
    name: '냉동기',
    domain: 'cooling',
    role: '항온항습기(수냉식)로 보낼 7°C 냉수를 만들고, 그 열을 냉각수로 넘깁니다.',
    detail: [
      '냉수 루프(냉동기 ↔ 항온항습기, 7/12°C)와 냉각수 루프(냉동기 ↔ 냉각탑, 32/37°C) 두 물 순환의 중심입니다.',
      '4대(N+1)이며, 냉각수 측은 냉동기-n ↔ 냉각수 펌프-n ↔ 냉각탑-n으로 1:1:1 조를 이룹니다.',
    ],
    perfPoints: ['냉동 용량 RT', 'COP', '냉수 공급온도'],
  }),
  T({
    id: 'coolingTower',
    code: 'C5',
    name: '냉각탑',
    domain: 'cooling',
    role: '냉각수를 공기와 접촉·증발시켜 냉동기의 열을 최종적으로 대기에 버립니다.',
    detail: [
      '서버실 B의 열은 서버 → 실내 공기 → 항온항습기(수냉식) → 냉수 → 냉동기 → 냉각수 → 냉각탑 → 대기로 릴레이처럼 전달됩니다.',
      '외기가 충분히 차가우면 냉각탑 냉각수로 판형 열교환기를 거쳐 냉수를 직접 만듭니다(프리쿨링).',
    ],
    perfPoints: ['방열 용량', '냉각수 출구온도'],
  }),
  T({
    id: 'pump',
    code: 'C6',
    name: '순환 펌프',
    domain: 'cooling',
    role: '냉수(냉동기 ↔ 항온항습기)와 냉각수(냉동기 ↔ 냉각탑)를 순환시킵니다.',
    detail: ['냉동기마다 냉수 펌프 1대, 냉각수 펌프 1대가 짝을 이룹니다. 인버터로 회전수를 조절해 전력을 아낍니다.'],
    perfPoints: ['유량', '양정', '소비전력'],
  }),
  T({
    id: 'hx',
    code: 'C7',
    name: '판형 열교환기',
    domain: 'cooling',
    role: '외기가 낮을 때 냉동기를 거치지 않고 냉각수로 냉수를 직접 식힙니다(프리쿨링).',
    detail: ['냉동기 압축기를 멈출 수 있어 겨울철 냉각 전력과 PUE를 크게 줄입니다.'],
    perfPoints: ['열교환 용량', '접근 온도차'],
  }),
  T({
    id: 'sensor',
    code: 'C8',
    name: '온습도 센서',
    domain: 'cooling',
    role: '랙 흡기 온도·습도를 측정합니다.',
    detail: [
      '서버가 실제로 빨아들이는 공기를 재야 하므로 랙 전면 상·중·하에 설치합니다. 랙 상단이 가장 더워지기 쉬운 지점입니다.',
      'ASHRAE 권장 흡기 온도는 18~27°C입니다.',
    ],
    perfPoints: ['측정 범위 · 정확도', '측정값'],
  }),

  // ───────── 방재 ─────────
  T({
    id: 'fireDetector',
    code: 'F1',
    name: '화재 감지기',
    domain: 'fire',
    role: '연기·열을 감지해 소화 수신반에 신호를 보냅니다.',
    detail: [
      '종류: 광전식 연기감지기, 열감지기, VESDA(공기흡입형, 극미량 연기 조기 감지), 리튬이온 배터리 오프가스 감지기.',
      '가스 소화설비는 감지기 회로 A와 B가 모두 동작해야 기동합니다(교차회로, 오방출 방지).',
    ],
    perfPoints: ['감도', '감지 방식'],
  }),
  T({
    id: 'gasSystem',
    code: 'F2',
    name: '가스 소화설비',
    domain: 'fire',
    role: '서버실·UPS실·배터리실에 가스 약제를 방출해 불을 끕니다.',
    detail: [
      '물을 쓰면 장비가 손상되므로 가스를 씁니다. 현장에서는 관습적으로 "하론"이라 부르지만 지금은 HFC-227ea, FK-5-1-12, IG-541 같은 대체 약제를 씁니다.',
      '구성: 저장용기 → 기동용기(솔레노이드) → 선택밸브(방출 구역 선택) → 배관 → 분사헤드. 압력스위치가 실제 방출을 확인합니다.',
      '저장용기는 2F 소화약제실 한 곳에 두고 선택밸브로 2F~4F 방호구역을 모두 담당합니다.',
    ],
    perfPoints: ['약제 종류', '충전량 kg', '설계 농도'],
  }),
  T({
    id: 'firePanel',
    code: 'F3',
    name: '소화 수신반',
    domain: 'fire',
    role: '감지 신호를 판단해 가스 소화설비를 기동합니다.',
    detail: [
      '교차회로를 판단하고 방출 전 20~30초 지연 타이머로 대피 시간을 줍니다.',
      '하위 구성품: 방출표시등(방출 시 "가스 방출 중 입실 금지" 점등), 수동조작함·방출지연 스위치(각 방호구역 출입문 외부).',
    ],
    perfPoints: ['지연 시간', '회로 수'],
  }),
  T({
    id: 'leakDetector',
    code: 'F4',
    name: '누수 감지기',
    domain: 'fire',
    role: '수냉식 설비 주변에 깐 감지선으로 물이 새는 위치를 찾습니다.',
    detail: ['케이블형 감지선이 누수 지점까지의 거리(m)를 표시합니다.'],
    perfPoints: ['감지 길이', '위치 정확도'],
  }),

  // ───────── 보안 ─────────
  T({
    id: 'accessControl',
    code: 'S1',
    name: '출입통제 장치',
    domain: 'security',
    role: '카드·생체 인증으로 인가된 사람만 출입시킵니다.',
    detail: ['로비 스피드게이트와 서버실 입구(맨트랩, 카드+생체 2단계 인증)로 구성합니다.'],
    perfPoints: ['인증 방식'],
  }),
  T({
    id: 'cctv',
    code: 'S2',
    name: 'CCTV',
    domain: 'security',
    role: '출입구와 랙열을 녹화합니다.',
    detail: ['영상은 통합관제실에서 감시·보관합니다.'],
    perfPoints: ['보관 기간'],
  }),

  // ───────── IT (추후 확장) ─────────
  T({
    id: 'rack',
    code: 'IT',
    name: '랙',
    domain: 'it',
    role: '서버·스토리지·네트워크 장비를 싣는 캐비닛입니다.',
    detail: ['IT 장비는 추후 단계에서 상세화합니다. 현재는 공간(U)·전력 용량과 rPDU A/B 연결을 보여주는 용도입니다.'],
    perfPoints: ['U 수', '랙당 전력 할당 kW'],
  }),
];

export const TYPE_BY_ID = Object.fromEntries(EQUIP_TYPES.map((t) => [t.id, t])) as Record<TypeId, EquipType>;
