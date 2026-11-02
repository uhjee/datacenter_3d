// 지표 탭: 운전 조건 → PUE · 서버실별 남은 용량 · UPS 2N (docs/PLAN.md §6)

import { useState } from 'react';
import { PART_COLOR, RT_KW, UPS_KW, upsId, type Metrics, type RoomMetrics } from '../data/metrics';
import { ROOM_LABELS, SR_BY_LABEL } from '../data/building';
import { type RoomLabel } from '../data/thermal';
import { activateGroup, enterHeat } from '../scene/focus';
import { useView } from '../store/useView';
import { CustomerSummary } from './CustomerSummary';
import { InfoTip, Kpi, KpiRow, Meter, Props, Section, Status, TipTable } from './kit';

const CONT_NAME = { none: '봉쇄 없음', CAC: '냉복도 봉쇄', HAC: '열복도 봉쇄' } as const;
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
            help="실외기 · 냉동기 효율과 수냉식(3F · 4F)의 프리쿨링을 바꿉니다."
          />
        </div>
        <div className="rp-airlink">
          <span className="hint">
            급기 · 봉쇄 조건{' '}
            <InfoTip
              text={
                <>
                  <p>급기 온도 · 컨테인먼트는 온도 카드(상단 [온도])의 설정을 따릅니다.</p>
                  <TipTable
                    head={['', '급기', '컨테인먼트']}
                    rows={ROOM_LABELS.map((r) => [`서버실 ${r}`, <span className="num">{cfg[r].supply}°C</span>, CONT_NAME[cfg[r].containment]])}
                  />
                </>
              }
            />
          </span>
          <button className="link" onClick={() => enterHeat(useView.getState().airRoom)}>
            온도 카드 열기 →
          </button>
        </div>

        <Pue m={m} />

        <div className="seg small rp-room-seg">
          {ROOM_LABELS.map((r) => (
            <button key={r} className={room === r ? 'on' : ''} onClick={() => setRoom(r)} title={SR_BY_LABEL[r].coolName}>
              {r} · {SR_BY_LABEL[r].floor}
            </button>
          ))}
          <button className={room === 'cmp' ? 'on' : ''} onClick={() => setRoom('cmp')}>
            비교
          </button>
        </div>
        {room === 'cmp' ? <RoomCompare m={m} /> : <RoomView m={m} r={room} />}

        <Ups m={m} />

        <CustomerSummary />
      </div>
    </div>
  );
}

