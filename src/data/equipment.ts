// 장비 개체 배치 (docs/PLAN.md §1~§4)
// pos는 해당 층 바닥면 기준 로컬 좌표, 장비 바닥 중심.
// size = [폭, 높이, 깊이]는 장비 자체 기준(전면 = +z)이며 rotY로 회전한다.

import { COLD_AISLE_DZ, RACK, RACKS_PER_BLOCK, RAISED_H, ROW_OFFSETS, SERVER_ROOMS, blockOuterX, rackX, type FloorId, type ServerRoomLayout } from './building';
import type { TypeId } from './equipTypes';
import { RACKS } from './racks';

type V3 = [number, number, number];

export interface Equip {
  id: string;
  type: TypeId;
  name: string;
  floor: FloorId;
  room: string;
  pos: V3;
  size: V3;
  rotY?: number;
  system?: string; // A계통 / B계통 / 공용 / N+1 등
  specs: [string, string][];
  note?: string;
  area?: { x: [number, number]; z: [number, number] }; // 여러 지점에 걸친 장비(감지기 등)
}

const F = RAISED_H;
const E = (e: Equip) => e;

const SR_A = SERVER_ROOMS[0];
const SR_B = SERVER_ROOMS[1];
// 항온항습기 · 실외기 6대 (N+1: 5대 운전 + 1대 예비)의 z 위치
const COOL_Z = [-7, -3.6, -0.2, 3.2, 6.6, 10];

// 센서 위치: (열 0~5, 랙 번호 0~23). 냉복도마다 두 곳, 서쪽 · 동쪽 블록에 하나씩
const SENSOR_SLOTS: [number, number][] = [
  [0, 4],
  [1, 18],
  [2, 7],
  [3, 15],
  [4, 3],
  [5, 20],
];

function sensors(room: ServerRoomLayout): Equip[] {
  return SENSOR_SLOTS.map(([r, i], n) => {
    const row = ROW_OFFSETS[r];
    const z = room.cz + row.dz + row.facing * (RACK.d / 2 + 0.04);
    const block = i < RACKS_PER_BLOCK ? 0 : 1;
    return E({
      id: `sensor-${room.label.toLowerCase()}-${n + 1}`,
      type: 'sensor',
      name: `온습도 센서 ${room.label}-${n + 1}`,
      floor: room.floor,
      room: room.roomId,
      pos: [rackX(room, block, i % RACKS_PER_BLOCK), F + 0.1, z],
      size: [0.14, 2.0, 0.06],
      specs: [
        ['측정 위치', `${r + 1}열 ${i + 1}번 랙 전면 (상·중·하)`],
        ['측정 범위', '-20~60°C / 0~100%RH'],
        ['정확도', '±0.3°C'],
        ['기준', '권장 흡기 18~27°C'],
      ],
    });
  });
}

// PDU: 포드(냉복도를 마주 보는 두 열) × 블록마다 A · B 한 대씩 = 서버실당 PDU-A 6대 + PDU-B 6대.
// PDU 한 대 = 랙 22~24대. 랙 수는 차단기 극수가 아니라 전력이 정한다: 225kVA × 80%(연속 부하) × 역률 0.9 ≈ 162kW 안에
// 담당 랙의 설계 전력 합이 들어가야 하고(GPU 열 포드는 180kW라 300kVA), 42극 분전반 2면(84극) 중 24회로만 써서 증설 여유를 둔다.
// A는 앞열(1·3·5열) 끝, B는 뒷열(2·4·6열) 끝에 선다.
export const pduId = (sys: 'a' | 'b', room: ServerRoomLayout, n: number) => `pdu-${sys}${room.label === 'A' ? 1 : 2}-${n}`;
export const pduIndex = (pod: number, block: number) => pod * 2 + block + 1;

