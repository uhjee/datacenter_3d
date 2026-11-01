// 지표 계산: PUE, 냉각 · 전력 · 공간 용량, 고립 용량 (docs/PLAN.md §6)
// 장비 성능 포인트와 단순한 효율 곡선으로 만든 근사 모델이다. 경향(외기 온도 · 부하율 · 봉쇄가 PUE를 어떻게 바꾸는지)을 보여주는 용도.

import { RACK } from './building';
import { RACKS } from './racks';
import { rackKw, type AirCfg, type RoomLabel, type RoomTherm } from './thermal';

export const UPS_KW = 1350; // UPS 1대 정격 출력 (1,500kVA)
export const RT_KW = 3.517; // 1 USRT

export interface Part {
  key: string;
  name: string;
  kw: number;
}

export interface UpsLoad {
  out: number;
  pct: number; // 정격 대비
  eff: number;
  loss: number;
}

export interface RoomMetrics {
  label: RoomLabel;
  it: number;
  cooling: number;
  coolingParts: Part[];
  cop: number; // 냉각 계통 전체 COP (열 / 냉각 전력)
  freeCooling: number; // 0~1 (서버실 B만)
  partialPue: number;
  capN1: number;
  capAll: number;
  loadPct: number; // N+1 용량 대비
  rt: number;
  airflow: number; // 필요 풍량 m³/h (급기 · 환기 ΔT 12°C 가정)
  space: { usedU: number; totalU: number; racks: number; loaded: number };
  power: { design: number; actual: number };
  stranded: { key: 'space' | 'power' | 'cooling'; name: string; used: number; stranded: number }[];
}

