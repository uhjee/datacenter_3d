// 온도 카드 (3D 위 왼쪽 위, 상단 [온도]를 켰을 때). 서버실 온도에 관한 조작을 한 곳에 모은다.
// 서버실 전환은 왼쪽 층 이동 막대(3F · 4F · 5F)가 맡고, 카드 머리글에는 지금 서버실 이름만 둔다
//   표시: 히트맵 · 기류 입자 (둘 중 하나는 켜 둔다) · 시점(위에서 / 통로 단면)
//   히트맵: 단면 높이 · 구간별 온도 바 · 이 단면 통계 · 표시 옵션 · 커서 위치 온도
//   공조 조건: 컨테인먼트 · 블랭킹 · 투시 · 플레넘
// 기본은 접힘 (3D를 덜 가리도록). 접혀 있어도 표시 · 단면 높이 · 온도 바 · 요약은 보인다
// 급기 온도 · 수치는 따로 떼어 3D 오른쪽 아래 카드(SupplyCard)에 둔다 → 급기를 바꾸며 히트맵과 수치를 함께 본다

import { useMemo, useState } from 'react';
import { ChevronDown, Eye, MoveDown } from 'lucide-react';
import { fieldStats, HEIGHT_M, HEIGHT_NAME } from '../data/heatField';
import { RACKS } from '../data/racks';
import { AIR_LAYOUT, RECOMMENDED, statusOf, STATUS_META, TEMP_BANDS, tempColor, tempGradient, type AirCfg, type Containment , type RoomLabel } from '../data/thermal';
import { SR_BY_LABEL } from '../data/building';
import { exitThermal, focusItem, heatView, viewRoom } from '../scene/focus';
import { useView, type HeatHeight } from '../store/useView';
import { InfoTip, TipSwatch, TipTable, ToggleTag } from './kit';
import { useHeatField, useRoomTherm } from './useStatus';

const CONTAINMENT: { key: Containment; name: string; blocks: string; room: string; desc: string }[] = [
  {
    key: 'none',
    name: '봉쇄 없음',
    blocks: '없음',
    room: '섞인 공기',
    desc: '냉기와 열기가 섞입니다. 랙 위로 넘어온 열기가 다시 흡기되고(재순환), 일부 냉기는 랙을 거치지 않고 돌아갑니다(바이패스).',
  },
  { key: 'CAC', name: '냉복도 봉쇄 (CAC)', blocks: '냉복도 위 · 양 끝', room: '뜨거움 (열기)', desc: '냉복도 위와 양 끝을 막아 냉기를 랙 앞에 가둡니다. 나머지 방은 열기로 차므로 방 온도는 높아집니다.' },
  { key: 'HAC', name: '열복도 봉쇄 (HAC)', blocks: '열복도 (천장 리턴으로)', room: '차가움 (냉기)', desc: '열복도를 막아 열기를 굴뚝처럼 천장 리턴으로 바로 보냅니다. 방 전체가 냉기로 채워집니다.' },
];

const STAGES = ['급기(하부)', '이중마루 하부', '타공판', '냉복도', '랙 흡기', '랙 배기', '열복도', '천장 · 리턴', '항온항습기 흡입', '코일에서 열 전달'];
// 이중마루가 없는 서버실(C): 기기 정면에서 바로 불어 넣는다
const STAGES_FLOOD = ['전면 토출', '방을 건너며 섞임', '냉복도', '랙 앞', '랙 흡기', '랙 배기', '열복도', '실내 위쪽', '항온항습기 흡입', '코일에서 열 전달'];
const stagesOf = (room: RoomLabel) => (SR_BY_LABEL[room].raised > 0 ? STAGES : STAGES_FLOOD);

