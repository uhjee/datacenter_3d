// 패널 공통 부품 (docs/ui-proposal.html 시안의 부품). 클래스 이름은 기존 규칙과 겹치지 않게 k- 로 시작한다

import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  BookOpen,
  Check,
  ChevronDown,
  CircleAlert,
  Flame,
  Info,
  Minus,
  OctagonX,
  Server,
  Shield,
  Snowflake,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { Domain } from '../data/equipTypes';

export type Tone = 'ok' | 'warn' | 'crit' | 'info' | 'muted';

const TONE_VAR: Record<Tone, string> = { ok: 'var(--ok)', warn: 'var(--warn)', crit: 'var(--crit)', info: 'var(--info)', muted: 'var(--ink-3)' };
// 상태는 색만으로 구분하지 않도록 아이콘을 함께 붙인다
const TONE_ICON: Record<Tone, LucideIcon> = { ok: Check, warn: CircleAlert, crit: OctagonX, info: Info, muted: Minus };

export const DOMAIN_ICON: Record<Domain, LucideIcon> = { power: Zap, cooling: Snowflake, fire: Flame, security: Shield, it: Server };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// 카드 틀: 머리 영역 + 본문
export function Card({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="rp-card">
      {head}
      <div className="rp-body">{children}</div>
    </div>
  );
}

// 영역 아이콘 칸 (머리 영역 왼쪽)
export function Glyph({ icon: Icon, color }: { icon: LucideIcon; color: string }) {
  return (
    <span className="k-glyph" style={{ '--c': color } as CSSProperties}>
      <Icon size={20} strokeWidth={2} />
    </span>
  );
}

export function IconButton({ icon: Icon, label, onClick, active }: { icon: LucideIcon; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button className={`k-icon-btn${active ? ' on' : ''}`} aria-label={label} title={label} onClick={onClick}>
      <Icon size={15} strokeWidth={2} />
    </button>
  );
}

// 머리 영역: 아이콘 · 위치 경로 · 이름 · 상태 알약 · 아이콘 버튼
export function PanelHead(p: { glyph?: ReactNode; crumb?: string[]; title: ReactNode; info?: ReactNode; pills?: ReactNode; actions?: ReactNode }) {
  return (
    <div className={`k-head${p.glyph ? '' : ' no-glyph'}`}>
      {p.glyph}
      <div className="k-head-main">
        {p.crumb && p.crumb.length > 0 && (
          <div className="k-crumb">
            {p.crumb.map((c, i) => (
              <span key={i}>
                {i > 0 && <i>›</i>}
                {c}
              </span>
            ))}
          </div>
        )}
        <h2 className="k-title">
          {p.title}
          {p.info && <InfoTip text={p.info} />}
        </h2>
        {p.pills && <div className="k-pills">{p.pills}</div>}
      </div>
      {p.actions && <div className="k-actions">{p.actions}</div>}
    </div>
  );
}

// 상태 알약: 점 + 글자. ghost는 점 없는 테두리형(속성 표시)
export function Pill({ tone = 'ok', color, ghost, children, title }: { tone?: Tone; color?: string; ghost?: boolean; children: ReactNode; title?: string }) {
  const c = color ?? TONE_VAR[tone];
  return (
    <span className={`k-pill${ghost ? ' ghost' : ''}`} style={{ '--c': c } as CSSProperties} title={title}>
      {children}
    </span>
  );
}

// 상태 글자: 아이콘 + 글자 (정상 · 주의 · 위험)
export function Status({ tone, children }: { tone: Tone; children: ReactNode }) {
  const Icon = TONE_ICON[tone];
  return (
    <span className="k-status" style={{ '--c': TONE_VAR[tone] } as CSSProperties}>
      <Icon size={12} strokeWidth={2.5} />
      {children}
    </span>
  );
}

