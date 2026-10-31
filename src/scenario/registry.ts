// 시나리오 목록. 저장소와 화면은 id로 정의를 찾아 쓴다

import type { ScenarioDef, ScenarioId } from './core';
import { OUTAGE, type ScenarioParams, type Series } from './outage';
import { UPS_FAIL, type UpsFailParams } from './upsFail';
import { CRAC_FAIL, type CracFailParams, type CracFailSeries } from './cracFail';
import { LINE_OUT } from './lineOut';
import { LEAK, type LeakParams, type LeakSeries } from './leak';
import { BAT_FIRE, type BatFireParams } from './batFire';
import { SR_FIRE, type SrFireParams } from './srFire';

export type ScenarioRun =
  | { id: 'outage'; params: ScenarioParams; series: Series }
  | { id: 'upsFail'; params: UpsFailParams; series: null }
  | { id: 'cracFail'; params: CracFailParams; series: CracFailSeries }
  | { id: 'lineOut'; params: ScenarioParams; series: Series }
  | { id: 'leak'; params: LeakParams; series: LeakSeries }
  | { id: 'batFire'; params: BatFireParams; series: null }
  | { id: 'srFire'; params: SrFireParams; series: null };
export type ScenarioStart =
  | { id: 'outage'; params: ScenarioParams }
  | { id: 'upsFail'; params: UpsFailParams }
  | { id: 'cracFail'; params: CracFailParams }
  | { id: 'lineOut'; params: ScenarioParams }
  | { id: 'leak'; params: LeakParams }
  | { id: 'batFire'; params: BatFireParams }
  | { id: 'srFire'; params: SrFireParams };

// 정의마다 조건 · 연속값 타입이 달라 목록에서는 넓은 타입으로 꺼낸다
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DEFS: Record<ScenarioId, ScenarioDef<any, any>> = { outage: OUTAGE, upsFail: UPS_FAIL, cracFail: CRAC_FAIL, lineOut: LINE_OUT, leak: LEAK, batFire: BAT_FIRE, srFire: SR_FIRE };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const defOf = (id: ScenarioId): ScenarioDef<any, any> => DEFS[id];
