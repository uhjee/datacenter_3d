// 랙 색칠 (docs/PLAN.md §6): U 사용률 · 전력 사용률은 한 색(파랑)의 밝기, 흡기 온도는 온도 색표.

import { RACK } from '../data/building';
import type { Rack } from '../data/racks';
import { rackKw, tempColor, type RoomTherm } from '../data/thermal';
import type { RackColorMode } from '../store/useView';

// 낮음(어두운 파랑) → 높음(밝은 파랑). 어두운 배경에서는 값이 클수록 밝게
const LOW: [number, number, number] = [0x1c, 0x2b, 0x3c];
const HIGH: [number, number, number] = [0x8f, 0xd0, 0xff];
export function rampColor(v: number) {
  const k = Math.min(1, Math.max(0, v));
  const h = (i: number) => Math.round(LOW[i] + (HIGH[i] - LOW[i]) * k).toString(16).padStart(2, '0');
  return `#${h(0)}${h(1)}${h(2)}`;
}
export const RAMP_CSS = `linear-gradient(90deg, ${rampColor(0)}, ${rampColor(0.5)}, ${rampColor(1)})`;

export const RACK_COLOR_META: Record<Exclude<RackColorMode, 'none'>, { name: string; short: string; low: string; high: string; desc: string }> = {
  u: { name: 'U 사용률', short: '공간(U)', low: '0%', high: '100%', desc: '42U 중 장비가 차지한 칸의 비율 (공간 용량)' },
  power: { name: '전력 사용률', short: '전력', low: '0%', high: '100%', desc: '랙에 할당한 설계 전력 대비 실제 소비 전력 (전력 용량)' },
  temp: { name: '흡기 온도', short: '온도', low: '15°C', high: '35°C', desc: '랙 앞면 흡기 중 가장 높은 온도 (권장 18~27°C)' },
};

// 랙 하나의 색. 색칠 대상이 아니면 null
// height: 히트맵이 켜져 있으면 그 높이(0 하 · 1 중 · 2 상)의 흡기로 칠한다
export function rackColorOf(mode: RackColorMode, r: Rack, therm: RoomTherm, itLoad: number, height?: number): string | null {
  if (mode === 'u') return rampColor(r.uUsed / RACK.U);
  if (mode === 'power') return rampColor(rackKw(r, itLoad) / r.designKw);
  if (mode === 'temp') {
    const t = therm.racks[r.id];
    if (!t || t.kw <= 0) return null;
    return tempColor(height == null ? Math.max(...t.inlet) : t.inlet[height]);
  }
  return null;
}
