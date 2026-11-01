// 시나리오 탭: 시계 · 재생 조작 · 상태판 · 진행 단계(사건 기록 포함), 그리고 재생 시계

import { useEffect, useMemo, type CSSProperties, type ReactNode } from 'react';
import { Droplets, Fan, Flame, Pause, Play, PlugZap, RotateCcw, Server, Zap, type LucideIcon } from 'lucide-react';
import { RACKS } from '../data/racks';
import { computeMetrics, UPS_KW } from '../data/metrics';
import { STATUS_META, statusOf, type RoomLabel } from '../data/thermal';
import { exitThermal, focusFloor, focusOverview, startTrace } from '../scene/focus';
import { useView } from '../store/useView';
import { Meter, Pill, Section, Status, Switch } from '../ui/kit';
import { TEMP_TONE } from '../ui/ThermInfo';
import { fmtT, scenEnd, SRC_META, STARTING_COLOR, FAULT_COLOR, type Src } from './core';
import { tl, values, type Values } from './outage';
import { defOf } from './registry';
import { UPS_FAIL_COUNTS, UT, values as upsValues, type UpsFailValues } from './upsFail';
import { CT, standbyOf, unitName, values as cracValues, type CracFailParams, type CracFailValues } from './cracFail';
import { lt, RESPONSE_NAME, values as leakValues, type LeakParams, type LeakValues } from './leak';
import { bt, values as batValues, type BatFireParams, type BatFireValues } from './batFire';
import { fireRack, st, values as srValues, type SrFireParams, type SrFireValues } from './srFire';
import { useRoomTherm } from '../ui/useStatus';
import type { RackColorMode } from '../store/useView';

// 재생 중에는 매 프레임 시간을 흘려 보낸다
export function ScenarioClock() {
  const playing = useView((s) => !!s.scenario?.playing);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const s = useView.getState();
      if (!s.scenario) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      s.setScenT(s.scenario.t + dt * s.scenario.speed);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  return null;
}

// 시나리오를 시작하기 전 화면 정리, 시작한 뒤 흐름도 · 시나리오 탭 · 전체 보기
function beforeStart() {
  const s = useView.getState();
  startTrace(null);
  s.setGroup(null);
  s.select(null);
  exitThermal(false);
  return { s, m: computeMetrics(s.itLoad, s.outdoorT, s.airCfg, s.therm) };
}
function afterStart() {
  const s = useView.getState();
  if (s.diagramMode === 'off') s.setDiagramMode('half');
  s.setDiagramTab('power');
  s.setRightTab('scenario');
  focusOverview();
}

// 현재 운전 조건(IT 부하율 · 외기 · 기류 설정)으로 시나리오 시작
export function startOutage() {
  const { s, m } = beforeStart();
  s.startScenario({
    id: 'outage',
    params: {
      upsOut: { A: m.ups.A.out, B: m.ups.B.out },
      facilityKw: m.total,
      baseInlet: { A: s.therm.A.maxInlet, B: s.therm.B.maxInlet },
      genFail: false,
    },
  });
  afterStart();
}

// 한전 1회선 정전: 완전 정전과 같은 조건에 ALTS 절체 시간만 더한다
export function startLineOut() {
  const { s, m } = beforeStart();
  s.startScenario({
    id: 'lineOut',
    params: {
      upsOut: { A: m.ups.A.out, B: m.ups.B.out },
      facilityKw: m.total,
      baseInlet: { A: s.therm.A.maxInlet, B: s.therm.B.maxInlet },
      genFail: false,
      alts: 3,
    },
  });
  afterStart();
}

// UPS-A 출력 = 이중전원 랙 절반 + 단일전원(STS) 랙, UPS-B 출력 = 이중전원 랙 절반
export function startUpsFail() {
  const { s, m } = beforeStart();
  s.startScenario({ id: 'upsFail', params: { side: 'A', bypass: true, ab: 2 * m.ups.B.out, sts: m.ups.A.out - m.ups.B.out } });
  afterStart();
}

// 항온항습기 고장: 그 서버실로 카메라를 옮기고 랙을 흡기 온도로 칠한다 (끝내면 원래 색칠로)
let rackColorBefore: RackColorMode | null = null;
export function startCracFail(room: RoomLabel = 'B') {
  const { s } = beforeStart();
  const th = s.therm[room];
  s.startScenario({ id: 'cracFail', params: { room, unit: 2, second: false, loadKw: th.loadKw, unitKw: th.unitKw, supply: s.airCfg[room].supply } });
  rackColorBefore = s.rackColor;
  s.setRackColor('temp');
  if (s.diagramMode === 'off') s.setDiagramMode('half');
  s.setDiagramTab('cooling');
  s.setRightTab('scenario');
  focusFloor(room === 'A' ? '3F' : '4F');
}

// 누수: 서버실 B 이중마루를 투시해 마루 아래 물이 보이게 한다 (끝내면 원래대로)
let xrayBefore: boolean | null = null;
export function startLeak() {
  const { s } = beforeStart();
  const th = s.therm.B;
  s.startScenario({ id: 'leak', params: { unit: 3, response: 'manual', rate: 20, loadKw: th.loadKw, unitKw: th.unitKw, supply: s.airCfg.B.supply } });
  xrayBefore = s.airCfg.B.xray;
  s.setAirCfg('B', { xray: true });
  rackColorBefore = s.rackColor;
  s.setRackColor('temp');
  if (s.diagramMode === 'off') s.setDiagramMode('half');
  s.setDiagramTab('cooling');
  s.setRightTab('scenario');
  focusFloor('4F');
}

