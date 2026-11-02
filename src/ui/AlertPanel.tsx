// 주의 사항 (오른쪽 패널 [주의] 탭): 화면 곳곳에 흩어진 경고를 한 목록에 모은다. 관제 화면처럼 심각한 것부터.
// 항목을 누르면 그 대상으로 이동한다. 운전 조건(IT 부하율 · 외기)과 시나리오 재생에 따라 바로 바뀐다

import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { coloStats } from '../data/colo';
import { CUSTOMERS } from '../data/customers';
import { RECOMMENDED, type RoomLabel, type RoomTherm } from '../data/thermal';
import { enterHeat, focusItem } from '../scene/focus';
import { useView } from '../store/useView';
import { InfoTip, Status, TipTable, type Tone } from './kit';
import { useAllRoomTherm, useMetrics } from './useStatus';
import { ROOM_LABELS, SR_BY_LABEL, roomOfId } from '../data/building';
import { upsId } from '../data/metrics';

export interface Alert {
  key: string;
  tone: Tone;
  area: string; // 분야 (냉각 · 전력 · 고객사 · 시나리오)
  title: string;
  detail: string;
  go: () => void;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const ORDER: Record<Tone, number> = { crit: 0, warn: 1, info: 2, ok: 3, muted: 4 };

function roomAlerts(label: RoomLabel, th: RoomTherm): Alert[] {
  const out: Alert[] = [];
  const hottest = Object.entries(th.racks)
    .filter(([, t]) => t.kw > 0)
    .sort((a, b) => Math.max(...b[1].inlet) - Math.max(...a[1].inlet))[0];
  if (th.over > 0)
    out.push({
      key: `inlet-${label}`,
      tone: th.maxInlet > 32 ? 'crit' : 'warn',
      area: '냉각',
      title: `서버실 ${label} 흡기 권장 초과 랙 ${th.over}대`,
      detail: `최고 ${th.maxInlet}°C${hottest ? ` (${hottest[0]})` : ''} · 권장 상한 ${RECOMMENDED[1]}°C`,
      go: () => enterHeat(label),
    });
  if (th.loadKw > th.capKw)
    out.push({
      key: `cool-${label}`,
      tone: th.loadKw > th.capKw * (th.units / (th.units - 1)) ? 'crit' : 'warn',
      area: '냉각',
      title: `서버실 ${label} 냉각 N+1 부족`,
      detail: `열부하 ${th.loadKw}kW > N+1 용량 ${th.capKw}kW (예비 없이 운전)`,
      go: () => useView.getState().setRightTab('metrics'),
    });
  return out;
}

export function useAlerts(): Alert[] {
  const m = useMetrics();
  const th = useAllRoomTherm();
  const snap = useView((s) => s.scenSnap);
  return useMemo(() => {
    const out: Alert[] = ROOM_LABELS.flatMap((l) => roomAlerts(l, th[l]));
    // UPS: 서버실마다 한 쌍
    for (const l of ROOM_LABELS) {
      const n = SR_BY_LABEL[l].num;
      if (m.upsFail[l] > 1)
        out.push({
          key: `ups-2n-${l}`,
          tone: 'crit',
          area: '전력',
          title: `UPS-A${n} · B${n} 2N 깨짐 (서버실 ${l})`,
          detail: `한 대가 멈추면 남은 한 대가 ${pct(m.upsFail[l])}를 받아야 함`,
          go: () => focusItem(upsId('a', l)),
        });
      else
        for (const sys of ['a', 'b'] as const) {
          const u = m.ups[upsId(sys, l)];
          if (u.pct > 0.5)
            out.push({
              key: `ups-${sys}${n}`,
              tone: 'warn',
              area: '전력',
              title: `UPS-${sys.toUpperCase()}${n} 2N 권장 상한(50%) 초과`,
              detail: `지금 ${pct(u.pct)} · ${Math.round(u.out)}kW`,
              go: () => focusItem(upsId(sys, l)),
            });
        }
    }
    for (const c of CUSTOMERS) {
      const s = coloStats(c, th[roomOfId(c.room)]);
      if (s.tone !== 'ok' || s.peakRatio > 1)
        out.push({
          key: `cu-${c.id}`,
          tone: s.tone === 'ok' ? 'warn' : s.tone,
          area: '고객사',
          title: `${c.name} 계약 전력 ${s.tone === 'crit' ? '초과' : s.tone === 'warn' ? '주의' : '이번 달 최대 초과'}`,
          detail: `지금 ${pct(s.ratio)} · 30일 최대 ${pct(s.peakRatio)} (계약 ${c.contract.kw}kW)`,
          go: () => focusItem(`customer:${c.id}`),
        });
      if (s.circuitOver > 0)
        out.push({
          key: `cir-${c.id}`,
          tone: 'crit',
          area: '고객사',
          title: `${c.name} 랙 회로 여유 부족 ${s.circuitOver}대`,
          detail: '한쪽 회로가 끊기면 남은 회로 차단기가 떨어질 수 있음',
          go: () => focusItem(`customer:${c.id}`),
        });
    }
    if (snap) {
      const off = Object.entries(snap.nodes).filter(([id, n]) => id.startsWith('rack:') && n.status === 'off').length;
      if (off > 0)
        out.push({
          key: 'scen-rack',
          tone: 'crit',
          area: '시나리오',
          title: `랙 ${off}대 정지`,
          detail: '시나리오 재생 중 · 시나리오 탭에서 진행 확인',
          go: () => useView.getState().setRightTab('scenario'),
        });
    }
    return out.sort((a, b) => ORDER[a.tone] - ORDER[b.tone]);
  }, [m, th, snap]);
}

export function AlertPanel() {
  const alerts = useAlerts();
  return (
    <div className="rp-card">
      <div className="rp-body rp-pad-top">
        <h4 className="rp-list-h">
          주의 사항
          <InfoTip
            text={
              <>
                <TipTable
                  head={['분야', '기준']}
                  rows={[
                    ['냉각', `랙 흡기 권장 상한 ${RECOMMENDED[1]}°C 초과 · 열부하가 N+1(1대 예비) 냉각 용량 초과`],
                    ['전력', 'UPS 한 대 부하가 2N 권장 상한 50% 초과 · 한 대 고장 시 남은 한 대가 100% 넘음'],
                    ['고객사', '계약 전력의 90%부터 주의 · 넘으면 초과 · 30일 최대가 계약 초과 · 랙 회로 한쪽 단독 시 100% 초과'],
                    ['시나리오', '재생 중 정지한 랙'],
                  ]}
                />
                <p>지표 탭의 IT 부하율을 올리거나 시나리오를 재생하면 이 목록이 바로 바뀝니다. 항목을 누르면 그 대상으로 이동합니다.</p>
              </>
            }
          />
        </h4>
        {alerts.length === 0 ? (
          <p className="al-empty">
            <Status tone="ok">모두 정상 범위입니다</Status>
          </p>
        ) : (
          <div className="al-list">
            {alerts.map((a) => (
              <button key={a.key} className={`al-item ${a.tone}`} onClick={a.go}>
                <Status tone={a.tone}>{a.area}</Status>
                <span className="al-text">
                  <b>{a.title}</b>
                  <small className="num">{a.detail}</small>
                </span>
                <ChevronRight size={14} className="al-go" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
