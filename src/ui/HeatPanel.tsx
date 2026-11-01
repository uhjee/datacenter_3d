// 히트맵 카드 (3D 위 왼쪽 아래): 히트맵을 켜면 나온다.
// 구간별 온도 바(ASHRAE 경계 · 색) · 단면 높이 · 이 단면의 최저 · 평균 · 최고 · 핫스팟 · 커서 위치 온도 · 표시 옵션

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { fieldStats, HEIGHT_M, HEIGHT_NAME } from '../data/heatField';
import { RACKS } from '../data/racks';
import { AIR_LAYOUT, RECOMMENDED, statusOf, STATUS_META, TEMP_BANDS, tempColor, tempGradient } from '../data/thermal';
import { exitHeat, focusItem } from '../scene/focus';
import { useView, type HeatHeight } from '../store/useView';
import { InfoTip, TipSwatch, TipTable } from './kit';
import { useHeatField, useRoomTherm } from './useStatus';

const LO = 15;
const HI = 40;
const pos = (t: number) => `${((Math.min(HI, Math.max(LO, t)) - LO) / (HI - LO)) * 100}%`;

// 구간 띠에 쓰는 짧은 이름
const SHORT: Record<string, string> = {
  '권장보다 낮음': '낮음',
  '권장 범위': '권장',
  '주의 (권장 초과 · 허용 이내)': '주의',
  '위험 (흡기) · 열복도는 정상 배기': '위험 · 배기',
};

// 기본은 접힘 (기류 카드 세부 설정과 같이). 펼친 상태는 이번 화면 동안 기억
let open0 = false;

export function HeatPanel() {
  const on = useView((s) => s.heatOn);
  const room = useView((s) => s.airRoom);
  const h = useView((s) => s.heatHeight);
  const opacity = useView((s) => s.heatOpacity);
  const hotOnly = useView((s) => s.heatHotOnly);
  const probe = useView((s) => s.heatProbe);
  const th = useRoomTherm(room);
  const f = useHeatField(room, on);
  const [open, setOpen] = useState(open0);
  const hot = useMemo(
    () =>
      RACKS.filter((r) => r.serverRoom === room)
        .map((r) => ({ r, t: th.racks[r.id] }))
        .filter(({ t }) => t && t.kw > 0 && t.inlet[h] > RECOMMENDED[1])
        .sort((a, b) => b.t.inlet[h] - a.t.inlet[h]),
    [room, th, h],
  );
  if (!on || !f) return null;
  const st = fieldStats(f);
  const set = useView.getState();
  const L = AIR_LAYOUT[room];
  const toggle = () => {
    open0 = !open;
    setOpen(!open);
  };

  return (
    <div className="heat-panel">
      <header>
        <b>
          히트맵
          <InfoTip
            text={
              <>
                <p>고른 높이 단면의 공기 온도 분포입니다. 판정은 랙 흡기 기준이며, 열복도의 35°C 넘는 값은 정상 배기입니다.</p>
                <TipTable
                  head={['구간', '온도', '뜻']}
                  rows={[...TEMP_BANDS].reverse().map((b) => [
                    <>
                      <TipSwatch color={b.color} />
                      {SHORT[b.name] ?? '과냉'}
                    </>,
                    <span className="num">{b.lo === -Infinity ? `${b.hi}°C 미만` : b.hi === Infinity ? `${b.lo}°C 초과` : `${b.lo} ~ ${b.hi}°C`}</span>,
                    b.name,
                  ])}
                />
                <p>바닥 통로를 가리키면 그 지점 온도가 나옵니다. 막대 아래 회색 선은 이 단면의 최저 ~ 최고 범위입니다.</p>
              </>
            }
          />
        </b>
        <span className="heat-where">
          서버실 {room} · {L.floor}
        </span>
        <button className={`icon heat-fold${open ? ' open' : ''}`} onClick={toggle} title={open ? '접기' : '펼치기'} aria-expanded={open}>
          <ChevronDown size={14} />
        </button>
        <button className="icon" onClick={() => exitHeat()} title="히트맵 끄기">
          ✕
        </button>
      </header>

      <div className="heat-body">
        <div className="seg small heat-h">
          {HEIGHT_NAME.map((n, i) => (
            <button key={n} className={h === i ? 'on' : ''} onClick={() => set.setHeatHeight(i as HeatHeight)} title={`이중마루 위 ${HEIGHT_M[i]}m 단면`}>
              {n} {HEIGHT_M[i]}m
            </button>
          ))}
        </div>

        {/* 구간별 온도 바: 연속 색 + ASHRAE 경계 눈금 + 이 단면의 최저 ~ 최고 범위 */}
        <div className="heat-bar">
          <div className="heat-bar-c" style={{ background: tempGradient(LO, HI) }}>
            {[18, 27, 32].map((t) => (
              <em key={t} style={{ left: pos(t) }} />
            ))}
            {probe && <b className="heat-probe-mark" style={{ left: pos(probe.t) }} />}
          </div>
          {/* 구간 띠: 경계에서 나눈 구간 이름 (마우스를 올리면 설명) */}
          <div className="heat-bands">
            {TEMP_BANDS.filter((b) => b.hi > LO).map((b) => {
              const lo = Math.max(LO, b.lo);
              const hi = Math.min(HI, b.hi);
              return (
                <span
                  key={b.name}
                  style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})`, borderColor: b.color, color: b.color }}
                  title={`${b.lo === -Infinity ? `${b.hi}°C 미만` : b.hi === Infinity ? `${b.lo}°C 초과` : `${b.lo}~${b.hi}°C`} · ${b.name}`}
                >
                  {SHORT[b.name] ?? b.name}
                </span>
              );
            })}
          </div>
          <div className="heat-range" title={`이 단면 공기 온도 범위 ${st.min.toFixed(1)} ~ ${st.max.toFixed(1)}°C`}>
            <i style={{ left: pos(st.min), width: `calc(${pos(st.max)} - ${pos(st.min)})` }} />
          </div>
          <div className="heat-ticks num">
            {[15, 18, 27, 32, 40].map((t) => (
              <span key={t} style={{ left: pos(t) }}>
                {t}
              </span>
            ))}
          </div>
        </div>

        {open && (
          <>

            <h5 className="heat-h5">
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
                <input type="range" min={0.3} max={1} step={0.05} value={opacity} onChange={(e) => set.setHeatOpacity(+e.target.value)} />
              </label>
              <label className="chk" title={`권장 상한 ${RECOMMENDED[1]}°C 이하는 거의 투명하게`}>
                <input type="checkbox" checked={hotOnly} onChange={(e) => set.setHeatHotOnly(e.target.checked)} /> {RECOMMENDED[1]}°C 넘는 곳만
              </label>
            </div>
          </>
        )}

        {probe && (
          <div className="heat-probe num">
            커서 위치 <b style={{ color: tempColor(probe.t) }}>{probe.t.toFixed(1)}°C</b>
            <span style={{ color: STATUS_META[statusOf(probe.t)].color }}> · {STATUS_META[statusOf(probe.t)].name}</span>
          </div>
        )}
      </div>
    </div>
  );
}