// 배터리실 화재: 2층으로. 서버실 화재: 그 서버실 층으로
export function startBatFire() {
  const { s } = beforeStart();
  s.startScenario({ id: 'batFire', params: { offgas: false, separated: true } });
  if (s.diagramMode === 'off') s.setDiagramMode('half');
  s.setDiagramTab('power');
  s.setRightTab('scenario');
  focusFloor('2F');
}

export function startSrFire() {
  const { s } = beforeStart();
  s.startScenario({ id: 'srFire', params: { room: 'A', early: false } });
  s.setRightTab('scenario');
  focusFloor('3F');
}

export function stopScenario() {
  const s = useView.getState();
  const id = s.scenario?.id;
  if ((id === 'cracFail' || id === 'leak') && rackColorBefore) s.setRackColor(rackColorBefore);
  if (id === 'leak' && xrayBefore != null) s.setAirCfg('B', { xray: xrayBefore });
  rackColorBefore = null;
  xrayBefore = null;
  s.stopScenario();
}

const SPEEDS = [1, 2, 5, 20];
const RACK_IDS = RACKS.map((r) => `rack:${r.id}`);
const GEN_NAME = { off: '대기', starting: '기동 중', rated: '정격 운전', cooldown: '냉각 운전' } as const;
const UPS_NAME = { normal: '상용 운전', battery: '배터리 운전', walkin: '발전기로 부하 인수 중', gen: '발전기 전원 운전' } as const;

export function ScenarioPanel() {
  const sc = useView((s) => s.scenario);
  if (!sc) return <ScenarioList />;
  return <ScenarioRun />;
}