// 온도 척도 (히트맵 · 랙 색칠 · 기류 입자 공통)
const LO = 15;
const HI = 40;
const pos = (t: number) => `${((Math.min(HI, Math.max(LO, t)) - LO) / (HI - LO)) * 100}%`;
const SHORT: Record<string, string> = {
  '권장보다 낮음': '낮음',
  '권장 범위': '권장',
  '주의 (권장 초과 · 허용 이내)': '주의',
  '위험 (흡기) · 열복도는 정상 배기': '위험 · 배기',
};
const bandRange = (b: (typeof TEMP_BANDS)[number]) =>
  b.lo === -Infinity ? `${b.hi}°C 미만` : b.hi === Infinity ? `${b.lo}°C 초과` : `${b.lo} ~ ${b.hi}°C`;

// 카드 전체 · 세부 설정 · 급기 카드의 열림 상태 (이번 화면 동안 기억)
let cardOpen = false;
let detailOpen = false;
let supplyOpen = false;

export function ThermalPanel() {
  const airOn = useView((s) => s.airOn);
  const heatOn = useView((s) => s.heatOn);
  const room = useView((s) => s.airRoom);
  const cfg = useView((s) => s.airCfg[room]);
  const h = useView((s) => s.heatHeight);
  const opacity = useView((s) => s.heatOpacity);
  const hotOnly = useView((s) => s.heatHotOnly);
  const probe = useView((s) => s.heatProbe);
  const rackColor = useView((s) => s.rackColor === 'temp');
  const th = useRoomTherm(room);
  const f = useHeatField(room, heatOn);
  const [card, setCard] = useState(cardOpen);
  const [detail, setDetail] = useState(detailOpen);
  const hot = useMemo(
    () =>
      RACKS.filter((r) => r.serverRoom === room)
        .map((r) => ({ r, t: th.racks[r.id] }))
        .filter(({ t }) => t && t.kw > 0 && t.inlet[h] > RECOMMENDED[1])
        .sort((a, b) => b.t.inlet[h] - a.t.inlet[h]),
    [room, th, h],
  );
  if (!airOn && !heatOn) return null;
  const s = useView.getState();
  const set = (patch: Partial<AirCfg>) => s.setAirCfg(room, patch);
  const st = f ? fieldStats(f) : null;
  const toggleCard = () => {
    cardOpen = !card;
    setCard(!card);
  };
  const toggleDetail = () => {
    detailOpen = !detail;
    setDetail(!detail);
  };
  // 표시는 하나 이상 켜 둔다 (모두 끄려면 ✕)
  const toggleHeat = () => {
    const v = useView.getState();
    if (!v.heatOn || v.airOn) v.setHeatOn(!v.heatOn);
  };
  const toggleAir = () => {
    const v = useView.getState();
    if (!v.airOn || v.heatOn) v.setAirOn(!v.airOn);
  };
  const cont = CONTAINMENT.find((c) => c.key === cfg.containment)!;

  return (
    <div className="air-panel thermal-panel">
      <header>
        <b>
          온도
          <InfoTip
            text={
              <>
                <p>서버실 공기 온도를 두 가지로 봅니다. 판정은 랙 흡기 기준이며, 열복도의 35°C 넘는 값은 정상 배기입니다.</p>
                <TipTable
                  head={['표시', '보여 주는 것']}
                  rows={[
                    ['히트맵', '고른 높이 단면의 온도 분포를 바닥에 깔고, 하단 2D 상면도에 랙 온도를 그립니다. 바닥을 가리키면 그 지점 온도'],
                    ['기류 입자', '찬 공기(파랑)가 랙을 지나며 데워져(빨강) 항온항습기로 돌아가는 길'],
                  ]}
                />
                <TipTable
                  head={['구간', '온도', '뜻']}
                  rows={[...TEMP_BANDS].reverse().map((b) => [
                    <>
                      <TipSwatch color={b.color} />
                      {SHORT[b.name] ?? '과냉'}
                    </>,
                    <span className="num">{bandRange(b)}</span>,
                    b.name,
                  ])}
                />
              </>
            }
          />
        </b>
        <span className="room-name" title={`${SR_BY_LABEL[room].coolName} · 서버실은 왼쪽 층 이동 막대(3F · 4F · 5F)로 바꿉니다`}>
          서버실 {room} · {AIR_LAYOUT[room].floor}
          <small>{SR_BY_LABEL[room].coolName}</small>
        </span>
        <button className={`icon heat-fold${card ? ' open' : ''}`} onClick={toggleCard} title={card ? '접기' : '펼치기'} aria-expanded={card}>
          <ChevronDown size={14} />
        </button>
        <button className="icon" onClick={() => exitThermal()} title="온도 보기 끄기">
          ✕
        </button>
      </header>

      <div className="air-body">
        {/* 표시 · 시점 */}
        <div className="th-row">
          <ToggleTag on={heatOn} onToggle={toggleHeat} label="히트맵" color="#ff922b" />
          <ToggleTag on={airOn} onToggle={toggleAir} label="기류 입자" color="#74c0fc" />
          <span className="grow" />
          <button className="small th-cam" onClick={() => heatView(room)} title="위에서 내려다보기 (분포가 잘 보임)">
            <MoveDown size={13} /> 위에서
          </button>
          <button className="small th-cam" onClick={() => viewRoom(room)} title="열 방향 끝에서 냉복도 · 열복도 단면 보기 (기류가 잘 보임)">
            <Eye size={13} /> 통로 단면
          </button>
        </div>

        {heatOn && (
          <div className="seg small heat-h">
            {HEIGHT_NAME.map((n, i) => (
              <button key={n} className={h === i ? 'on' : ''} onClick={() => s.setHeatHeight(i as HeatHeight)} title={`${SR_BY_LABEL[room].raised > 0 ? '이중마루 위' : '바닥 위'} ${HEIGHT_M[i]}m 단면`}>
                {n} {HEIGHT_M[i]}m
              </button>
            ))}
          </div>
        )}

        {/* 구간별 온도 바 (히트맵 · 랙 색 · 기류 입자 공통 척도) */}
        <div className="heat-bar">
          <div className="heat-bar-c" style={{ background: tempGradient(LO, HI) }}>
            {[18, 27, 32].map((t) => (
              <em key={t} style={{ left: pos(t) }} />
            ))}
            {probe && heatOn && <b className="heat-probe-mark" style={{ left: pos(probe.t) }} />}
          </div>
          <div className="heat-bands">
            {TEMP_BANDS.filter((b) => b.hi > LO).map((b) => {
              const lo = Math.max(LO, b.lo);
              const hi = Math.min(HI, b.hi);
              return (
                <span
                  key={b.name}
                  style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})`, borderColor: b.color, color: b.color }}
                  title={`${bandRange(b)} · ${b.name}`}
                >
                  {SHORT[b.name] ?? b.name}
                </span>
              );
            })}
          </div>
          {st && (
            <div className="heat-range" title={`이 단면 공기 온도 범위 ${st.min.toFixed(1)} ~ ${st.max.toFixed(1)}°C`}>
              <i style={{ left: pos(st.min), width: `calc(${pos(st.max)} - ${pos(st.min)})` }} />
            </div>
          )}
          <div className="heat-ticks num">
            {[15, 18, 27, 32, 40].map((t) => (
              <span key={t} style={{ left: pos(t) }}>
                {t}
              </span>
            ))}
          </div>
        </div>

        {!card && (
          <button className="air-sum num" onClick={toggleCard} title="펼쳐서 컨테인먼트 · 통계 · 세부 설정 보기">
            {cont.name} · 최고 흡기 <b style={{ color: tempColor(th.maxInlet) }}>{th.maxInlet}°C</b> · 권장 초과 {th.over}대
          </button>
        )}

        {card && (
          <>
            <h5>
              컨테인먼트
              <InfoTip
                text={
                  <TipTable
                    head={['방식', '막는 곳', '방 공기', '특징']}
                    nowrap={[1, 2]}
                    rows={CONTAINMENT.map((c) => [
                      <>
                        {c.name}
                        {c.key === cfg.containment ? ' ✓' : ''}
                      </>,
                      c.blocks,
                      c.room,
                      c.desc,
                    ])}
                  />
                }
              />
            </h5>
            <div className="seg small">
              {CONTAINMENT.map((c) => (
                <button key={c.key} className={cfg.containment === c.key ? 'on' : ''} onClick={() => set({ containment: c.key })}>
                  {c.name}
                </button>
              ))}
            </div>

            {heatOn && st && (
              <>
                <h5>
                  이 단면
                  <InfoTip text={`최저 · 평균 · 최고는 열복도 배기를 포함한 공기 온도이고, 핫스팟은 이 높이 흡기가 ${RECOMMENDED[1]}°C를 넘는 랙입니다.`} />
                </h5>
                <div className="heat-stats num">
                  <div>
                    <small>최저</small>
                    <b style={{ color: tempColor(st.min) }}>{st.min.toFixed(1)}°</b>
                  </div>
                  <div>
                    <small>평균</small>
                    <b style={{ color: tempColor(st.avg) }}>{st.avg.toFixed(1)}°</b>
                  </div>
                  <div>
                    <small>최고</small>
                    <b style={{ color: tempColor(st.max) }}>{st.max.toFixed(1)}°</b>
                  </div>
                  <div>
                    <small>핫스팟 랙</small>
                    <b style={{ color: hot.length ? 'var(--warn)' : 'var(--ok)' }}>{hot.length}대</b>
                  </div>
                </div>
                {hot.length > 0 && (
                  <button className="heat-hot" onClick={() => focusItem(`rack:${hot[0].r.id}`)}>
                    가장 뜨거운 랙 <b>{hot[0].r.id}</b> <span className="num">{hot[0].t.inlet[h].toFixed(1)}°C</span> →
                  </button>
                )}
                <div className="heat-opts">
                  <label>
                    불투명도
                    <input type="range" min={0.3} max={1} step={0.05} value={opacity} onChange={(e) => s.setHeatOpacity(+e.target.value)} />
                  </label>
                  <label className="chk" title={`권장 상한 ${RECOMMENDED[1]}°C 이하는 거의 투명하게`}>
                    <input type="checkbox" checked={hotOnly} onChange={(e) => s.setHeatHotOnly(e.target.checked)} /> {RECOMMENDED[1]}°C 넘는 곳만
                  </label>
                </div>
              </>
            )}

            <button className={`air-more${detail ? ' open' : ''}`} aria-expanded={detail} onClick={toggleDetail}>
              <span className="air-more-t">세부 설정</span>
              <span className="air-more-sum">
                블랭킹 {cfg.blanking ? '있음' : '없음'} · 플레넘 {cfg.plenum || cfg.containment === 'HAC' ? '있음' : '없음'}
              </span>
              <ChevronDown className="k-chev" size={14} />
            </button>

            {detail && (
              <>
                <div className="air-toggles">
                  <label className="chk">
                    <input type="checkbox" checked={cfg.blanking} onChange={(e) => set({ blanking: e.target.checked })} />
                    블랭킹 패널
                  </label>
                  {SR_BY_LABEL[room].raised > 0 && (
                    <label className="chk">
                      <input type="checkbox" checked={cfg.xray} onChange={(e) => set({ xray: e.target.checked })} />
                      이중마루 투시
                    </label>
                  )}
                  <label className="chk">
                    <input
                      type="checkbox"
                      checked={cfg.plenum || cfg.containment === 'HAC'}
                      disabled={cfg.containment === 'HAC'}
                      onChange={(e) => set({ plenum: e.target.checked })}
                    />
                    천장 리턴 플레넘
                  </label>
                  <label className="chk">
                    <input type="checkbox" checked={rackColor} onChange={(e) => s.setRackColor(e.target.checked ? 'temp' : 'none')} />랙 흡기 온도 색
                  </label>
                </div>
              </>
            )}
          </>
        )}

        {probe && heatOn && (
          <div className="heat-probe num">
            커서 위치 <b style={{ color: tempColor(probe.t) }}>{probe.t.toFixed(1)}°C</b>
            <span style={{ color: STATUS_META[statusOf(probe.t)].color }}> · {STATUS_META[statusOf(probe.t)].name}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// 급기 · 수치 카드 (3D 오른쪽 아래, 온도 보기 중). 고른 서버실의 급기 설정 온도와 공조 수치를 보여 준다
export function SupplyCard() {
  const airOn = useView((s) => s.airOn);
  const heatOn = useView((s) => s.heatOn);
  const room = useView((s) => s.airRoom);
  const cfg = useView((s) => s.airCfg[room]);
  const th = useRoomTherm(room);
  const [open, setOpen] = useState(supplyOpen);
  if (!airOn && !heatOn) return null;
  const toggle = () => {
    supplyOpen = !open;
    setOpen(!open);
  };
  const loadPct = Math.round((th.loadKw / th.capKw) * 100);
  const dT = +(th.returnT - cfg.supply).toFixed(1);

  return (
    <div className="air-panel supply-card">
      <header>
        <b>
          급기 · 수치
          <InfoTip
            text={
              <>
                <TipTable
                  head={['수치', '뜻', '좋은 쪽']}
                  rows={[
                    ['환기 − 급기', '항온항습기로 돌아오는 공기와 내보내는 공기의 온도 차. 같은 바람으로 옮기는 열의 양', '클수록'],
                    ['재순환', '랙 배기가 다시 흡기로 돌아오는 비율 (흡기 온도를 올림)', '작을수록'],
                    ['바이패스', '찬 공기가 랙을 거치지 않고 그냥 돌아가는 비율 (환기 − 급기 차이를 줄임)', '작을수록'],
                    ['열부하 / 냉각 용량', '1대를 예비로 뺀(N+1) 냉각 용량 대비 지금 열부하', '100% 이하'],
                  ]}
                />
                <p>기류 입자가 지나는 길</p>
                <TipTable rows={stagesOf(room).slice(0, 5).map((a, i) => [`${'①②③④⑤'[i]} ${a}`, `${'⑥⑦⑧⑨⑩'[i]} ${stagesOf(room)[i + 5]}`])} />
              </>
            }
          />
        </b>
        <span className="room-name">
          서버실 {room} · {AIR_LAYOUT[room].floor}
        </span>
        <button className={`icon heat-fold${open ? ' open' : ''}`} onClick={toggle} title={open ? '접기' : '펼치기'} aria-expanded={open}>
          <ChevronDown size={14} />
        </button>
      </header>
      <div className="air-body">
        <h5>
          급기 설정 온도 <b>{cfg.supply}°C</b>
          {!open && (
            <span className="supply-sum num">
              최고 흡기 <b style={{ color: tempColor(th.maxInlet) }}>{th.maxInlet}°C</b>
            </span>
          )}
        </h5>
        <input className="range" type="range" min={16} max={26} step={0.5} value={cfg.supply} onChange={(e) => useView.getState().setAirCfg(room, { supply: +e.target.value })} />
        {open && (
          <div className="air-metrics">
            <Metric name="평균 흡기" value={`${th.avgInlet}°C`} color={tempColor(th.avgInlet)} />
            <Metric name="최고 흡기" value={`${th.maxInlet}°C`} color={tempColor(th.maxInlet)} />
            <Metric name="권장 초과 랙" value={`${th.over} / ${th.loaded}`} color={th.over ? STATUS_META.warn.color : STATUS_META.ok.color} />
            <Metric name="환기 온도" value={`${th.returnT}°C`} sub={`급기와 차이 ${dT}°C`} />
            <Metric name="재순환" value={`${Math.round(th.recirc * 100)}%`} />
            <Metric name="바이패스" value={`${Math.round(th.bypass * 100)}%`} />
            <Metric name="열부하 / 냉각 용량" value={`${th.loadKw} / ${th.capKw}kW`} sub={`N+1 기준 ${loadPct}% · ${th.unitKw}kW × ${th.units - 1}대`} />
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ name, value, sub, color }: { name: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="metric">
      <span>{name}</span>
      <b style={color ? { color } : undefined}>{value}</b>
      {sub && <small>{sub}</small>}
    </div>
  );
}