function pdus(room: ServerRoomLayout): Equip[] {
  const out: Equip[] = [];
  const rn = room.label === 'A' ? 1 : 2;
  for (let pod = 0; pod < 3; pod++) {
    for (const block of [0, 1]) {
      const n = pduIndex(pod, block);
      const side = block === 0 ? -1 : 1;
      const x = blockOuterX(room, block) + side * 0.5;
      const rows = `${pod * 2 + 1}·${pod * 2 + 2}열 ${block === 0 ? '서쪽' : '동쪽'} 블록`;
      // 담당 랙의 설계 전력 합으로 PDU 용량을 고른다 (GPU 열이 있는 포드는 300kVA)
      const racks = RACKS.filter((r) => r.serverRoom === room.label && r.pod === pod && r.block === block && r.feed === 'AB');
      const design = racks.reduce((sum, r) => sum + r.designKw, 0);
      const kva = design <= 162 ? 225 : 300;
      for (const sys of ['a', 'b'] as const) {
        const row = ROW_OFFSETS[pod * 2 + (sys === 'a' ? 0 : 1)];
        const S = sys.toUpperCase();
        out.push(
          E({
            id: pduId(sys, room, n),
            type: 'pdu',
            name: `PDU-${S}${rn}-${n}`,
            floor: room.floor,
            room: room.roomId,
            pos: [x, F, room.cz + row.dz],
            size: [0.8, 2.0, 0.9],
            rotY: side * (Math.PI / 2),
            system: `${S}계통`,
            specs: [
              ['입력', `UPS-${S} 출력 380V`],
              ['용량', `${kva}kVA (연속 부하 80% ≈ ${Math.round(kva * 0.8 * 0.9)}kW)`],
              ['분기', `42극 분전반 2면(84극) 중 ${racks.length}회로 사용`],
              ['담당', `서버실 ${room.label} ${rows} 랙 ${racks.length}대의 rPDU-${S} (설계 ${design}kW)`],
            ],
          }),
        );
      }
    }
  }
  // STS: 6열 동쪽 블록 끝 단일전원 랙 2대용. PDU-B 바깥에 선다
  const sx = blockOuterX(room, 1) + 1.45;
  const row = ROW_OFFSETS[5];
  out.push(
    E({
      id: `sts-${rn}`,
      type: 'sts',
      name: `STS-${rn}`,
      floor: room.floor,
      room: room.roomId,
      pos: [sx, F, room.cz + row.dz],
      size: [0.8, 2.0, 0.8],
      rotY: Math.PI / 2,
      system: 'A/B 선택',
      specs: [
        ['입력', 'UPS-A 출력 / UPS-B 출력'],
        ['절체 시간', '4~8ms (반도체)'],
        ['정격', '100A'],
        ['대상', `서버실 ${room.label} 6열 23·24번 단일전원 랙`],
      ],
    }),
  );
  return out;
}