function ScenarioList() {
  const items: [LucideIcon, string, string, (() => void) | null][] = [
    [Zap, '한전 완전 정전', '본선 · 예비선이 모두 끊겼을 때 배터리 → 발전기 → 복전까지', startOutage],
    [PlugZap, '한전 1회선 정전', '본선만 끊김 → ALTS가 예비선으로 절체. 몇 초의 순간 정전에도 공조는 다시 켜야 한다', startLineOut],
    [Server, 'UPS 고장', 'UPS 한 대가 멈춰도 2N이라 랙은 그대로. STS 절체 · 예비 없는 N 상태 · 정비 바이패스', startUpsFail],
    [Fan, '항온항습기 고장', '6대 중 1대 고장 → 대기기 자동 투입(N+1), 그사이 주변 랙 흡기 상승. 한 대 더 멈추면?', () => startCracFail()],
    [Flame, '배터리실 화재', '리튬이온 열폭주 → 가스 소화 → 재발화 → 전원 차단. 오프가스 감지 · 방화구획 분리가 피해 범위를 가른다', startBatFire],
    [Flame, '서버실 화재', '랙 전원부 과열 → VESDA 단계 경보 → 조기 대응 또는 가스 소화. 다른 랙은 계속 동작', startSrFire],
    [Droplets, '누수', '서버실 B 마루 아래 냉수 배관 누수 → 감지 → 밸브 차단. 대응 방식에 따라 번지는 물의 양', startLeak],
  ];
  return (
    <div className="rp-card">
      <div className="rp-body rp-pad-top">
        <p className="role">사고가 났을 때 전기와 냉각이 어떻게 버티는지 시간을 따라 재생합니다. 3D와 흐름도가 각 장비가 어떤 전원으로 살아 있는지 함께 보여줍니다.</p>
        <div className="rp-scen-list">
          {items.map(([Icon, t, d, start]) => (
            <div key={t} className={`rp-scen-item${start ? '' : ' off'}`}>
              <span className="rp-scen-ico">
                <Icon size={18} />
              </span>
              <div className="grow">
                <b>{t}</b>
                <small>{d}</small>
              </div>
              {start ? (
                <button className="primary" onClick={start}>
                  <Play size={13} /> 시작
                </button>
              ) : (
                <Pill tone="muted">준비 중</Pill>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScenarioRun() {
  const sc = useView((s) => s.scenario)!;
  const snap = useView((s) => s.scenSnap)!;
  const def = defOf(sc.id);
  const phases = useMemo(() => def.phases(sc.params), [def, sc.params]);
  const log = useMemo(() => def.eventLog(sc.params), [def, sc.params]);
  const segments = useMemo(() => def.segments(sc.params), [def, sc.params]);
  const set = useView.getState();
  const end = scenEnd(def, sc.params);
  const ended = sc.t >= end;
  const at = (t: number) => `${(t / end) * 100}%`;
  const racksOn = RACK_IDS.filter((id) => snap.nodes[id]?.status === 'on').length;
  const rackSrc = snap.nodes[RACK_IDS[0]].src;

  // 시나리오별: 시계 옆 설명 · 상태판 · 조건
  let clockSub: string;
  let board: ReactNode;
  let cond: ReactNode;
  let condSummary: string;
  if (sc.id === 'outage' || sc.id === 'lineOut') {
    const p = sc.params;
    const v = values(sc.t, p, sc.series);
    const L = tl(p);
    const since = sc.t - L.out;
    const single = sc.id === 'lineOut';
    clockSub =
      since < 0 ? '정전 직전' : !v.utility ? `${single ? '본선 정전' : '정전 후'} ${Math.floor(since)}초` : single ? `복전 후 ${Math.floor(sc.t - L.back)}초` : '복전 후';
    board = <Board v={v} line={single ? (sc.t < L.out ? 'main' : sc.t < L.back ? 'switching' : 'standby') : undefined} />;
    const genSwitch = <Switch checked={p.genFail} onChange={() => set.setScenParams({ genFail: !p.genFail })} label="발전기-2 기동 실패 (N+1: 1대로도 감당하는지)" />;
    if (single) {
      condSummary = `ALTS ${p.alts}초${p.genFail ? ' · 발전기-2 실패' : ''}`;
      cond = (
        <div className="rp-cond">
          <div className="rp-cond-row">
            <span>ALTS 절체</span>
            <div className="seg small">
              {[3, 20].map((k) => (
                <button key={k} className={p.alts === k ? 'on' : ''} onClick={() => set.setScenParams({ alts: k })}>
                  {k}초{k === 3 ? ' (발전기보다 빠름)' : ' (발전기보다 느림)'}
                </button>
              ))}
            </div>
          </div>
          {genSwitch}
          <p className="hint">발전기는 정격까지 약 10초, ATS는 그 뒤에 넘어갑니다(정전 후 13초). ALTS가 그보다 빠르면 ATS는 상용 쪽에 그대로 있고, 느리면 완전 정전처럼 발전기로 갔다가 돌아옵니다.</p>
        </div>
      );
    } else {
      condSummary = p.genFail ? '발전기-2 기동 실패' : '기본';
      cond = genSwitch;
    }
  } else if (sc.id === 'upsFail') {
    const p = sc.params;
    const v = upsValues(sc.t, p);
    const since = sc.t - UT.fail;
    clockSub = since < 0 ? '고장 직전' : v.mode === 'restored' ? '2N 회복' : `고장 후 ${Math.floor(since)}초`;
    board = <UpsBoard v={v} side={p.side} />;
    condSummary = `UPS-${p.side} 고장 · 바이패스 ${p.bypass ? '사용' : '안 씀'}`;
    cond = (
      <div className="rp-cond">
        <div className="rp-cond-row">
          <span>고장 나는 UPS</span>
          <div className="seg small">
            {(['A', 'B'] as const).map((k) => (
              <button key={k} className={p.side === k ? 'on' : ''} onClick={() => set.setScenParams({ side: k })}>
                UPS-{k}
              </button>
            ))}
          </div>
        </div>
        <Switch checked={p.bypass} onChange={() => set.setScenParams({ bypass: !p.bypass })} label="정비 바이패스로 고장 쪽 계통 임시 복구" />
        <p className="hint">UPS-B가 고장 나면 STS는 원래 A로 받고 있어 절체가 일어나지 않습니다. 바이패스를 쓰면 예비 없는 시간이 줄지만 그쪽 계통은 UPS 보호를 잃습니다.</p>
      </div>
    );
  } else if (sc.id === 'cracFail') {
    const p = sc.params;
    const v = cracValues(sc.t, p, sc.series);
    const since = sc.t - CT.fail;
    clockSub = since < 0 ? '고장 직전' : `고장 후 ${Math.floor(since)}초`;
    board = <CracBoard v={v} p={p} t={sc.t} />;
    condSummary = `서버실 ${p.room} · ${p.unit}번 고장${p.second ? ' · 한 대 더' : ''}`;
    cond = (
      <div className="rp-cond">
        <div className="rp-cond-row">
          <span>서버실</span>
          <div className="seg small">
            {(['A', 'B'] as const).map((k) => (
              <button key={k} className={p.room === k ? 'on' : ''} onClick={() => restartCrac({ room: k })}>
                {k} · {k === 'A' ? '공냉식' : '수냉식'}
              </button>
            ))}
          </div>
        </div>
        <div className="rp-cond-row">
          <span>고장 유닛</span>
          <div className="seg small">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button key={n} className={p.unit === n ? 'on' : ''} onClick={() => set.setScenParams({ unit: n })}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <Switch checked={p.second} onChange={() => set.setScenParams({ second: !p.second })} label="대기기 투입 뒤 이웃 유닛 한 대 더 고장 (예비 없음)" />
        <p className="hint">
          대기기는 {standbyOf(p)}번입니다. 서버실 B는 봉쇄가 없어 평소 흡기가 높아 같은 고장에도 권장 상한(27°C)을 먼저 넘습니다. 지표 탭의 IT 부하율을 올린 뒤 다시 시작하면 용량 부족이 더 크게 드러납니다.
        </p>
      </div>
    );
  } else if (sc.id === 'leak') {
    const p = sc.params;
    const v = leakValues(sc.t, p);
    const L = lt(p);
    const since = sc.t - L.start;
    clockSub = since < 0 ? '누수 직전' : sc.t < L.close ? `누수 ${Math.floor(since)}초째` : `차단 후 ${Math.floor(sc.t - L.close)}초`;
    board = <LeakBoard v={v} p={p} t={sc.t} />;
    condSummary = `${p.unit}번 분기 · ${RESPONSE_NAME[p.response]}`;
    cond = (
      <div className="rp-cond">
        <div className="rp-cond-row col">
          <span>대응 방식</span>
          <div className="seg small">
            {(['auto', 'manual', 'spot'] as const).map((k) => (
              <button key={k} className={p.response === k ? 'on' : ''} onClick={() => set.setScenParams({ response: k })}>
                {RESPONSE_NAME[k]}
              </button>
            ))}
          </div>
        </div>
        <div className="rp-cond-row">
          <span>새는 분기</span>
          <div className="seg small">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button key={n} className={p.unit === n ? 'on' : ''} onClick={() => set.setScenParams({ unit: n })}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <p className="hint">
          차단까지 걸린 시간 = 바닥에 고인 물입니다. 감지선은 물이 닿은 위치(±1m)를 알려 바로 그 분기를 닫을 수 있고, 점형 감지기는 물이 감지기까지 번져야 울리고 구역만 알려 줍니다.
        </p>
      </div>
    );
  } else if (sc.id === 'batFire') {
    const p = sc.params;
    const v = batValues(sc.t, p);
    const B = bt(p);
    clockSub = sc.t < B.pre ? '전조 직전' : sc.t < B.runaway ? `전조 ${Math.floor(sc.t - B.pre)}초째` : sc.t < B.out ? `발화 후 ${Math.floor(sc.t - B.runaway)}초` : '진화 완료';
    board = <BatFireBoard v={v} p={p} />;
    condSummary = `오프가스 ${p.offgas ? '있음' : '없음'} · ${p.separated ? '방화구획 분리' : '한 공간'}`;
    cond = (
      <div className="rp-cond">
        <Switch checked={p.offgas} onChange={() => set.setScenParams({ offgas: !p.offgas })} label="오프가스 감지기 (연기 전 조기 경보 · 배터리 자동 분리)" />
        <Switch checked={p.separated} onChange={() => set.setScenParams({ separated: !p.separated })} label="배터리실 · UPS실 · 전력선 방화구획 분리 (이 건물의 설계)" />
        <p className="hint">분리를 끄면 판교 화재처럼 배터리 · UPS · 전력선이 한 공간에 있다고 보고, 소방대가 전기실 전체를 끊어 2N인데도 랙이 모두 꺼집니다.</p>
      </div>
    );
  } else {
    const p = sc.params;
    const v = srValues(sc.t, p);
    const S = st(p);
    clockSub = sc.t < S.pre ? '과열 직전' : sc.t < S.clear ? `연기 발생 후 ${Math.floor(sc.t - S.pre)}초` : '정리 완료';
    board = <SrFireBoard v={v} p={p} />;
    condSummary = `서버실 ${p.room} · ${p.early ? '조기 대응' : '대응 늦음'}`;
    cond = (
      <div className="rp-cond">
        <div className="rp-cond-row">
          <span>서버실</span>
          <div className="seg small">
            {(['A', 'B'] as const).map((k) => (
              <button
                key={k}
                className={p.room === k ? 'on' : ''}
                onClick={() => {
                  set.setScenParams({ room: k });
                  focusFloor(k === 'A' ? '3F' : '4F');
                }}
              >
                서버실 {k}
              </button>
            ))}
          </div>
        </div>
        <Switch checked={p.early} onChange={() => set.setScenParams({ early: !p.early })} label="VESDA 경보 단계에서 랙 전원 차단 (조기 대응)" />
        <p className="hint">조기 대응을 끄면 불로 번져 가스 소화약제를 방출합니다. 가스 약제는 장비를 적시지 않아 불이 난 랙 말고는 계속 동작합니다.</p>
      </div>
    );
  }

  return (
    <div className="rp-card scen">
      <div className="rp-body rp-pad-top">
        <div className="rp-scen-top">
          <Pill tone="crit">{def.name}</Pill>
          <button className="small" onClick={stopScenario}>
            끝내기
          </button>
        </div>
        <div className="rp-clock">
          <span className="num">T+{fmtT(sc.t)}</span>
          <small>{clockSub}</small>
        </div>
        <p className="rp-clock-sub">
          랙 {RACK_IDS.length}대 {racksOn === RACK_IDS.length ? '모두 동작' : `중 ${racksOn}대 동작`} · 전원{' '}
          <b style={{ color: SRC_META[rackSrc].color }}>{SRC_META[rackSrc].name}</b>
        </p>

        <div className="rp-player">
          <button className="rp-play" aria-label={sc.playing ? '일시정지' : ended ? '다시 재생' : '재생'} onClick={() => set.setScenPlaying(!sc.playing)}>
            {sc.playing ? <Pause size={15} /> : ended ? <RotateCcw size={15} /> : <Play size={15} />}
          </button>
          <div className="rp-scrub">
            <div className="rp-scrub-track">
              {segments.map((g) => (
                <i key={g.from} style={{ left: at(g.from), width: at(g.to - g.from), background: g.color }} />
              ))}
              <b style={{ width: at(sc.t) }} />
            </div>
            {phases.map((p, i) => (
              <button
                key={p.title}
                className={`rp-tick${i === snap.phase ? ' on' : ''}`}
                style={{ left: at(p.t) }}
                title={`${fmtT(p.t)} ${p.title}`}
                aria-label={`${fmtT(p.t)} ${p.title}`}
                onClick={() => set.setScenT(p.t + 0.5)}
              />
            ))}
            <input type="range" min={0} max={end} step={1} value={sc.t} onChange={(e) => set.setScenT(+e.target.value)} aria-label="시각" />
          </div>
          <div className="seg small rp-speed">
            {SPEEDS.map((k) => (
              <button key={k} className={sc.speed === k ? 'on' : ''} onClick={() => set.setScenSpeed(k)}>
                {k}×
              </button>
            ))}
          </div>
        </div>
        <div className="rp-scrub-legend">
          {def.legend.map((l) => (
            <span key={l.name} style={{ '--c': l.color } as CSSProperties}>
              {l.name}
            </span>
          ))}
        </div>

        {board}

        <Section id="scen-steps" title="진행 단계" count={`${snap.phase + 1} / ${phases.length}`}>
          <ol className="rp-steps">
            {phases.map((p, i) => {
              const next = phases[i + 1]?.t ?? Infinity;
              const state = i < snap.phase ? 'done' : i === snap.phase ? 'now' : 'future';
              const events = log.filter((e) => e.t >= p.t && e.t < next).sort((a, b) => a.t - b.t);
              return (
                <li key={p.title} className={state}>
                  <span className="rp-step-dot" />
                  <button className="rp-step-t" onClick={() => set.setScenT(p.t + 0.5)}>
                    <span className="num">{fmtT(p.t)}</span>
                    {p.title}
                  </button>
                  {state === 'now' && (
                    <div className="rp-step-now">
                      <p>{p.body}</p>
                      {events.length > 0 && (
                        <ul>
                          {events.map((e, k) => (
                            <li key={k} className={e.t <= sc.t ? 'done' : ''}>
                              <span className="num">{fmtT(e.t)}</span> {e.text}
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="rp-step-nav">
                        <button className="small" disabled={i === 0} onClick={() => set.setScenT(phases[i - 1].t + 0.5)}>
                          ← 이전
                        </button>
                        <button className="small" disabled={i === phases.length - 1} onClick={() => set.setScenT(phases[i + 1].t + 0.5)}>
                          다음 →
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </Section>

        <Section id={`scen-cond-${sc.id}`} title="조건 바꾸기" count={condSummary} defaultOpen={sc.id !== 'outage'}>
          {cond}
        </Section>
        <p className="note">{def.note}</p>
      </div>
    </div>
  );
}

// 서버실을 바꾸면 열부하 · 유닛 용량 · 급기 설정이 달라 처음부터 다시 시작
function restartCrac(patch: { room: RoomLabel }) {
  const s = useView.getState();
  const before = rackColorBefore;
  s.stopScenario();
  startCracFail(patch.room);
  rackColorBefore = before;
}

// 항온항습기 고장 상태판 6칸
function CracBoard({ v, p, t }: { v: CracFailValues; p: CracFailParams; t: number }) {
  const th = useRoomTherm(p.room);
  const fState = v.states[p.unit - 1];
  const util = p.loadKw / Math.max(1, v.cap);
  const utilColor = util > 1 ? 'var(--crit)' : util > 0.9 ? 'var(--warn)' : 'var(--ok)';
  const sbName = { run: '냉각 중', standby: '대기', starting: p.room === 'A' ? '기동 중 · 압축기 대기' : '기동 중', fault: '고장' }[v.standby];
  const sbColor = v.standby === 'run' ? 'var(--ok)' : v.standby === 'starting' ? STARTING_COLOR : SRC_META.utility.color;
  const tst = statusOf(th.maxInlet);
  const spare = 6 - v.running - v.states.filter((x) => x === 'fault').length - (v.standby === 'starting' ? 1 : 0);
  return (
    <div className="rp-board">
      <Tile k={`고장 유닛 · ${p.unit}번`} v={fState === 'fault' ? '고장 · 정지' : fState === 'standby' ? '수리 완료 · 대기' : '운전'} c={fState === 'fault' ? FAULT_COLOR : 'var(--ok)'} s={unitName(p.room, p.unit)} />
      <Tile k={`대기기 · ${standbyOf(p)}번`} v={sbName} c={sbColor} s={t < CT.cmd ? '고장 시 자동 기동' : undefined} />
      <Tile k="운전 대수" v={`${v.running} / 6대`} c={spare > 0 ? 'var(--ok)' : 'var(--warn)'} s={spare > 0 ? `예비 ${spare}대` : '예비 없음'} />
      <Tile k="냉각 용량 대비 열부하" v={`${Math.round(util * 100)}%`} c={utilColor} meter={{ v: util, color: utilColor }} s={`${Math.round(p.loadKw)} / ${v.cap}kW`} />
      <Tile k="급기 온도" v={`${v.supplyT}°C`} c={v.supplyT - p.supply > 0.3 ? 'var(--warn)' : SRC_META.utility.color} s={`설정 ${p.supply}°C`} />
      <div className="rp-tile" style={{ '--c': `var(--${TEMP_TONE[tst]})` } as CSSProperties}>
        <div className="rp-tile-k">
          <span>최고 흡기 · 서버실 {p.room}</span>
        </div>
        <div className="rp-tile-v num">{th.maxInlet}°C</div>
        <div className="rp-tile-s num">권장 초과 랙 {th.over}대 · 평균 {th.avgInlet}°C</div>
        {tst !== 'ok' && <Status tone={TEMP_TONE[tst]}>{STATUS_META[tst].name}</Status>}
      </div>
    </div>
  );
}

// 배터리실 화재 상태판 6칸
function BatFireBoard({ v, p }: { v: BatFireValues; p: BatFireParams }) {
  const stageName = { normal: '정상', pre: '정상 (전조 감지 안 됨)', offgas: '오프가스 경보', fire: '열폭주 · 화재', suppressed: '불꽃 잦아듦', reignite: '재발화', cooling: '물 냉각 중', out: '진화 완료' }[v.stage];
  const stageColor = v.stage === 'normal' || v.stage === 'pre' || v.stage === 'out' ? SRC_META.utility.color : v.stage === 'offgas' ? STARTING_COLOR : v.stage === 'cooling' ? '#4dabf7' : FAULT_COLOR;
  const cellColor = v.cell > 150 ? FAULT_COLOR : v.cell > 60 ? STARTING_COLOR : 'var(--ok)';
  const racks = useView((s) => s.scenSnap);
  const on = racks ? RACK_IDS.filter((id) => racks.nodes[id]?.status === 'on').length : RACK_IDS.length;
  return (
    <div className="rp-board">
      <Tile k="배터리실 A" v={stageName} c={stageColor} s={p.separated ? '방화구획 분리' : '배터리 · UPS · 전력선 한 공간'} />
      <Tile k="가장 뜨거운 셀" v={`${v.cell}°C`} c={cellColor} meter={{ v: Math.min(1, v.cell / 700), color: cellColor }} s="리튬인산철, 근사 곡선" />
      <Tile k="배터리 연결" v={v.isolated ? '분리됨' : '연결'} c={v.isolated ? STARTING_COLOR : SRC_META.utility.color} s={v.isolated ? 'UPS-A 배터리 백업 없음' : 'UPS-A 직류 링크'} />
      <Tile
        k="가스 소화"
        v={v.gas === 'standby' ? '대기' : v.gas === 'delay' ? `방출 지연 ${v.delayLeft}초` : '방출 완료'}
        c={v.gas === 'standby' ? SRC_META.utility.color : v.gas === 'delay' ? STARTING_COLOR : '#e9ecef'}
        s={v.gas === 'done' ? (v.stage === 'out' ? '약제 배기 · 재진입' : '불꽃만 잡고 셀 반응은 남음') : '교차회로 → 30초 지연'}
      />
      <Tile k="UPS-A" v={v.cut ? (p.separated ? '비상 정지 (EPO)' : '정지 (전체 차단)') : '운전'} c={v.cut ? FAULT_COLOR : 'var(--ok)'} s={v.cut ? '소방 진입 전 전원 차단' : undefined} />
      <Tile k="랙" v={`${on} / ${RACK_IDS.length}대 동작`} c={on === RACK_IDS.length ? 'var(--ok)' : FAULT_COLOR} s={on === RACK_IDS.length ? (v.cut ? 'B계통으로 유지 (2N → N)' : '영향 없음') : '서비스 중단'} />
    </div>
  );
}

// 서버실 화재 상태판 6칸
function SrFireBoard({ v, p }: { v: SrFireValues; p: SrFireParams }) {
  const lvColor = v.level === '정상' ? SRC_META.utility.color : v.level === 'Fire' ? FAULT_COLOR : STARTING_COLOR;
  return (
    <div className="rp-board">
      <Tile k="원인 랙" v={`랙 ${fireRack(p)}`} c={v.rackState === 'run' ? STARTING_COLOR : v.rackState === 'cut' ? 'var(--warn)' : FAULT_COLOR} s={v.rackState === 'run' ? '서버 전원부 과열' : v.rackState === 'cut' ? 'rPDU 차단 · 정지' : '소손 · 차단기 트립'} />
      <Tile k="VESDA (공기흡입형)" v={v.level} c={lvColor} s="Alert → Action → Fire" />
      <Tile k="연기감지기 교차회로" v={`A ${v.detA ? '●' : '○'} · B ${v.detB ? '●' : '○'}`} c={v.detA && v.detB ? FAULT_COLOR : v.detA ? STARTING_COLOR : SRC_META.utility.color} s="A · B 모두 울려야 방출" />
      <Tile
        k="가스 소화"
        v={v.gas === 'standby' ? '대기' : v.gas === 'delay' ? `방출 지연 ${v.delayLeft}초` : '방출 · 진화'}
        c={v.gas === 'standby' ? SRC_META.utility.color : v.gas === 'delay' ? STARTING_COLOR : '#e9ecef'}
        s={v.gas === 'delay' ? '경보 방송 · 대피' : v.gas === 'done' ? '장비를 적시지 않음' : undefined}
      />
      <Tile k={`서버실 ${p.room} 랙`} v={`${v.racksOn} / ${v.racksTotal}대 동작`} c={v.racksOn === v.racksTotal ? 'var(--ok)' : 'var(--warn)'} s={v.racksOn === v.racksTotal ? '영향 없음' : '원인 랙만 정지'} />
      <Tile k="공조" v="운전 (실내 순환)" c="var(--ok)" s="외기 댐퍼 닫힘 · 설계에 따라 다름" />
    </div>
  );
}

// 누수 상태판 6칸
function LeakBoard({ v, p, t }: { v: LeakValues; p: LeakParams; t: number }) {
  const L = lt(p);
  const th = useRoomTherm('B');
  const leaking = t >= L.start && t < L.close;
  const waterColor = '#4dabf7';
  const sbName = { run: '냉각 중', standby: '대기', starting: '기동 중', fault: '고장' }[v.standby];
  const detectText = !v.detected ? '미감지' : p.response === 'spot' ? (v.located ? '위치 확인' : '구역 경보 · 찾는 중') : `감지선 ${v.cablePos}m 지점`;
  const valveText = v.valveClosed ? '닫힘' : t >= L.repair ? '열림 (복구)' : v.detected ? (p.response === 'auto' ? '자동 차단 중' : p.response === 'spot' && !v.located ? '열림 · 위치 찾는 중' : '작업자 이동 중') : '열림';
  return (
    <div className="rp-board">
      <Tile
        k={`누수 · ${p.unit}번 분기`}
        v={t < L.start ? '정상' : leaking ? '새는 중' : v.water > 0 ? '멈춤 · 물 제거' : '마름'}
        c={leaking ? waterColor : t < L.start || v.water === 0 ? SRC_META.utility.color : 'var(--warn)'}
        s="이중마루 아래 냉수 분기"
      />
      <Tile
        k="바닥의 물"
        v={`${Math.round(v.water)}L`}
        c={waterColor}
        meter={{ v: v.water / Math.max(1, v.maxWater), color: waterColor }}
        s={`번진 면적 약 ${v.area.toFixed(1)}m² · 분당 ${p.rate}L`}
      />
      <Tile k="감지" v={detectText} c={v.detected ? FAULT_COLOR : SRC_META.utility.color} s={p.response === 'spot' ? '점형 감지기 (구역)' : '위치 표시형 감지선 (±1m)'} />
      <Tile k="분기 차단 밸브" v={valveText} c={v.valveClosed ? 'var(--warn)' : v.detected && t < L.close ? FAULT_COLOR : SRC_META.utility.color} s={p.response === 'auto' ? '전동 밸브 (감지 연동)' : '수동 밸브'} />
      <Tile
        k="냉각 · 서버실 B"
        v={`${v.running} / 6대 운전`}
        c={v.running < 5 ? FAULT_COLOR : v.standby === 'run' ? 'var(--warn)' : 'var(--ok)'}
        s={`대기기 ${sbName} · 최고 흡기 ${th.maxInlet}°C`}
      />
      <Tile
        k="물이 닿은 랙"
        v={`${v.racksWet}대`}
        c={v.racksWet > 0 ? FAULT_COLOR : 'var(--ok)'}
        s={v.racksWet > 0 ? '마루 아래 전원 케이블 · 콘센트 점검' : '랙 아래까지는 안 번짐'}
      />
    </div>
  );
}

// UPS 고장 상태판 6칸
function UpsBoard({ v, side }: { v: UpsFailValues; side: 'A' | 'B' }) {
  const o = side === 'A' ? 'B' : 'A';
  const fName = { normal: '정상 운전', fault: '고장 · 출력 차단', bypass: '고장 · 정비 바이패스', starting: '재기동 중', restored: '정상 운전' }[v.mode];
  const fColor = v.mode === 'fault' ? FAULT_COLOR : v.mode === 'bypass' ? SRC_META.bypass.color : v.mode === 'starting' ? STARTING_COLOR : 'var(--ok)';
  const oPct = v.pct[o];
  const oColor = oPct > 1 ? 'var(--crit)' : oPct > 0.5 ? 'var(--warn)' : 'var(--ok)';
  const nColor = v.redundancy === '2N' ? 'var(--ok)' : v.redundancy.startsWith('N ·') ? FAULT_COLOR : SRC_META.bypass.color;
  const pduText = { utility: `UPS-${side} 출력`, bypass: '상용 직결 (UPS 보호 없음)', none: '정지' }[v.pduSrc];
  const pduColor = v.pduSrc === 'utility' ? SRC_META.utility.color : v.pduSrc === 'bypass' ? SRC_META.bypass.color : SRC_META.none.color;
  const dualText = v.pduSrc === 'none' ? `rPDU-${o} 단독` : v.pduSrc === 'bypass' ? `${o} + ${side}(바이패스)` : '양쪽 rPDU';
  return (
    <div className="rp-board">
      <Tile k={`고장 UPS · UPS-${side}`} v={fName} s={v.load[side] > 0 ? `출력 ${Math.round(v.load[side])}kW · ${Math.round(v.pct[side] * 100)}%` : '출력 0kW'} c={fColor} />
      <Tile
        k={`남은 UPS · UPS-${o}`}
        v={`부하율 ${Math.round(oPct * 100)}%`}
        c={oColor}
        meter={{ v: oPct, color: oColor }}
        s={`${Math.round(v.load[o])}kW · 정격 ${UPS_KW.toLocaleString()}kW`}
      />
      <Tile k="이중화" v={v.redundancy} c={nColor} s={v.redundancy === '2N' ? '한 대가 멈춰도 버팀' : v.redundancy.startsWith('N ·') ? `UPS-${o}가 멈추면 전체 정지` : `${side}계통은 보호 없음`} />
      <Tile k={`이중전원 랙 ${UPS_FAIL_COUNTS.dual}대`} v={dualText} c={v.pduSrc === 'none' ? 'var(--warn)' : SRC_META.utility.color} s="끊김 없음" />
      <Tile
        k={`단일전원 랙 ${UPS_FAIL_COUNTS.single}대 (STS)`}
        v={v.stsOnB ? 'B 입력으로 절체' : 'A 우선 입력'}
        c={v.stsOnB ? 'var(--warn)' : SRC_META.utility.color}
        s={v.stsOnB ? '4~8ms, 서버 꺼지지 않음' : '평상시 입력'}
      />
      <Tile k={`${side}계통 PDU 12대`} v={pduText} c={pduColor} s={v.pduSrc === 'none' ? '랙 rPDU-' + side + ' 꺼짐' : undefined} />
    </div>
  );
}

// 상태판 6칸: 왼쪽 색 띠 = 전원 출처 또는 상태
function Tile({ k, kr, v, s, c, meter }: { k: string; kr?: string; v: string; s?: string; c: string; meter?: { v: number; color: string } }) {
  return (
    <div className="rp-tile" style={{ '--c': c } as CSSProperties}>
      <div className="rp-tile-k">
        <span>{k}</span>
        {kr && <span className="num">{kr}</span>}
      </div>
      <div className="rp-tile-v num">{v}</div>
      {meter && <Meter v={meter.v} color={meter.color} />}
      {s && <div className="rp-tile-s num">{s}</div>}
    </div>
  );
}

// line: 1회선 정전일 때 한전 수전 상태 (본선 수전 · ALTS 절체 중 · 예비선 수전)
function Board({ v, line }: { v: Values; line?: 'main' | 'switching' | 'standby' }) {
  const running = v.gen.filter((g) => g !== 'off').length;
  const genText = v.gen[0] === v.gen[1] ? GEN_NAME[v.gen[0]] : `1 ${GEN_NAME[v.gen[0]]} · 2 ${GEN_NAME[v.gen[1]]}`;
  const genColor = v.gen.some((g) => g === 'rated' || g === 'cooldown') ? SRC_META.gen.color : v.gen.some((g) => g === 'starting') ? STARTING_COLOR : SRC_META.none.color;
  const upsSrc: Src = v.ups === 'battery' ? 'battery' : v.ups === 'normal' ? 'utility' : 'gen';
  const soc = Math.min(v.soc.A, v.soc.B);
  const maxIn = Math.max(v.inlet.A, v.inlet.B);
  const tst = statusOf(maxIn);
  const coolTone = v.coolingOn === v.coolingTotal ? 'var(--ok)' : v.coolingOn === 0 ? 'var(--crit)' : STARTING_COLOR;
  return (
    <div className="rp-board">
      {line ? (
        <Tile
          k="한전 · ALTS"
          v={line === 'main' ? '본선 수전' : line === 'switching' ? '본선 정전 · 절체 중' : '예비선 수전'}
          s={line === 'main' ? '예비선 대기' : line === 'switching' ? (v.ats === '발전기' ? '발전기로 버티는 중' : '건물 전체 순간 정전') : '본선은 복구 대기'}
          c={line === 'switching' ? 'var(--crit)' : SRC_META.utility.color}
        />
      ) : (
        <Tile k="한전" v={v.utility ? '정상' : '정전'} s={v.utility ? '22.9kV 본선 수전' : '본선 · 예비선 모두'} c={v.utility ? SRC_META.utility.color : 'var(--crit)'} />
      )}
      <Tile
        k="발전기"
        kr={`${running}/2`}
        v={genText}
        c={genColor}
        meter={v.genLoadPct > 0 ? { v: v.genLoadPct, color: SRC_META.gen.color } : undefined}
        s={v.genLoadPct > 0 ? `부하 ${Math.round(v.genLoadPct * 100)}%` : undefined}
      />
      <Tile k="UPS A · B" v={UPS_NAME[v.ups]} s={`ATS ${v.ats} 쪽`} c={SRC_META[upsSrc].color} />
      <Tile
        k="배터리"
        v={`${(soc * 100).toFixed(1)}%`}
        c={SRC_META.battery.color}
        meter={{ v: soc, color: SRC_META.battery.color }}
        s={`A ${(v.soc.A * 100).toFixed(1)} · B ${(v.soc.B * 100).toFixed(1)} · 약 ${Math.round(v.batteryMin)}분`}
      />
      <Tile k="공조 설비" v={`${v.coolingOn} / ${v.coolingTotal}대`} c={coolTone} s={v.coolingOn < v.coolingTotal ? '나머지 정지 · 재기동 대기' : '모두 운전'} />
      <div className="rp-tile" style={{ '--c': `var(--${TEMP_TONE[tst]})` } as CSSProperties}>
        <div className="rp-tile-k">
          <span>최고 흡기</span>
        </div>
        <div className="rp-tile-v num">{maxIn}°C</div>
        <div className="rp-tile-s num">
          A {v.inlet.A} · B {v.inlet.B} · 냉수 {v.chwT}°C
        </div>
        {tst !== 'ok' && <Status tone={TEMP_TONE[tst]}>{STATUS_META[tst].name}</Status>}
      </div>
    </div>
  );
}