export interface Metrics {
  it: number;
  ups: Record<'A' | 'B', UpsLoad>;
  upsLoss: number;
  trLoss: number;
  other: number;
  total: number;
  pue: number;
  parts: Part[]; // PUE 분해 막대 순서
  rooms: Record<RoomLabel, RoomMetrics>;
  upsFailPct: number; // 한 대가 멈춰 나머지 한 대가 전부 받을 때 부하율
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// UPS 효율: 부하율이 낮을수록 나쁨 (온라인 이중변환형의 전형적 곡선)
const EFF_CURVE: [number, number][] = [
  [0, 0.85],
  [0.1, 0.9],
  [0.25, 0.945],
  [0.5, 0.965],
  [0.75, 0.97],
  [1, 0.968],
];
function upsEff(p: number) {
  for (let i = 1; i < EFF_CURVE.length; i++) {
    const [x1, y1] = EFF_CURVE[i];
    if (p <= x1) {
      const [x0, y0] = EFF_CURVE[i - 1];
      return y0 + ((y1 - y0) * (p - x0)) / (x1 - x0);
    }
  }
  return EFF_CURVE[EFF_CURVE.length - 1][1];
}

export function upsLoad(out: number): UpsLoad {
  const pct = out / UPS_KW;
  const eff = upsEff(pct);
  return { out, pct, eff, loss: out * (1 / eff - 1) };
}

// 항온항습기 팬: 운전 5대(N+1 중 1대 예비), 부하와 바이패스만큼 바람을 더 보냄
const fanKw = (unitFan: number, heat: number, cap: number, bypass: number) => 5 * unitFan * (0.6 + 0.4 * Math.min(1, heat / cap)) * (1 + bypass);

// 급기 온도를 올리면 냉동 사이클 효율이 좋아짐 (°C당 3%)
const supplyK = (supply: number) => 1 + 0.03 * (supply - 20);

export function computeMetrics(load: number, outdoor: number, cfg: Record<RoomLabel, AirCfg>, therm: Record<RoomLabel, RoomTherm>): Metrics {
  const it = { A: therm.A.loadKw, B: therm.B.loadKw };
  const itAll = it.A + it.B;

  // UPS: 이중전원 랙은 A·B가 절반씩, 단일전원(STS) 랙은 평상시 A 우선
  let ab = 0;
  let sts = 0;
  for (const r of RACKS) {
    const kw = rackKw(r, load);
    if (r.feed === 'STS') sts += kw;
    else ab += kw;
  }
  const ups = { A: upsLoad(ab / 2 + sts), B: upsLoad(ab / 2) };
  const upsLoss = ups.A.loss + ups.B.loss;

  // 서버실 A: 공냉식 직팽 (압축기가 항온항습기 안, 실외기 팬)
  const copDx = clamp(4.2 - 0.07 * (outdoor - 15), 2, 5) * supplyK(cfg.A.supply);
  const capA = { n1: 700, all: 840 };
  const partsA: Part[] = [
    { key: 'comp', name: '압축기', kw: it.A / copDx },
    { key: 'fan', name: '항온항습기 팬', kw: fanKw(6, it.A, capA.n1, therm.A.bypass) },
    { key: 'cond', name: '실외기 팬', kw: 5 * 2.2 },
  ];

  // 서버실 B: 수냉식 (냉동기 + 펌프 + 냉각탑), 외기가 차면 프리쿨링
  const shift = 0.5 * (cfg.B.supply - 20);
  const free = clamp((13 + shift - outdoor) / 8, 0, 1);
  const copCh = clamp(6.2 - 0.06 * (outdoor - 15), 3.5, 7) * supplyK(cfg.B.supply);
  const capB = { n1: 750, all: 900 };
  const partsB: Part[] = [
    { key: 'chiller', name: '냉동기', kw: (it.B * (1 - free)) / copCh },
    { key: 'fan', name: '항온항습기 팬', kw: fanKw(5.5, it.B, capB.n1, therm.B.bypass) },
    { key: 'pump', name: '냉수 · 냉각수 펌프', kw: 2 * 5.5 + 2 * 7.5 },
    { key: 'ct', name: '냉각탑 팬', kw: 2 * 4 },
  ];
  const coolA = partsA.reduce((s, p) => s + p.kw, 0);
  const coolB = partsB.reduce((s, p) => s + p.kw, 0);

  // 기타: 조명 · 관제 · 사무 + UPS실 · 배터리실 공조(UPS 손실열 제거)
  const other = 22 + upsLoss / 3;
  // TR: 무부하손 2대 × 3kW + 통과 전력의 1%
  const through = itAll + upsLoss + coolA + coolB + other;
  const trLoss = 6 + through * 0.01;
  const total = through + trLoss;

  const shared = upsLoss + trLoss + other;
  const room = (label: RoomLabel, cooling: number, parts: Part[], cap: { n1: number; all: number }, freeCooling: number): RoomMetrics => {
    const racks = RACKS.filter((r) => r.serverRoom === label);
    const usedU = racks.reduce((s, r) => s + r.uUsed, 0);
    const totalU = racks.length * RACK.U;
    const design = racks.reduce((s, r) => s + r.designKw, 0);
    const actual = it[label];
    const used = { space: usedU / totalU, power: actual / design, cooling: actual / cap.n1 };
    const top = Math.max(used.space, used.power, used.cooling);
    const names = { space: '공간 (U)', power: '전력 (랙 할당)', cooling: '냉각 (N+1)' } as const;
    return {
      label,
      it: actual,
      cooling,
      coolingParts: parts,
      cop: actual / cooling,
      freeCooling,
      partialPue: (actual + cooling + (shared * actual) / itAll) / actual,
      capN1: cap.n1,
      capAll: cap.all,
      loadPct: actual / cap.n1,
      rt: actual / RT_KW,
      airflow: (actual * 3600) / (1.2 * 1.005 * 12),
      space: { usedU, totalU, racks: racks.length, loaded: racks.filter((r) => r.devices.length > 0).length },
      power: { design, actual },
      stranded: (['space', 'power', 'cooling'] as const).map((k) => ({ key: k, name: names[k], used: used[k], stranded: 1 - used[k] / top })),
    };
  };

  return {
    it: itAll,
    ups,
    upsLoss,
    trLoss,
    other,
    total,
    pue: total / itAll,
    parts: [
      { key: 'it', name: 'IT 장비', kw: itAll },
      { key: 'coolA', name: '냉각 · 서버실 A', kw: coolA },
      { key: 'coolB', name: '냉각 · 서버실 B', kw: coolB },
      { key: 'ups', name: 'UPS 손실', kw: upsLoss },
      { key: 'tr', name: 'TR 손실', kw: trLoss },
      { key: 'other', name: '조명 · 기타', kw: other },
    ],
    rooms: { A: room('A', coolA, partsA, capA, 0), B: room('B', coolB, partsB, capB, free) },
    upsFailPct: (ups.A.out + ups.B.out) / UPS_KW,
  };
}

// 분해 막대 색 (검증된 범주 팔레트, 어두운 배경용)
export const PART_COLOR: Record<string, string> = {
  it: '#3987e5',
  coolA: '#d95926',
  coolB: '#199e70',
  ups: '#c98500',
  tr: '#d55181',
  other: '#9085e9',
};
