// 정보 카드의 온도 부분: 랙 흡기 · 배기, 온습도 센서 측정값, 항온항습기 급기 · 환기

import { RACK_BY_ID } from '../data/racks';
import { sensorRack, STATUS_META, statusOf, tempColor, type RoomLabel, type TempStatus } from '../data/thermal';
import { enterAir } from '../scene/focus';
import { useView } from '../store/useView';
import { Kpi, KpiRow, Section, Status, type Tone } from './kit';
import { useRoomTherm } from './useStatus';

export const TEMP_TONE: Record<TempStatus, Tone> = { cold: 'info', ok: 'ok', warn: 'warn', hot: 'crit' };

// 온도 막대 눈금 범위 (°C)
const T_MIN = 16;
const T_MAX = 40;
const tPos = (t: number) => `${((Math.min(T_MAX, Math.max(T_MIN, t)) - T_MIN) / (T_MAX - T_MIN)) * 100}%`;

function Temp({ t }: { t: number }) {
  return (
    <span className="temp-chip num" style={{ background: tempColor(t) }}>
      {t}°C
    </span>
  );
}

function CfgLine({ room }: { room: RoomLabel }) {
  const cfg = useView((s) => s.airCfg[room]);
  const name = { none: '봉쇄 없음', CAC: '냉복도 봉쇄', HAC: '열복도 봉쇄' }[cfg.containment];
  return (
    <p className="hint">
      급기 {cfg.supply}°C · {name} · 블랭킹 패널 {cfg.blanking ? '있음' : '없음'} 조건의 근사값입니다.{' '}
      <button className="link" onClick={() => enterAir(room)}>
        기류 보기
      </button>
    </p>
  );
}

export function RackTempSection({ rackId }: { rackId: string }) {
  const r = RACK_BY_ID[rackId];
  const t = useRoomTherm(r.serverRoom).racks[rackId];
  if (!t) return null;
  if (t.kw === 0) {
    return (
      <Section id="rack-temp" title="온도">
        <p className="detail muted">장비가 없어 열이 나지 않습니다.</p>
      </Section>
    );
  }
  const maxIn = Math.max(...t.inlet);
  const maxEx = Math.max(...t.exhaust);
  return (
    <Section id="rack-temp" title="온도" count={`흡기 ${maxIn}°C · 배기 ${maxEx}°C`} aside={<Status tone={TEMP_TONE[t.status]}>{STATUS_META[t.status].name}</Status>}>
      <div className="rp-temps">
        {(['상단', '중단', '하단'] as const).map((n, i) => {
          const k = 2 - i;
          return (
            <div key={n} className="rp-temp-row">
              <span className="rp-temp-k">{n}</span>
              <Temp t={t.inlet[k]} />
              <span className="rp-temp-arrow">→</span>
              <Temp t={t.exhaust[k]} />
            </div>
          );
        })}
      </div>
      <div className="rp-tscale">
        <div className="rp-tscale-bar" />
        {t.inlet.map((v, i) => (
          <em key={i} style={{ left: tPos(v) }} title={`흡기 ${v}°C`} />
        ))}
        <i style={{ left: tPos(27) }} />
      </div>
      <div className="rp-tscale-l num">
        <span>{T_MIN}°C</span>
        <span style={{ left: tPos(27) }}>권장 27°C</span>
        <span>{T_MAX}°C</span>
      </div>
      <p className="hint">
        발열 약 {t.kw}kW · 랙을 지나며 {t.dT.toFixed(1)}°C 오릅니다. 눈금은 상 · 중 · 하단 흡기 온도입니다.
      </p>
      <CfgLine room={r.serverRoom} />
    </Section>
  );
}

export function SensorTemps({ sensorId }: { sensorId: string }) {
  const r = sensorRack(sensorId);
  const room = useRoomTherm(r?.serverRoom ?? 'A');
  const t = r ? room.racks[r.id] : null;
  if (!r || !t) return null;
  return (
    <>
      <KpiRow>
        {(['상단', '중단', '하단'] as const).map((n, i) => {
          const v = t.inlet[2 - i];
          const st = statusOf(v);
          return <Kpi key={n} label={`${n} 흡기`} value={v} unit="°C" tone={st === 'ok' ? undefined : TEMP_TONE[st]} sub={STATUS_META[st].name} />;
        })}
      </KpiRow>
      <p className="hint">{r.name} 전면(흡기)에서 잰 값입니다.</p>
      <CfgLine room={r.serverRoom} />
    </>
  );
}

export function UnitTemps({ room }: { room: RoomLabel }) {
  const cfg = useView((s) => s.airCfg[room]);
  const th = useRoomTherm(room);
  const load = th.loadKw / th.capKw;
  return (
    <>
      <KpiRow>
        <Kpi label="급기" value={cfg.supply} unit="°C" sub="이중마루 아래로" />
        <Kpi label="환기" value={th.returnT} unit="°C" sub="천장 쪽 흡입" />
        <Kpi
          label={`서버실 ${room} 열부하`}
          value={Math.round(th.loadKw)}
          unit="kW"
          meter={{ v: load, color: load > 1 ? 'var(--crit)' : load > 0.9 ? 'var(--warn)' : 'var(--ok)' }}
          sub={`N+1 용량 ${th.capKw}kW`}
        />
      </KpiRow>
      <CfgLine room={room} />
    </>
  );
}
