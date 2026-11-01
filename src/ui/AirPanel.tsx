// 기류 패널 (3D 위 왼쪽 위, 상단 [기류]를 켰을 때만). 봉쇄 · 블랭킹 · 급기 온도를 바꾸면 기류와 랙 흡기 온도가 바로 바뀐다.

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { RECOMMENDED, STATUS_META, tempColor, tempGradient, type AirCfg, type Containment, type RoomLabel } from '../data/thermal';
import { exitAir, switchRoom } from '../scene/focus';
import { useView } from '../store/useView';
import { useRoomTherm } from './useStatus';

const CONTAINMENT: { key: Containment; name: string; desc: string }[] = [
  {
    key: 'none',
    name: '봉쇄 없음',
    desc: '냉기와 열기가 섞입니다. 랙 위로 넘어온 열기가 다시 흡기되고(재순환), 일부 냉기는 랙을 거치지 않고 돌아갑니다(바이패스).',
  },
  { key: 'CAC', name: '냉복도 봉쇄 (CAC)', desc: '냉복도 위와 양 끝을 막아 냉기를 랙 앞에 가둡니다. 나머지 방은 열기로 차므로 방 온도는 높아집니다.' },
  { key: 'HAC', name: '열복도 봉쇄 (HAC)', desc: '열복도를 막아 열기를 굴뚝처럼 천장 리턴으로 바로 보냅니다. 방 전체가 냉기로 채워집니다.' },
];

// 컨테인먼트 아래 세부 설정 · 수치는 기본으로 접는다 (3D 상면을 덜 가리도록). 열고 닫은 상태는 이번 화면 동안 기억
let detailOpen = false;

const STAGES = ['급기(하부)', '이중마루 하부', '타공판', '냉복도', '랙 흡기', '랙 배기', '열복도', '천장 · 리턴', '항온항습기 흡입', '코일에서 열 전달'];

export function AirPanel() {
  const on = useView((s) => s.airOn);
  const room = useView((s) => s.airRoom);
  const cfg = useView((s) => s.airCfg[room]);
  const th = useRoomTherm(room);
  const rackColor = useView((s) => s.rackColor === 'temp');
  const [open, setOpen] = useState(detailOpen);
  if (!on) return null;
  const toggle = () => {
    detailOpen = !open;
    setOpen(!open);
  };
  const set = (patch: Partial<AirCfg>) => useView.getState().setAirCfg(room, patch);
  const loadPct = Math.round((th.loadKw / th.capKw) * 100);
  const dT = +(th.returnT - cfg.supply).toFixed(1);

  return (
    <div className="air-panel">
      <header>
        <b>기류</b>
        <div className="seg small">
          {(['A', 'B'] as RoomLabel[]).map((r) => (
            <button key={r} className={room === r ? 'on' : ''} onClick={() => switchRoom(r)}>
              서버실 {r} ({r === 'A' ? '3F 공냉식' : '4F 수냉식'})
            </button>
          ))}
        </div>
        <button className="icon" onClick={() => exitAir()} title="기류 끄기">
          ✕
        </button>
      </header>

      <div className="air-body">
        <h5>컨테인먼트</h5>
        <div className="seg small">
          {CONTAINMENT.map((c) => (
            <button key={c.key} className={cfg.containment === c.key ? 'on' : ''} onClick={() => set({ containment: c.key })}>
              {c.name}
            </button>
          ))}
        </div>
        <p className="hint">{CONTAINMENT.find((c) => c.key === cfg.containment)!.desc}</p>

        <button className={`air-more${open ? ' open' : ''}`} aria-expanded={open} onClick={toggle}>
          <span className="air-more-t">세부 설정 · 수치</span>
          <span className="air-more-sum num">
            최고 흡기 <b style={{ color: tempColor(th.maxInlet) }}>{th.maxInlet}°C</b> · 권장 초과 {th.over}대
          </span>
          <ChevronDown className="k-chev" size={14} />
        </button>

        {open && (
          <>
            <div className="air-toggles">
              <label className="chk">
                <input type="checkbox" checked={cfg.blanking} onChange={(e) => set({ blanking: e.target.checked })} />
                블랭킹 패널
              </label>
              <label className="chk">
                <input type="checkbox" checked={cfg.xray} onChange={(e) => set({ xray: e.target.checked })} />
                이중마루 투시
              </label>
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
                <input type="checkbox" checked={rackColor} onChange={(e) => useView.getState().setRackColor(e.target.checked ? 'temp' : 'none')} />랙 흡기 온도
                색
              </label>
            </div>

            <h5>
              급기 설정 온도 <b>{cfg.supply}°C</b>
            </h5>
            <input className="range" type="range" min={16} max={26} step={0.5} value={cfg.supply} onChange={(e) => set({ supply: +e.target.value })} />

            <div className="air-metrics">
              <Metric name="평균 흡기" value={`${th.avgInlet}°C`} color={tempColor(th.avgInlet)} />
              <Metric name="최고 흡기" value={`${th.maxInlet}°C`} color={tempColor(th.maxInlet)} />
              <Metric name="권장 초과 랙" value={`${th.over} / ${th.loaded}`} color={th.over ? STATUS_META.warn.color : STATUS_META.ok.color} />
              <Metric name="환기 온도" value={`${th.returnT}°C`} sub={`급기와 차이 ${dT}°C`} />
              <Metric name="재순환" value={`${Math.round(th.recirc * 100)}%`} />
              <Metric name="바이패스" value={`${Math.round(th.bypass * 100)}%`} />
              <Metric name="열부하 / 냉각 용량" value={`${th.loadKw} / ${th.capKw}kW`} sub={`N+1 기준 ${loadPct}% · ${th.unitKw}kW × ${th.units - 1}대`} />
            </div>

            <div className="temp-scale">
              <div className="bar" style={{ background: tempGradient(15, 35) }} />
              <div className="ticks">
                <span>15°C</span>
                <span>
                  권장 {RECOMMENDED[0]}~{RECOMMENDED[1]}°C
                </span>
                <span>35°C</span>
              </div>
            </div>
            <p className="hint stages">
              {STAGES.map((s, i) => (
                <span key={s}>
                  {'①②③④⑤⑥⑦⑧⑨⑩'[i]} {s}
                </span>
              ))}
            </p>
            <p className="hint">
              급기와 환기의 온도 차가 클수록 같은 바람으로 더 많은 열을 옮기므로 항온항습기 효율이 좋아집니다. 바이패스가 크면 찬 공기가 그냥 돌아와 이 차이가
              줄어듭니다.
            </p>
          </>
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
