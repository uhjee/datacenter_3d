// 고객사 계약 요약: 지표 탭 섹션(4개사 계약 대비 사용률) · 건물 개요의 주의 한 줄.
// 고객사 카드로 가는 길을 케이지 클릭 · 랙 트리 말고도 열어 두고, 계약 초과를 눈에 띄게 한다

import { useMemo } from 'react';
import { coloStats, ratioTone, TONE_TEXT, WARN_RATIO } from '../data/colo';
import { CUSTOMERS } from '../data/customers';
import { focusItem } from '../scene/focus';
import { useView } from '../store/useView';
import { Section, Status, TipTable, type Tone } from './kit';
import { useAllRoomTherm } from './useStatus';
import { roomOfId } from '../data/building';

const TONE_VAR: Record<Tone, string> = { ok: 'var(--ink-2)', warn: 'var(--warn)', crit: 'var(--crit)', info: 'var(--info)', muted: 'var(--ink-3)' };
const pct = (v: number) => `${Math.round(v * 100)}%`;

function useCustomerRows() {
  const th = useAllRoomTherm();
  return useMemo(() => CUSTOMERS.map((c) => ({ c, s: coloStats(c, th[roomOfId(c.room)]) })), [th]);
}

// 목록에서 고르면 선택하고 그 자리로 이동 (3D · 2D 화면 클릭은 선택만)
const openCustomer = (id: string) => focusItem(`customer:${id}`);

export function CustomerSummary() {
  const rows = useCustomerRows();
  const over = rows.filter((r) => r.s.tone === 'crit').length;
  const warn = rows.filter((r) => r.s.tone === 'warn').length;
  const monthOver = rows.filter((r) => r.s.peakRatio > 1).length;
  return (
    <Section
      id="customers"
      title="고객사 계약 전력"
      info={
        <TipTable
          head={['표시', '뜻']}
          rows={[
            ['막대', '지금 유효 전력 ÷ 계약 전력 (눈금 = 계약 100%)'],
            ['▼', '30일 일별 최대 (월 최대 수요 기준 과금)'],
            ['상태', `${pct(WARN_RATIO)}부터 주의, 100% 넘으면 초과`],
          ]}
        />
      }
      count={`${rows.length}개사`}
      aside={
        over ? <Status tone="crit">초과 {over}곳</Status> : warn ? <Status tone="warn">주의 {warn}곳</Status> : <Status tone="ok">모두 계약 안</Status>
      }
    >
      <div className="cs-list">
        {rows.map(({ c, s }) => {
          const max = Math.max(1.2, s.peakRatio * 1.05, s.ratio * 1.05);
          const x = (v: number) => `${(Math.min(v, max) / max) * 100}%`;
          return (
            <button key={c.id} className="cs-row" onClick={() => openCustomer(c.id)} title={`${c.name} 계약 현황 보기`}>
              <span className="cs-name">
                <i style={{ background: c.color }} />
                {c.name}
              </span>
              <span className="cs-bar">
                <i style={{ width: x(s.ratio), background: TONE_VAR[s.tone] }} />
                <em style={{ left: x(1) }} />
                <b style={{ left: x(s.peakRatio) }}>▼</b>
              </span>
              <span className="cs-v num" style={{ color: s.tone === 'ok' ? undefined : TONE_VAR[s.tone] }}>
                {pct(s.ratio)}
              </span>
              <span className="cs-kw num">
                {s.kw.toFixed(1)} / {c.contract.kw}kW
              </span>
            </button>
          );
        })}
      </div>
      {monthOver > 0 && <p className="cs-note">이번 달 최대 수요가 계약을 넘은 고객사 {monthOver}곳 (초과 청구 대상)</p>}
    </Section>
  );
}

// 건물 개요의 주의 한 줄: 계약 초과 · 주의 고객사가 있을 때만
export function CustomerAlert() {
  const rows = useCustomerRows();
  const bad = rows.filter((r) => ratioTone(r.s.ratio) !== 'ok' || r.s.peakRatio > 1);
  if (bad.length === 0) return null;
  const worst = [...bad].sort((a, b) => b.s.ratio - a.s.ratio)[0];
  return (
    <button className="cs-alert" onClick={() => useView.getState().setRightTab('metrics')} title="지표 탭의 고객사 계약 전력 보기">
      <Status tone={worst.s.tone === 'ok' ? 'warn' : worst.s.tone}>고객사 계약</Status>
      <span>
        {bad.map(({ c, s }) => `${c.name} ${pct(s.ratio)}${s.tone === 'ok' ? ' (이번 달 최대 초과)' : ` ${TONE_TEXT[s.tone]}`}`).join(' · ')}
      </span>
      <span className="cs-go">→</span>
    </button>
  );
}

