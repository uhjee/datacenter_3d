// 고객사 정보 카드: 계약 전력 대비 사용 현황 · 30일 추이 · 랙별 회로 여유 · 흡기 온도 SLA · 공간 · 계약 조건

import { useMemo, useState, type MouseEvent } from 'react';
import { Crosshair, Handshake, X } from 'lucide-react';
import { RACK, ROOM_BY_ID } from '../data/building';
import { AS_OF, CIRCUIT, CUSTOMER_BY_ID, type Customer, type CustomerId } from '../data/customers';
import { TONE_TEXT, TREND_DAYS, WARN_RATIO, cageArea, coloStats, monthsBetween, rackPlace, type ColoStats } from '../data/colo';
import { RECOMMENDED } from '../data/thermal';
import { focusItem } from '../scene/focus';
import { useView } from '../store/useView';
import { Card, Glyph, IconButton, Kpi, KpiRow, LearnBox, PanelHead, Pill, Props, Section, Status, TipTable, type Tone } from './kit';
import { useRoomTherm } from './useStatus';

const TONE_VAR: Record<Tone, string> = { ok: 'var(--ok)', warn: 'var(--warn)', crit: 'var(--crit)', info: 'var(--info)', muted: 'var(--ink-3)' };
const pct = (v: number) => `${Math.round(v * 100)}%`;
const kw1 = (v: number) => v.toFixed(1);

