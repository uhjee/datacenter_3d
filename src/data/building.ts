// 빌딩형 데이터센터 배치. 단위 m. x=동서(동쪽 +), z=남북(남쪽 +), y=높이.
// 각 층의 장비 좌표는 "그 층 바닥면" 기준 로컬 좌표다.

export type FloorId = 'B1' | '1F' | '2F' | '3F' | '4F' | 'PH';

export interface Floor {
  id: FloorId;
  name: string;
  index: number; // 아래에서부터 0
  y: number; // 바닥면 높이 (1F 바닥 = 0)
  height: number; // 층고
  summary: string;
}

export const FLOORS: Floor[] = [
  { id: 'B1', name: '지하 1층', index: 0, y: -5.5, height: 5.5, summary: '한전 수전, TR, 저압 배전, 비상 발전기, 냉동기 등 무거운 설비' },
  { id: '1F', name: '1층', index: 1, y: 0, height: 4.5, summary: '로비, 출입통제, 통합관제실' },
  { id: '2F', name: '2층', index: 2, y: 4.5, height: 4.5, summary: 'UPS실 A/B, 배터리실 A/B, 소화약제실' },
  { id: '3F', name: '3층', index: 3, y: 9, height: 5, summary: '서버실 A (공냉식 항온항습기)' },
  { id: '4F', name: '4층', index: 4, y: 14, height: 5, summary: '서버실 B (수냉식 항온항습기)' },
  { id: 'PH', name: '옥상 · 옥탑', index: 5, y: 19, height: 3.5, summary: '실외기, 냉각탑' },
];

export const FLOOR_BY_ID = Object.fromEntries(FLOORS.map((f) => [f.id, f])) as Record<FloorId, Floor>;

export const SLAB = 0.3; // 슬래브 두께 (바닥면 아래)
export const RAISED_H = 0.6; // 서버실 이중마루 높이
export const EXPLODE_GAP = 7; // 층 벌려 보기 시 층당 추가 간격

export const FOOTPRINT = { x: [-20, 20] as [number, number], z: [-12, 12] as [number, number] };

export type RoomKind = 'room' | 'server' | 'corridor' | 'roof';

export interface Room {
  id: string;
  floor: FloorId;
  name: string;
  x: [number, number];
  z: [number, number];
  color: string;
  kind: RoomKind;
  summary: string;
}

const R = (
  id: string,
  floor: FloorId,
  name: string,
  x: [number, number],
  z: [number, number],
  color: string,
  summary: string,
  kind: RoomKind = 'room',
): Room => ({ id, floor, name, x, z, color, kind, summary });

export const ROOMS: Room[] = [
  // B1
  R('b1-hv', 'B1', '특고압 수전실', [-20, -6], [-10, 0], '#3b3424', '한전 22.9kV를 받아 특고압 수배전반과 TR로 380/220V까지 낮춥니다.'),
  R('b1-lv', 'B1', '저압 전기실', [-6, 6], [-10, 0], '#3b3424', '저압 배전반 A/B, ATS A/B, 공조 동력반 A/B가 있습니다.'),
  R('b1-gen', 'B1', '발전기실', [-20, 6], [0, 12], '#2f3a25', '비상 발전기 2대(N+1)와 연료 탱크가 있습니다.'),
  R('b1-chiller', 'B1', '냉동기실', [6, 20], [-10, 12], '#24343d', '서버실 B(수냉식)에 보낼 냉수를 만드는 냉동기, 펌프, 판형 열교환기가 있습니다.'),
  // 1F
  R('1f-lobby', '1F', '로비 · 출입통제', [-20, 2], [-10, 12], '#30303a', '방문자 출입과 1차 출입통제가 이뤄지는 공간입니다.'),
  R('1f-noc', '1F', '통합관제실', [2, 20], [-10, 4], '#2c2a3d', '전력·공조·방재 상태를 24시간 감시합니다. 소화 수신반이 있습니다.'),
  R('1f-dock', '1F', '반입실', [2, 20], [4, 12], '#30303a', '장비 반입·하역 공간입니다.', 'corridor'),
  // 2F
  R('2f-ups-a', '2F', 'UPS실 A', [-20, -4], [-10, 1], '#26313d', 'A계통 UPS가 있습니다. 서버실 A·B의 A계통 전원을 모두 담당합니다.'),
  R('2f-bat-a', '2F', '배터리실 A', [-20, -4], [1, 12], '#233a35', 'UPS-A용 리튬이온 배터리. UPS실·서버실과 방화구획으로 분리합니다.'),
  R('2f-corr', '2F', '복도', [-4, 4], [-10, 2], '#2a2a2f', '복도', 'corridor'),
  R('2f-agent', '2F', '소화약제실', [-4, 4], [2, 12], '#3a2626', '가스 소화설비의 저장용기가 있습니다. 2F~4F 방호구역을 담당합니다.'),
  R('2f-ups-b', '2F', 'UPS실 B', [4, 20], [-10, 1], '#3d3126', 'B계통 UPS가 있습니다. 서버실 A·B의 B계통 전원을 모두 담당합니다.'),
  R('2f-bat-b', '2F', '배터리실 B', [4, 20], [1, 12], '#233a35', 'UPS-B용 리튬이온 배터리. A와 다른 방화구획입니다.'),
  // 3F
  R('3f-sr-a', '3F', '서버실 A (공냉식)', [-20, 14], [-10, 12], '#1d2833', '공냉식 항온항습기로 냉각하는 서버실. 랙이 등을 맞댄 열복도를 막은 열복도 봉쇄(HAC) 3개 포드, 랙 216대. 열은 냉매 배관으로 옥상 실외기에 버립니다. 동쪽은 나중에 들인 증설 블록(25~36번)입니다.', 'server'),
  R('3f-ante', '3F', '전실 · 출입통제', [14, 20], [-10, 12], '#30303a', '서버실 출입 전 인증 공간입니다.', 'corridor'),
  // 4F
  R('4f-ante', '4F', '전실 · 출입통제', [-20, -14], [-10, 12], '#30303a', '서버실 출입 전 인증 공간입니다.', 'corridor'),
  R('4f-sr-b', '4F', '서버실 B (수냉식)', [-14, 20], [-10, 12], '#1d2c33', '수냉식 항온항습기로 냉각하는 서버실. 랙이 등을 맞댄 열복도와 포드 사이 · 바깥 냉복도의 봉쇄 없는 배치, 랙 216대. 열은 냉수로 지하 냉동기에 보냅니다. 서쪽은 나중에 들인 증설 블록(25~36번)입니다.', 'server'),
  // PH
  R('ph-roof', 'PH', '옥상', [-20, 20], [-10, 12], '#2e3236', '실외기와 냉각탑이 있는 옥상 기계 공간입니다.', 'roof'),
];