export const EQUIPMENT: Equip[] = [
  // ════════ B1 ════════
  E({
    id: 'kepco-main',
    type: 'kepco',
    name: '한전 인입 (본선)',
    floor: 'B1',
    room: 'b1-hv',
    pos: [-19.3, 0, -7.6],
    size: [0.9, 2.2, 1.2],
    system: '본선 (상시)',
    specs: [
      ['전압', '22.9kV-Y 3상 4선'],
      ['인입 방식', '지중 케이블'],
      ['계약 전력', '5,000kW'],
    ],
  }),
  E({
    id: 'kepco-standby',
    type: 'kepco',
    name: '한전 인입 (예비선)',
    floor: 'B1',
    room: 'b1-hv',
    pos: [-19.3, 0, -4.6],
    size: [0.9, 2.2, 1.2],
    system: '예비선',
    specs: [
      ['전압', '22.9kV-Y 3상 4선'],
      ['인입 방식', '지중 케이블 (본선과 다른 변전소·경로)'],
      ['역할', '본선 정전 시 ALTS로 자동 절체'],
    ],
  }),
  E({
    id: 'hv-in',
    type: 'hvPanel',
    name: '특고압 수배전반 (수전부)',
    floor: 'B1',
    room: 'b1-hv',
    pos: [-15.6, 0, -9.2],
    size: [4.4, 2.4, 1.2],
    system: '공용',
    specs: [
      ['구성', 'ALTS · LBS · MOF · LA/PF'],
      ['정격 전압', '24kV'],
      ['ALTS', '본선 ⇄ 예비선 자동 절체'],
    ],
  }),
  E({
    id: 'hv-a',
    type: 'hvPanel',
    name: '특고압 수배전반 A (VCB)',
    floor: 'B1',
    room: 'b1-hv',
    pos: [-12.0, 0, -9.2],
    size: [2.2, 2.4, 1.2],
    system: 'A계통',
    specs: [
      ['차단기', 'VCB 24kV 630A'],
      ['차단 용량', '25kA'],
      ['공급', 'TR-A'],
    ],
  }),
  E({
    id: 'hv-b',
    type: 'hvPanel',
    name: '특고압 수배전반 B (VCB)',
    floor: 'B1',
    room: 'b1-hv',
    pos: [-9.4, 0, -9.2],
    size: [2.2, 2.4, 1.2],
    system: 'B계통',
    specs: [
      ['차단기', 'VCB 24kV 630A'],
      ['차단 용량', '25kA'],
      ['공급', 'TR-B'],
    ],
  }),
  E({
    id: 'tr-a',
    type: 'tr',
    name: 'TR-A',
    floor: 'B1',
    room: 'b1-hv',
    pos: [-15, 0, -3.4],
    size: [2.8, 2.6, 1.8],
    system: 'A계통 (2N)',
    specs: [
      ['형식', '몰드형'],
      ['변압', '22.9kV → 380/220V'],
      ['용량', '2,000kVA (전체 부하 단독 감당)'],
      ['효율', '≈99%'],
      ['무부하손', '≈3kW'],
    ],
  }),
  E({
    id: 'tr-b',
    type: 'tr',
    name: 'TR-B',
    floor: 'B1',
    room: 'b1-hv',
    pos: [-10, 0, -3.4],
    size: [2.8, 2.6, 1.8],
    system: 'B계통 (2N)',
    specs: [
      ['형식', '몰드형'],
      ['변압', '22.9kV → 380/220V'],
      ['용량', '2,000kVA (전체 부하 단독 감당)'],
      ['효율', '≈99%'],
      ['무부하손', '≈3kW'],
    ],
  }),
  E({
    id: 'lv-a',
    type: 'lvPanel',
    name: '저압 배전반 A',
    floor: 'B1',
    room: 'b1-lv',
    pos: [-3.5, 0, -9.3],
    size: [4.0, 2.3, 1.0],
    system: 'A계통',
    specs: [
      ['주차단기', 'ACB 4,000A'],
      ['전압', '3상 4선 380/220V'],
      ['분기', 'ATS-A'],
    ],
  }),
  E({
    id: 'lv-tie',
    type: 'lvPanel',
    name: '저압 배전반 연계반 (연계 ACB)',
    floor: 'B1',
    room: 'b1-lv',
    pos: [-0.8, 0, -9.3],
    size: [1.2, 2.3, 1.0],
    system: 'A·B 연계',
    specs: [
      ['차단기', '연계 ACB 4,000A'],
      ['평상시', '개방'],
      ['용도', 'TR 한 대 정비 시 투입 → 다른 TR이 A·B 모두 공급'],
    ],
  }),
  E({
    id: 'lv-b',
    type: 'lvPanel',
    name: '저압 배전반 B',
    floor: 'B1',
    room: 'b1-lv',
    pos: [1.9, 0, -9.3],
    size: [4.0, 2.3, 1.0],
    system: 'B계통',
    specs: [
      ['주차단기', 'ACB 4,000A'],
      ['전압', '3상 4선 380/220V'],
      ['분기', 'ATS-B'],
    ],
  }),
  E({
    id: 'ats-a',
    type: 'ats',
    name: 'ATS-A',
    floor: 'B1',
    room: 'b1-lv',
    pos: [-4.9, 0, -3.2],
    size: [1.4, 2.3, 1.0],
    system: 'A계통',
    specs: [
      ['정격 전류', '2,500A'],
      ['절체', '상용(저압 배전반 A) ⇄ 발전기 모선'],
      ['절체 시간', '수 초 (기계식)'],
      ['공급', 'UPS-A, 공조 동력반 A'],
    ],
  }),
  E({
    id: 'mcc-a',
    type: 'mcc',
    name: '공조 동력반 A',
    floor: 'B1',
    room: 'b1-lv',
    pos: [-2.4, 0, -3.2],
    size: [2.4, 2.1, 0.8],
    system: 'A계통',
    specs: [
      ['정격', '1,200A'],
      ['공급 대상', '항온항습기 1·3·5번, 실외기 1·3·5번, 냉동기-1·3, 펌프 1·3번, 냉각탑-1·3'],
      ['특징', 'UPS 미경유 (ATS 하류)'],
    ],
  }),
  E({
    id: 'mcc-b',
    type: 'mcc',
    name: '공조 동력반 B',
    floor: 'B1',
    room: 'b1-lv',
    pos: [1.2, 0, -3.2],
    size: [2.4, 2.1, 0.8],
    system: 'B계통',
    specs: [
      ['정격', '1,200A'],
      ['공급 대상', '항온항습기 2·4·6번, 실외기 2·4·6번, 냉동기-2, 펌프 2번, 냉각탑-2'],
      ['특징', 'UPS 미경유 (ATS 하류)'],
    ],
  }),
  E({
    id: 'ats-b',
    type: 'ats',
    name: 'ATS-B',
    floor: 'B1',
    room: 'b1-lv',
    pos: [4.6, 0, -3.2],
    size: [1.4, 2.3, 1.0],
    system: 'B계통',
    specs: [
      ['정격 전류', '2,500A'],
      ['절체', '상용(저압 배전반 B) ⇄ 발전기 모선'],
      ['절체 시간', '수 초 (기계식)'],
      ['공급', 'UPS-B, 공조 동력반 B'],
    ],
  }),
  E({
    id: 'gen-1',
    type: 'generator',
    name: '비상 발전기-1',
    floor: 'B1',
    room: 'b1-gen',
    pos: [-13, 0, 3.8],
    size: [6.0, 2.6, 2.2],
    system: 'N+1',
    specs: [
      ['연료', '디젤(경유)'],
      ['출력', '2,000kW (2,500kVA) 380V'],
      ['기동 시간', '≤10초 (전압·주파수 확립)'],
      ['운전', '발전기-2와 병렬'],
    ],
  }),
  E({
    id: 'gen-2',
    type: 'generator',
    name: '비상 발전기-2',
    floor: 'B1',
    room: 'b1-gen',
    pos: [-13, 0, 8.8],
    size: [6.0, 2.6, 2.2],
    system: 'N+1',
    specs: [
      ['연료', '디젤(경유)'],
      ['출력', '2,000kW (2,500kVA) 380V'],
      ['기동 시간', '≤10초 (전압·주파수 확립)'],
      ['운전', '발전기-1과 병렬'],
    ],
  }),
  E({
    id: 'fuel-1',
    type: 'fuelTank',
    name: '서비스 탱크-1',
    floor: 'B1',
    room: 'b1-gen',
    pos: [-5.6, 0, 3.8],
    size: [2.4, 1.6, 1.4],
    specs: [
      ['용량', '1,000L'],
      ['운전 가능', '약 2시간 (발전기-1 정격)'],
      ['보충', '연료 저장탱크에서 자동 이송'],
    ],
  }),
  E({
    id: 'fuel-2',
    type: 'fuelTank',
    name: '서비스 탱크-2',
    floor: 'B1',
    room: 'b1-gen',
    pos: [-5.6, 0, 8.8],
    size: [2.4, 1.6, 1.4],
    specs: [
      ['용량', '1,000L'],
      ['운전 가능', '약 2시간 (발전기-2 정격)'],
      ['보충', '연료 저장탱크에서 자동 이송'],
    ],
  }),
  E({
    id: 'fuel-main',
    type: 'fuelTank',
    name: '연료 저장탱크',
    floor: 'B1',
    room: 'b1-gen',
    pos: [1.6, 0, 6.3],
    size: [3.0, 3.0, 7.0],
    system: '공용',
    specs: [
      ['용량', '40,000L'],
      ['운전 가능', '약 40시간 (발전기 2대 정격), 실제 부하에서는 더 김'],
    ],
  }),
  // 냉동기실
  ...[-6, -1, 4].flatMap((z, i): Equip[] => [
    E({
      id: `chiller-${i + 1}`,
      type: 'chiller',
      name: `냉동기-${i + 1}`,
      floor: 'B1',
      room: 'b1-chiller',
      pos: [14, 0, z],
      size: [6.0, 2.6, 2.4],
      system: 'N+1',
      specs: [
        ['냉동 용량', '100RT (≈352kW)'],
        ['COP', '≈5.5'],
        ['냉수', '공급 7°C / 환수 12°C'],
        ['냉각수', '입구 32°C / 출구 37°C'],
        ['짝', `냉수 펌프-${i + 1}, 냉각수 펌프-${i + 1}, 냉각탑-${i + 1}`],
      ],
    }),
    E({
      id: `pump-chw-${i + 1}`,
      type: 'pump',
      name: `냉수 펌프-${i + 1}`,
      floor: 'B1',
      room: 'b1-chiller',
      pos: [8.6, 0, z - 0.7],
      size: [1.6, 1.1, 0.9],
      specs: [
        ['용도', '냉수 (냉동기 ↔ 항온항습기(수냉식))'],
        ['유량', '60m³/h'],
        ['양정', '30m'],
        ['소비전력', '7.5kW (인버터)'],
      ],
    }),
    E({
      id: `pump-cw-${i + 1}`,
      type: 'pump',
      name: `냉각수 펌프-${i + 1}`,
      floor: 'B1',
      room: 'b1-chiller',
      pos: [8.6, 0, z + 0.7],
      size: [1.6, 1.1, 0.9],
      specs: [
        ['용도', '냉각수 (냉동기 ↔ 냉각탑)'],
        ['유량', '75m³/h'],
        ['양정', '25m'],
        ['소비전력', '11kW (인버터)'],
      ],
    }),
  ]),
  E({
    id: 'hx-1',
    type: 'hx',
    name: '판형 열교환기',
    floor: 'B1',
    room: 'b1-chiller',
    pos: [14, 0, 9.4],
    size: [2.4, 2.2, 1.2],
    specs: [
      ['열교환 용량', '400kW'],
      ['접근 온도차', '≈1.5°C'],
      ['동작', '외기 저온 시 냉동기 우회 (프리쿨링)'],
    ],
  }),
  E({
    id: 'leak-b1',
    type: 'leakDetector',
    name: '누수 감지기 (냉동기실)',
    floor: 'B1',
    room: 'b1-chiller',
    pos: [19.6, 1.0, 11.6],
    size: [0.2, 0.4, 0.5],
    specs: [
      ['감지선', '냉동기·펌프 주변 60m'],
      ['위치 표시', '±1m'],
    ],
    area: { x: [7.5, 18], z: [-8, 6] },
  }),
  E({
    id: 'fd-gen',
    type: 'fireDetector',
    name: '화재 감지기 (발전기실)',
    floor: 'B1',
    room: 'b1-gen',
    pos: [-7, 5.0, 6],
    size: [0.3, 0.1, 0.3],
    specs: [['종류', '열감지기 · 불꽃감지기']],
    area: { x: [-19, 5], z: [1, 11] },
  }),

  // ════════ 1F ════════
  E({
    id: 'access-lobby',
    type: 'accessControl',
    name: '출입통제 장치 (로비 스피드게이트)',
    floor: '1F',
    room: '1f-lobby',
    pos: [-8, 0, 3],
    size: [3.4, 1.1, 0.7],
    specs: [['인증', 'RFID 출입카드']],
  }),
  E({
    id: 'cctv-1f',
    type: 'cctv',
    name: 'CCTV (로비)',
    floor: '1F',
    room: '1f-lobby',
    pos: [-19.5, 3.8, 11.5],
    size: [0.35, 0.35, 0.35],
    specs: [['보관', '30~90일']],
  }),
  E({
    id: 'fire-panel',
    type: 'firePanel',
    name: '소화 수신반',
    floor: '1F',
    room: '1f-noc',
    pos: [18.4, 0, -9.3],
    size: [1.4, 1.9, 0.6],
    specs: [
      ['기동 로직', '교차회로 (감지기 A AND B)'],
      ['방출 지연', '20~30초'],
      ['하위 구성품', '방출표시등, 수동조작함·방출지연 스위치 (각 방호구역 출입문 외부)'],
      ['담당', '2F UPS실·배터리실, 3F 서버실 A, 4F 서버실 B'],
    ],
  }),

  // ════════ 2F ════════
  E({
    id: 'ups-a',
    type: 'ups',
    name: 'UPS-A',
    floor: '2F',
    room: '2f-ups-a',
    pos: [-12, 0, -9.1],
    size: [5.0, 2.0, 1.0],
    system: 'A계통 (2N)',
    specs: [
      ['방식', '온라인 이중변환'],
      ['용량', '1,200kVA / 1,080kW (모듈형)'],
      ['효율', '94~97% (부하율에 따라)'],
      ['담당', '서버실 A·B의 A계통 (PDU-A1-1~6, PDU-A2-1~6, STS-1·2)'],
      ['권장 부하율', '≤50% (2N)'],
    ],
  }),
  E({
    id: 'ups-b',
    type: 'ups',
    name: 'UPS-B',
    floor: '2F',
    room: '2f-ups-b',
    pos: [12, 0, -9.1],
    size: [5.0, 2.0, 1.0],
    system: 'B계통 (2N)',
    specs: [
      ['방식', '온라인 이중변환'],
      ['용량', '1,200kVA / 1,080kW (모듈형)'],
      ['효율', '94~97% (부하율에 따라)'],
      ['담당', '서버실 A·B의 B계통 (PDU-B1-1~6, PDU-B2-1~6, STS-1·2)'],
      ['권장 부하율', '≤50% (2N)'],
    ],
  }),
  E({
    id: 'bat-a',
    type: 'battery',
    name: '리튬이온 배터리 A',
    floor: '2F',
    room: '2f-bat-a',
    pos: [-12, 0, 6.5],
    size: [9.0, 2.0, 4.4],
    system: 'A계통',
    specs: [
      ['종류', '리튬인산철(LFP), BMS 내장'],
      ['용량', '300kWh'],
      ['백업 시간', '약 15분 @ 1,080kW'],
      ['연결', 'UPS-A 직류 링크'],
    ],
  }),
  E({
    id: 'bat-b',
    type: 'battery',
    name: '리튬이온 배터리 B',
    floor: '2F',
    room: '2f-bat-b',
    pos: [12, 0, 6.5],
    size: [9.0, 2.0, 4.4],
    system: 'B계통',
    specs: [
      ['종류', '리튬인산철(LFP), BMS 내장'],
      ['용량', '300kWh'],
      ['백업 시간', '약 15분 @ 1,080kW'],
      ['연결', 'UPS-B 직류 링크'],
    ],
  }),
  E({
    id: 'gas-system',
    type: 'gasSystem',
    name: '가스 소화설비 (저장용기)',
    floor: '2F',
    room: '2f-agent',
    pos: [0, 0, 8.2],
    size: [5.0, 1.8, 3.0],
    specs: [
      ['약제', 'HFC-227ea (예시)'],
      ['구성', '저장용기 · 기동용기 · 선택밸브 · 압력스위치'],
      ['방호구역', 'UPS실 A/B, 배터리실 A/B, 서버실 A, 서버실 B'],
    ],
  }),
  ...(['2f-ups-a', '2f-ups-b', '2f-bat-a', '2f-bat-b'] as const).map((room) => {
    const areas: Record<string, { x: [number, number]; z: [number, number]; name: string }> = {
      '2f-ups-a': { x: [-19, -5], z: [-9, 0], name: 'UPS실 A' },
      '2f-ups-b': { x: [5, 19], z: [-9, 0], name: 'UPS실 B' },
      '2f-bat-a': { x: [-19, -5], z: [2, 11], name: '배터리실 A' },
      '2f-bat-b': { x: [5, 19], z: [2, 11], name: '배터리실 B' },
    };
    const a = areas[room];
    const isBat = room.includes('bat');
    return E({
      id: `fd-${room.slice(3)}`,
      type: 'fireDetector',
      name: `화재 감지기 (${a.name})`,
      floor: '2F',
      room,
      pos: [(a.x[0] + a.x[1]) / 2, 4.0, (a.z[0] + a.z[1]) / 2],
      size: [0.3, 0.1, 0.3],
      specs: [['종류', isBat ? '연기감지기 · 열감지기 · 오프가스 감지기' : '연기감지기 (A/B 교차회로)']],
      area: { x: a.x, z: a.z },
    });
  }),

  // ════════ 3F 서버실 A (공냉식) ════════
  ...COOL_Z.map((z, i) =>
    E({
      id: `crac-${i + 1}`,
      type: 'crac',
      name: `항온항습기(공냉식)-${i + 1}`,
      floor: '3F',
      room: '3f-sr-a',
      pos: [-19.0, 0, z],
      size: [2.0, F + 2.0, 1.0],
      rotY: Math.PI / 2,
      system: 'N+1',
      specs: [
        ['냉각 용량', '120kW (≈34 USRT)'],
        ['풍량', '30,000m³/h'],
        ['급기 설정', '20°C'],
        ['취출', '하향 → 이중마루 하부'],
        ['짝', `실외기-${i + 1} (냉매 배관, 1:1)`],
        ['동력', i % 2 === 0 ? '공조 동력반 A' : '공조 동력반 B'],
      ],
    }),
  ),
  ...pdus(SR_A),
  ...sensors(SR_A),
  E({
    id: 'fd-sr-a',
    type: 'fireDetector',
    name: '화재 감지기 (서버실 A)',
    floor: '3F',
    room: '3f-sr-a',
    pos: [-3, 4.5, 1],
    size: [0.3, 0.1, 0.3],
    specs: [['종류', '연기감지기 (A/B 교차회로) · VESDA']],
    area: { x: [-19, 13], z: [-9, 11] },
  }),
  E({
    id: 'access-3f',
    type: 'accessControl',
    name: '출입통제 장치 (서버실 A 맨트랩)',
    floor: '3F',
    room: '3f-ante',
    pos: [17, 0, 1],
    size: [2.4, 2.4, 2.2],
    specs: [['인증', '카드 + 생체 2단계, 인터록 이중문']],
  }),
  E({
    id: 'cctv-3f',
    type: 'cctv',
    name: 'CCTV (서버실 A)',
    floor: '3F',
    room: '3f-sr-a',
    pos: [13.5, 4.3, -9.5],
    size: [0.35, 0.35, 0.35],
    specs: [['보관', '30~90일']],
  }),

  // ════════ 4F 서버실 B (수냉식) ════════
  ...COOL_Z.map((z, i) =>
    E({
      id: `crah-${i + 1}`,
      type: 'crah',
      name: `항온항습기(수냉식)-${i + 1}`,
      floor: '4F',
      room: '4f-sr-b',
      pos: [19.0, 0, z],
      size: [2.0, F + 2.0, 1.0],
      rotY: -Math.PI / 2,
      system: 'N+1',
      specs: [
        ['냉각 용량', '130kW (≈37 USRT)'],
        ['풍량', '32,500m³/h'],
        ['급기 설정', '20°C'],
        ['냉수', '공급 7°C / 환수 12°C (냉수 헤더)'],
        ['동력', i % 2 === 0 ? '공조 동력반 A' : '공조 동력반 B'],
      ],
    }),
  ),
  ...pdus(SR_B),
  ...sensors(SR_B),
  E({
    id: 'fd-sr-b',
    type: 'fireDetector',
    name: '화재 감지기 (서버실 B)',
    floor: '4F',
    room: '4f-sr-b',
    pos: [3, 4.5, 1],
    size: [0.3, 0.1, 0.3],
    specs: [['종류', '연기감지기 (A/B 교차회로) · VESDA']],
    area: { x: [-13, 19], z: [-9, 11] },
  }),
  E({
    id: 'leak-4f',
    type: 'leakDetector',
    name: '누수 감지기 (서버실 B)',
    floor: '4F',
    room: '4f-sr-b',
    pos: [17.2, F + 1.0, -9.85],
    size: [0.5, 0.4, 0.2],
    specs: [
      ['감지선', '항온항습기(수냉식)·냉수 배관 주변 이중마루 하부 50m'],
      ['위치 표시', '±1m'],
    ],
    area: { x: [17.6, 20], z: [-9, 11] },
  }),
  E({
    id: 'access-4f',
    type: 'accessControl',
    name: '출입통제 장치 (서버실 B 맨트랩)',
    floor: '4F',
    room: '4f-ante',
    pos: [-17, 0, 1],
    size: [2.4, 2.4, 2.2],
    specs: [['인증', '카드 + 생체 2단계, 인터록 이중문']],
  }),
  E({
    id: 'cctv-4f',
    type: 'cctv',
    name: 'CCTV (서버실 B)',
    floor: '4F',
    room: '4f-sr-b',
    pos: [-13.5, 4.3, -9.5],
    size: [0.35, 0.35, 0.35],
    specs: [['보관', '30~90일']],
  }),

  // ════════ PH 옥상 ════════
  ...COOL_Z.map((z, i) =>
    E({
      id: `cond-${i + 1}`,
      type: 'condenser',
      name: `실외기-${i + 1}`,
      floor: 'PH',
      room: 'ph-roof',
      pos: [-15.5, 0, z],
      size: [2.4, 1.5, 2.0],
      system: 'N+1',
      specs: [
        ['방열 용량', '≈130kW'],
        ['외기 대응', '-15~43°C'],
        ['짝', `항온항습기(공냉식)-${i + 1} (냉매 배관, 1:1)`],
        ['동력', i % 2 === 0 ? '공조 동력반 A' : '공조 동력반 B'],
      ],
    }),
  ),
  ...[-4.5, 1.5, 7.5].map((z, i) =>
    E({
      id: `ct-${i + 1}`,
      type: 'coolingTower',
      name: `냉각탑-${i + 1}`,
      floor: 'PH',
      room: 'ph-roof',
      pos: [14.5, 0, z],
      size: [4.0, 4.2, 4.0],
      system: 'N+1',
      specs: [
        ['방열 용량', '≈440kW'],
        ['냉각수', '37°C → 32°C'],
        ['짝', `냉동기-${i + 1}, 냉각수 펌프-${i + 1}`],
        ['동력', i === 1 ? '공조 동력반 B' : '공조 동력반 A'],
      ],
    }),
  ),
];

export const EQUIP_BY_ID: Record<string, Equip> = Object.fromEntries(EQUIPMENT.map((e) => [e.id, e]));

// 냉복도 위치 (이중마루 타공판 표시용)
export function coldAisleZ(cz: number) {
  return COLD_AISLE_DZ.map((dz) => cz + dz);
}
