// 지표 계산: PUE, 냉각 · 전력 · 공간 용량, 고립 용량 (docs/PLAN.md §6)
// 장비 성능 포인트와 단순한 효율 곡선으로 만든 근사 모델이다. 경향(외기 온도 · 부하율 · 봉쇄가 PUE를 어떻게 바꾸는지)을 보여주는 용도.

import { RACK, ROOM_LABELS, SR_BY_LABEL, byRoom } from './building';
import { RACKS } from './racks';
import { rackKw, roomUnits, type AirCfg, type RoomLabel, type RoomTherm } from './thermal';

export const UPS_KW = 1080; // UPS 1대 정격 출력 (1,200kVA)
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
  freeCooling: number; // 0~1 (수냉식 몫이 있는 서버실)
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
  ups: Record<string, UpsLoad>; // UPS id → 부하 (ups-a1 …)
  upsLoss: number;
  trLoss: number;
  other: number;
  total: number;
  pue: number;
  parts: Part[]; // PUE 분해 막대 순서
  rooms: Record<RoomLabel, RoomMetrics>;
  upsFail: Record<RoomLabel, number>; // 서버실 UPS 한 쌍 중 한 대가 멈춰 나머지 한 대가 전부 받을 때 부하율
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

// 항온항습기 팬: 운전 대수(N+1 중 1대 예비), 부하와 바이패스만큼 바람을 더 보냄
const fanKw = (running: number, unitFan: number, heat: number, cap: number, bypass: number) => running * unitFan * (0.6 + 0.4 * Math.min(1, heat / cap)) * (1 + bypass);
// 항온항습기 1대 팬 전력 (kW). 전면 토출형은 섞이는 공기까지 밀어내려고 바람을 더 많이 보낸다
const UNIT_FAN: Record<string, number> = { crah: 5.5, crac: 6, cracFront: 7.5 };

// 급기 온도를 올리면 냉동 사이클 효율이 좋아짐 (°C당 3%)
const supplyK = (supply: number) => 1 + 0.03 * (supply - 20);

// 서버실 · 계통의 UPS id (UPS-A1 = 서버실 A의 A계통)
export const upsId = (sys: 'a' | 'b', label: RoomLabel) => `ups-${sys}${SR_BY_LABEL[label].num}`;

