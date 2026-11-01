// 서버실 온도 분포 (히트맵): 한 높이 단면의 공기 온도를 0.2m 격자로 근사한다. 교육용 단순 모델이며 CFD가 아니다.
//   랙 열(row)마다 앞면 선(흡기 온도)과 뒷면 선(배기 온도)이 있다.
//   통로 칸은 양쪽에서 마주 보는 면의 온도를 거리 비율로 섞는다 (냉복도 = 흡기, 열복도 = 배기).
//   열 끝 · 블록 사이처럼 랙이 없는 곳과 벽 쪽은 방 공기 온도로 옅어진다. 방 공기는 봉쇄 방식에 따라 다르다.
//   마지막에 살짝 흐려 칸 경계를 부드럽게 한다.

import { RACK, ROOM_BY_ID } from './building';
import { RACKS } from './racks';
import { AIR_LAYOUT, RECOMMENDED, type AirCfg, type RoomLabel, type RoomTherm } from './thermal';

export const HEAT_RES = 0.2; // 격자 한 칸 (m)
export const HEIGHT_NAME = ['하', '중', '상'] as const;
export const HEIGHT_M = [0.3, 1.1, 1.9]; // 단면 높이 (이중마루 바닥 기준, 랙 하 · 중 · 상 흡기와 같은 높이)

export interface HeatField {
  x0: number;
  z0: number;
  nx: number;
  nz: number;
  data: Float32Array; // [iz * nx + ix]
  min: number;
  max: number;
}

interface Face {
  z: number;
  dir: 1 | -1; // 공기 쪽 방향 (앞면이면 랙 facing, 뒷면이면 반대)
  pts: { x: number; t: number }[];
}

// 방 공기 온도: 봉쇄 없음은 섞인 공기, 냉복도 봉쇄는 방 전체가 열기, 열복도 봉쇄는 방 전체가 냉기
export function ambientT(cfg: AirCfg, th: RoomTherm, h: number) {
  if (cfg.containment === 'CAC') return th.returnT - 1 + h * 0.5;
  if (cfg.containment === 'HAC') return cfg.supply + 1 + h * 0.3;
  return (th.avgInlet + th.returnT) / 2 + (h - 1);
}

const SIGMA = 0.35; // 랙 값을 열 방향(x)으로 퍼뜨리는 폭
const FADE = 2.0; // 마주 보는 면이 없을 때 방 공기로 옅어지는 거리

