// 고객사 계약 대비 사용 현황: 유효 전력 · 계약 전력 · 30일 추이 · 랙별 회로 여유 · 흡기 온도.
// 초과 판정은 두 가지를 함께 본다.
//   지금: 현재 유효 전력 ÷ 계약 전력 (운영 경보)
//   이번 달: 30일 일별 최대 중 가장 큰 값 ÷ 계약 전력 (과금 판정, 순간값이 아니라 월 최대 수요 기준)

import { BLOCK_NAME, RACK } from './building';
import { CIRCUIT, CUSTOMERS, type Customer } from './customers';
import { RACKS, type Rack } from './racks';
import { RECOMMENDED, rackKw, type RoomTherm } from './thermal';
import type { Tone } from '../ui/kit';

export const WARN_RATIO = 0.9; // 계약의 90%부터 주의
export const TREND_DAYS = 30;

export interface ColoRack {
  rack: Rack;
  kw: number;
  failover: number; // A · B 중 한쪽이 끊겨 남은 회로가 랙 전체를 받을 때, 회로 연속 한도 대비
  inletMax: number | null;
}

export interface ColoStats {
  racks: ColoRack[];
  kw: number; // 유효 전력 (지금)
  ratio: number; // 지금 ÷ 계약
  tone: Tone;
  peak: number; // 30일 최대
  peakRatio: number;
  overDays: number; // 30일 중 계약 초과한 날
  trend: number[]; // 일별 최대 (마지막 = 오늘 = 지금)
  uUsed: number;
  uTotal: number;
  inlet: [number, number] | null; // 고객 랙 흡기 최저 · 최고
  circuitOver: number; // 회로 여유가 부족한 랙 수
  inletOver: number; // 권장 상한을 넘는 랙 수
}

export const ratioTone = (r: number): Tone => (r > 1 ? 'crit' : r >= WARN_RATIO ? 'warn' : 'ok');
export const TONE_TEXT: Record<Tone, string> = { ok: '정상', warn: '주의', crit: '초과', info: '', muted: '' };

export const customerRacks = (c: Customer) => RACKS.filter((r) => r.customer === c.id);

// 일별 최대 전력 추이 (예시). 기준 부하(IT 부하율 100%)에서 평일 · 주말 차이와 가끔 튀는 날을 섞는다
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SHAPE: Record<string, number[]> = Object.fromEntries(
  CUSTOMERS.map((c) => {
    const rnd = mulberry32(20261101 + c.id.charCodeAt(0));
    const f = Array.from({ length: TREND_DAYS - 1 }, (_, d) => {
      const weekend = (d + 2) % 7 >= 5;
      const spike = rnd() < 0.1 ? 0.1 : 0;
      return (weekend ? 0.88 : 0.95) + rnd() * 0.07 + spike;
    });
    return [c.id, f];
  }),
);

export function coloStats(c: Customer, therm: RoomTherm): ColoStats {
  const cont = CIRCUIT[c.contract.circuit].cont;
  const racks = customerRacks(c).map((rack) => {
    const t = therm.racks[rack.id];
    const kw = t?.kw ?? 0;
    return { rack, kw, failover: kw / cont, inletMax: t && t.kw > 0 ? Math.max(...t.inlet) : null };
  });
  const kw = +racks.reduce((s, r) => s + r.kw, 0).toFixed(1);
  const base = racks.reduce((s, r) => s + rackKw(r.rack), 0);
  const trend = [...SHAPE[c.id].map((f) => +(base * f).toFixed(1)), kw];
  const peak = Math.max(...trend);
  const inlets = racks.flatMap((r) => (r.inletMax == null ? [] : [r.inletMax]));
  const ratio = kw / c.contract.kw;
  return {
    racks,
    kw,
    ratio,
    tone: ratioTone(ratio),
    peak,
    peakRatio: peak / c.contract.kw,
    overDays: trend.filter((v) => v > c.contract.kw).length,
    trend,
    uUsed: racks.reduce((s, r) => s + r.rack.uUsed, 0),
    uTotal: racks.length * RACK.U,
    inlet: inlets.length ? [Math.min(...inlets), Math.max(...inlets)] : null,
    circuitOver: racks.filter((r) => r.failover > 1).length,
    inletOver: inlets.filter((t) => t > RECOMMENDED[1]).length,
  };
}

// 'YYYY-MM' 사이 개월 수
export function monthsBetween(a: string, b: string) {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

export const cageArea = (c: Customer) => (c.cage ? (c.cage.x[1] - c.cage.x[0]) * (c.cage.z[1] - c.cage.z[0]) : 0);

export const rackPlace = (r: Rack) => `${r.row + 1}열 ${r.index + 1}번 · ${BLOCK_NAME[r.block]}`;