export function computeMetrics(load: number, outdoor: number, cfg: Record<RoomLabel, AirCfg>, therm: Record<RoomLabel, RoomTherm>): Metrics {
  const it = byRoom((l) => therm[l].loadKw);
  const itAll = ROOM_LABELS.reduce((s, l) => s + it[l], 0);

  // UPS: 서버실마다 한 쌍. 이중전원 랙은 A·B가 절반씩, 단일전원(STS) 랙은 평상시 A 우선
  const ups: Record<string, UpsLoad> = {};
  const upsFail = {} as Record<RoomLabel, number>;
  for (const l of ROOM_LABELS) {
    let ab = 0;
    let sts = 0;
    for (const r of RACKS) {
      if (r.serverRoom !== l) continue;
      const kw = rackKw(r, load);
      if (r.feed === 'STS') sts += kw;
      else ab += kw;
    }
    ups[upsId('a', l)] = upsLoad(ab / 2 + sts);
    ups[upsId('b', l)] = upsLoad(ab / 2);
    upsFail[l] = (ab + sts) / UPS_KW;
  }
  const upsLoss = Object.values(ups).reduce((s, u) => s + u.loss, 0);

  // 서버실마다 수냉식 · 공냉식 몫을 항온항습기 대수로 나눈다 (B는 반반)
  const units = byRoom((l) => roomUnits(SR_BY_LABEL[l].roomId));
  const waterShare = byRoom((l) => units[l].filter((e) => e.type === 'crah').length / units[l].length);
  // 냉동기 설비(냉동기 · 펌프 · 냉각탑)는 3F · 4F가 함께 쓴다 → 펌프 · 냉각탑 전력은 냉수로 버리는 열에 비례해 나눈다
  const waterHeat = ROOM_LABELS.reduce((s, l) => s + it[l] * waterShare[l], 0);
  const plantRunning = Math.min(3, Math.max(1, Math.ceil(waterHeat / 352))); // 운전 냉동기 대수 (100RT ≈ 352kW, 1대 예비)
  const plantAux = { pump: plantRunning * (5.5 + 7.5), ct: plantRunning * 4 };

  const roomCooling = (l: RoomLabel) => {
    const heat = it[l];
    const w = waterShare[l];
    const sup = cfg[l].supply;
    const n = units[l].length;
    const cap = { n1: (n - 1) * therm[l].unitKw, all: n * therm[l].unitKw };
    const parts: Part[] = [];
    let free = 0;
    if (w > 0) {
      // 수냉식: 냉동기, 외기가 차면 프리쿨링
      free = clamp((13 + 0.5 * (sup - 20) - outdoor) / 8, 0, 1);
      const copCh = clamp(6.2 - 0.06 * (outdoor - 15), 3.5, 7) * supplyK(sup);
      const share = waterHeat > 0 ? (heat * w) / waterHeat : 0;
      parts.push({ key: 'chiller', name: '냉동기', kw: (heat * w * (1 - free)) / copCh });
      parts.push({ key: 'pump', name: '냉수 · 냉각수 펌프', kw: plantAux.pump * share });
      parts.push({ key: 'ct', name: '냉각탑 팬', kw: plantAux.ct * share });
    }
    if (w < 1) {
      // 공냉식 직팽: 압축기가 항온항습기 안, 실외기 팬. 외기가 오르면 효율이 떨어진다
      const copDx = clamp(4.2 - 0.07 * (outdoor - 15), 2, 5) * supplyK(sup);
      const air = units[l].filter((e) => e.type !== 'crah').length;
      parts.push({ key: 'comp', name: '압축기', kw: (heat * (1 - w)) / copDx });
      parts.push({ key: 'cond', name: '실외기 팬', kw: Math.max(1, air - 1) * 2.2 });
    }
    const unitFan = units[l].reduce((s, e) => s + UNIT_FAN[e.type], 0) / n;
    parts.unshift({ key: 'fan', name: '항온항습기 팬', kw: fanKw(n - 1, unitFan, heat, cap.n1, therm[l].bypass) });
    return { parts, cap, free, kw: parts.reduce((s, p) => s + p.kw, 0) };
  };
  const cool = byRoom(roomCooling);
  const coolAll = ROOM_LABELS.reduce((s, l) => s + cool[l].kw, 0);

  // 기타: 조명 · 관제 · 사무 + UPS실 · 배터리실 공조(UPS 손실열 제거)
  const other = 30 + upsLoss / 3;
  // TR: 무부하손 2대 × 4.5kW + 통과 전력의 1%
  const through = itAll + upsLoss + coolAll + other;
  const trLoss = 9 + through * 0.01;
  const total = through + trLoss;

  const shared = upsLoss + trLoss + other;
  const room = (label: RoomLabel): RoomMetrics => {
    const { parts, cap, free, kw: cooling } = cool[label];
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
      freeCooling: free,
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
      ...ROOM_LABELS.map((l) => ({ key: `cool${l}`, name: `냉각 · 서버실 ${l}`, kw: cool[l].kw })),
      { key: 'ups', name: 'UPS 손실', kw: upsLoss },
      { key: 'tr', name: 'TR 손실', kw: trLoss },
      { key: 'other', name: '조명 · 기타', kw: other },
    ],
    rooms: byRoom(room),
    upsFail,
  };
}

// 분해 막대 색 (검증된 범주 팔레트, 어두운 배경용)
export const PART_COLOR: Record<string, string> = {
  it: '#3987e5',
  coolA: '#199e70',
  coolB: '#d95926',
  coolC: '#a8323e',
  ups: '#c98500',
  tr: '#d55181',
  other: '#9085e9',
};
