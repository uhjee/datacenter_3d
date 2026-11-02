// 시나리오: 한전 1회선 정전 (docs/PLAN.md §11.4)
// 본선이 끊기면 ALTS가 다른 변전소에서 오는 예비선으로 절체한다. 절체하는 몇 초 동안은 건물 전체가 순간 정전이다.
// UPS 뒤의 랙은 배터리로 끊김 없이 넘기지만, UPS를 거치지 않는 공조 설비는 그 몇 초 때문에 모두 멈추고 순서대로 다시 켜야 한다(냉동기는 몇 분).
// 정전 모델(outage.ts)을 그대로 쓰고, 한전 전원이 alts초 뒤 예비선으로 돌아오는 것만 다르다.

import { phaseAt, sigOf, SRC_META, STARTING_COLOR, type LogItem, type Phase, type ScenarioDef } from './core';
import { prepare, RESTART_DELAY as R, snapshot as outageSnapshot, tl, type ScenarioParams, type Series } from './outage';

export function phases(p: ScenarioParams): Phase[] {
  const L = tl(p);
  const s = p.alts ?? 3;
  const list: Phase[] = [
    {
      t: 0,
      title: '정상 운전 (본선 수전)',
      body: '한전 22.9kV 본선으로 받고, 다른 변전소에서 오는 예비선은 ALTS에서 열린 채 대기합니다. 발전기도 대기 중입니다.',
    },
    {
      t: L.out,
      title: '본선 정전 → 순간 정전',
      body: `본선 선로에 사고가 났습니다. ALTS가 예비선으로 넘어가기 전 ${s}초 동안은 특고압 · 저압 전체에 전기가 없습니다. UPS는 0초 만에 배터리로 넘어가 랙은 그대로지만, UPS를 거치지 않는 항온항습기 · 냉동기 · 펌프 · 냉각탑은 모두 멈춥니다.`,
    },
    {
      t: L.genStart,
      title: '발전기 기동 신호',
      body: '저전압을 감지한 발전기도 일단 기동합니다. 정격에 이르기까지 10초 안팎이 걸리고, ATS는 발전기가 준비돼야 넘어갑니다.',
    },
  ];
  if (L.onGen) {
    list.push(
      { t: L.ats, title: 'ATS 발전기 절체', body: `ALTS 절체(${s}초)가 발전기 준비보다 늦어, ATS가 먼저 발전기로 넘어갔습니다. 완전 정전과 같은 길입니다.` },
      { t: L.back, title: 'ALTS 예비선 절체', body: '예비선으로 절체되어 한전 전원이 돌아왔습니다. ATS는 전압이 안정적인지 지켜본 뒤(여기서는 60초) 상용으로 돌아갑니다.' },
      { t: L.retransfer, title: 'ATS 상용 복귀', body: 'ATS가 폐쇄 전환으로 상용(예비선)에 돌아옵니다. 발전기는 부하 없이 냉각 운전합니다.' },
    );
  } else {
    list.push({
      t: L.back,
      title: 'ALTS 예비선 절체 → 복전',
      body: `${s}초 만에 예비선으로 절체되어 전기가 돌아왔습니다. 발전기는 아직 정격 전이라 ATS는 상용 쪽 그대로입니다. UPS는 배터리 방전을 멈추고, 공조 동력반이 살아나 설비가 순서대로 다시 켜집니다.`,
    });
  }
  list.push(
    {
      t: L.mccBack + R.crac,
      title: '공냉식 압축기 재기동',
      body: '팬 · 펌프 · 냉각탑은 금방 돌지만, 공냉식 항온항습기 압축기는 재기동 보호 시간이 지나야 냉각을 시작합니다. 몇 초의 순간 정전이 수십 초의 냉각 공백이 됩니다.',
    },
    {
      t: L.mccBack + R.chiller,
      title: '냉동기 재기동',
      body: '냉동기는 다시 냉수를 만들기까지 몇 분이 걸립니다. 그동안 서버실 B는 배관에 남은 냉수로 버팁니다. 그래서 냉동기 · 냉수 펌프를 UPS에 물리거나 축냉조를 두기도 합니다.',
    },
    {
      t: L.genStop,
      title: '발전기 정지',
      body: L.onGen ? '냉각 운전을 마친 발전기가 대기로 돌아갑니다.' : '부하를 받지 않은 발전기가 냉각 운전을 마치고 대기로 돌아갑니다.',
    },
  );
  return list.sort((a, b) => a.t - b.t);
}