export function CustomerCard({ id }: { id: CustomerId }) {
  const c = CUSTOMER_BY_ID[id];
  const therm = useRoomTherm('B');
  const s = useMemo(() => (c ? coloStats(c, therm) : null), [c, therm]);
  if (!c || !s) return null;
  const left = monthsBetween(AS_OF, c.contract.end);
  const expiring = left <= 3;
  return (
    <Card
      head={
        <PanelHead
          glyph={<Glyph icon={Handshake} color={c.color} />}
          crumb={[c.floor, ROOM_BY_ID[c.room]?.name ?? c.room, '증설 블록', '고객사']}
          title={c.name}
          info="추이 · 계약 조건은 학습용 예시 값입니다. 유효 전력은 지표 탭의 IT 부하율을 따라 바뀝니다."
          pills={
            <>
              <Pill tone={s.tone}>계약 전력 {TONE_TEXT[s.tone]}</Pill>
              <Pill ghost color={c.color} title={c.summary}>
                {c.cage ? `케이지 · 랙 ${s.racks.length}대` : `랙 단위 · ${s.racks.length}대`}
              </Pill>
              {expiring && (
                <Pill tone={c.contract.autoRenew ? 'info' : 'warn'} title={`계약 만료 ${c.contract.end}`}>
                  {left <= 0 ? '계약 만료' : `만료 ${left}개월 전`}
                  {c.contract.autoRenew ? ' · 자동 갱신' : ''}
                </Pill>
              )}
            </>
          }
          actions={
            <>
              <IconButton icon={Crosshair} label="카메라 이동" onClick={() => focusItem(`customer:${c.id}`)} />
              <IconButton icon={X} label="닫기" onClick={() => useView.getState().select(null)} />
            </>
          }
        />
      }
    >
      <KpiRow>
        <Kpi label="유효 전력" value={kw1(s.kw)} unit="kW" sub={`랙 ${s.racks.length}대 합계`} />
        <Kpi label="계약 전력" value={c.contract.kw} unit="kW" sub="약정 (확보 용량)" />
        <Kpi
          label="사용률"
          value={Math.round(s.ratio * 100)}
          unit="%"
          tone={s.tone === 'ok' ? undefined : s.tone}
          sub={<Status tone={s.tone}>{s.ratio > 1 ? `${kw1(s.kw - c.contract.kw)}kW 초과` : `여유 ${kw1(c.contract.kw - s.kw)}kW`}</Status>}
        />
      </KpiRow>
      <p className="role">{c.summary}</p>

      <Section id="co-power" title="계약 전력 대비" count={`지금 ${pct(s.ratio)} · 30일 최대 ${pct(s.peakRatio)}`}>
        <ContractBar c={c} s={s} />
      </Section>

      <Section
        id="co-trend"
        title="30일 전력 추이"
        info="일별 최대 전력입니다. 선에 마우스를 올리면 그날 값이 나오고, 빨간 점은 계약을 넘은 날입니다. 초과 청구는 보통 이 월 최대 수요로 판정합니다."
        count={s.overDays > 0 ? `${TREND_DAYS}일 중 ${s.overDays}일 초과` : '초과한 날 없음'}>
        <TrendChart c={c} s={s} />
      </Section>

      <Section
        id="co-racks"
        title="랙별 전력 · 회로 여유"
        info={
          <>
            <TipTable
              rows={[
                ['랙 회로', `A · B 각 ${CIRCUIT[c.contract.circuit].name}`],
                ['정격', <span className="num">{CIRCUIT[c.contract.circuit].kva}kVA</span>],
                ['연속 한도', <span className="num">{CIRCUIT[c.contract.circuit].cont}kW (정격의 80%)</span>],
                ['한쪽 회로 단독', 'A · B 중 한쪽이 끊겨 남은 회로가 랙 전체를 받을 때 연속 한도 대비'],
                ['판정', '80%부터 주의, 100% 넘으면 한쪽 고장 때 차단기가 떨어질 수 있음'],
              ]}
            />
            <p>행을 누르면 그 랙으로 이동합니다.</p>
          </>
        }
        count={`${s.racks.length}대${s.circuitOver ? ` · 회로 부족 ${s.circuitOver}` : ''}`}
      >
        <RackTable c={c} s={s} />
      </Section>

      <Section
        id="co-sla"
        title="환경 SLA (랙 흡기 온도)"
        info={`밝은 띠는 ASHRAE 권장 범위(18~27°C)입니다. 랙 ${RACK.U}U의 하 · 중 · 상 흡기 중 가장 높은 값을 씁니다.`}
        count={s.inletOver ? `권장 상한 넘음 ${s.inletOver}대` : '권장 범위 안'}>
        <TempBand s={s} />
      </Section>

      <Section id="co-space" title="공간">
        <Props
          items={[
            { k: '랙', v: `${s.racks.length}대` },
            { k: 'U 사용', v: `${s.uUsed} / ${s.uTotal}U (${pct(s.uUsed / s.uTotal)})` },
            ...(c.cage
              ? [
                  { k: '케이지 면적', v: `${cageArea(c).toFixed(0)}m²` },
                  { k: '예약 칸 (확장 우선권)', v: `${c.cage.reserved.length}칸 · 케이지 안이라 다른 고객에게 임대하지 않음`, wide: true },
                ]
              : [{ k: '구분', v: '케이지 없이 잠금 랙 문으로 구분' }]),
          ]}
        />
      </Section>

      <Section id="co-contract" title="계약 조건" count={`기준 ${AS_OF}`}>
        <Props
          items={[
            { k: '과금 방식', v: c.contract.billing, wide: true },
            { k: '계약 기간', v: `${c.contract.start} ~ ${c.contract.end}`, wide: true },
            { k: '남은 기간', v: left <= 0 ? '만료' : `${left}개월${c.contract.autoRenew ? ' · 자동 갱신' : ' · 갱신 협의 필요'}` },
            { k: '랙 회로', v: `A · B 각 ${CIRCUIT[c.contract.circuit].name}` },
            { k: '크로스 커넥트', v: `${c.contract.crossConnects}회선` },
            { k: '리모트 핸즈', v: `이번 달 ${c.contract.remoteHands[0]} / ${c.contract.remoteHands[1]}시간` },
            { k: '출입 인가자', v: `${c.contract.access}명` },
          ]}
        />
      </Section>

      <LearnBox title="알아보기 · 계약 전력과 초과" long>
        <p>계약 전력은 사업자가 이 고객을 위해 UPS · 냉각 용량을 미리 확보해 두기로 약정한 값입니다. 그 안에서 쓰면 추가 요금이 없고, 넘으면 초과분을 따로 청구합니다.</p>
        <p>
          초과는 순간값이 아니라 <b>한 달 동안의 최대 수요</b>로 판정하는 경우가 많습니다. 그래서 지금은 여유가 있어도 이번 달 중 하루라도 넘었다면 초과로
          청구될 수 있습니다. 계약의 {pct(WARN_RATIO)}부터 주의로 봅니다.
        </p>
        <p>
          랙 회로는 차단기 정격의 80%까지만 계속 쓸 수 있습니다. A · B 이중 회로는 평소 반씩 나눠 받지만, 한쪽이 끊기면 남은 회로 하나가 랙 전체를 받아야
          합니다. 회로 여유가 100%를 넘는 랙은 이중화가 있어도 한쪽 고장 때 차단기가 떨어질 수 있습니다.
        </p>
        <p>흡기 온도는 사업자가 고객에게 보장하는 환경 SLA입니다. 보통 ASHRAE 권장 범위(18~27°C)를 기준으로 합니다.</p>
      </LearnBox>
    </Card>
  );
}