export function computeHeatField(label: RoomLabel, cfg: AirCfg, th: RoomTherm, h: number): HeatField {
  const L = AIR_LAYOUT[label];
  const room = ROOM_BY_ID[L.roomId];
  const x0 = room.x[0];
  const z0 = room.z[0];
  const nx = Math.round((room.x[1] - room.x[0]) / HEAT_RES);
  const nz = Math.round((room.z[1] - room.z[0]) / HEAT_RES);
  const amb = ambientT(cfg, th, h);

  // 열마다 앞면 · 뒷면 선
  const racks = RACKS.filter((r) => r.serverRoom === label);
  const faces: Face[] = [];
  const rows = [...new Set(racks.map((r) => r.row))];
  const bodies: [number, number][] = []; // 랙 몸체가 차지하는 z 범위
  for (const row of rows) {
    const rs = racks.filter((r) => r.row === row);
    const f = rs[0].facing;
    const zc = rs[0].z;
    const temp = (id: string, k: 'inlet' | 'exhaust') => th.racks[id]?.[k][h] ?? amb;
    // 빈 랙: 블랭킹 패널로 막혀 있으면 바람이 지나가지 않아 방 공기로 둔다.
    // 막혀 있지 않으면 찬 공기가 그대로 빠져나가(바이패스) 열복도에 찬 자리가 생긴다
    const flow = rs.filter((r) => (th.racks[r.id]?.kw ?? 0) > 0 || !cfg.blanking);
    faces.push({ z: zc + (f * RACK.d) / 2, dir: f, pts: flow.map((r) => ({ x: r.x, t: temp(r.id, 'inlet') })) });
    faces.push({ z: zc - (f * RACK.d) / 2, dir: (-f) as 1 | -1, pts: flow.map((r) => ({ x: r.x, t: temp(r.id, 'exhaust') })) });
    bodies.push([zc - RACK.d / 2, zc + RACK.d / 2]);
  }

  // 면마다 x 열별 (온도, 덮임 정도)
  const prof = faces.map((f) => {
    const t = new Float32Array(nx);
    const c = new Float32Array(nx);
    for (let ix = 0; ix < nx; ix++) {
      const x = x0 + (ix + 0.5) * HEAT_RES;
      let ws = 0;
      let ts = 0;
      for (const p of f.pts) {
        const d = x - p.x;
        if (Math.abs(d) > SIGMA * 3) continue;
        const w = Math.exp(-(d * d) / (2 * SIGMA * SIGMA));
        ws += w;
        ts += w * p.t;
      }
      t[ix] = ws > 0 ? ts / ws : amb;
      // 랙이 0.6m 간격으로 이어진 곳에서 커널 합 × 간격 ÷ 커널 넓이 ≈ 1, 열 끝에서는 절반
      c[ix] = Math.min(1, (ws * RACK.w) / (SIGMA * Math.sqrt(2 * Math.PI)));
    }
    return { t, c };
  });

  const raw = new Float32Array(nx * nz);
  for (let iz = 0; iz < nz; iz++) {
    const z = z0 + (iz + 0.5) * HEAT_RES;
    const body = bodies.findIndex(([a, b]) => z >= a && z <= b);
    // 통로 칸: 위 · 아래로 가장 가까운 면 중 공기 쪽이 이 칸을 향하는 면 (통로에 붙은 두 열의 면)
    let below = -1;
    let above = -1;
    faces.forEach((f, i) => {
      if (f.z <= z && f.dir === 1 && (below < 0 || f.z > faces[below].z)) below = i;
      if (f.z >= z && f.dir === -1 && (above < 0 || f.z < faces[above].z)) above = i;
    });
    for (let ix = 0; ix < nx; ix++) {
      const at = (i: number) => prof[i].c[ix] * prof[i].t[ix] + (1 - prof[i].c[ix]) * amb;
      let t: number;
      if (body >= 0) {
        // 랙 안: 흡기와 배기 사이
        const fi = faces.findIndex((f) => f.dir === 1 && Math.abs(f.z - bodies[body][1]) < 0.01);
        const bi = faces.findIndex((f) => f.dir === -1 && Math.abs(f.z - bodies[body][0]) < 0.01);
        t = fi >= 0 && bi >= 0 ? (at(fi) + at(bi)) / 2 : amb;
      } else if (below >= 0 && above >= 0) {
        const k = (z - faces[below].z) / (faces[above].z - faces[below].z);
        t = at(below) * (1 - k) + at(above) * k;
      } else if (below >= 0 || above >= 0) {
        const i = below >= 0 ? below : above;
        const k = Math.min(1, Math.abs(z - faces[i].z) / FADE);
        t = at(i) * (1 - k) + amb * k;
      } else {
        t = amb;
      }
      raw[iz * nx + ix] = t;
    }
  }

  const data = blur(blur(raw, nx, nz), nx, nz);
  let min = Infinity;
  let max = -Infinity;
  for (const v of data) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { x0, z0, nx, nz, data, min, max };
}

// 3×3 상자 흐림
function blur(src: Float32Array, nx: number, nz: number) {
  const out = new Float32Array(src.length);
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      let s = 0;
      let n = 0;
      for (let dz = -1; dz <= 1; dz++) {
        const z = iz + dz;
        if (z < 0 || z >= nz) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const x = ix + dx;
          if (x < 0 || x >= nx) continue;
          s += src[z * nx + x];
          n++;
        }
      }
      out[iz * nx + ix] = s / n;
    }
  }
  return out;
}

// 세계 좌표 (x, z) 의 온도 (격자 밖이면 null)
export function sampleField(f: HeatField, x: number, z: number): number | null {
  const ix = Math.floor((x - f.x0) / HEAT_RES);
  const iz = Math.floor((z - f.z0) / HEAT_RES);
  if (ix < 0 || iz < 0 || ix >= f.nx || iz >= f.nz) return null;
  return f.data[iz * f.nx + ix];
}

// 칸 불투명도: '주의 이상만 강조'면 권장 상한(27°C) 이하를 거의 비운다
export const heatAlpha = (t: number, hotOnly: boolean) => (!hotOnly || t > RECOMMENDED[1] ? 1 : 0.1);

// 단면 통계 (격자 칸 평균)
export function fieldStats(f: HeatField) {
  let s = 0;
  for (const v of f.data) s += v;
  return { min: f.min, max: f.max, avg: s / f.data.length };
}