// 가로 막대: 값(0~1) + 기준선
export function Meter({ v, mark, markLabel, color, size = 'sm' }: { v: number; mark?: number; markLabel?: string; color?: string; size?: 'sm' | 'md' }) {
  return (
    <div className={`k-meter ${size}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      <i style={{ width: `${clamp01(v) * 100}%`, background: color }} />
      {mark != null && <em style={{ left: `${clamp01(mark) * 100}%` }} title={markLabel} />}
    </div>
  );
}

// 핵심 수치 타일: 이름 · 큰 숫자 + 단위 · 막대 · 보조 글
export function Kpi(p: { label: ReactNode; value: ReactNode; unit?: string; sub?: ReactNode; meter?: { v: number; mark?: number; markLabel?: string; color?: string }; tone?: Tone }) {
  return (
    <div className="k-kpi">
      <div className="k-kpi-label">{p.label}</div>
      <div className="k-kpi-value num" style={p.tone ? { color: TONE_VAR[p.tone] } : undefined}>
        {p.value}
        {p.unit && <small>{p.unit}</small>}
      </div>
      {p.meter && <Meter {...p.meter} />}
      {p.sub && <div className="k-kpi-sub num">{p.sub}</div>}
    </div>
  );
}

export function KpiRow({ children, cols = 3 }: { children: ReactNode; cols?: 2 | 3 }) {
  return <div className={`k-kpis c${cols}`}>{children}</div>;
}

// Enter · Space로 접기 (role=button 요소용)
export const keyToggle = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.target !== e.currentTarget) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fn();
  }
};

// 접는 섹션. 열림 상태는 제목별로 기억해서 다른 장비를 골라도 유지한다
const openMemo = new Map<string, boolean>();

export function Section(p: { id?: string; title: ReactNode; info?: ReactNode; count?: ReactNode; aside?: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  const key = p.id ?? String(p.title);
  const [open, setOpen] = useState(() => openMemo.get(key) ?? p.defaultOpen ?? true);
  const toggle = () => {
    openMemo.set(key, !open);
    setOpen(!open);
  };
  return (
    <div className={`k-sect${open ? '' : ' closed'}`}>
      <div className="k-sect-h">
        {/* 제목 줄 전체가 접기 단추. 안에 info 단추가 들어가므로 button 대신 role=button */}
        <div className="k-sect-toggle" role="button" tabIndex={0} aria-expanded={open} onClick={toggle} onKeyDown={keyToggle(toggle)}>
          <span className="k-sect-title">{p.title}</span>
          {p.info && <InfoTip text={p.info} />}
          {p.count != null && <span className="k-sect-count num">{p.count}</span>}
          <span className="grow" />
          <ChevronDown className="k-chev" size={14} />
        </div>
        {p.aside && <span className="k-sect-aside">{p.aside}</span>}
      </div>
      {open && <div className="k-sect-body">{p.children}</div>}
    </div>
  );
}

// 속성 칸: 2열 이름-값 (wide는 한 줄 전체)
export function Props({ items }: { items: { k: ReactNode; v: ReactNode; wide?: boolean }[] }) {
  // 좁은 칸이 홀수면 마지막 좁은 칸을 넓혀 빈 칸이 생기지 않게 한다 (나머지 빈틈은 grid dense가 메움)
  const narrow = items.map((it, i) => (it.wide ? -1 : i)).filter((i) => i >= 0);
  const lastOdd = narrow.length % 2 === 1 ? narrow[narrow.length - 1] : -1;
  return (
    <dl className="k-props">
      {items.map((it, i) => (
        <div key={i} className={it.wide || i === lastOdd ? 'wide' : ''}>
          <dt>{it.k}</dt>
          <dd>{it.v}</dd>
        </div>
      ))}
    </dl>
  );
}

// 알아보기 상자: 학습용 설명을 실제 값과 다른 모양으로. 길면 세 줄까지만 보이고 펼친다
export function LearnBox({ title, children, long }: { title: string; children: ReactNode; long?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`k-learn${long && !open ? ' clamp' : ''}`}>
      <BookOpen size={16} />
      <div>
        <b>{title}</b>
        <div className="k-learn-body">{children}</div>
        {long && (
          <button className="k-learn-more" onClick={() => setOpen(!open)}>
            {open ? '접기' : '더 읽기'}
          </button>
        )}
      </div>
    </div>
  );
}

// 제목 옆 ⓘ 단추: 마우스를 올리거나 초점을 주면(누르면 고정) 설명. 화면에 늘 깔아 두지 않을 사용법 · 기준 · 범례 설명을 여기에 둔다.
// 패널 스크롤 · 카드 쌓임에 갇히지 않게 body에 화면 기준(fixed)으로 띄운다.
// 너비는 내용에 맞추되 넉넉한 상한까지 넓혀 줄바꿈을 줄이고, 실제 크기를 재서 화면 안 · 아래(모자라면 위)에 놓는다
export function InfoTip({ text, label = '설명' }: { text: ReactNode; label?: string }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [pinned, setPinned] = useState(false);
  const tip = useRef<HTMLDivElement>(null);
  const show = (el: HTMLElement) => setAnchor(el.getBoundingClientRect());
  const hide = () => {
    if (!pinned) setAnchor(null);
  };
  useLayoutEffect(() => {
    const el = tip.current;
    if (!el || !anchor) return;
    const { width: w, height: h } = el.getBoundingClientRect();
    const m = 8;
    const x = Math.max(m, Math.min(window.innerWidth - w - m, anchor.left + anchor.width / 2 - w / 2));
    const below = anchor.bottom + 6;
    const y = below + h <= window.innerHeight - m ? below : Math.max(m, anchor.top - 6 - h);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.visibility = 'visible';
  }, [anchor, text]);
  return (
    <span
      className={`k-help${anchor ? ' on' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={label}
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={hide}
      onFocus={(e) => show(e.currentTarget)}
      onBlur={() => {
        setPinned(false);
        setAnchor(null);
      }}
      // 섹션 제목 줄 안에 있어도 접히지 않게
      onClick={(e) => {
        e.stopPropagation();
        setPinned(!pinned);
        show(e.currentTarget);
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Info size={13} />
      {anchor &&
        createPortal(
          // 크기를 잰 뒤 보이게 (첫 그림에서 엉뚱한 자리에 깜빡이지 않도록)
          <div ref={tip} className="k-tip" role="tooltip" style={{ left: 0, top: 0, visibility: 'hidden' }}>
            {text}
          </div>,
          document.body,
        )}
    </span>
  );
}

// 툴팁 안 표: 머리 줄(선택) + 행. 첫 칸은 이름처럼 진하게. nowrap: 줄바꿈하지 않을 짧은 칸 번호
export function TipTable({ head, rows, nowrap = [] }: { head?: ReactNode[]; rows: ReactNode[][]; nowrap?: number[] }) {
  return (
    <table className="k-tip-table">
      {head && (
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) =>
              j === 0 ? (
                <th key={j}>{c}</th>
              ) : (
                <td key={j} className={nowrap.includes(j) ? 'nowrap' : undefined}>
                  {c}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// 툴팁 안 색 견본
export const TipSwatch = ({ color, line }: { color: string; line?: boolean }) => (
  <i className={`k-tip-sw${line ? ' line' : ''}`} style={{ background: color }} />
);
export const Help = InfoTip;

// 켜기 · 끄기 스위치 (체크박스 대신). 왼쪽에 색 점이나 선 견본을 붙일 수 있다
export function Switch(p: { checked: boolean; onChange: () => void; label: ReactNode; swatch?: ReactNode; disabled?: boolean }) {
  return (
    <label className={`k-switch${p.disabled ? ' disabled' : ''}`}>
      {p.swatch}
      <span className="k-switch-label">{p.label}</span>
      <input type="checkbox" role="switch" checked={p.checked} disabled={p.disabled} onChange={p.onChange} />
      <span className="k-switch-track" aria-hidden />
    </label>
  );
}