// 계약 전력 막대: 지금 값 · 90% 주의선 · 계약선 · 30일 최대(▼). 계약을 넘은 부분은 빗금
function ContractBar({ c, s }: { c: Customer; s: ColoStats }) {
  const k = c.contract.kw;
  const max = Math.max(k * 1.25, s.peak * 1.06, s.kw * 1.06);
  const x = (v: number) => `${(v / max) * 100}%`;
  const fill = s.tone === 'ok' ? 'var(--ink-2)' : TONE_VAR[s.tone];
  return (
    <div className="co-bar">
      <div className="co-bar-track">
        <i style={{ width: x(Math.min(s.kw, k)), background: fill }} />
        {s.kw > k && <i className="over" style={{ left: x(k), width: x(s.kw - k) }} />}
        <em className="warn" style={{ left: x(k * WARN_RATIO) }} title={`주의 ${pct(WARN_RATIO)}`} />
        <em style={{ left: x(k) }} title="계약 전력" />
        <b style={{ left: x(s.peak) }} title={`30일 최대 ${kw1(s.peak)}kW`}>
          ▼
        </b>
      </div>
      <div className="co-bar-scale num">
        <span>0</span>
        <span style={{ left: x(k) }}>계약 {k}kW</span>
      </div>
      <div className="co-legend">
        <span>
          <i style={{ background: fill }} />
          지금 {kw1(s.kw)}kW
        </span>
        <span>
          <i className="tick" />
          주의 {pct(WARN_RATIO)}
        </span>
        <span>
          <b>▼</b>
          30일 최대 {kw1(s.peak)}kW ({pct(s.peakRatio)})
        </span>
        {s.peakRatio > 1 && <Status tone="crit">이번 달 초과 청구 대상</Status>}
      </div>
    </div>
  );
}