export const ROOM_BY_ID = Object.fromEntries(ROOMS.map((r) => [r.id, r])) as Record<string, Room>;

// ── 수직 샤프트 (공간 요소) ──
export interface Shaft {
  id: string;
  name: string;
  x: [number, number];
  z: [number, number];
  floors: FloorId[];
  color: string;
  summary: string;
}

const ALL: FloorId[] = ['B1', '1F', '2F', '3F', '4F', 'PH'];

export const SHAFTS: Shaft[] = [
  {
    id: 'eps-a',
    name: 'EPS-A (전기 샤프트 A)',
    x: [-20, -17],
    z: [-12, -10],
    floors: ALL,
    color: '#3d8bfd',
    summary: 'A계통 전력 케이블이 지나는 수직 통로입니다. B계통과 반대편에 두어 물리적으로 분리합니다. 옥상 공조 설비의 동력 케이블도 이곳으로 올라갑니다.',
  },
  {
    id: 'ref',
    name: '냉매 배관 샤프트',
    x: [-14, -12],
    z: [-12, -10],
    floors: ['3F', '4F', 'PH'],
    color: '#c77dff',
    summary: '3F 공냉식 항온항습기와 옥상 실외기를 잇는 냉매 배관이 지납니다.',
  },
  {
    id: 'core',
    name: '코어 (계단 · 승강기)',
    x: [-3, 3],
    z: [-12, -10],
    floors: ALL,
    color: '#868e96',
    summary: '계단과 승강기가 있는 수직 동선입니다.',
  },
  {
    id: 'ps',
    name: 'PS (배관 샤프트)',
    x: [12, 14.5],
    z: [-12, -10],
    floors: ALL,
    color: '#22b8cf',
    summary: '냉수(B1 냉동기 ↔ 4F 서버실 B)와 냉각수(B1 냉동기 ↔ 옥상 냉각탑) 배관이 지납니다.',
  },
  {
    id: 'eps-b',
    name: 'EPS-B (전기 샤프트 B)',
    x: [17, 20],
    z: [-12, -10],
    floors: ALL,
    color: '#fd7e14',
    summary: 'B계통 전력 케이블이 지나는 수직 통로입니다. 옥상 공조 설비의 B계통 동력 케이블도 지납니다.',
  },
];