function Slider(p: { name: string; value: string; min: number; max: number; step: number; v: number; onChange: (v: number) => void; help: string }) {
  return (
    <label className="rp-slider">
      <span className="rp-slider-head">
        <span>
          {p.name} <InfoTip text={p.help} />
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
            <InfoTip
              text={
                <>
                  <p>총 시설 전력 ÷ IT 전력. 1.0에 가까울수록 IT 말고 쓰는 전력이 적습니다.</p>
                  <TipTable
                    head={['비교', 'PUE']}
                    rows={[
                      ['이 건물 (지금)', <span className="num">{m.pue.toFixed(2)}</span>],
                      ['세계 평균 (2024)', <span className="num">약 1.56</span>],
                      ['국내 우수 사례', <span className="num">1.1 ~ 1.3</span>],
                    ]}
                  />
                  <p>UPS · 냉각 설비는 부하가 낮을수록 효율이 떨어지고 고정 전력 비중이 커져 PUE가 나빠집니다. 막대 조각에 마우스를 올리면 그 항목의 전력이 나옵니다.</p>
                </>
              }
            />
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
          <div className="stack-tip num">{h ? `${h.name} ${f0(h.kw)}kW (${pct(h.kw / m.total)})` : '\u00a0'}</div>
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
  // 세 서버실 중 냉각 효율 순위 (부분 PUE가 낮을수록 위)
  const rank = ROOM_LABELS.map((l) => m.rooms[l].partialPue).sort((a, b) => a - b).indexOf(x.partialPue) + 1;
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
        <Kpi label="냉각 전력" value={f0(x.cooling)} unit="kW" sub={`IT의 ${pct(x.cooling / x.it)}${x.freeCooling > 0 ? ` · 프리쿨링 ${pct(x.freeCooling)}` : ''}`} />
        <Kpi label="부분 PUE" value={x.partialPue.toFixed(2)} sub={`${SR_BY_LABEL[r].coolName} · 세 서버실 중 ${rank}위`} />
      </KpiRow>

      <Section
        id="room-cap"
        title="남은 용량"
        info={
          <>
            <p>공간 · 전력 · 냉각 중 하나가 먼저 차면 나머지가 남아도 랙을 더 넣지 못합니다(고립 용량). 막대의 눈금은 가장 먼저 차는 자원의 위치입니다.</p>
            <TipTable
              head={['자원', '기준', '먼저 쓰는 랙']}
              rows={[
                ['냉각', 'N+1 (1대 예비) 냉각 용량', '고밀도 GPU 열'],
                ['전력', '랙 할당 전력 합', '고밀도 GPU 열'],
                ['공간', '42U × 랙 수', '스토리지 · 네트워크 열'],
              ]}
            />
            <p>
              1 USRT = {RT_KW}kW. 왼쪽 패널 "랙 색칠"에서 U 사용률 · 전력으로 칠해 볼 수 있습니다.
            </p>
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
      </Section>

      <Section id="room-cool-parts" title="냉각 전력 내역" count={x.coolingParts.map((p) => p.name).join(' · ')} defaultOpen={false}>
        <Props items={x.coolingParts.map((p) => ({ k: p.name, v: `${f0(p.kw)}kW` }))} />
      </Section>
    </>
  );
}

function RoomCompare({ m }: { m: Metrics }) {
  const rooms = ROOM_LABELS.map((l) => m.rooms[l]);
  const best = rooms.reduce((x, y) => (y.partialPue < x.partialPue ? y : x)).label;
  const rows: [string, (x: RoomMetrics) => string][] = [
    ['IT 부하', (x) => `${f0(x.it)}kW`],
    ['냉각 전력', (x) => `${f0(x.cooling)}kW`],
    ['냉각 ÷ IT', (x) => pct(x.cooling / x.it)],
    ['냉각 COP', (x) => x.cop.toFixed(1)],
    ['프리쿨링', (x) => (x.freeCooling > 0 ? pct(x.freeCooling) : '안 함')],
    ['냉각 (N+1)', (x) => pct(x.loadPct)],
  ];
  return (
    <>
      <table className="specs compare">
        <thead>
          <tr>
            <th>
              <InfoTip
                label="비교 기준"
                text={
                  <TipTable
                    head={['지표', '계산']}
                    rows={[
                      ['부분 PUE', '(서버실 IT + 그 서버실 냉각 + 공용 손실 몫) ÷ 서버실 IT'],
                      ['냉각 ÷ IT', '서버실 냉각 전력 ÷ IT 전력 (작을수록 효율 좋음)'],
                      ['냉각 COP', '옮긴 열 ÷ 냉각에 쓴 전력 (클수록 효율 좋음)'],
                      ['프리쿨링', '외기가 차가우면 수냉식 몫을 냉동기 대신 판형 열교환기로 식히는 비율'],
                    ]}
                  />
                }
              />
            </th>
            {rooms.map((x) => (
              <td key={x.label}>
                {x.label} · {SR_BY_LABEL[x.label].coolName}
              </td>
            ))}
          </tr>
        </thead>
        <tbody className="num">
          {rows.map(([k, f]) => (
            <tr key={k}>
              <th>{k}</th>
              {rooms.map((x) => (
                <td key={x.label}>{f(x)}</td>
              ))}
            </tr>
          ))}
          <tr>
            <th>부분 PUE</th>
            {rooms.map((x) => (
              <td key={x.label} className={best === x.label ? 'best' : ''}>
                {x.partialPue.toFixed(2)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </>
  );
}

// ── UPS 2N: 두 대 부하율 + 50% 기준선 ──
function Ups({ m }: { m: Metrics }) {
  const fail = Math.max(...ROOM_LABELS.map((l) => m.upsFail[l]));
  return (
    <Section
      id="ups-2n"
      title="UPS 2N"
      info={
        <>
          <p>2N 구성은 한 대가 멈춰도 다른 한 대가 전부 받아야 하므로 평상시 각 UPS를 50% 이하로 둡니다(막대의 눈금).</p>
          <TipTable
            head={['상태', 'UPS 부하']}
            rows={[
              ['평상시 (두 대 운전)', '각 50% 이하 권장'],
              ['한 대 고장', '남은 한 대가 그 서버실 전부 (100% 이하여야 2N 유지)'],
              ['단일전원 랙 (STS)', '평상시 그 서버실 A계통 UPS로 받음'],
              ['구성', `서버실마다 한 쌍 (UPS-A1 · B1 = 서버실 A …), 대당 ${UPS_KW.toLocaleString('ko-KR')}kW`],
            ]}
          />
          <p>손실은 열이 되어 UPS실 공조가 다시 식힙니다.</p>
        </>
      }
      aside={fail <= 1 ? <Status tone="ok">한 대 고장 시 최대 {pct(fail)}로 감당</Status> : <Status tone="crit">한 대 고장 시 {pct(fail)} · 2N 깨짐</Status>}
    >
      <div className="rp-caps">
        {ROOM_LABELS.flatMap((l) => (['a', 'b'] as const).map((sys) => [l, sys] as const)).map(([l, sys]) => {
          const id = upsId(sys, l);
          const u = m.ups[id];
          return (
            <div key={id} className="rp-cap">
              <div className="rp-cap-t">
                <span className="grow" style={{ color: `var(--${sys})` }}>
                  UPS-{sys.toUpperCase()}
                  {SR_BY_LABEL[l].num} <small>서버실 {l}</small>
                </span>
                {u.pct > 0.5 && <span className="rp-flag warn">{u.pct > 1 ? '정격 초과' : '50% 초과'}</span>}
                <b className="num">{pct(u.pct)}</b>
              </div>
              <Meter v={u.pct} mark={0.5} markLabel="2N 권장 상한 50%" color={`var(--${sys})`} size="md" />
              <small className="num">
                {f0(u.out)}kW · 효율 {(u.eff * 100).toFixed(1)}% · 손실 {f0(u.loss)}kW
              </small>
            </div>
          );
        })}
      </div>
      <div className="rp-airlink">
        <button className="link" onClick={() => activateGroup('sys-A')}>
          A계통 묶음 보기 →
        </button>
      </div>
    </Section>
  );
}