// 30일 일별 최대 전력: 선 + 계약 기준선. 초과한 날은 점. 마우스를 올리면 그날 값
function TrendChart({ c, s }: { c: Customer; s: ColoStats }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 300;
  const H = 120;
  const P = { l: 34, r: 8, t: 10, b: 18 };
  const k = c.contract.kw;
  const hi = Math.max(k, s.peak) * 1.08;
  const lo = Math.min(k, ...s.trend) * 0.85;
  const n = s.trend.length;
  const px = (i: number) => P.l + (i / (n - 1)) * (W - P.l - P.r);
  const py = (v: number) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  const line = s.trend.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join('');
  const ticks = [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.1];
  const onMove = (e: MouseEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const hv = hover == null ? null : s.trend[hover];
  // 계약선 글자는 선이 덜 지나가는 쪽(위 · 아래)에 둔다
  const above = s.trend.filter((v) => v > k).length;
  return (
    <div className="co-trend">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${c.name} 30일 일별 최대 전력, 계약 ${k}kW`}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={P.l} x2={W - P.r} y1={py(t)} y2={py(t)} />
            <text className="axis" x={P.l - 4} y={py(t) + 3} textAnchor="end">
              {t >= 20 ? Math.round(t) : t.toFixed(1)}
            </text>
          </g>
        ))}
        <line className="limit" x1={P.l} x2={W - P.r} y1={py(k)} y2={py(k)} />
        <text className="limit-label" x={W - P.r} y={py(k) + (above > n / 2 ? 11 : -4)} textAnchor="end">
          계약 {k}kW
        </text>
        <path d={line} fill="none" stroke={c.color} strokeWidth={2} strokeLinejoin="round" />
        {s.trend.map((v, i) =>
          v > k ? <circle key={i} className="over" cx={px(i)} cy={py(v)} r={3} /> : null,
        )}
        <circle cx={px(n - 1)} cy={py(s.trend[n - 1])} r={3.5} fill={c.color} className="today" />
        {[0, Math.floor((n - 1) / 2), n - 1].map((i) => (
          <text key={i} className="axis" x={px(i)} y={H - 4} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
            {i === n - 1 ? '오늘' : `${n - 1 - i}일 전`}
          </text>
        ))}
        {hover != null && hv != null && (
          <g>
            <line className="cross" x1={px(hover)} x2={px(hover)} y1={P.t} y2={H - P.b} />
            <circle cx={px(hover)} cy={py(hv)} r={4} fill={c.color} className="today" />
          </g>
        )}
        <rect
          x={P.l}
          y={0}
          width={W - P.l - P.r}
          height={H}
          fill="transparent"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        />
      </svg>
      <div className="co-trend-read num">
        {hover != null && hv != null ? (
          <>
            <b>{hover === n - 1 ? '오늘 (지금)' : `${n - 1 - hover}일 전 최대`}</b> {kw1(hv)}kW · 계약의 {pct(hv / k)}
            {hv > k && <Status tone="crit">초과</Status>}
          </>
        ) : null}
      </div>
    </div>
  );
}

// 랙별: 전력 · 한쪽 회로 단독 시 회로 한도 대비 · 최고 흡기. 행을 누르면 그 랙으로
function RackTable({ c, s }: { c: Customer; s: ColoStats }) {
  const cont = CIRCUIT[c.contract.circuit].cont;
  const rows = [...s.racks].sort((a, b) => b.failover - a.failover);
  return (
    <div className="co-table">
      <div className="co-tr head">
        <span>랙</span>
        <span>전력</span>
        <span title={`A · B 중 한쪽이 끊겨 남은 회로가 랙 전체를 받을 때, 회로 연속 한도 ${cont}kW 대비`}>한쪽 회로 단독</span>
        <span>흡기</span>
      </div>
      {rows.map((r) => {
        const ft: Tone = r.failover > 1 ? 'crit' : r.failover >= 0.8 ? 'warn' : 'ok';
        const hot = r.inletMax != null && r.inletMax > RECOMMENDED[1];
        return (
          <button key={r.rack.id} className="co-tr" title={rackPlace(r.rack)} onClick={() => focusItem(`rack:${r.rack.id}`)}>
            <span className="num">{r.rack.id}</span>
            <span className="num">{kw1(r.kw)}kW</span>
            <span className="co-fo">
              <span className="co-fo-bar">
                <i style={{ width: `${Math.min(1, r.failover / 1.2) * 100}%`, background: ft === 'ok' ? 'var(--ink-3)' : TONE_VAR[ft] }} />
                <em style={{ left: `${(1 / 1.2) * 100}%` }} />
              </span>
              <span className="num" style={ft === 'ok' ? undefined : { color: TONE_VAR[ft] }}>
                {pct(r.failover)}
              </span>
            </span>
            <span className="num" style={hot ? { color: 'var(--warn)' } : undefined}>
              {r.inletMax == null ? '—' : `${r.inletMax.toFixed(1)}°`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// 흡기 온도: 권장 띠(18~27°C) 위에 고객 랙들의 최저 ~ 최고 범위
function TempBand({ s }: { s: ColoStats }) {
  const [a, b] = [16, 32];
  const x = (t: number) => `${((Math.max(a, Math.min(b, t)) - a) / (b - a)) * 100}%`;
  const [r0, r1] = RECOMMENDED;
  if (!s.inlet) return <p className="hint">발열하는 랙이 없습니다.</p>;
  const ok = s.inlet[1] <= r1 && s.inlet[0] >= r0;
  return (
    <div className="co-temp">
      <div className="co-temp-track">
        <span className="band" style={{ left: x(r0), width: `calc(${x(r1)} - ${x(r0)})` }} />
        <i style={{ left: x(s.inlet[0]), width: `calc(${x(s.inlet[1])} - ${x(s.inlet[0])} + 4px)`, background: ok ? 'var(--ok)' : 'var(--warn)' }} />
      </div>
      <div className="co-bar-scale num">
        <span>{a}°C</span>
        <span style={{ left: x(r0) }}>{r0}</span>
        <span style={{ left: x(r1) }}>{r1}</span>
        <span style={{ left: '100%' }}>{b}</span>
      </div>
      <div className="co-legend">
        <span className="num">
          고객 랙 흡기 {s.inlet[0].toFixed(1)} ~ {s.inlet[1].toFixed(1)}°C
        </span>
        <Status tone={ok ? 'ok' : 'warn'}>{ok ? 'SLA 준수' : 'SLA 위반 우려'}</Status>
      </div>
    </div>
  );
}