export function eventLog(p: ScenarioParams): LogItem[] {
  const L = tl(p);
  const items: LogItem[] = [
    { t: L.out, text: '한전 본선 정전 (선로 사고), 예비선은 살아 있음' },
    { t: L.out, text: 'UPS 6대 배터리 운전 전환 (0초, 랙 무정전)' },
    { t: L.out, text: '공조 동력반 순간 정전 → 공조 설비 전부 정지' },
    { t: L.genStart, text: p.genFail ? '발전기-1 기동, 발전기-2 기동 실패' : '발전기-1 · 2 기동 신호' },
    { t: L.genRated, text: L.onGen ? '발전기 정격 도달' : '발전기 정격 도달 (상용 복전 상태라 부하 없음)' },
    { t: L.back, text: `ALTS 예비선 절체 (본선 정전 후 ${p.alts}초)` },
  ];
  if (L.onGen) {
    items.push(
      { t: L.ats, text: 'ATS-A · B 발전기로 절체' },
      { t: L.retransfer, text: 'ATS-A · B 상용 복귀 (폐쇄 전환)' },
    );
  } else {
    items.push({ t: L.back, text: 'UPS 배터리 방전 종료, 공조 동력반 복전' });
  }
  items.push(
    { t: L.mccBack + R.crah, text: '항온항습기(수냉식) 팬 재기동' },
    { t: L.mccBack + R.pump, text: '냉수 · 냉각수 펌프 재기동' },
    { t: L.mccBack + R.coolingTower, text: '냉각탑 팬 재기동' },
    { t: L.mccBack + R.crac, text: '항온항습기(공냉식) 압축기 · 실외기 재기동' },
    { t: L.mccBack + R.chiller, text: '냉동기 재기동, 냉수 온도 회복 시작' },
    { t: L.genStop, text: '발전기 냉각 운전 종료, 대기' },
  );
  return items;
}

export const LINE_OUT: ScenarioDef<ScenarioParams, Series> = {
  id: 'lineOut',
  name: '한전 1회선 정전',
  end: 0, // 조건(ALTS 절체 시간)에 따라 달라 endOf로 계산
  phases,
  snapshot: (t, p) => {
    const snap = outageSnapshot(t, p);
    const phase = phaseAt(phases(p), t);
    return { ...snap, phase, sig: sigOf(phase, snap.nodes) };
  },
  prepare,
  eventLog,
  endOf: (p) => tl(p).end,
  segments: (p) => {
    const L = tl(p);
    return L.onGen
      ? [
          { from: 0, to: L.out, color: SRC_META.utility.color },
          { from: L.out, to: L.ats, color: SRC_META.battery.color },
          { from: L.ats, to: L.retransfer, color: SRC_META.gen.color },
          { from: L.retransfer, to: L.end, color: SRC_META.utility.color },
        ]
      : [
          { from: 0, to: L.out, color: SRC_META.utility.color },
          { from: L.out, to: L.back, color: SRC_META.battery.color },
          { from: L.back, to: L.end, color: SRC_META.utility.color },
        ];
  },
  legend: [
    { color: SRC_META.utility.color, name: SRC_META.utility.name },
    { color: SRC_META.battery.color, name: SRC_META.battery.name },
    { color: SRC_META.gen.color, name: SRC_META.gen.name },
    { color: STARTING_COLOR, name: '재기동 중' },
    { color: SRC_META.none.color, name: '정전' },
  ],
  note: '근사 모델입니다. ALTS 절체 시간은 제품 · 설정에 따라 달라 조건으로 바꿀 수 있게 했습니다. 재기동 시간은 완전 정전과 같습니다.',
  assume: [
    ['공냉식 압축기 재기동', '45초'],
    ['냉동기 재기동', '240초'],
  ],
};
