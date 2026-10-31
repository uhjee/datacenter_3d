// 지표 탭: 운전 조건 → PUE · 서버실별 남은 용량 · UPS 2N (docs/PLAN.md §6)

import { useState } from 'react';
import { PART_COLOR, RT_KW, type Metrics, type RoomMetrics } from '../data/metrics';
import { type RoomLabel } from '../data/thermal';
import { activateGroup, enterAir } from '../scene/focus';
import { useView } from '../store/useView';
import { Help, Kpi, KpiRow, Meter, Props, Section, Status } from './kit';
import { useMetrics } from './useStatus';

const f0 = (v: number) => Math.round(v).toLocaleString('ko-KR');
const pct = (v: number) => `${Math.round(v * 100)}%`;

type RoomTab = RoomLabel | 'cmp';

export function MetricsPanel() {
  const itLoad = useView((s) => s.itLoad);
  const outdoor = useView((s) => s.outdoorT);
  const cfg = useView((s) => s.airCfg);
  const m = useMetrics();
  const [room, setRoom] = useState<RoomTab>('A');

  return (
    <div className="rp-card metrics">
      <div className="rp-body rp-pad-top">
        <div className="rp-sliders">
          <Slider
            name="IT 부하율"
            value={`${Math.round(itLoad * 100)}%`}
            min={0.3}
            max={1.5}
            step={0.05}
            v={itLoad}
            onChange={(v) => useView.getState().setItLoad(v)}
            help="랙에 실린 장비가 얼마나 일하는지 (100% = 기준). 높이면 냉각 N+1 · UPS 50% 기준을 넘는 순간을 볼 수 있습니다."
          />
          <Slider
            name="외기 온도"
            value={`${outdoor}°C`}
            min={-10}
            max={38}
            step={1}
            v={outdoor}
            onChange={(v) => useView.getState().setOutdoorT(v)}
            help="실외기 · 냉동기 효율과 서버실 B의 프리쿨링을 바꿉니다."
          />
        </div>
        <p className="hint">
          급기 온도 · 컨테인먼트는 기류 패널 설정(서버실 A {cfg.A.supply}°C · B {cfg.B.supply}°C)을 따릅니다.{' '}
          <button className="link" onClick={() => enterAir(useView.getState().airRoom)}>
            기류 패널 열기
          </button>
        </p>

        <Pue m={m} />

        <div className="seg small rp-room-seg">
          <button className={room === 'A' ? 'on' : ''} onClick={() => setRoom('A')}>
            A · 공냉식
          </button>
          <button className={room === 'B' ? 'on' : ''} onClick={() => setRoom('B')}>
            B · 수냉식
          </button>
          <button className={room === 'cmp' ? 'on' : ''} onClick={() => setRoom('cmp')}>
            A · B 비교
          </button>
        </div>
        {room === 'cmp' ? <RoomCompare m={m} /> : <RoomView m={m} r={room} />}

        <Ups m={m} />
      </div>
    </div>
  );
}

function Slider(p: { name: string; value: string; min: number; max: number; step: number; v: number; onChange: (v: number) => void; help: string }) {
  return (
    <label className="rp-slider">
      <span className="rp-slider-head">
        <span>
          {p.name} <Help text={p.help} />
        </span>
        <b className="num">{p.value}</b>
      </span>
      <input className="range" type="range" min={p.min} max={p.max} step={p.step} value={p.v} onChange={(e) => p.onChange(+e.target.value)} />
    </label>
  );
}