// ── 서버실 랙 배치 ──
// 상면 배치 근거: 바닥 타일 0.6m, 통로 2장(1.2m) · 랙 깊이 1.2m · 통로 1.2m의 표준 피치.
// 안쪽 통로를 사이에 둔 두 열이 한 묶음(포드)이고 피치는 4.8m. 서버실마다 포드 3개 = 6열.
// 두 서버실 모두 안쪽 통로가 열복도(두 열이 등을 맞댐)이고, 포드 사이 · 바깥 통로가 냉복도(타공판)다.
// 서버실 A는 그 열복도를 봉쇄(HAC)하고, 서버실 B는 봉쇄 없이 둔다.
// 각 열은 12랙 블록으로 나뉘고, 블록 바깥 끝에 PDU가 선다(블록 사이는 이동 통로).
// 처음 두 블록(1~24번)이 개소 때 설치분이고, 항온항습기 반대쪽 빈 바닥에 세 번째 블록(25~36번)을 증설했다.
// 랙 번호를 바꾸지 않으려고 증설 블록은 위치와 관계없이 블록 2(25~36번)로 둔다.
export interface ServerRoomLayout {
  roomId: string;
  floor: FloorId;
  cz: number; // 포드 중심 z
  blocks: number[]; // 블록마다 서쪽 끝 x (0 · 1 = 개소분, 2 = 증설분)
  pduSide: (1 | -1)[]; // 블록마다 PDU가 서는 끝 (-1 서쪽, 1 동쪽)
  label: 'A' | 'B';
  hotInner?: boolean; // 포드 안쪽 통로가 열복도 (랙이 등을 맞댐)
}

export const RACK = { w: 0.6, d: 1.2, h: 2.2, U: 42 };
export const RACKS_PER_BLOCK = 12;
export const BLOCK_LEN = RACKS_PER_BLOCK * RACK.w; // 7.2m
export const EXPANSION_BLOCK = 2;

export const SERVER_ROOMS: ServerRoomLayout[] = [
  // 서버실 A: 항온항습기가 서쪽 벽, 증설 블록은 동쪽 (PDU는 벽 쪽 끝)
  { roomId: '3f-sr-a', floor: '3F', cz: 1, blocks: [-15.0, -5.4, 5.0], pduSide: [-1, 1, 1], label: 'A', hotInner: true },
  // 서버실 B: 항온항습기가 동쪽 벽, 증설 블록은 서쪽 (A와 좌우 대칭)
  { roomId: '4f-sr-b', floor: '4F', cz: 1, blocks: [-1.8, 7.8, -12.2], pduSide: [-1, 1, -1], label: 'B', hotInner: true },
];

export const POD_PITCH = 4.8;
export const AISLE_W = 1.2;
// 포드 안쪽 통로 중심 (두 열 사이, 포드 중심 기준)
export const INNER_AISLE_DZ = [-POD_PITCH, 0, POD_PITCH];
// 포드 바깥 통로 중심: 포드 사이와 바깥 양쪽
export const OUTER_AISLE_DZ = [-POD_PITCH * 1.5, -POD_PITCH / 2, POD_PITCH / 2, POD_PITCH * 1.5];
// 열 순서(북→남): 냉복도 | ←1열 | 열복도 | 2열→ | 냉복도 | ←3열 | 열복도 | 4열→ | 냉복도 | ←5열 | 열복도 | 6열→ | 냉복도
// facing = 랙 앞면(흡기)이 향하는 방향(z). 아래 값은 안쪽 통로가 냉복도일 때이고, 서버실별 방향은 rowFacing으로 구한다
export const ROW_OFFSETS: { dz: number; facing: 1 | -1 }[] = INNER_AISLE_DZ.flatMap((c) => [
  { dz: c - (AISLE_W / 2 + RACK.d / 2), facing: 1 as const },
  { dz: c + (AISLE_W / 2 + RACK.d / 2), facing: -1 as const },
]);

export const rowFacing = (sr: ServerRoomLayout, r: number) => ((sr.hotInner ? -1 : 1) * ROW_OFFSETS[r].facing) as 1 | -1;
// 서버실별 냉복도 · 열복도 중심 (포드 중심 기준)
export const coldAisleDZ = (sr: ServerRoomLayout) => (sr.hotInner ? OUTER_AISLE_DZ : INNER_AISLE_DZ);
export const hotAisleDZ = (sr: ServerRoomLayout) => (sr.hotInner ? INNER_AISLE_DZ : OUTER_AISLE_DZ);

// 블록 b의 i번째(0~11) 랙 중심 x
export const rackX = (sr: ServerRoomLayout, block: number, i: number) => sr.blocks[block] + RACK.w / 2 + i * RACK.w;
// 블록의 바깥 끝(PDU 쪽) x
export const blockOuterX = (sr: ServerRoomLayout, block: number) => sr.blocks[block] + (sr.pduSide[block] === 1 ? BLOCK_LEN : 0);
export const BLOCK_NAME = ['서쪽 블록', '동쪽 블록', '증설 블록'];