// ── PUE: 큰 숫자 + 분해 막대 (조각에 마우스를 올리면 값) ──
function Pue({ m }: { m: Metrics }) {
  const [hover, setHover] = useState<string | null>(null);
  const h = m.parts.find((p) => p.key === hover);
  return (
    <>
      <div className="rp-hero">
        <div>
          <div className="rp-hero-k">
            PUE{' '}
            <Help text="총 시설 전력 ÷ IT 전력. 1.0에 가까울수록 IT 말고 쓰는 전력이 적습니다. 2024년 세계 평균은 약 1.56, 국내 우수 사례는 1.1~1.3 수준입니다. UPS · 냉각 설비는 부하가 낮을수록 효율이 떨어지고 고정 전력 비중이 커져 PUE가 나빠집니다." />
          </div>
          <div className="rp-hero-v num">{m.pue.toFixed(2)}</div>
        </div>
        <div className="rp-hero-r">
          <div className="rp-hero-f num">
            시설 <b>{f0(m.total)}</b> ÷ IT <b>{f0(m.it)}</b> kW
          </div>
          <div className="stack" onMouseLeave={() => setHover(null)}>
            {m.parts.map((p) => (
              <i
                key={p.key}
                className={hover && hover !== p.key ? 'faded' : ''}
                style={{ flexGrow: p.kw, background: PART_COLOR[p.key] }}
                onMouseEnter={() => setHover(p.key)}
              />
            ))}
          </div>
          <div className="stack-tip num">{h ? `${h.name} ${f0(h.kw)}kW (${pct(h.kw / m.total)})` : '막대 조각에 마우스를 올리면 값이 나옵니다'}</div>
        </div>
      </div>
      <Section id="pue-parts" title="전력 분해" count={`${m.parts.length}항목`} defaultOpen={false}>
        <table className="specs parts">
          <tbody>
            {m.parts.map((p) => (
              <tr key={p.key} onMouseEnter={() => setHover(p.key)} onMouseLeave={() => setHover(null)} className={hover === p.key ? 'on' : ''}>
                <th>
                  <span className="dot" style={{ background: PART_COLOR[p.key] }} /> {p.name}
                </th>
                <td className="num">{f0(p.kw)}kW</td>
                <td className="num">{pct(p.kw / m.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
}

// ── 서버실 한 곳: 핵심 수치 + 남은 용량(냉각 · 전력 · 공간) + 냉각 전력 내역 ──
function RoomView({ m, r }: { m: Metrics; r: RoomLabel }) {
  const x: RoomMetrics = m.rooms[r];
  const other = m.rooms[r === 'A' ? 'B' : 'A'];
  const diff = x.partialPue - other.partialPue;
  const st = x.stranded;
  const top = st.reduce((a, b) => (b.used > a.used ? b : a));
  const coolLevel = x.it <= x.capN1 ? 'ok' : x.it <= x.capAll ? 'warn' : 'crit';
  const sub = (k: 'space' | 'power' | 'cooling') => {
    if (k === 'cooling') return `${f0(x.it)} / ${f0(x.capN1)}kW · ${f0(x.rt)} USRT · 풍량 약 ${f0(x.airflow)}m³/h`;
    if (k === 'power') return `${f0(x.power.actual)} / ${f0(x.power.design)}kW (랙 할당 합)`;
    return `${x.space.usedU.toLocaleString('ko-KR')} / ${x.space.totalU.toLocaleString('ko-KR')}U · 장비 있는 랙 ${x.space.loaded}/${x.space.racks}대`;
  };
  return (
    <>
      <KpiRow>
        <Kpi label="IT 부하" value={f0(x.it)} unit="kW" />
        <Kpi label="냉각 전력" value={f0(x.cooling)} unit="kW" sub={`COP ${x.cop.toFixed(1)}${r === 'B' && x.freeCooling > 0 ? ` · 프리쿨링 ${pct(x.freeCooling)}` : ''}`} />
        <Kpi label="부분 PUE" value={x.partialPue.toFixed(2)} sub={`${r === 'A' ? 'B' : 'A'}보다 ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}`} />
      </KpiRow>

      <Section
        id="room-cap"
        title={
          <>
            남은 용량{' '}
            <Help text="공간 · 전력 · 냉각 중 하나가 먼저 차면 나머지가 남아도 랙을 더 넣지 못합니다(고립 용량). 고밀도 GPU 열은 전력 · 냉각을, 스토리지 · 네트워크 열은 공간을 먼저 씁니다. 냉각은 N+1(1대 예비) 용량 기준입니다." />
          </>
        }
        aside={
          coolLevel === 'ok' ? (
            <Status tone="ok">냉각 N+1 충족</Status>
          ) : coolLevel === 'warn' ? (
            <Status tone="warn">N+1 부족</Status>
          ) : (
            <Status tone="crit">냉각 전체 용량 초과</Status>
          )
        }
      >
        <div className="rp-caps">
          {(['cooling', 'power', 'space'] as const).map((k) => {
            const s = st.find((q) => q.key === k)!;
            const first = s === top;
            const color = s.used > 1 ? 'var(--crit)' : s.used > 0.9 ? 'var(--warn)' : first ? 'var(--ink)' : undefined;
            return (
              <div key={k} className="rp-cap">
                <div className="rp-cap-t">
                  <span className="grow">{s.name}</span>
                  {first && <span className="rp-flag">먼저 참</span>}
                  <b className="num">{pct(s.used)}</b>
                </div>
                <Meter v={s.used} mark={first ? undefined : top.used} markLabel={`${top.name}이 찰 때`} color={color} size="md" />
                <small className="num">
                  {sub(k)}
                  {!first && top.used < 1 && ` · ${top.name}이 찰 때 ${pct(s.stranded)}는 남아도 못 씀`}
                </small>
              </div>
            );
          })}
        </div>
        <p className="hint">
          1 USRT = {RT_KW}kW. 눈금은 가장 먼저 차는 자원의 위치입니다. 왼쪽 패널 "랙 색칠"에서 U 사용률 · 전력으로 칠해 볼 수 있습니다.
        </p>
      </Section>

      <Section id="room-cool-parts" title="냉각 전력 내역" count={x.coolingParts.map((p) => p.name).join(' · ')} defaultOpen={false}>
        <Props items={x.coolingParts.map((p) => ({ k: p.name, v: `${f0(p.kw)}kW` }))} />
      </Section>
    </>
  );
}

function RoomCompare({ m }: { m: Metrics }) {
  const { A, B } = m.rooms;
  const better = A.partialPue < B.partialPue ? 'A' : 'B';
  return (
    <>
      <table className="specs compare">
        <thead>
          <tr>
            <th />
            <td>A · 공냉식</td>
            <td>B · 수냉식</td>
          </tr>
        </thead>
        <tbody className="num">
          <tr>
            <th>IT 부하</th>
            <td>{f0(A.it)}kW</td>
            <td>{f0(B.it)}kW</td>
          </tr>
          <tr>
            <th>냉각 전력</th>
            <td>{f0(A.cooling)}kW</td>
            <td>{f0(B.cooling)}kW</td>
          </tr>
          <tr>
            <th>냉각 COP</th>
            <td>{A.cop.toFixed(1)}</td>
            <td>{B.cop.toFixed(1)}</td>
          </tr>
          <tr>
            <th>프리쿨링</th>
            <td>없음</td>
            <td>{B.freeCooling > 0 ? pct(B.freeCooling) : '안 함'}</td>
          </tr>
          <tr>
            <th>냉각 (N+1)</th>
            <td>{pct(A.loadPct)}</td>
            <td>{pct(B.loadPct)}</td>
          </tr>
          <tr>
            <th>부분 PUE</th>
            <td className={better === 'A' ? 'best' : ''}>{A.partialPue.toFixed(2)}</td>
            <td className={better === 'B' ? 'best' : ''}>{B.partialPue.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
      <p className="hint">
        부분 PUE = (서버실 IT + 그 서버실 냉각 + 공용 손실 몫) ÷ 서버실 IT. 냉각 COP는 옮긴 열 ÷ 냉각에 쓴 전력입니다. 외기가 차가우면 서버실 B는 냉동기 대신 판형
        열교환기로 냉수를 만들어(프리쿨링) 냉각 전력이 크게 줄어듭니다.
      </p>
    </>
  );
}

// ── UPS 2N: 두 대 부하율 + 50% 기준선 ──
function Ups({ m }: { m: Metrics }) {
  const fail = m.upsFailPct;
  return (
    <Section
      id="ups-2n"
      title={
        <>
          UPS 2N{' '}
          <Help text="2N 구성은 한 대가 멈춰도 다른 한 대가 전부 받아야 하므로 평상시 각 UPS를 50% 이하로 둡니다. 단일전원 랙(STS)은 평상시 UPS-A로 받습니다. 손실은 열이 되어 UPS실 공조가 다시 식힙니다." />
        </>
      }
      aside={fail <= 1 ? <Status tone="ok">한 대 고장 시 {pct(fail)}로 감당</Status> : <Status tone="crit">한 대 고장 시 {pct(fail)} · 2N 깨짐</Status>}
    >
      <div className="rp-caps">
        {(['A', 'B'] as const).map((k) => {
          const u = m.ups[k];
          return (
            <div key={k} className="rp-cap">
              <div className="rp-cap-t">
                <span className="grow" style={{ color: `var(--${k.toLowerCase()})` }}>
                  UPS-{k}
                </span>
                {u.pct > 0.5 && <span className="rp-flag warn">{u.pct > 1 ? '정격 초과' : '50% 초과'}</span>}
                <b className="num">{pct(u.pct)}</b>
              </div>
              <Meter v={u.pct} mark={0.5} markLabel="2N 권장 상한 50%" color={`var(--${k.toLowerCase()})`} size="md" />
              <small className="num">
                {f0(u.out)}kW · 효율 {(u.eff * 100).toFixed(1)}% · 손실 {f0(u.loss)}kW
              </small>
            </div>
          );
        })}
      </div>
      <p className="hint">
        눈금 = 2N 권장 상한 50%.{' '}
        <button className="link" onClick={() => activateGroup('sys-A')}>
          A계통 묶음 보기
        </button>
      </p>
    </Section>
  );
}
